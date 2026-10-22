#!/usr/bin/env node
/**
 * sync-kiro.mjs — espejo bidireccional entre claude-meta (Claude Code) y Kiro.
 *
 * Mantiene iguales, en los dos sentidos:
 *   - las reglas de plugins/orchestration          ⇄ ~/.kiro/steering/<regla>.md
 *   - los subagentes de plugins/orchestration/agents ⇄ ~/.kiro/agents/<agente>.md
 *   - las memorias de Claude Code de este repo       ⇄ steering memoria-<slug>.md
 *     (global en ~/.kiro/steering, o en <meta>/.kiro/steering si es de un proyecto)
 *   - el .claude/CLAUDE.md de cada *-meta            ⇄ <meta>/.kiro/steering/proyecto.md
 *   - las skills de cada *-meta                      ⇄ <meta>/.kiro/skills/
 * y genera, solo hacia Kiro, el hook de inicio de sesión de la raíz y de cada
 * meta (.kiro/hooks/inicio-de-sesion.json).
 *
 * Los *-meta viven fuera del repo, en ../metas junto a él (o en CLAUDE_META_HOME):
 * son locales de la máquina y nunca se versionan.
 *
 * Lo que viaja es el contenido compartido de cada par: el cuerpo y, según el
 * tipo, la descripción, las herramientas del agente o si la memoria está
 * fijada. Cada lado conserva el resto de su encabezado. La huella de lo último
 * espejado se guarda en plugins/orchestration/kiro/estado.local.json, y qué
 * memorias son de un proyecto, en config.local.json. Los dos son locales y no
 * se versionan porque nombran proyectos de esta máquina. Según la huella:
 *   - cambió un solo lado        → se copia al otro;
 *   - cambiaron los dos          → no se toca nada y se reporta el conflicto;
 *   - aparece un archivo nuevo   → se crea del otro lado;
 *   - se borra de un lado        → se reporta y el par queda desvinculado; el
 *                                  otro lado no se borra.
 *
 * Uso:
 *   node tools/sync-kiro.mjs                            espeja y reporta
 *   node tools/sync-kiro.mjs --simular                  reporta sin escribir
 *   node tools/sync-kiro.mjs --hook                     calla si no hay novedades y nunca falla
 *   node tools/sync-kiro.mjs --gana claude|kiro <par>   resuelve un conflicto
 *   node tools/sync-kiro.mjs --revincular <par>         vuelve a espejar un par desvinculado
 *
 * <par> es el id que imprime el reporte (p. ej. memoria:<slug>)
 * o un trozo de la ruta de cualquiera de los dos lados.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..');
const METAS = process.env.CLAUDE_META_HOME || path.resolve(RAIZ, '..', 'metas');
const HOME = os.homedir();
const KIRO = process.env.KIRO_HOME || path.join(HOME, '.kiro');
const CLAUDE = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude');
// Claude Code guarda las memorias por proyecto, con la ruta del repo como clave.
const MEMORIAS = process.env.CLAUDE_MEMORY_DIR
  || path.join(CLAUDE, 'projects', RAIZ.replace(/[^A-Za-z0-9]/g, '-'), 'memory');
const DIR_CONF = path.join(RAIZ, 'plugins', 'orchestration', 'kiro');
const CONFIG = path.join(DIR_CONF, 'config.json');
const CONFIG_LOCAL = path.join(DIR_CONF, 'config.local.json');
const ESTADO = path.join(DIR_CONF, 'estado.local.json');
const CANDADO = `${ESTADO}.lock`;
const HOOK_KIRO = 'inicio-de-sesion.json';
const SCRIPT = path.join(AQUI, 'sync-kiro.mjs').replace(/\\/g, '/');
const TEXTO = /\.(md|txt|json|mjs|js|ts|sh|py|ya?ml|csv|html?)$/i;

const args = process.argv.slice(2);
const MODO_HOOK = args.includes('--hook');
const SIMULAR = args.includes('--simular');
const GANA = tomar('--gana', 2);
const REVINCULAR = tomar('--revincular', 1)?.[0];

let CONF;
let EST;
let confCambiada = false;
let localCambiada = false;
const eventos = [];
const avisos = [];

// ── utilidades ─────────────────────────────────────────────────────────────

function tomar(flag, n) {
  const i = args.indexOf(flag);
  return i < 0 ? null : args.slice(i + 1, i + 1 + n);
}

const lf = (s) => s.replace(/\r\n/g, '\n');
const huella = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const clave = (p) => path.resolve(p).toLowerCase();
const existe = (p) => fs.existsSync(p);

function leer(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function escribir(p, contenido) {
  if (SIMULAR) return;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, contenido);
}

function entradas(dir, filtro) {
  try { return fs.readdirSync(dir, { withFileTypes: true }).filter(filtro).map((d) => d.name); } catch { return []; }
}

const mds = (dir) => entradas(dir, (d) => d.isFile() && d.name.endsWith('.md')).map((n) => n.slice(0, -3));

function archivos(dir, base = dir) {
  const out = [];
  for (const d of entradas(dir, () => true)) {
    if (d === '.DS_Store') continue;
    const p = path.join(dir, d);
    if (fs.statSync(p).isDirectory()) out.push(...archivos(p, base));
    else out.push(path.relative(base, p).replace(/\\/g, '/'));
  }
  return out;
}

function mostrar(p) {
  const r = path.relative(RAIZ, p);
  if (!r.startsWith('..') && !path.isAbsolute(r)) return r.replace(/\\/g, '/');
  return `~/${path.relative(HOME, p)}`.replace(/\\/g, '/');
}

// ── encabezado YAML (el subconjunto que usan estos archivos) ────────────────

function separar(texto) {
  const t = lf(texto);
  const m = t.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  return m ? { enc: m[1], cuerpo: t.slice(m[0].length) } : { enc: null, cuerpo: t };
}

const unir = (enc, cuerpo) => (enc == null ? cuerpo : `---\n${enc}\n---\n${cuerpo}`);

function desentrecomillar(v) {
  if (v.startsWith('"')) { try { return JSON.parse(v); } catch { return v.slice(1, -1); } }
  if (v.startsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  return v;
}

// Índices [inicio, fin) de la clave de primer nivel y de sus líneas anidadas.
function tramo(lineas, k) {
  const i = lineas.findIndex((l) => l === `${k}:` || l.startsWith(`${k}: `));
  if (i < 0) return null;
  let fin = i + 1;
  while (fin < lineas.length && (lineas[fin] === '' || /^\s/.test(lineas[fin]))) fin++;
  return [i, fin];
}

function campo(enc, k) {
  if (!enc) return undefined;
  const lineas = enc.split('\n');
  const t = tramo(lineas, k);
  if (!t) return undefined;
  const v = lineas[t[0]].slice(k.length + 1).trim();
  if (/^[>|]-?$/.test(v)) {
    const bloque = lineas.slice(t[0] + 1, t[1]).map((l) => l.trim());
    return bloque.join(v.startsWith('>') ? ' ' : '\n').trim();
  }
  return desentrecomillar(v);
}

function lista(enc, k) {
  if (!enc) return [];
  const lineas = enc.split('\n');
  const t = tramo(lineas, k);
  if (!t) return [];
  const enLinea = lineas[t[0]].slice(k.length + 1).trim();
  if (enLinea.startsWith('[')) {
    return enLinea.slice(1, -1).split(',').map((x) => desentrecomillar(x.trim())).filter(Boolean);
  }
  return lineas.slice(t[0] + 1, t[1])
    .map((l) => l.match(/^\s+-\s+(.*)$/)?.[1])
    .filter(Boolean)
    .map((x) => desentrecomillar(x.trim()));
}

const escalar = (v) => (typeof v !== 'string' || /^[A-Za-z0-9_.\/-]+$/.test(v) ? String(v) : JSON.stringify(v));

function fijar(enc, k, valor) {
  const actual = Array.isArray(valor) ? lista(enc, k) : campo(enc, k);
  if (JSON.stringify(actual) === JSON.stringify(Array.isArray(valor) ? valor : String(valor))) return enc;
  const nuevas = Array.isArray(valor)
    ? [`${k}:`, ...valor.map((x) => `  - ${escalar(x)}`)]
    : [`${k}: ${escalar(valor)}`];
  const lineas = enc ? enc.split('\n') : [];
  const t = tramo(lineas, k);
  if (!t) return [...lineas, ...nuevas].join('\n');
  lineas.splice(t[0], t[1] - t[0], ...nuevas);
  return lineas.join('\n');
}

// metadata.pinned y metadata.modified de las memorias de Claude Code.
const fijadaClaude = (enc) => /^\s+pinned:\s*true\s*$/m.test(enc ?? '');

function fijarMetadata(enc, k, v) {
  const re = new RegExp(`^(\\s+)${k}:.*$`, 'm');
  if (re.test(enc)) return enc.replace(re, `$1${k}: ${v}`);
  if (/^metadata:\s*$/m.test(enc)) return enc.replace(/^metadata:\s*$/m, `metadata:\n  ${k}: ${v}`);
  return `${enc}\nmetadata:\n  ${k}: ${v}`;
}

// ── configuración y estado ─────────────────────────────────────────────────

function cargar() {
  CONF = JSON.parse(leer(CONFIG));
  CONF.agentes.porAgente ??= {};
  let local = null;
  try { local = JSON.parse(leer(CONFIG_LOCAL)); } catch { /* sin archivo local */ }
  // Las memorias por proyecto viven en config.local.json. Si config.json aún
  // las trae, se mudan al archivo local en la próxima escritura.
  const heredadas = CONF.memorias?.proyecto;
  delete CONF.memorias;
  if (heredadas && Object.keys(heredadas).length) {
    confCambiada = true;
    localCambiada = !local?.memorias?.proyecto;
  }
  CONF.memorias = { proyecto: local?.memorias?.proyecto ?? heredadas ?? {} };
  try { EST = JSON.parse(leer(ESTADO)); } catch { EST = null; }
  EST ??= {};
  EST.pares ??= {};
  EST.generados ??= {};
}

