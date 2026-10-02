#!/usr/bin/env node
// Vigía del compañero (etapa 0).
//
// Proceso liviano que mira las sesiones de Claude Code y avisa con
// notificaciones nativas de Windows cuando una te necesita o termina. Al
// arrancar, y una vez al día, muestra un resumen. Nunca llama a un modelo ni
// hace llamadas de red: solo lee archivos locales.
//
// Variables de entorno (opcionales):
//   COMPANERO_JOBS_DIR     sesiones de Claude Code (default: ~/.claude/jobs)
//   COMPANERO_META_HOME    raíz de los *-meta (default: la raíz de claude-meta)
//   COMPANERO_DATA_DIR     log y estado del vigía (default: %LOCALAPPDATA%\companero)
//   COMPANERO_INTERVALO_MS cada cuánto revisa (default: 5000)
//   COMPANERO_SIMULAR=1    escribe los avisos en el log en vez de mostrarlos

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  armarResumen,
  avisoDeSesion,
  debeResumirDelDia,
  detectarCambios,
  ESTADOS,
  fechaLocal,
  instantanea,
} from './nucleo.mjs';
import { crearFuenteClaudeCode } from './fuentes/claude-code.mjs';
import { leerCheckpointsPendientes } from './fuentes/revision.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

const CFG = {
  dirJobs: process.env.COMPANERO_JOBS_DIR || path.join(os.homedir(), '.claude', 'jobs'),
  metaHome: process.env.COMPANERO_META_HOME || path.resolve(AQUI, '..', '..'),
  dirDatos: process.env.COMPANERO_DATA_DIR || path.join(process.env.LOCALAPPDATA || os.homedir(), 'companero'),
  intervaloMs: Number(process.env.COMPANERO_INTERVALO_MS) || 5000,
  simular: process.env.COMPANERO_SIMULAR === '1',
};

const ARCHIVO_LOG = path.join(CFG.dirDatos, 'vigia.log');
const ARCHIVO_LATIDO = path.join(CFG.dirDatos, 'vigia.pid');
const ARCHIVO_ESTADO = path.join(CFG.dirDatos, 'estado.json');
const LOG_MAXIMO = 1024 * 1024;

fs.mkdirSync(CFG.dirDatos, { recursive: true });

function registrar(mensaje) {
  try {
    if (fs.existsSync(ARCHIVO_LOG) && fs.statSync(ARCHIVO_LOG).size > LOG_MAXIMO) {
      fs.renameSync(ARCHIVO_LOG, `${ARCHIVO_LOG}.1`);
    }
    fs.appendFileSync(ARCHIVO_LOG, `${new Date().toISOString()} ${mensaje}\n`);
  } catch {
    // Sin log no se detiene el vigía.
  }
}

// Una sola instancia: el vigía escribe un latido en cada vuelta. Si hay un
// latido reciente de otro proceso, este sale.
function otraInstanciaViva() {
  try {
    const { pid, latido } = JSON.parse(fs.readFileSync(ARCHIVO_LATIDO, 'utf8'));
    return pid !== process.pid && Date.now() - latido < CFG.intervaloMs * 3 + 2000;
  } catch {
    return false;
  }
}

function latir() {
  fs.writeFileSync(ARCHIVO_LATIDO, JSON.stringify({ pid: process.pid, latido: Date.now() }));
}

function leerEstado() {
  try {
    return JSON.parse(fs.readFileSync(ARCHIVO_ESTADO, 'utf8'));
  } catch {
    return {};
  }
}

function guardarEstado(estado) {
  fs.writeFileSync(ARCHIVO_ESTADO, JSON.stringify(estado));
}

function mostrar(aviso) {
  registrar(`aviso: ${aviso.titulo} | ${aviso.texto.replace(/\n/g, ' / ')}${aviso.accion ? ` | ${aviso.accion}` : ''}`);
  if (CFG.simular) return;
  const datos = Buffer.from(JSON.stringify(aviso), 'utf8').toString('base64');
  const ps = spawn(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(AQUI, 'avisar.ps1'), '-Datos', datos],
    { windowsHide: true, stdio: 'ignore' },
  );
  ps.on('error', (e) => registrar(`error al mostrar el aviso: ${e.message}`));
}

const fuentes = [crearFuenteClaudeCode({ dirJobs: CFG.dirJobs, registrar })];

function leerSesiones() {
  return fuentes.flatMap((f) => f.leer().map((s) => ({ ...s, _fuente: f })));
}

function mostrarResumen(sesiones) {
  const conDesde = sesiones.map((s) =>
    s.estado === ESTADOS.TE_NECESITA ? { ...s, desde: s._fuente.desde(s) } : s,
  );
  mostrar(armarResumen(conDesde, leerCheckpointsPendientes(CFG.metaHome)));
  guardarEstado({ ...leerEstado(), ultimoResumen: fechaLocal(new Date()) });
}

let previas = null;

function vuelta() {
  try {
    latir();
    const sesiones = leerSesiones();
    if (!previas) {
      mostrarResumen(sesiones);
    } else {
      for (const aviso of detectarCambios(previas, sesiones)) mostrar(avisoDeSesion(aviso));
      if (debeResumirDelDia(leerEstado().ultimoResumen, new Date())) mostrarResumen(sesiones);
    }
    previas = instantanea(sesiones);
  } catch (e) {
    registrar(`error en la vuelta: ${e.stack || e.message}`);
  }
}

if (otraInstanciaViva()) {
  registrar(`ya hay un vigía corriendo; este (pid ${process.pid}) sale`);
  process.exit(0);
}

registrar(`vigía iniciado (pid ${process.pid}${CFG.simular ? ', simulación' : ''}) · jobs: ${CFG.dirJobs} · meta: ${CFG.metaHome}`);
vuelta();
setInterval(vuelta, CFG.intervaloMs);
