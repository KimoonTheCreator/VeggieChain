// Menjalankan backend-core (:3000) dan frontend Vite (:5173) dengan satu perintah:
//   npm run dev
// Tanpa dependency tambahan, dan Ctrl+C mematikan kedua proses sekaligus.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const useColor = process.stdout.isTTY ? '' : '\x1b[1m'; // tetap jelas saat output di-pipe

const SERVICES = [
  { name: 'backend ', color: '\x1b[32m', dir: 'backend-core', missing: 'backend-core/node_modules' },
  { name: 'frontend', color: '\x1b[36m', dir: 'frontend', missing: 'frontend/node_modules' },
];

for (const svc of SERVICES) {
  if (!existsSync(path.join(ROOT, svc.missing))) {
    console.error(
      `\x1b[31m[dev]\x1b[0m Dependency ${svc.dir} belum terpasang. Jalankan:\n         cd ${svc.dir} && npm install`
    );
    process.exit(1);
  }
}

const children = [];
let shuttingDown = false;

function prefix(stream, label, color) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      process.stdout.write(`${color}${label}\x1b[0m │ ${line}\n`);
    }
  });
  stream.on('end', () => {
    if (buffer) process.stdout.write(`${color}${label}\x1b[0m │ ${buffer}\n`);
  });
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try {
      // detached:true -> child jadi process group leader, jadi anak-cucunya ikut mati
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      try {
        child.kill('SIGTERM');
      } catch {}
    }
  }
  setTimeout(() => process.exit(code), 400);
}

for (const svc of SERVICES) {
  const child = spawn('npm', ['run', 'dev'], {
    cwd: path.join(ROOT, svc.dir),
    env: { ...process.env, FORCE_COLOR: '1' },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  prefix(child.stdout, svc.name, svc.color);
  prefix(child.stderr, svc.name, svc.color);

  child.on('error', (err) => {
    console.error(`${svc.color}${svc.name}\x1b[0m │ gagal dijalankan: ${err.message}`);
    shutdown(1);
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(
      `${svc.color}${svc.name}\x1b[0m │ berhenti (${signal ?? `exit ${code}`}), menghentikan service lain...`
    );
    shutdown(code ?? 1);
  });

  children.push(child);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('SIGHUP', () => shutdown(0));

console.log(`${useColor}\x1b[1mVeggieChain dev\x1b[0m`);
console.log('  backend  → http://localhost:3000');
console.log('  frontend → http://localhost:5173');
console.log('  Ctrl+C untuk menghentikan keduanya.\n');
