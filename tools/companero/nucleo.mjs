// Lógica pura del vigía: decide qué avisar a partir de las sesiones leídas.
// No toca disco ni procesos, para poder probarla aislada (test/nucleo.test.mjs).

export const ESTADOS = Object.freeze({
  TRABAJANDO: 'trabajando',
  TE_NECESITA: 'te-necesita',
  TERMINO: 'termino',
  OTRO: 'otro',
});

const ESQUEMA_ACCION = 'companero:attach/';

// Foto de las sesiones para comparar en la vuelta siguiente.
export function instantanea(sesiones) {
  return new Map(sesiones.map((s) => [s.clave, { estado: s.estado, detalle: s.detalle }]));
}

// Compara la foto anterior con las sesiones actuales y devuelve los avisos.
// Solo avisa al entrar a "te necesita" (o si cambian sus decisiones) y al
// pasar a "terminó"; seguir en el mismo estado no repite el aviso.
export function detectarCambios(previas, actuales) {
  const avisos = [];
  for (const s of actuales) {
    const antes = previas.get(s.clave);
    if (s.estado === ESTADOS.TE_NECESITA) {
      if (!antes || antes.estado !== ESTADOS.TE_NECESITA || antes.detalle !== s.detalle) {
        avisos.push({ tipo: ESTADOS.TE_NECESITA, sesion: s });
      }
    } else if (s.estado === ESTADOS.TERMINO && antes && antes.estado !== ESTADOS.TERMINO) {
      avisos.push({ tipo: ESTADOS.TERMINO, sesion: s });
    }
  }
  return avisos;
}

// Texto, sonido y acción del aviso de una sesión.
export function avisoDeSesion({ tipo, sesion }) {
  const necesita = tipo === ESTADOS.TE_NECESITA;
  return {
    titulo: `${sesion.nombre} ${necesita ? 'te necesita' : 'terminó'}`,
    texto: sesion.detalle || (necesita ? 'Revisa la sesión.' : ''),
    sonido: necesita,
    accion: sesion.fuente === 'claude-code' ? `${ESQUEMA_ACCION}${sesion.id}` : null,
  };
}

// "8 h", "25 min", "3 d".
export function hace(ms) {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Resumen sin modelo: quién te espera (la más antigua primero), cuántas
// trabajan y qué checkpoints quedaron pendientes en revision/.
export function armarResumen(sesiones, checkpointsPendientes, ahora = Date.now()) {
  const esperan = sesiones
    .filter((s) => s.estado === ESTADOS.TE_NECESITA)
    .sort((a, b) => (a.desde ?? ahora) - (b.desde ?? ahora));
  const trabajando = sesiones.filter((s) => s.estado === ESTADOS.TRABAJANDO).length;

  const titulo = esperan.length
    ? plural(esperan.length, 'sesión te espera', 'sesiones te esperan')
    : 'Nada te espera';

  const lineas = [];
  if (esperan.length) {
    const visibles = esperan
      .slice(0, 3)
      .map((s) => (s.desde ? `${s.nombre} (hace ${hace(ahora - s.desde)})` : s.nombre));
    if (esperan.length > 3) visibles.push(`y ${esperan.length - 3} más`);
    lineas.push(visibles.join(' · '));
  }
  if (checkpointsPendientes.length) {
    const proyectos = [...new Set(checkpointsPendientes.map((c) => c.proyecto))].join(', ');
    lineas.push(`${plural(checkpointsPendientes.length, 'checkpoint pendiente', 'checkpoints pendientes')}: ${proyectos}`);
  }
  if (trabajando) lineas.push(`${plural(trabajando, 'sesión trabajando', 'sesiones trabajando')}`);
  if (!lineas.length) lineas.push('Sin sesiones activas ni checkpoints pendientes.');

  return { titulo, texto: lineas.join('\n'), sonido: esperan.length > 0, accion: null };
}

// Fecha local "AAAA-MM-DD".
export function fechaLocal(fecha) {
  const p = (n) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}`;
}

// El resumen del día sale una vez por fecha, desde cierta hora: así aparece al
// despertar el equipo en la mañana aunque el vigía lleve días corriendo.
export function debeResumirDelDia(ultimaFecha, ahora, horaMinima = 6) {
  return fechaLocal(ahora) !== ultimaFecha && ahora.getHours() >= horaMinima;
}
