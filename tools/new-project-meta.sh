#!/usr/bin/env bash
# Da de alta el directorio de trabajo de un proyecto.
# Uso: ./new-project-meta.sh <proyecto>
# donde RUTA_CODIGO es el repo de código del proyecto.
#
# Variables de entorno (opcionales):
#   META_HOME — directorio raíz para los meta de proyectos
#               (default: directorio padre del script; ~/Sites/meta si clonaste ahí)
#   SITES     — directorio raíz de repos de código
#               (default: ~/Sites)
set -euo pipefail

PROY="${1:-}"
if [[ -z "$PROY" ]]; then
  echo "Uso: ./new-project-meta.sh <proyecto>" >&2
  exit 1
fi

SITES="${SITES:-$HOME/Sites}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
META_HOME="${META_HOME:-$(dirname "$SCRIPT_DIR")}"
CODIGO="${SITES}/${PROY}"
META="${META_HOME}/${PROY}-meta"

if [[ ! -d "$CODIGO" ]]; then
  echo "No existe el repo de código: $CODIGO" >&2
  echo "Ajusta la variable SITES o crea el directorio antes de continuar." >&2
  exit 1
fi
if [[ ! -d "$CODIGO/.git" ]]; then
  echo "Advertencia: $CODIGO no parece un repo git (no hay .git). El estado se ancla a git, así que revisa esto." >&2
fi
if [[ -e "$META" ]]; then
  echo "Ya existe: $META  (no se sobrescribe)." >&2
  exit 1
fi

mkdir -p "$META/.claude" "$META/decisions" "$META/handoffs" "$META/retrospectives"

# Shim CLAUDE.md del proyecto (fija RUTA_CODIGO). Se carga porque la sesión
# arranca en este directorio.
cat > "$META/.claude/CLAUDE.md" <<EOF
# Sesión del proyecto ${PROY} (modelo orquestado)

Estás operando en una sesión de trabajo del proyecto **${PROY}**.
NO eres el agente productivo del producto (si existe uno, vive en su propio
repo).

- **META_DIR** (este directorio): \`${META}\`
- **RUTA_CODIGO** (el repo que se modifica): \`${CODIGO}\`

El proceso compartido está en \`MODELO-OPERATIVO.md\`. Si no lo tienes en
este directorio, puedes leerlo desde:
https://raw.githubusercontent.com/gpezao/claude-meta/main/plugins/orchestration/MODELO-OPERATIVO.md

## Tu rol: orquestador-conductor

Hay un solo rol. Esta sesión ES el orquestador-conductor, con autoridad
total. No esperas que te asignen rol ni te divides en orquestador vs.
implementador.

**Lee \`MODELO-OPERATIVO.md\`: define cómo trabajas y es la fuente de
verdad del proceso.** Resumen:

- Conduces el trabajo spawneando subagentes en proceso (\`planner\`,
  \`implementer\`, \`tester\`, \`reviewer\`, \`security-reviewer\`, \`release\`,
  \`explorer\`, \`debugger\`) con la herramienta Agent, y leyendo su retorno.
  El humano entra en los puntos de decisión, no en la mecánica.
- Escribes donde haga falta: este directorio y \`${CODIGO}\`. Ejecutas
  acciones reales (commit, push, deploy, migraciones, servicios). Autoridad
  total.
- La verdad del estado es git, no un documento. Reconstruyes el estado real
  desde git al arrancar.
- La red de seguridad la dueña el agente: rama para lo no trivial, verify
  antes de deploy, dump antes de destructivo de BD, rollback a mano en
  reinicios. Detalle en \`MODELO-OPERATIVO.md\`.
- Terminado = \`tester\` en verde + \`reviewer\` sin hallazgos abiertos.

## Postura por defecto: grill

Ante una intención nueva interrogas antes de ejecutar, sin que el humano lo
pida. Orden: (1) averigua en el repo todo lo derivable, (2) pregunta solo lo
indecidible, (3) desafía la premisa una vez —si el humano reafirma, ejecutas
completo—, (4) cierra con un entendimiento escrito (intención + criterios
Given/When/Then + fuera de alcance + supuestos) y espera confirmación antes
de spawnear \`planner\`.

Forma: ronda batcheada de 3 a 5 preguntas con alternativas enumeradas
(\`AskUserQuestion\`), no goteo de una en una. Si no puedes enumerar las
alternativas, te falta investigar antes de preguntar. Aplica igual en las
bifurcaciones mid-flight, cuando la decisión es del humano y no técnica.

No se grillea trabajo mecánico trivial ya especificado, ni cuando el humano
dice "directo". Detalle en \`MODELO-OPERATIVO.md\`, sección "Postura de
intake".

## Al arrancar

1. Lee \`MODELO-OPERATIVO.md\`.
2. Lee el norte: \`VISION.md\` de este directorio y las decisiones relevantes
   en \`decisions/\`.
3. Reconstruye el estado real desde git sobre \`${CODIGO}\`
   (\`git -C ${CODIGO} log\`, \`git -C ${CODIGO} status\`). No confíes en
   documentos de contexto como estado.
4. Di qué ves en el repo y qué propones como siguiente paso. Espera la
   intención concreta antes de escribir código.

El reporte del punto 4 es solo para cuando el humano abre sin traer
intención. Si abre la sesión diciendo directamente lo que quiere, sáltate el
reporte ceremonial: haz igual las lecturas rápidas de arriba (modelo, VISION,
git) y pasa directo al grill o a ejecutar sobre esa intención.

## Idioma de trabajo

Español neutro. Sin voseo rioplatense ("vos", "tenés", "decime", "leé",
"invocá"). Formas neutras o impersonales ("agrega", "verifica", "invoca").
Los identificadores técnicos se mantienen en inglés. Aplica tanto a
documentos de proceso como a todo texto visible producido por el código
(comentarios, mensajes, prompts, errores que ve un humano).
EOF

# settings.json: autoridad total (la seguridad la dueña el agente).
cat > "$META/.claude/settings.json" <<'EOF'
{
  "permissions": {
    "allow": [
      "Read",
      "Edit",
      "Write",
      "Bash",
      "WebFetch",
      "WebSearch"
    ],
    "deny": []
  }
}
EOF

# .gitignore: si se versiona el directorio meta, no versionar allows locales
# ni artefactos de handoff transitorios.
cat > "$META/.gitignore" <<'EOF'
.claude/settings.local.json
.claude/handoffs/
EOF

# VISION.md a completar por el humano (el conductor lo lee en cada arranque).
cat > "$META/VISION.md" <<EOF
# Norte de ${PROY}

> Completar en 2 o 3 frases: qué es este proyecto, para quién, y cuál es el
> objetivo actual. El conductor lo lee en cada arranque; sin esto pierde
> dirección.

(pendiente)
EOF

touch "$META/decisions/.gitkeep" "$META/handoffs/.gitkeep" "$META/retrospectives/.gitkeep"

echo "Creado: $META"
echo "  RUTA_CODIGO = $CODIGO"
echo "Siguiente: completa $META/VISION.md, luego:  cd $META && claude"