function guardar() {
  if (SIMULAR) return;
  if (confCambiada) {
    const { memorias, ...compartida } = CONF;
    fs.writeFileSync(CONFIG, `${JSON.stringify(compartida, null, 2)}\n`);
  }
  if (localCambiada) fs.writeFileSync(CONFIG_LOCAL, `${JSON.stringify({ memorias: CONF.memorias }, null, 2)}\n`);
  const tmp = `${ESTADO}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(EST, null, 2)}\n`);
  fs.renameSync(tmp, ESTADO);
}

function tomarCandado() {
  if (SIMULAR) return true;
  try {
    fs.writeFileSync(CANDADO, String(process.pid), { flag: 'wx' });
    return true;
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    // Un candado de más de un minuto es de una corrida que murió.
    if (Date.now() - fs.statSync(CANDADO).mtimeMs > 60_000) {
      fs.unlinkSync(CANDADO);
      return tomarCandado();
    }
    return false;
  }
}

function soltarCandado() {
  if (!SIMULAR) try { fs.unlinkSync(CANDADO); } catch { /* ya no está */ }
}

const herramientas = (nombre) => CONF.agentes.porAgente[nombre]?.tools ?? CONF.agentes.tools;

function guardarHerramientas(nombre, tools) {
  if (JSON.stringify(tools) === JSON.stringify(herramientas(nombre))) return;
  const propio = CONF.agentes.porAgente[nombre] ?? {};
  if (JSON.stringify(tools) === JSON.stringify(CONF.agentes.tools)) delete propio.tools;
  else propio.tools = tools;
  if (Object.keys(propio).length) CONF.agentes.porAgente[nombre] = propio;
  else delete CONF.agentes.porAgente[nombre];
  confCambiada = true;
}

