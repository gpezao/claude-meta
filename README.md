# claude-meta

Marketplace personal de plugins de Claude Code. Incluye el plugin
`orchestration`: modelo de trabajo orquestado donde una sesión conductora
con autoridad total dirige subagentes especializados en contextos aislados.

## Instalar el marketplace

```bash
/plugin marketplace add gpezao/claude-meta
```

## Instalar el plugin orchestration

```bash
/plugin install orchestration
```

Esto copia los 8 subagentes a `~/.claude/agents/`.

## Activar las reglas globales en todas las sesiones

Cuatro reglas aplican en toda sesión de Claude Code, no solo en las del modelo
orquestado:

- `ANTES-DE-EJECUTAR.md`: ante un pedido nuevo, el agente investiga, pregunta
  y confirma lo que entendió antes de ejecutar.
- `CHECKPOINTS.md`: cómo te pide decisiones (cada pregunta se entiende sola,
  sin scrollear) y dónde deja lo que tienes que revisar.
- `REDACCION-DE-ENTREGABLES.md`: tono neutral, hechos con fuente y sin
  copiar el contexto interno en lo que se comparte.
- `NOTAS-DE-SESION.md`: las correcciones y decisiones del humano se anotan
  en un archivo en el momento, para que la compactación no las pierda.

Se importan desde la memoria de usuario. Con el repo clonado en
`~/Proyectos/claude-meta`, agrega estas líneas a `~/.claude/CLAUDE.md`
(créalo si no existe):

```
@~/Proyectos/claude-meta/plugins/orchestration/ANTES-DE-EJECUTAR.md
@~/Proyectos/claude-meta/plugins/orchestration/CHECKPOINTS.md
@~/Proyectos/claude-meta/plugins/orchestration/REDACCION-DE-ENTREGABLES.md
@~/Proyectos/claude-meta/plugins/orchestration/NOTAS-DE-SESION.md
```

## Usar el modelo orquestado

### 1. Dar de alta un proyecto

```bash
# Descarga el script (o clona el repo):
curl -o new-project-meta.sh \
  https://raw.githubusercontent.com/gpezao/claude-meta/main/tools/new-project-meta.sh
chmod +x new-project-meta.sh

# Crea el directorio de trabajo del proyecto:
./new-project-meta.sh <nombre-proyecto>
# Requiere que ~/Proyectos/<nombre-proyecto> exista como repo git.
# Ajusta la variable SITES si tus repos viven en otro directorio:
#   SITES=/ruta/a/repos ./new-project-meta.sh <nombre-proyecto>
```

El directorio de trabajo (`<META_DIR>`) se crea en `metas/`, junto al repo
`claude-meta` (variable `META_HOME`). Es local de la máquina: guarda
decisiones, handoffs y material de clientes, así que nunca va dentro de este
repo ni a GitHub. El `.gitignore` ignora cualquier `*-meta` que quede en la
raíz.

### 2. Completar el norte del proyecto

```bash
# Edita el VISION.md que creó el script:
$EDITOR <META_DIR>/<nombre-proyecto>-meta/VISION.md
```

### 3. Abrir una sesión

```bash
cd <META_DIR>/<nombre-proyecto>-meta
claude
```

Y pega el primer prompt de
[SESSION-START.md](plugins/orchestration/SESSION-START.md).

## Usar el modelo en Kiro

Las reglas, los subagentes, las memorias de Claude Code y la configuración
de cada `*-meta` se espejan en Kiro con `tools/sync-kiro.mjs`. El espejo
funciona en los dos sentidos: lo que cambia en Claude Code pasa a Kiro, y lo
que cambia en Kiro vuelve a este repo.

| En claude-meta (Claude Code) | En Kiro |
|---|---|
| Reglas de `plugins/orchestration/` | `~/.kiro/steering/` |
| `plugins/orchestration/agents/` | `~/.kiro/agents/` |
| Memorias de Claude Code de este repo | `~/.kiro/steering/memoria-*.md`, o en el meta si son de un proyecto |
| `<meta>/.claude/CLAUDE.md` | `<meta>/.kiro/steering/proyecto.md` |
| `<meta>/.claude/skills/` | `<meta>/.kiro/skills/` |
| Hooks `SessionStart` de `<meta>/.claude/settings.json` | `<meta>/.kiro/hooks/inicio-de-sesion.json` (generado) |

Lo que Kiro hace distinto (sin `AskUserQuestion`, subagentes por nombre,
MCP propio) está en `plugins/orchestration/kiro/ADAPTACION-KIRO.md`, que
también llega a Kiro como steering.

