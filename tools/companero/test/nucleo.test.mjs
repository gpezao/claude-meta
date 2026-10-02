import test from 'node:test';
import assert from 'node:assert/strict';
import {
  armarResumen,
  avisoDeSesion,
  debeResumirDelDia,
  detectarCambios,
  ESTADOS,
  hace,
  instantanea,
} from '../nucleo.mjs';

const sesion = (id, estado, detalle = '', extra = {}) => ({
  fuente: 'claude-code',
  clave: `claude-code:${id}`,
  id,
  nombre: `sesión ${id}`,
  estado,
  detalle,
  ...extra,
});

test('avisa cuando una sesión pasa de trabajando a te necesita', () => {
  const previas = instantanea([sesion('a1', ESTADOS.TRABAJANDO)]);
  const avisos = detectarCambios(previas, [sesion('a1', ESTADOS.TE_NECESITA, 'D1 ok/cambios')]);
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].tipo, ESTADOS.TE_NECESITA);
});

test('no repite el aviso si sigue esperando con las mismas decisiones', () => {
  const s = sesion('a1', ESTADOS.TE_NECESITA, 'D1 ok/cambios');
  assert.deepEqual(detectarCambios(instantanea([s]), [s]), []);
});

test('vuelve a avisar si cambian las decisiones pendientes', () => {
  const previas = instantanea([sesion('a1', ESTADOS.TE_NECESITA, 'D1 ok/cambios')]);
  const avisos = detectarCambios(previas, [sesion('a1', ESTADOS.TE_NECESITA, 'D2 A/B')]);
  assert.equal(avisos.length, 1);
});

test('avisa cuando una sesión termina, una sola vez', () => {
  const previas = instantanea([sesion('a1', ESTADOS.TRABAJANDO)]);
  const terminada = sesion('a1', ESTADOS.TERMINO, 'PR #24 abierto');
  assert.equal(detectarCambios(previas, [terminada])[0].tipo, ESTADOS.TERMINO);
  assert.deepEqual(detectarCambios(instantanea([terminada]), [terminada]), []);
});

test('una sesión nueva que ya espera avisa; una nueva que ya terminó no', () => {
  const avisos = detectarCambios(new Map(), [
    sesion('n1', ESTADOS.TE_NECESITA, 'D1'),
    sesion('n2', ESTADOS.TERMINO, 'listo'),
  ]);
  assert.deepEqual(avisos.map((a) => a.sesion.id), ['n1']);
});

test('el aviso de te necesita suena y abre la sesión con el protocolo', () => {
  const aviso = avisoDeSesion({ tipo: ESTADOS.TE_NECESITA, sesion: sesion('412d0689', ESTADOS.TE_NECESITA, 'D1 · D2') });
  assert.equal(aviso.titulo, 'sesión 412d0689 te necesita');
  assert.equal(aviso.texto, 'D1 · D2');
  assert.equal(aviso.sonido, true);
  assert.equal(aviso.accion, 'companero:attach/412d0689');
});

test('el aviso de terminó es silencioso', () => {
  const aviso = avisoDeSesion({ tipo: ESTADOS.TERMINO, sesion: sesion('a1', ESTADOS.TERMINO, 'listo') });
  assert.equal(aviso.titulo, 'sesión a1 terminó');
  assert.equal(aviso.sonido, false);
});

test('una fuente que no es Claude Code no lleva acción de clic', () => {
  const aviso = avisoDeSesion({ tipo: ESTADOS.TERMINO, sesion: { ...sesion('k1', ESTADOS.TERMINO), fuente: 'kiro' } });
  assert.equal(aviso.accion, null);
});

test('hace() redondea a minutos, horas o días', () => {
  assert.equal(hace(25 * 60000), '25 min');
  assert.equal(hace(8 * 3600000), '8 h');
  assert.equal(hace(3 * 86400000), '3 d');
});

test('el resumen ordena por antigüedad y cuenta checkpoints y sesiones activas', () => {
  const ahora = Date.parse('2026-10-02T23:00:00Z');
  const resumen = armarResumen(
    [
      sesion('a', ESTADOS.TE_NECESITA, '', { nombre: 'forms', desde: ahora - 8 * 3600000 }),
      sesion('b', ESTADOS.TE_NECESITA, '', { nombre: 'kiro', desde: ahora - 2 * 86400000 }),
      sesion('c', ESTADOS.TRABAJANDO),
    ],
    [{ proyecto: 'gauss-sdd' }, { proyecto: 'app-mobile-forms' }, { proyecto: 'gauss-sdd' }],
    ahora,
  );
  assert.equal(resumen.titulo, '2 sesiones te esperan');
  assert.equal(
    resumen.texto,
    'kiro (hace 2 d) · forms (hace 8 h)\n3 checkpoints pendientes: gauss-sdd, app-mobile-forms\n1 sesión trabajando',
  );
  assert.equal(resumen.sonido, true);
});

test('el resumen sin pendientes lo dice y no suena', () => {
  const resumen = armarResumen([], []);
  assert.equal(resumen.titulo, 'Nada te espera');
  assert.equal(resumen.texto, 'Sin sesiones activas ni checkpoints pendientes.');
  assert.equal(resumen.sonido, false);
});

test('el resumen muestra hasta 3 sesiones y cuenta el resto', () => {
  const muchas = ['a', 'b', 'c', 'd', 'e'].map((id) => sesion(id, ESTADOS.TE_NECESITA, '', { nombre: id }));
  assert.match(armarResumen(muchas, []).texto, /^a · b · c · y 2 más$/);
});

test('el resumen del día sale una vez por fecha y desde las 6', () => {
  assert.equal(debeResumirDelDia('2026-10-01', new Date(2026, 9, 2, 8, 0)), true);
  assert.equal(debeResumirDelDia('2026-10-02', new Date(2026, 9, 2, 8, 0)), false);
  assert.equal(debeResumirDelDia('2026-10-01', new Date(2026, 9, 2, 3, 0)), false);
  assert.equal(debeResumirDelDia(undefined, new Date(2026, 9, 2, 9, 0)), true);
});
