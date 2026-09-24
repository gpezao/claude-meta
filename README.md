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

## Activar la regla de checkpoints en todas las sesiones

`CHECKPOINTS.md` define cómo un agente te pide decisiones (cada pregunta se
entiende sola, sin scrollear) y dónde deja lo que tienes que revisar. Para
que aplique en toda sesión de Claude Code, no solo en las del modelo
orquestado, importarlo desde la memoria de usuario. Con el repo clonado en
`~/Proyectos/claude-meta`, agrega esta línea a `~/.claude/CLAUDE.md` (créalo
si no existe):

```
@~/Proyectos/claude-meta/plugins/orchestration/CHECKPOINTS.md
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
# Requiere que ~/Sites/<nombre-proyecto> exista como repo git.
# Ajusta la variable SITES si tus repos viven en otro directorio:
#   SITES=/ruta/a/repos ./new-project-meta.sh <nombre-proyecto>
```

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
    CHECKPOINTS.md         ← forma de los checkpoints y carpeta revision/
    README.md
tools/
  new-project-meta.sh      ← genera el directorio de trabajo de un proyecto
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
  defecto; usa `AskUserQuestion` en rondas batcheadas.
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