- **Cuándo corre:** al abrir sesión, en las dos herramientas. En Claude Code,
  por un hook `SessionStart` en `~/.claude/settings.json`. En Kiro, por el
  hook de inicio de cada meta. También a mano: `node tools/sync-kiro.mjs`
  (`--simular` para ver sin escribir).
- **Conflictos:** si el mismo archivo cambió en los dos lados, no se toca y
  se reporta. Se resuelve con `--gana claude <par>` o `--gana kiro <par>`.
- **Archivos nuevos y borrados:** lo nuevo de un lado se crea en el otro. Lo
  borrado se reporta y el par queda desvinculado; el otro lado no se borra.
  `--revincular <par>` lo vuelve a espejar.
- **Configuración:** `plugins/orchestration/kiro/config.json` define las
  reglas espejadas y las herramientas de los agentes en Kiro. Qué memorias son
  de un proyecto vive en `config.local.json`, y el estado del espejo en
  `estado.local.json`. Ninguno de los dos se versiona.
- **MCP:** Kiro lee Jira por el servidor remoto de Atlassian
  (`~/.kiro/settings/mcp.json`). No tiene conector de Drive; lo que depende de
  Drive se hace desde Claude Code.

Para trabajar en un proyecto, abre su `*-meta` como workspace en Kiro.

## Estructura del repo

```
.claude-plugin/
  marketplace.json         ← registro del marketplace
plugins/
  orchestration/
    agents/                ← los 8 subagentes (se instalan en ~/.claude/agents/)
      planner.md
      implementer.md
      tester.md
      reviewer.md
      security-reviewer.md
      release.md
      explorer.md
      debugger.md
    MODELO-OPERATIVO.md    ← documento de proceso completo
    SESSION-START.md       ← cómo abrir una sesión y el primer prompt
    ANTES-DE-EJECUTAR.md   ← investigar, preguntar y confirmar antes de ejecutar
    CHECKPOINTS.md         ← forma de los checkpoints y carpeta revision/
    REDACCION-DE-ENTREGABLES.md ← tono y fuentes de lo que se comparte
    NOTAS-DE-SESION.md     ← notas que sobreviven a la compactación
    hooks/hooks.json       ← aviso de contexto, notas tras compactar, equilibrio al delegar y ruta del plugin
    scripts/               ← equilibrio de cuota y sus hooks
    skills/
      cuota/               ← modelo y proveedor por rol, equilibrio, puente a Codex
      cierre-de-card/      ← tester, reviewer, release y retro
    evals/                 ← casos de claude plugin eval (ver su README)
    kiro/
      ADAPTACION-KIRO.md   ← equivalencias Claude Code → Kiro
      config.json          ← qué se espeja y cómo
    README.md
tools/
  new-project-meta.sh      ← genera el directorio de trabajo de un proyecto
  sync-kiro.mjs            ← espejo bidireccional Claude Code ⇄ Kiro
```

## El modelo en una frase

Una sesión Claude Code actúa como orquestador-conductor con autoridad total
y conduce el trabajo spawneando subagentes especializados (`planner`,
`implementer`, `tester`, `reviewer`, `security-reviewer`, `release`,
`explorer`, `debugger`) en contextos aislados, leyendo su retorno y
decidiendo el siguiente paso. El humano entra en los puntos de decisión, no
en la mecánica.

Ver [MODELO-OPERATIVO.md](plugins/orchestration/MODELO-OPERATIVO.md) para
el detalle completo del proceso.

## Características

- **Grill en el intake**: el conductor interroga antes de ejecutar por
  defecto; usa `AskUserQuestion` en rondas batcheadas. La base
  (`ANTES-DE-EJECUTAR.md`) rige en toda sesión.
- **Checkpoints legibles**: cada decisión que se le pide al humano trae su
  contexto y sus opciones al lado; el material a revisar va a `revision/`
  del proyecto.
- **Estado en git**: la verdad es siempre el working tree, no documentos
  estáticos.
- **Red de seguridad del agente**: rama para cambios no triviales, verify
  antes de deploy, dump antes de destructivo de BD.
- **Autoridad total opt-in**: `settings.json` deja `deny` vacío; la
  seguridad la dueña el agente mediante reglas explícitas.
- **Terminado con evidencia**: `tester` en verde + `reviewer` sin
  hallazgos abiertos. Sin declarar "listo" con la sola opinión del agente.
- **Idioma**: español neutro; identificadores técnicos en inglés.
