// Fuente: checkpoints pendientes en <META_HOME>/*-meta/revision/*/checkpoint.md.
// El estado sale del encabezado que define CHECKPOINTS.md (estado: pendiente | resuelto).

import fs from 'node:fs';
import path from 'node:path';

const BYTES_ENCABEZADO = 1024;

export function estadoDeCheckpoint(contenido) {
  const encabezado = /^---\r?\n([\s\S]*?)\r?\n---/.exec(contenido);
  if (!encabezado) return null;
  const estado = /^estado:\s*(\S+)/m.exec(encabezado[1]);
  return estado ? estado[1] : null;
}

function leerInicio(archivo) {
  const fd = fs.openSync(archivo, 'r');
  try {
    const buf = Buffer.alloc(BYTES_ENCABEZADO);
    const n = fs.readSync(fd, buf, 0, BYTES_ENCABEZADO, 0);
    return buf.subarray(0, n).toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

const listarDirs = (dir) => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
};

export function leerCheckpointsPendientes(metaHome) {
  const pendientes = [];
  for (const meta of listarDirs(metaHome).filter((d) => d.endsWith('-meta'))) {
    const dirRevision = path.join(metaHome, meta, 'revision');
    for (const tema of listarDirs(dirRevision)) {
      const archivo = path.join(dirRevision, tema, 'checkpoint.md');
      let estado;
      try {
        estado = estadoDeCheckpoint(leerInicio(archivo));
      } catch {
        continue;
      }
      if (estado === 'pendiente') pendientes.push({ proyecto: meta.replace(/-meta$/, ''), tema, archivo });
    }
  }
  return pendientes;
}