function metaDeMemoria(slug) {
  return Object.entries(CONF.memorias.proyecto).find(([, slugs]) => slugs.includes(slug))?.[0];
}

function agregarMemoriaDeProyecto(meta, slug) {
  const slugs = (CONF.memorias.proyecto[meta] ??= []);
  if (!slugs.includes(slug)) { slugs.push(slug); localCambiada = true; }
}

// ── pares ──────────────────────────────────────────────────────────────────

function aMetas(p) {
  const rel = path.relative(RAIZ, p);
  const seg = rel.split(path.sep)[0];
  return !rel.startsWith('..') && !path.isAbsolute(rel) && seg.endsWith('-meta') ? path.join(METAS, rel) : p;
}

function metas() {
  return entradas(METAS, (d) => d.isDirectory() && d.name.endsWith('-meta'))
    .filter((m) => existe(path.join(METAS, m, '.claude')) || existe(path.join(METAS, m, '.kiro')));
}

function descubrirPares() {
  const pares = new Map();
  const kiroEmparejado = new Set();
  const agregar = (par, desdeKiro = false) => {
    if (pares.has(par.id)) {
      if (desdeKiro && clave(pares.get(par.id).kiro) !== clave(par.kiro)) {
        avisos.push(`sin emparejar: ${mostrar(par.kiro)} usa el mismo nombre que ${par.id}; renómbralo`);
      }
      return;
    }
    pares.set(par.id, par);
    kiroEmparejado.add(clave(par.kiro));
  };

  for (const r of CONF.reglas) {
    agregar({ id: `regla:${r.kiro.replace(/\.md$/, '')}`, tipo: 'regla', regla: r,
      claude: path.join(RAIZ, r.claude), kiro: path.join(KIRO, 'steering', r.kiro) });
  }

  const agC = path.join(RAIZ, CONF.agentes.dir);
  const agK = path.join(KIRO, 'agents');
  for (const nombre of new Set([...mds(agC), ...mds(agK)])) {
    agregar({ id: `agente:${nombre}`, tipo: 'agente', nombre,
      claude: path.join(agC, `${nombre}.md`), kiro: path.join(agK, `${nombre}.md`) });
  }

  for (const m of metas()) {
    const base = path.join(METAS, m);
    agregar({ id: `proyecto:${m}`, tipo: 'proyecto',
      claude: path.join(base, '.claude', 'CLAUDE.md'), kiro: path.join(base, '.kiro', 'steering', 'proyecto.md') });
    const sC = path.join(base, '.claude', 'skills');
    const sK = path.join(base, '.kiro', 'skills');
    for (const rel of new Set([...archivos(sC), ...archivos(sK)])) {
      agregar({ id: `skill:${m}/${rel}`, tipo: 'copia', claude: path.join(sC, rel), kiro: path.join(sK, rel) });
    }
  }

  // Memorias: primero los pares ya conocidos, para que no cambien de lugar.
  // Un par guardado cuando los meta vivían dentro del repo se rebasa a METAS.
  for (const [id, e] of Object.entries(EST.pares)) {
    if (id.startsWith('memoria:')) agregar({ id, tipo: 'memoria', slug: id.slice(8), claude: e.claude, kiro: aMetas(e.kiro) });
  }
  for (const slug of mds(MEMORIAS).filter((s) => s !== 'MEMORY')) {
    const meta = metaDeMemoria(slug);
    const dir = meta ? path.join(METAS, meta, '.kiro', 'steering') : path.join(KIRO, 'steering');
    agregar({ id: `memoria:${slug}`, tipo: 'memoria', slug,
      claude: path.join(MEMORIAS, `${slug}.md`), kiro: path.join(dir, `memoria-${slug}.md`) });
  }
  // Steering nuevo creado en Kiro: pasa a Claude Code como memoria.
  const reservados = new Set(['agents.md', 'proyecto.md', ...CONF.reglas.map((r) => r.kiro.toLowerCase())]);
  const dirsSteering = [[null, path.join(KIRO, 'steering')],
    ...metas().map((m) => [m, path.join(METAS, m, '.kiro', 'steering')])];
  for (const [meta, dir] of dirsSteering) {
    for (const f of mds(dir)) {
      const kp = path.join(dir, `${f}.md`);
      if (reservados.has(`${f.toLowerCase()}.md`) || kiroEmparejado.has(clave(kp))) continue;
      const slug = f.replace(/^memoria-/, '');
      agregar({ id: `memoria:${slug}`, tipo: 'memoria', slug, meta,
        claude: path.join(MEMORIAS, `${slug}.md`), kiro: kp }, true);
    }
  }
  return [...pares.values()];
}

