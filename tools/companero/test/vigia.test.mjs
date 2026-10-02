// Prueba de punta a punta del vigía en modo simulación: los avisos van al log
// en vez de mostrarse, y las sesiones salen de una carpeta temporal.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const vigia = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'vigia.mjs');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function esperarEnLog(log, patron, plazoMs = 5000) {
  const fin = Date.now() + plazoMs;
  while (Date.now() < fin) {
    if (fs.existsSync(log) && patron.test(fs.readFileSync(log, 'utf8'))) return true;
    await esperar(100);
  }
  return false;
}

function escribirJob(dirJobs, id, datos) {
  fs.mkdirSync(path.join(dirJobs, id), { recursive: true });
  fs.writeFileSync(path.join(dirJobs, id, 'state.json'), JSON.stringify(datos));
}

function lanzar(raiz, extraEnv = {}) {
  return spawn(process.execPath, [vigia], {
    env: {
      ...process.env,
      COMPANERO_JOBS_DIR: path.join(raiz, 'jobs'),
      COMPANERO_META_HOME: path.join(raiz, 'meta'),
      COMPANERO_DATA_DIR: path.join(raiz, 'datos'),
      COMPANERO_INTERVALO_MS: '150',
      COMPANERO_SIMULAR: '1',
      ...extraEnv,
    },
    stdio: 'ignore',
  });
}

test('resume al arrancar, avisa los cambios y no permite dos instancias', async (t) => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'companero-vigia-'));
  const jobs = path.join(raiz, 'jobs');
  const log = path.join(raiz, 'datos', 'vigia.log');
  escribirJob(jobs, 'aaaa0001', { state: 'blocked', name: 'forms', detail: 'D1 ok/cambios' });
  escribirJob(jobs, 'aaaa0002', { state: 'working', name: 'cognus' });
  fs.mkdirSync(path.join(raiz, 'meta', 'gauss-sdd-meta', 'revision', 'tema'), { recursive: true });
  fs.writeFileSync(path.join(raiz, 'meta', 'gauss-sdd-meta', 'revision', 'tema', 'checkpoint.md'), '---\nestado: pendiente\n---\n');

  const proceso = lanzar(raiz);
  t.after(() => proceso.kill());

  assert.ok(
    await esperarEnLog(log, /aviso: 1 sesión te espera \| forms .*1 checkpoint pendiente: gauss-sdd .*1 sesión trabajando/),
    'resumen al arrancar',
  );

  escribirJob(jobs, 'aaaa0002', { state: 'blocked', name: 'cognus', detail: 'D1 push (ok/cambios)' });
  assert.ok(
    await esperarEnLog(log, /aviso: cognus te necesita \| D1 push \(ok\/cambios\) \| companero:attach\/aaaa0002/),
    'aviso al bloquearse',
  );

  escribirJob(jobs, 'aaaa0001', { state: 'done', name: 'forms', detail: 'PR abierto' });
  assert.ok(await esperarEnLog(log, /aviso: forms terminó \| PR abierto/), 'aviso al terminar');

  const segundo = lanzar(raiz);
  await new Promise((r) => segundo.on('exit', r));
  assert.ok(await esperarEnLog(log, /ya hay un vigía corriendo/), 'la segunda instancia sale');

  const avisosDeBloqueo = fs.readFileSync(log, 'utf8').match(/cognus te necesita/g) ?? [];
  assert.equal(avisosDeBloqueo.length, 1, 'no repite el aviso de la misma espera');
});
