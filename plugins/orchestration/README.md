# Plugin: orchestration

Modelo de trabajo orquestado con Claude Code. Una sesión conductora con
autoridad total dirige subagentes especializados en contextos aislados.

## Qué incluye

**8 subagentes** (se instalan en `~/.claude/agents/`):

| Agente | Cuándo usarlo |
|--------|---------------|
| `planner` | Diseño no trivial antes de codear |
| `implementer` | Escritura de código de mucho volumen |
| `tester` | Validar criterios Given/When/Then |
| `reviewer` | Calidad del diff antes de commitear |
| `security-reviewer` | Gate obligatorio para cambios sensibles |
| `release` | Commit / push / PR |
| `explorer` | Entender código existente antes de modificar |
| `debugger` | Reproducir un bug y aislar la causa raíz |

**Documentos de proceso:**

- `MODELO-OPERATIVO.md` — el proceso completo: grill en el intake, pipeline
  de subagentes, autoridad total, estado en git.
- `SESSION-START.md` — cómo abrir una sesión y el primer prompt.
- `CHECKPOINTS.md` — cómo un agente le pide decisiones al humano sin
  obligarlo a scrollear, y dónde deja el material a revisar (`revision/`).
  Se carga en toda sesión desde `~/.claude/CLAUDE.md`.

## Cómo funciona

El conductor (la sesión Claude Code en el directorio de trabajo del
proyecto) lee `MODELO-OPERATIVO.md` y spawnea los subagentes con la
herramienta `Agent`. Cada subagente corre aislado en su propio contexto y
devuelve un retorno que el conductor lee para decidir el siguiente paso.

El humano interviene solo en los puntos de decisión (qué approach, si
desplegamos hoy), no en la mecánica.

## Configurar un proyecto nuevo

Después de instalar el plugin:

```bash
# 1. Clona new-project-meta.sh del repo (o descárgalo):
#    https://github.com/gpezao/claude-meta/blob/main/tools/new-project-meta.sh

# 2. Da de alta el directorio de trabajo:
./new-project-meta.sh <nombre-proyecto>   # requiere que <ruta-codigo> sea un repo git

# 3. Abre la sesión desde el directorio de trabajo:
cd <META_DIR>/<nombre-proyecto>-meta
claude
```

Ver `SESSION-START.md` para el primer prompt.