// ── proyección y composición por tipo ──────────────────────────────────────

function leerLado(par, lado) {
  const p = par[lado];
  if (par.tipo !== 'copia') return leer(p);
  try { return fs.readFileSync(p); } catch { return null; }
}

function proyectar(par, lado, contenido) {
  if (par.tipo === 'copia') {
    return { contenido: TEXTO.test(par.claude) ? lf(contenido.toString('utf8')) : contenido.toString('base64') };
  }
  const { enc, cuerpo } = separar(contenido);
  switch (par.tipo) {
    case 'regla':
    case 'proyecto':
      return { cuerpo };
    case 'agente':
      return { cuerpo, description: campo(enc, 'description') ?? '',
        tools: lado === 'kiro' ? lista(enc, 'tools') : herramientas(par.nombre) };
    case 'memoria':
      return { cuerpo, description: campo(enc, 'description') ?? '',
        fijada: lado === 'kiro' ? (campo(enc, 'inclusion') ?? 'always') === 'always' : fijadaClaude(enc) };
    default:
      throw new Error(`tipo desconocido: ${par.tipo}`);
  }
}

function encabezadoRegla(r) {
  let enc = `inclusion: ${r.inclusion ?? 'always'}`;
  if (r.name) enc = fijar(enc, 'name', r.name);
  if (r.description) enc = fijar(enc, 'description', r.description);
  return enc;
}

