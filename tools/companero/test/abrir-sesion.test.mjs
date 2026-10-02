// El protocolo companero: lo puede invocar cualquier página o programa, así
// que abrir-sesion.ps1 tiene que rechazar todo lo que no sea un id válido.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'abrir-sesion.ps1');

function validar(uri) {
  const r = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Uri', uri, '-SoloValidar'],
    { encoding: 'utf8', windowsHide: true },
  );
  return { codigo: r.status, salida: r.stdout.trim() };
}

test('acepta un id de sesión válido', () => {
  assert.deepEqual(validar('companero:attach/412d0689'), { codigo: 0, salida: '412d0689' });
  assert.deepEqual(validar('companero://attach/412d0689/'), { codigo: 0, salida: '412d0689' });
});

for (const uri of [
  'companero:attach/412d0689;calc',
  'companero:attach/412d0689 & calc',
  'companero:attach/../../x',
  'companero:attach/412D0689',
  'companero:attach/412d068',
  'companero:run/412d0689',
  'otro:attach/412d0689',
  '',
]) {
  test(`rechaza ${JSON.stringify(uri)}`, () => {
    assert.equal(validar(uri).codigo, 1);
  });
}
