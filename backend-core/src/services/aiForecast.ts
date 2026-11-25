import { supabase } from '../lib/supabase.js';

interface ForecastInput {
  commodityId: string;
  weatherCondition: 'cerah' | 'hujan_sedang' | 'hujan_lebat';
  isHolidayWeek: boolean;
  customNote?: string;
}

type SalesHistoryRow = {
  id: number;
  recorded_date: string;
  sold_b2c_kg: number | null;
  sold_b2b_kg: number | null;
  total_demand_kg: number | null;
  weather_condition: string | null;
  is_weekend: boolean | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Buang kalimat pada aiInsight yang mengulang informasi yang sudah tampil di
 * panel lain (angka apa pun) atau memakai istilah teknis. Tujuannya: kartu
 * rekomendasi hanya berisi saran tindakan yang belum ada di UI.
 */
const REDUNDANT_INSIGHT_PATTERNS = [
  /one[-\s]?off/i,
  /\bbaseline\b/i,
  /\bmultiplier\b/i,
  /\bpengali\b/i,
  /dailySeries/i,
  /transaksi[^.]*\bdiabaikan\b/i,
  /\d/, // semua angka sudah ditampilkan di panel lain (stok, prediksi, nominal)
];

function stripRedundantInsight(text: string): string {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return sentences
    .filter((sentence) => !REDUNDANT_INSIGHT_PATTERNS.some((re) => re.test(sentence)))
    .join(' ')
    .trim();
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Pisahkan transaksi one-off (mis. pembelian bulk) dari baseline harian.
 *
 * Aturan: baris dianggap one-off bila total_demand_kg > 3x median histori.
 * Median dipakai (bukan rata-rata) supaya satu nilai ekstrem tidak menaikkan
 * ambangnya sendiri. Hasilnya deterministik, jadi angka prediksi tidak lagi
 * bergantung pada penilaian model bahasa.
 */
function splitOneOffRows(rows: SalesHistoryRow[]) {
  const totals = rows.map((r) => Number(r.total_demand_kg) || 0);
  const med = median(totals);
  const fallbackBase =
    totals.length > 0 ? totals.reduce((s, v) => s + v, 0) / totals.length : 0;
  const base = med > 0 ? med : fallbackBase;
  const thresholdKg = base * 3;

  const baselineRows: SalesHistoryRow[] = [];
  const oneOffRows: SalesHistoryRow[] = [];
  for (const row of rows) {
    const total = Number(row.total_demand_kg) || 0;
    if (base > 0 && total > thresholdKg) oneOffRows.push(row);
    else baselineRows.push(row);
  }

  return { baselineRows, oneOffRows, thresholdKg };
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

  // 2. Ambil 14 catatan penjualan terbaru dari Supabase (termasuk hasil checkout
  //    otomatis maupun input manual), lalu pisahkan transaksi one-off.
  const { data: historyData } = await supabase
    .from('sales_history')
    .select('id, recorded_date, sold_b2c_kg, sold_b2b_kg, total_demand_kg, weather_condition, is_weekend')
    .eq('commodity_id', input.commodityId)
    .order('recorded_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(14);

  const historyRows = (historyData ?? []) as SalesHistoryRow[];
  const { baselineRows, oneOffRows, thresholdKg } = splitOneOffRows(historyRows);

  const baselineDailyKg =
    baselineRows.length > 0
      ? baselineRows.reduce((s, r) => s + Number(r.total_demand_kg), 0) / baselineRows.length
      : product.base_weekly_sales / 7;
  const oneOffExcludedKg = round2(
    oneOffRows.reduce((s, r) => s + Number(r.total_demand_kg || 0), 0)
  );

  const apiKey = process.env.DEEPSEEK_API_KEY;
  const dayLabels = ['Rab', 'Kam', 'Jum', 'Sab', 'Min', 'Sen', 'Sel'];
  const modelName = 'deepseek-chat';
  const apiEndpoint = 'https://api.deepseek.com/chat/completions';

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
        baseline_harian_kg: round2(baselineDailyKg),
        transaksi_one_off_diabaikan: {
          jumlah_transaksi: oneOffRows.length,
          total_kg: oneOffExcludedKg,
          ambang_one_off_kg: round2(thresholdKg),
          keterangan:
            'Pembelian bulk / transaksi sekali besar. SUDAH dikeluarkan dari baseline; jangan ditambahkan ke proyeksi.',
        },
        skenario_7_hari_ke_depan: {
          kondisi_cuaca: input.weatherCondition,
          pekan_libur_panjang: input.isHolidayWeek,
          catatan_khusus_lapangan: input.customNote || 'Tidak ada catatan khusus',
        },
        data_historis_baseline: baselineRows,
      };

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'Anda adalah layanan mikro StockPrediction (AI Demand Forecasting) pada sistem rantai pasok pertanian VeggieChain. ' +
                'Tugas: proyeksikan permintaan harian (kg) selama 7 hari ke depan (Rab, Kam, Jum, Sab, Min, Sen, Sel) dari data penjualan B2C & B2B. ' +
                'Gunakan baseline_harian_kg sebagai dasar, pertimbangkan data terbaru, lonjakan akhir pekan (Jum-Min), cuaca, dan catatan lapangan. ' +
                'Transaksi one-off pada field transaksi_one_off_diabaikan SUDAH dikeluarkan dari data_historis_baseline dan TIDAK BOLEH ditambahkan ke proyeksi. ' +
                'Total dailySeries harus berada dalam rentang 0.9-1.1 x (baseline_harian_kg x 7 x faktor cuaca x faktor libur). ' +
                'Untuk aiInsight, tulis 2-3 kalimat rekomendasi operasional dalam Bahasa Indonesia yang sederhana dan langsung bisa ditindaklanjuti. ' +
                'Jangan menulis angka apa pun dan jangan mengulang data yang sudah tampil di panel lain (stok, prediksi, buffer, rekomendasi tambah pasokan, nominal transaksi besar). ' +
                'Jangan memakai istilah teknis seperti baseline, multiplier, pengali, one-off, dailySeries, atau rumus persentase. ' +
                'Fokus pada tindakan dan waktu: perlu tambah pasokan atau tidak, kapan mulai bersiap, dan apa yang harus dijaga (misalnya pasokan akhir pekan atau libur panjang). ' +
                'Balas HANYA dengan objek JSON valid tanpa penjelasan tambahan, dengan bentuk tepat seperti ini: {"dailySeries":[{"dayLabel":"Rab","demandKg":0},{"dayLabel":"Kam","demandKg":0},{"dayLabel":"Jum","demandKg":0},{"dayLabel":"Sab","demandKg":0},{"dayLabel":"Min","demandKg":0},{"dayLabel":"Sen","demandKg":0},{"dayLabel":"Sel","demandKg":0}],"aiInsight":"rekomendasi singkat dalam Bahasa Indonesia"}.',
            },
            {
              role: 'user',
              content: `Hitung proyeksi permintaan 7 hari ke depan berdasarkan konteks data berikut:\n${JSON.stringify(contextPayload)}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(45_000),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`DeepSeek API HTTP ${response.status}: ${errBody}`);
      }

      const result = await response.json();
      const rawText = result?.choices?.[0]?.message?.content ?? '';
      const cleanedText = rawText
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```$/, '');
      const parsed = JSON.parse(cleanedText);

      if (Array.isArray(parsed.dailySeries) && parsed.dailySeries.length === 7) {
        dailySeries = parsed.dailySeries.map((d: any, i: number) => ({
          dayLabel: dayLabels[i],
          demandKg: Math.max(1, Math.round(Number(d.demandKg) || 10)),
        }));
        predictedDemandKg = dailySeries.reduce((sum, item) => sum + item.demandKg, 0);
        aiModel = result?.model || modelName;
        aiInsight = typeof parsed.aiInsight === 'string' ? parsed.aiInsight : '';
      }
    } catch (err) {
      console.error('Error memanggil DeepSeek API:', err);
    }
  }

  // Fallback jika API Key belum diisi atau gagal terhubung
  if (dailySeries.length === 0) {
    aiModel = 'statistical-fallback';

    const wMult =
      input.weatherCondition === 'hujan_lebat'
        ? 1.18
        : input.weatherCondition === 'hujan_sedang'
        ? 1.08
        : 1.0;
    const hMult = input.isHolidayWeek ? 1.25 : 1.0;
    predictedDemandKg = Math.round(baselineDailyKg * 7 * wMult * hMult);

    const weights = [0.11, 0.12, 0.12, 0.13, 0.17, 0.19, 0.16];
    dailySeries = dayLabels.map((dayLabel, idx) => ({
      dayLabel,
      demandKg: Math.max(1, Math.round(predictedDemandKg * weights[idx])),
    }));
    // Insight disusun setelah angka restock diketahui (lihat fallbackInsight).
    aiInsight = '';
  }
  const safetyBufferKg = Math.round(predictedDemandKg * 0.15);
  const totalRequiredKg = predictedDemandKg + safetyBufferKg;
  const recommendedRestockKg = Math.max(0, totalRequiredKg - product.stock_kg);

  // Rekomendasi harus berupa tindakan, bukan pengulangan angka di panel lain.
  const fallbackInsight =
    recommendedRestockKg > 0
      ? `Stok diperkirakan kurang untuk sepekan ke depan. Segera siapkan tambahan pasokan dari petani mitra${
          input.isHolidayWeek ? ', lebih awal karena ada libur panjang' : ''
        }, terutama menjelang akhir pekan.`
      : 'Stok masih cukup untuk sepekan ke depan, jadi belum perlu menambah pasokan. Pastikan panen dan pengiriman siap menjelang akhir pekan (Jumat–Minggu).';

  const cleanedInsight = stripRedundantInsight(aiInsight);
  aiInsight = cleanedInsight.length > 0 ? cleanedInsight : fallbackInsight;

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
    // Transparansi: berapa yang dijadikan baseline vs yang diabaikan sebagai one-off.
    baselineDailyKg: round2(baselineDailyKg),
    oneOffExcludedKg,
    oneOffExcludedCount: oneOffRows.length,
    recentHistory: historyRows.slice(0, 5),
  };
}