function componer(par, destino, p, actual) {
  if (par.tipo === 'copia') {
    return TEXTO.test(par.claude) ? p.contenido : Buffer.from(p.contenido, 'base64');
  }
  let enc = actual != null ? separar(actual).enc : null;
  const kiro = destino === 'kiro';
  switch (par.tipo) {
    case 'regla':
      if (kiro && enc == null) enc = encabezadoRegla(par.regla);
      return unir(enc, p.cuerpo);
    case 'proyecto':
      if (kiro && enc == null) enc = 'inclusion: always';
      return unir(enc, p.cuerpo);
    case 'agente':
      enc = fijar(enc ?? `name: ${par.nombre}`, 'description', p.description);
      if (kiro) {
        enc = fijar(enc, 'tools', p.tools);
        if (campo(enc, 'includeMcpJson') === undefined) enc = fijar(enc, 'includeMcpJson', CONF.agentes.includeMcpJson ?? true);
      } else {
        guardarHerramientas(par.nombre, p.tools);
      }
      return unir(enc, p.cuerpo);
    case 'memoria':
      if (kiro) {
        enc ??= `inclusion: ${p.fijada ? 'always' : 'auto'}`;
        const inclusion = campo(enc, 'inclusion') ?? 'always';
        if (p.fijada && inclusion !== 'always') enc = fijar(enc, 'inclusion', 'always');
        if (!p.fijada && inclusion === 'always') enc = fijar(enc, 'inclusion', 'auto');
        if (campo(enc, 'name') === undefined) enc = fijar(enc, 'name', par.slug);
      } else {
        enc ??= `name: ${par.slug}\ndescription: ""\nmetadata:\n  node_type: memory\n  pinned: false\n  modified: ""`;
        enc = fijarMetadata(enc, 'pinned', p.fijada);
        enc = fijarMetadata(enc, 'modified', new Date().toISOString());
      }
      return unir(fijar(enc, 'description', p.description), p.cuerpo);
    default:
      throw new Error(`tipo desconocido: ${par.tipo}`);
  }
}

// ── espejo ─────────────────────────────────────────────────────────────────

function coincide(par, q) {
  const n = q.replace(/\\/g, '/').toLowerCase();
  return par.id.toLowerCase() === n
    || [par.claude, par.kiro].some((p) => p.replace(/\\/g, '/').toLowerCase().includes(n));
}

