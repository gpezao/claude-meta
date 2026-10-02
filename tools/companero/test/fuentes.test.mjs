import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { crearFuenteClaudeCode } from '../fuentes/claude-code.mjs';
import { estadoDeCheckpoint, leerCheckpointsPendientes } from '../fuentes/revision.mjs';
import { ESTADOS } from '../nucleo.mjs';

const dirTemporal = () => fs.mkdtempSync(path.join(os.tmpdir(), 'companero-'));

function escribirJob(dirJobs, id, estado, extra = {}) {
  fs.mkdirSync(path.join(dirJobs, id), { recursive: true });
  fs.writeFileSync(path.join(dirJobs, id, 'state.json'), JSON.stringify({ state: estado, ...extra }));
}

test('normaliza los estados de Claude Code', () => {
  const dir = dirTemporal();
  escribirJob(dir, 'aaaa0001', 'blocked', { name: 'forms', detail: ' D1 ok/cambios ' });
  escribirJob(dir, 'aaaa0002', 'working', { name: 'cognus' });
  escribirJob(dir, 'aaaa0003', 'done', {});
  escribirJob(dir, 'aaaa0004', 'raro', {});
  const porId = Object.fromEntries(crearFuenteClaudeCode({ dirJobs: dir }).leer().map((s) => [s.id, s]));

  assert.equal(porId.aaaa0001.estado, ESTADOS.TE_NECESITA);
  assert.equal(porId.aaaa0001.nombre, 'forms');
  assert.equal(porId.aaaa0001.detalle, 'D1 ok/cambios');
  assert.equal(porId.aaaa0001.clave, 'claude-code:aaaa0001');
  assert.equal(porId.aaaa0002.estado, ESTADOS.TRABAJANDO);
  assert.equal(porId.aaaa0003.estado, ESTADOS.TERMINO);
  assert.equal(porId.aaaa0003.nombre, 'aaaa0003');
  assert.equal(porId.aaaa0004.estado, ESTADOS.OTRO);
});

test('un state.json a medio escribir conserva la lectura anterior', () => {
  const dir = dirTemporal();
  escribirJob(dir, 'aaaa0001', 'blocked', { name: 'forms' });
  const fuente = crearFuenteClaudeCode({ dirJobs: dir });
  assert.equal(fuente.leer()[0].estado, ESTADOS.TE_NECESITA);

  const archivo = path.join(dir, 'aaaa0001', 'state.json');
  fs.writeFileSync(archivo, '{"state": "work');
  fs.utimesSync(archivo, new Date(), new Date(Date.now() + 5000));
  const [sesion] = fuente.leer();
  assert.equal(sesion.estado, ESTADOS.TE_NECESITA);
});

test('sin carpeta de sesiones devuelve una lista vacía', () => {
  assert.deepEqual(crearFuenteClaudeCode({ dirJobs: path.join(dirTemporal(), 'no-existe') }).leer(), []);
});

test('si ningún state.json se puede leer, usa el respaldo', () => {
  const dir = dirTemporal();
  fs.mkdirSync(path.join(dir, 'aaaa0001'));
  fs.writeFileSync(path.join(dir, 'aaaa0001', 'state.json'), 'no es json');
  let llamadas = 0;
  const respaldo = () => {
    llamadas++;
    return [{ id: 'aaaa0001', estado: ESTADOS.TE_NECESITA }];
  };
  const fuente = crearFuenteClaudeCode({ dirJobs: dir, leerRespaldo: respaldo });
  assert.equal(fuente.leer()[0].estado, ESTADOS.TE_NECESITA);
  fuente.leer();
  assert.equal(llamadas, 1, 'el respaldo no se llama en cada vuelta');
});

test('desde() toma el inicio de la racha actual en timeline.jsonl', () => {
  const dir = dirTemporal();
  escribirJob(dir, 'aaaa0001', 'blocked', { updatedAt: 1 });
  const eventos = [
    { at: '2026-10-02T10:00:00Z', state: 'working' },
    { at: '2026-10-02T14:47:00Z', state: 'blocked' },
    { at: '2026-10-02T15:00:00Z', state: 'blocked' },
  ];
  fs.writeFileSync(path.join(dir, 'aaaa0001', 'timeline.jsonl'), eventos.map((e) => JSON.stringify(e)).join('\n'));
  const fuente = crearFuenteClaudeCode({ dirJobs: dir });
  const [sesion] = fuente.leer();
  assert.equal(fuente.desde(sesion), Date.parse('2026-10-02T14:47:00Z'));
});

test('desde() sin timeline usa la última actualización', () => {
  const dir = dirTemporal();
  escribirJob(dir, 'aaaa0001', 'blocked', { updatedAt: 1234 });
  const fuente = crearFuenteClaudeCode({ dirJobs: dir });
  assert.equal(fuente.desde(fuente.leer()[0]), 1234);
});

test('lee el estado del encabezado de un checkpoint', () => {
  assert.equal(estadoDeCheckpoint('---\nproyecto: cognus\nestado: pendiente\n---\n# x'), 'pendiente');
  assert.equal(estadoDeCheckpoint('---\r\nestado: resuelto   # nota\r\n---\r\n'), 'resuelto');
  assert.equal(estadoDeCheckpoint('# sin encabezado\nestado: pendiente'), null);
});

test('cuenta solo los checkpoints pendientes de las carpetas *-meta', () => {
  const home = dirTemporal();
  const checkpoint = (meta, tema, estado) => {
    fs.mkdirSync(path.join(home, meta, 'revision', tema), { recursive: true });
    fs.writeFileSync(path.join(home, meta, 'revision', tema, 'checkpoint.md'), `---\nestado: ${estado}\n---\n`);
  };
  checkpoint('cognus-meta', '2026-09-24-IDS-3812', 'resuelto');
  checkpoint('gauss-sdd-meta', '2026-09-28-propuesta', 'pendiente');
  checkpoint('otro-dir', '2026-09-28-x', 'pendiente');
  fs.mkdirSync(path.join(home, 'cognus-meta', 'revision', 'sin-checkpoint'));

  assert.deepEqual(
    leerCheckpointsPendientes(home).map((c) => [c.proyecto, c.tema]),
    [['gauss-sdd', '2026-09-28-propuesta']],
  );
});
