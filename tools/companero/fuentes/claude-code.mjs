// Fuente: sesiones en segundo plano de Claude Code.
//
// Lee ~/.claude/jobs/<id>/state.json, que Claude Code mantiene por cada sesión
// en segundo plano: estado (working | blocked | done), titular en una línea
// (para una bloqueada, su línea "needs input:") y nombre. No gasta tokens.
//
// state.json es un archivo interno, no documentado. Si deja de poder leerse,
// se recurre a `claude agents --json` (documentado), que trae nombre y estado
// pero no el titular.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ESTADOS } from '../nucleo.mjs';

const MAPA_ESTADOS = {
  blocked: ESTADOS.TE_NECESITA,
  done: ESTADOS.TERMINO,
  working: ESTADOS.TRABAJANDO,
};

const RESPALDO_CADA_MS = 30000;

export function normalizar(id, crudo) {
  return {
    fuente: 'claude-code',
    clave: `claude-code:${id}`,
    id,
    nombre: crudo.name || id,
    estado: MAPA_ESTADOS[crudo.state] ?? ESTADOS.OTRO,
    estadoOriginal: crudo.state ?? null,
    detalle: (crudo.detail || '').trim(),
    actualizado: crudo.updatedAt ?? null,
    cwd: crudo.cwd ?? null,
  };
}

export function crearFuenteClaudeCode({
  dirJobs = path.join(os.homedir(), '.claude', 'jobs'),
  leerRespaldo = leerConClaudeAgents,
  registrar = () => {},
} = {}) {
  const cache = new Map(); // archivo → { mtimeMs, sesion }
  let respaldo = { en: 0, sesiones: [] };
  let avisadoRespaldo = false;

  function leer() {
    let entradas;
    try {
      entradas = fs.readdirSync(dirJobs, { withFileTypes: true }).filter((e) => e.isDirectory());
    } catch {
      return [];
    }

    const sesiones = [];
    const vistos = new Set();
    for (const e of entradas) {
      const archivo = path.join(dirJobs, e.name, 'state.json');
      let st;
      try {
        st = fs.statSync(archivo);
      } catch {
        continue;
      }
      vistos.add(archivo);
      const enCache = cache.get(archivo);
      if (enCache && enCache.mtimeMs === st.mtimeMs) {
        sesiones.push(enCache.sesion);
        continue;
      }
      try {
        const sesion = normalizar(e.name, JSON.parse(fs.readFileSync(archivo, 'utf8')));
        cache.set(archivo, { mtimeMs: st.mtimeMs, sesion });
        sesiones.push(sesion);
      } catch {
        // Archivo a medio escribir: se usa la lectura anterior y se reintenta
        // en la próxima vuelta, para no inventar un cambio de estado.
        if (enCache) sesiones.push(enCache.sesion);
      }
    }
    for (const archivo of cache.keys()) if (!vistos.has(archivo)) cache.delete(archivo);

    if (sesiones.length || !entradas.length) return sesiones;

    // Hay sesiones pero ningún state.json legible: el formato pudo cambiar.
    if (!avisadoRespaldo) {
      registrar('state.json no legible; se usa `claude agents --json` como respaldo');
      avisadoRespaldo = true;
    }
    if (Date.now() - respaldo.en > RESPALDO_CADA_MS) {
      respaldo = { en: Date.now(), sesiones: leerRespaldo() };
    }
    return respaldo.sesiones;
  }

  // Desde cuándo la sesión está en su estado actual, según timeline.jsonl.
  function desde(sesion) {
    try {
      const lineas = fs
        .readFileSync(path.join(dirJobs, sesion.id, 'timeline.jsonl'), 'utf8')
        .trim()
        .split('\n');
      let inicio = null;
      for (let i = lineas.length - 1; i >= 0; i--) {
        let evento;
        try {
          evento = JSON.parse(lineas[i]);
        } catch {
          continue;
        }
        if (evento.state !== sesion.estadoOriginal) break;
        inicio = Date.parse(evento.at);
      }
      if (Number.isFinite(inicio)) return inicio;
    } catch {
      // Sin timeline: se cae al último cambio del estado.
    }
    return sesion.actualizado ?? null;
  }

  return { nombre: 'claude-code', leer, desde };
}

function leerConClaudeAgents() {
  const r = spawnSync('claude agents --json', { shell: true, encoding: 'utf8', timeout: 20000, windowsHide: true });
  try {
    return JSON.parse(r.stdout).map((s) => normalizar(s.id, { name: s.name, state: s.state, cwd: s.cwd }));
  } catch {
    return [];
  }
}