function volcar(par, destino, p, actual) {
  const origen = destino === 'kiro' ? 'claude' : 'kiro';
  escribir(par[destino], componer(par, destino, p, actual));
  if (destino === 'claude' && par.tipo === 'memoria' && par.meta) agregarMemoriaDeProyecto(par.meta, par.slug);
  if (SIMULAR) return;
  const escrito = leerLado(par, destino);
  if (huella(proyectar(par, destino, escrito)) !== huella(p)) {
    avisos.push(`${par.id}: ${mostrar(par[destino])} no quedó igual a ${origen}; revisa el encabezado`);
  }
}

function procesar(par) {
  let e = EST.pares[par.id];
  if (e && REVINCULAR && coincide(par, REVINCULAR)) {
    delete EST.pares[par.id];
    e = undefined;
  }
  if (e?.desvinculado) return;

  const tc = leerLado(par, 'claude');
  const tk = leerLado(par, 'kiro');
  if (tc == null && tk == null) { delete EST.pares[par.id]; return; }
  const pc = tc != null ? proyectar(par, 'claude', tc) : null;
  const pk = tk != null ? proyectar(par, 'kiro', tk) : null;
  const hc = pc && huella(pc);
  const hk = pk && huella(pk);
  const registrar = (h) => { EST.pares[par.id] = { claude: par.claude, kiro: par.kiro, huella: h }; };
  const evento = (tipo, sentido) => eventos.push({ tipo, par, sentido });

  if (pc && !pk) {
    if (e) { e.desvinculado = 'kiro'; return evento('borrado', 'en Kiro'); }
    volcar(par, 'kiro', pc, null);
    registrar(hc);
    return evento('nuevo', '→ Kiro');
  }
  if (!pc && pk) {
    if (e) { e.desvinculado = 'claude'; return evento('borrado', 'en Claude'); }
    volcar(par, 'claude', pk, null);
    registrar(hk);
    return evento('nuevo', '→ Claude');
  }
  if (hc === hk) return registrar(hc);

  let desde = GANA && coincide(par, GANA[1]) ? GANA[0] : null;
  if (!desde && e && hk === e.huella) desde = 'claude';
  if (!desde && e && hc === e.huella) desde = 'kiro';
  if (!desde) return evento('conflicto', '');
  if (desde === 'claude') { volcar(par, 'kiro', pc, tk); registrar(hc); return evento('cambio', '→ Kiro'); }
  volcar(par, 'claude', pk, tc);
  registrar(hk);
  return evento('cambio', '→ Claude');
}

// El hook de inicio de sesión de Kiro se genera: corre este espejo y los hooks
// SessionStart que el directorio ya tenga para Claude Code.
function comandosDeInicio(dir) {
  let conf;
  try { conf = JSON.parse(leer(path.join(dir, '.claude', 'settings.json'))); } catch { return []; }
  return (conf?.hooks?.SessionStart ?? [])
    .flatMap((h) => h.hooks ?? [])
    .filter((h) => h.type === 'command' && !h.command.includes('sync-kiro'))
    .map((h) => h.command.replace(/\$\{?CLAUDE_PROJECT_DIR\}?[\\/]/g, ''));
}

