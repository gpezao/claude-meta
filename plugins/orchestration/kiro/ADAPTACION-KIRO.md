# Adaptación a Kiro

> Aplica cuando el agente corre en Kiro. Las reglas, los agentes y las
> memorias de `claude-meta` se escribieron para Claude Code; este archivo
> traduce lo que cambia en Kiro. El texto de esas reglas no se reescribe:
> se lee con esta tabla de equivalencias.

## Equivalencias

| Los documentos dicen | En Kiro |
|---|---|
| `.claude/CLAUDE.md` del proyecto | `.kiro/steering/proyecto.md`, con el mismo contenido |
| "Lee `MODELO-OPERATIVO.md`" | Está en `~/.kiro/steering/modelo-operativo.md`. Si no está cargado, léelo desde ahí |
| Herramienta `Agent`, "spawnear un subagente" | La herramienta de subagentes de Kiro, con el nombre del agente (`planner`, `implementer`, `tester`…), sin el prefijo `orchestration:` |
| `AskUserQuestion` | No existe. Las decisiones van en texto, con la forma de `CHECKPOINTS.md`, y el humano responde en una línea (`D1 ok, D2 B`) |
| `mcp__claude_ai_Atlassian__<herramienta>` | La herramienta del mismo nombre en el servidor MCP `atlassian` de Kiro |
| `mcp__claude_ai_Google_Drive__<herramienta>` | No hay conector de Drive en Kiro. Lo que dependa de Drive se hace desde Claude Code |
| Hook `SessionStart` de `.claude/settings.json` | `.kiro/hooks/inicio-de-sesion.json`, generado por el espejo |
| `.claude/handoffs/`, `revision/`, `decisions/` | Iguales: son carpetas, no dependen de la herramienta |
| "Carga la skill `cierre-de-card`" | Está en `~/.kiro/steering/cierre-de-card.md`. Si no está cargado, léelo desde ahí |
| Skill `cuota`, equilibrio, puente a Codex, `MODO: directo`, `RUTA: forzada` | No aplican: en Kiro no hay Codex. Cada rol corre como subagente de Kiro |

## Subagentes

Se invocan por nombre y corren aislados, como en Claude Code: no pueden
preguntarle nada al humano y devuelven una sola vez. El intake y los
checkpoints los sostiene siempre el agente principal.

<!-- resultado-prueba-subagentes -->

## Memorias

Kiro no guarda memorias por su cuenta. Las de Claude Code llegan como
steering `memoria-*.md`. Cuando el humano te enseñe una preferencia durable
(una corrección o un "siempre…", "nunca…"), escríbela como steering nuevo:

- `~/.kiro/steering/memoria-<slug>.md` si aplica a todo, o
  `.kiro/steering/memoria-<slug>.md` del meta si es solo de ese proyecto.
- Encabezado: `inclusion: auto`, `name: <slug>` y `description: <una
  línea>`. Usa `inclusion: always` solo si debe regir en toda sesión.
- Cuerpo: la lección en prosa legible, con el porqué.

El espejo la lleva a Claude Code como memoria en la próxima sesión.

## Espejo con claude-meta

`tools/sync-kiro.mjs` mantiene iguales los dos lados y corre al abrir
sesión en ambas herramientas. Las reglas, los agentes, las memorias, el
steering de proyecto y las skills se pueden editar en cualquiera de los dos
lados. Los hooks de `.kiro/hooks/` se generan: no se editan a mano.

Si el espejo reporta un conflicto (el mismo archivo cambió en los dos
lados), díselo al humano y no lo resuelvas por tu cuenta.
