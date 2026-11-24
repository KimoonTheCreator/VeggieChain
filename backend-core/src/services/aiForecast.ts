import { supabase } from '../lib/supabase.js';

interface ForecastInput {
  commodityId: string;
  weatherCondition: 'cerah' | 'hujan_sedang' | 'hujan_lebat';
  isHolidayWeek: boolean;
  customNote?: string;
}

export async function generateAiDemandForecast(input: ForecastInput) {
  // 1. Ambil stok aktual & profil produk dari Supabase
  const { data: product, error: prodErr } = await supabase
    .from('products')
    .select('*')
    .eq('id', input.commodityId)
    .single();

  if (prodErr || !product) {
    throw new Error(`Komoditas ${input.commodityId} tidak ditemukan di Supabase.`);
  }

  // 2. Ambil 14 catatan penjualan terbaru dari Supabase (termasuk yang diinput manual)
  const { data: historyRows } = await supabase
    .from('sales_history')
    .select('id, recorded_date, sold_b2c_kg, sold_b2b_kg, total_demand_kg, weather_condition, is_weekend')
    .eq('commodity_id', input.commodityId)
    .order('id', { ascending: false })
    .limit(14);

  const apiKey = process.env.GEMINI_API_KEY;
  const dayLabels = ['Rab', 'Kam', 'Jum', 'Sab', 'Min', 'Sen', 'Sel'];
  const modelName = 'gemini-3.8-flash';

  let predictedDemandKg = 0;
  let dailySeries: { dayLabel: string; demandKg: number }[] = [];
  let aiInsight = '';
  let aiModel = modelName;

  if (apiKey && !apiKey.includes('TEMPEL_')) {
    try {
      const contextPayload = {
        komoditas: `${product.name} (${product.id})`,
        rata_rata_mingguan_dasar_kg: product.base_weekly_sales,
        stok_cold_storage_saat_ini_kg: product.stock_kg,
        skenario_7_hari_ke_depan: {
          kondisi_cuaca: input.weatherCondition,
          pekan_libur_panjang: input.isHolidayWeek,
          catatan_khusus_lapangan: input.customNote || 'Tidak ada catatan khusus',
        },
        data_historis_terbaru_dari_database: historyRows || [],
      };

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text: 'Anda adalah layanan mikro StockPrediction (AI Demand Forecasting) pada sistem rantai pasok pertanian VeggieChain. Analisis data historis penjualan B2C & B2B dari database untuk memproyeksikan permintaan harian (kg) selama 7 hari ke depan (Rab, Kam, Jum, Sab, Min, Sen, Sel). Berikan bobot lebih besar pada catatan penjualan terbaru yang diinput pengguna, lonjakan akhir pekan (Jum-Min), kondisi cuaca, dan catatan lapangan.',
                },
              ],
            },
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: `Hitung proyeksi permintaan 7 hari ke depan berdasarkan konteks data berikut:\n${JSON.stringify(contextPayload)}`,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'OBJECT',
                properties: {
                  dailySeries: {
                    type: 'ARRAY',
                    items: {
                      type: 'OBJECT',
                      properties: {
                        dayLabel: { type: 'STRING' },
                        demandKg: { type: 'INTEGER' },
                      },
                      required: ['dayLabel', 'demandKg'],
                    },
                  },
                  aiInsight: {
                    type: 'STRING',
                  },
                },
                required: ['dailySeries', 'aiInsight'],
              },
            },
          }),
        }
      );

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Gemini API HTTP ${response.status}: ${errBody}`);
      }

      const result = await response.json();
      const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed = JSON.parse(rawText);

      if (Array.isArray(parsed.dailySeries) && parsed.dailySeries.length === 7) {
        dailySeries = parsed.dailySeries.map((d: any, i: number) => ({
          dayLabel: dayLabels[i],
          demandKg: Math.max(1, Math.round(Number(d.demandKg) || 10)),
        }));
        predictedDemandKg = dailySeries.reduce((sum, item) => sum + item.demandKg, 0);
        aiInsight =
          parsed.aiInsight ||
          'Proyeksi Gemini AI memperhitungkan tren penjualan terbaru di database, faktor cuaca, dan pola akhir pekan.';
      }
    } catch (err) {
      console.error('Error memanggil Gemini API:', err);
    }
  }

  // Fallback jika API Key belum diisi atau gagal terhubung
  if (dailySeries.length === 0) {
    aiModel = 'statistical-fallback';
    const avgRecentDaily =
      historyRows && historyRows.length > 0
        ? historyRows.reduce((s, r) => s + Number(r.total_demand_kg), 0) / historyRows.length
        : product.base_weekly_sales / 7;

    const wMult =
      input.weatherCondition === 'hujan_lebat'
        ? 1.18
        : input.weatherCondition === 'hujan_sedang'
        ? 1.08
        : 1.0;
    const hMult = input.isHolidayWeek ? 1.25 : 1.0;
    predictedDemandKg = Math.round(avgRecentDaily * 7 * wMult * hMult);

    const weights = [0.11, 0.12, 0.12, 0.13, 0.17, 0.19, 0.16];
    dailySeries = dayLabels.map((dayLabel, idx) => ({
      dayLabel,
      demandKg: Math.max(1, Math.round(predictedDemandKg * weights[idx])),
    }));
    aiInsight =
      'Menggunakan kalkulasi rata-rata historis Supabase (pastikan GEMINI_API_KEY di backend-core/.env sudah valid untuk mengaktifkan Gemini AI).';
  }

  const safetyBufferKg = Math.round(predictedDemandKg * 0.15);
  const totalRequiredKg = predictedDemandKg + safetyBufferKg;
  const recommendedRestockKg = Math.max(0, totalRequiredKg - product.stock_kg);

  return {
    commodityId: product.id,
    commodityName: product.name,
    currentStockKg: product.stock_kg,
    predictedDemandKg,
    safetyBufferKg,
    totalRequiredKg,
    recommendedRestockKg,
    isRestockNeeded: recommendedRestockKg > 0,
    refFarmerPrice: product.base_farmer_price,
    dailySeries,
    aiInsight,
    aiModel,
    recentHistory: (historyRows || []).slice(0, 5),
  };
}