function generarHooks() {
  for (const dir of [RAIZ, ...metas().map((m) => path.join(METAS, m))]) {
    const comandos = [`node "${SCRIPT}" --hook`, ...comandosDeInicio(dir)];
    const prompt = [
      'Inicio de sesión. Antes de atender el primer pedido, corre en la raíz del workspace:',
      ...comandos.map((c) => `- \`${c}\``),
      'Si alguno imprime un aviso, resúmelo en una línea y sigue sus indicaciones. Si no imprimen nada, no comentes nada.',
    ].join('\n');
    const json = `${JSON.stringify({ version: 'v1', hooks: [{ name: 'Inicio de sesión', trigger: 'SessionStart',
      action: { type: 'agent', prompt }, timeout: 120, enabled: true }] }, null, 2)}\n`;
    const p = path.join(dir, '.kiro', 'hooks', HOOK_KIRO);
    const k = clave(p);
    const actual = leer(p);
    const previo = EST.generados[k];
    if (actual != null && lf(actual) === json) { EST.generados[k] = huella(json); continue; }
    // Si el archivo no es el que generó la corrida anterior, alguien lo editó.
    if (actual != null && huella(lf(actual)) !== previo) {
      const marca = `manual:${huella(lf(actual))}`;
      if (previo !== marca) avisos.push(`hook editado a mano, no se sobrescribe: ${mostrar(p)}`);
      EST.generados[k] = marca;
      continue;
    }
    escribir(p, json);
    EST.generados[k] = huella(json);
    eventos.push({ tipo: actual == null ? 'nuevo' : 'cambio', par: { id: `hook:${mostrar(p)}` }, sentido: '→ Kiro' });
  }
}

// ── reporte ────────────────────────────────────────────────────────────────

function reportar() {
  const de = (t) => eventos.filter((e) => e.tipo === t);
  const conflictos = de('conflicto');
  const borrados = de('borrado');
  const espejados = [...de('nuevo'), ...de('cambio')];
  const lineas = [];

  if (espejados.length) {
    if (!MODO_HOOK || espejados.length <= 8) {
      lineas.push(`${espejados.length} espejado(s)${SIMULAR ? ' (simulado)' : ''}:`);
      for (const e of espejados) lineas.push(`  ${e.tipo === 'nuevo' ? 'nuevo ' : 'cambio'} ${e.sentido}  ${e.par.id}`);
    } else {
      const aK = espejados.filter((e) => e.sentido === '→ Kiro').length;
      lineas.push(`${espejados.length} espejado(s): ${aK} hacia Kiro, ${espejados.length - aK} hacia Claude Code.`);
    }
  }
  for (const e of conflictos) {
    lineas.push(`CONFLICTO ${e.par.id}: cambió en los dos lados desde el último espejo.`);
    lineas.push(`  Claude: ${mostrar(e.par.claude)}`);
    lineas.push(`  Kiro:   ${mostrar(e.par.kiro)}`);
    lineas.push(`  Resolver: node tools/sync-kiro.mjs --gana claude|kiro ${e.par.id}`);
  }
  for (const e of borrados) {
    lineas.push(`borrado ${e.sentido}: ${e.par.id}. No se borra del otro lado; el par queda desvinculado.`);
    lineas.push(`  Para volver a espejarlo: node tools/sync-kiro.mjs --revincular ${e.par.id}`);
  }
  for (const a of avisos) lineas.push(`aviso: ${a}`);

  if (!lineas.length) {
    if (!MODO_HOOK) console.log('Sin cambios: Claude Code y Kiro están iguales.');
    return;
  }
  const titulo = MODO_HOOK ? '[espejo Kiro] ' : '';
  console.log(`${titulo}${lineas.join('\n')}`);
  if (MODO_HOOK && conflictos.length) console.log('Díselo al humano; no resuelvas el conflicto por tu cuenta.');
}

// ── principal ──────────────────────────────────────────────────────────────

function principal() {
  if (args.includes('--ayuda') || args.includes('-h')) {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').match(/\/\*\*([\s\S]*?)\*\//)[1].replace(/^ \* ?/gm, ''));
    return;
  }
  if (GANA && !['claude', 'kiro'].includes(GANA[0])) throw new Error('--gana espera claude o kiro, y el par');
  if (!tomarCandado()) {
    if (!MODO_HOOK) console.log('Otra corrida del espejo está en curso; intenta de nuevo en un momento.');
    return;
  }
  try {
    cargar();
    for (const par of descubrirPares()) procesar(par);
    generarHooks();
    guardar();
  } finally {
    soltarCandado();
  }
  reportar();
}

try {
  principal();
} catch (e) {
  if (!MODO_HOOK) throw e;
  console.log(`[espejo Kiro] error: ${e.message}. La sesión sigue; corre node tools/sync-kiro.mjs para ver el detalle.`);
}
