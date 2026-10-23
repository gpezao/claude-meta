---
name: cuota
description: Modelo, esfuerzo y proveedor (Claude o Codex) de cada rol del pipeline, el equilibrio de cuota y el puente a Codex. Usar antes de delegar planner, implementer, debugger, explorer, reviewer o security-reviewer, cuando el hook del equilibrio rechaza una invocación, cuando un puente responde CODEX_NO_DISPONIBLE, o cuando hay que decidir si una investigación pesada va a Codex.
---

# Cuota: modelo y proveedor por rol (decisiones 0002, 0003 y 0004)

Aplica solo en Claude Code; en Kiro no hay Codex.

Cada rol corre con el modelo y el esfuerzo de la decisión 0002
(`claude-meta-meta/decisions/0002-modelo-y-esfuerzo-por-rol.md`), elegidos
por calidad medida en una prueba propia y por consumo de cuota. La decisión
0003 (`claude-meta-meta/decisions/0003-equilibrio-de-cuota-entre-proveedores.md`)
agrega cuándo un rol pasa a su alternativa para que las cuotas de Claude y de
Codex se gasten al mismo ritmo. La decisión 0004
(`claude-meta-meta/decisions/0004-ventana-de-5-h-y-contexto-del-conductor.md`)
suma la presión de la ventana de 5 h.

| Rol | Base | Alternativa (desvío o cuota) |
|---|---|---|
| `explorer` | Claude Haiku 5.5 · medium | Codex GPT-6-Luna · medium (`MODO: codex`) |
| `planner` | Codex GPT-6.1-Sol · high (puente) | Claude Opus 5.5 · high |
| `implementer` | Codex GPT-6.1-Sol · high (puente) | Claude Sonnet 5 (alias `sonnet`) · high |
| `tester` | Claude Sonnet 5.5 · high | — |
| `reviewer` | Claude Opus 5.5 · high | Codex GPT-6.1-Sol · high |
| `security-reviewer` | Claude Opus 5.5 · high | Codex GPT-6.1-Sol · high |
| `debugger` | Codex GPT-6.1-Sol · high (puente) | Claude Opus 5.5 · high |
| `release` | Claude Haiku 5.5 · medium | — |
| redacción | El conductor, o `general-purpose` con `model: "opus"` | — |

**El conductor** trabaja con Opus 5.5 en high (`~/.claude/settings.json`).
Usa xhigh solo cuando el humano lo pide para una tarea puntual. Un subagente
sin `effort` propio corre con el esfuerzo de la sesión.

## Puente a Codex

`planner`, `implementer` y `debugger` son subagentes de Claude (Haiku 5.5) que
arman el encargo y lo ejecutan en Codex con el script del plugin `codex`.
Devuelven la salida de Codex tal cual. `explorer` hace lo mismo con
GPT-6-Luna solo si el prompt empieza con `MODO: codex`. El plugin `codex` a
veces deja un trabajo en `queued` sin arrancar, en el repo principal o en un
worktree por igual. Por eso cada puente comprueba a los 90 s que el trabajo
arrancó y, si no, lo relanza una vez antes de responder
`CODEX_NO_DISPONIBLE`. Los worktrees usan el puente como cualquier repo.

## Equilibrio de cuota (decisión 0003)

Antes de delegar un rol, el conductor corre:

```bash
R=$(cat "$HOME/.claude/cache/orchestration-raiz" 2>/dev/null)
[ -f "$R/scripts/equilibrio-cuota.mjs" ] || R=$(ls -d "$HOME"/.claude/plugins/cache/gpezao/orchestration/*/ 2>/dev/null | sort -V | tail -1)
node "${R%/}/scripts/equilibrio-cuota.mjs" --implementer <claude|codex|ninguno>
```

La salida dice en qué proveedor corre cada rol, por qué y cómo invocarlo. El
script lee el uso que el statusline deja en `~/.claude/cache/`. Las reglas:

- **Ritmo** = % usado de la semana ÷ % transcurrido de la semana, con un
  mínimo de 25% transcurrido (unas 42 h), para que el uso de las primeras
  horas tras un reinicio no infle el ritmo. 1,0 es gastar la cuota justo
  cuando se reinicia. Se compara el ritmo y no el porcentaje porque las
  semanas de Claude y de Codex se reinician en días distintos.
- **Desvío.** Si el ritmo de un proveedor supera al del otro en más de 0,25,
  sus roles flexibles (`explorer`, `planner`, `implementer`, `debugger`)
  pasan a la alternativa. Vuelven a la base cuando la diferencia baja de
  0,10.
- **Presión de 5 h (decisión 0004).** Si un proveedor tiene la ventana de
  5 h en 60% o más y el otro está bajo 60%, los roles flexibles del primero
  pasan al otro, aunque el ritmo semanal diga lo contrario. Es la ventana que
  corta el trabajo en el día.
- **Revisión cruzada.** `reviewer` y `security-reviewer` corren siempre en un
  proveedor distinto al del implementer de la card, por encima del ritmo y del
  tope de 5 h; solo cede si ese proveedor está agotado. `--implementer` indica
  dónde corrió; sin el argumento se asume el que decide el script. Para
  revisar un cambio sin implementer, `--implementer ninguno`: la revisión
  sigue el desvío como un rol flexible.
- **Tope de 5 h.** Un proveedor con la ventana de 5 h en 90% o más no recibe
  tareas nuevas si el otro puede recibirlas. Sin alternativa (el otro agotado,
  los dos sobre el tope o un rol fijo), sigue el mismo y el script lo marca con
  `AVISO`.
- **Agotado.** Si un proveedor llega a 100% en alguna ventana, o Codex informa
  que alcanzó el límite, el otro sigue solo. Si el script responde `ninguno`
  (los dos agotados, o Claude agotado para `tester` o `release`), el
  conductor para y le avisa al humano.
- **Fijos en Claude:** `tester`, porque el sandbox de Codex no corre
  `flutter test`, y `release`, porque el push desde Codex no está probado.
- **Conductor.** Cuando el desvío es contra Claude, o Claude está sobre el
  tope de 5 h o con presión de 5 h, el conductor manda a Codex las
  investigaciones y los barridos de código pesados: `explorer` con
  `MODO: codex`, o `task --model gpt-6.1-sol --effort high` para un análisis.
  El intake, los checkpoints, la redacción de entregables y la síntesis
  siguen en Claude.

## El hook del equilibrio (decisión 0003)

Un hook `PreToolUse` sobre `Agent` corre el equilibrio en cada delegación de
`planner`, `implementer`, `debugger` y `explorer`. Si la invocación no
coincide (por ejemplo, `MODO: directo` cuando el rol va en Codex, o sin
`MODO: directo` y sin `model` cuando va en Claude), la rechaza y el motivo
dice cómo invocarlo. El conductor la repite como dice el motivo.

- **Escape.** Cuando hay una razón para otra ruta, el prompt lleva una línea
  `RUTA: forzada <motivo>` y el hook no la revisa. Va debajo de la línea
  `MODO`, porque los agentes reconocen el modo solo en la primera línea:

  ```
  MODO: directo
  RUTA: forzada CODEX_NO_DISPONIBLE
  <el encargo>
  ```

  Es el caso de `CODEX_NO_DISPONIBLE` y de un pedido explícito del humano.
  El escape solo sirve para correr en Claude un rol que el equilibrio manda
  a Codex. Forzar Codex no funciona: el puente vuelve a consultar el
  equilibrio y, si no le toca Codex, responde `CODEX_NO_DISPONIBLE`.
- **Formato exacto.** `MODO: directo` o `MODO: codex` al comienzo de la
  primera línea con texto, y `RUTA: forzada` al comienzo de una línea
  propia: con esas mayúsculas y un espacio después de los dos puntos. Con
  otra escritura, la línea no cuenta.
- **Falla abierto.** Ante cualquier error, caché ausente, falta del dato
  semanal de alguno de los dos proveedores (por ejemplo, sin Codex
  instalado) o proveedor `ninguno`, el hook no dice nada y la delegación
  sigue. Nunca le pregunta al humano.
- **No revisa** `reviewer`, `security-reviewer`, `tester` ni `release`: la
  revisión depende de dónde corrió el implementer, que el hook no ve. Para
  esos roles el conductor sigue corriendo el script.

## Cómo se invoca la alternativa

- **Planner, implementer o debugger en Claude.** El conductor invoca el mismo
  agente con `MODO: directo` en la primera línea del prompt y el `model` de la
  alternativa: `opus` para `planner` y `debugger`, `sonnet` para
  `implementer`. En Claude Code 2.1.283, el alias `sonnet` apunta a Sonnet 5,
  no a 5.5. El `model` se pasa siempre: sin él, el agente corre con el Haiku
  del puente. **Implementer en `opus` (decisión 0004):** el conductor puede
  usarlo cuando juzga que el PR es complejo (lógica entrelazada en varios
  archivos, estado compartido o concurrencia, o un intento en `sonnet` que no
  pasó la revisión). Gasta más cuota de Claude que `sonnet`, así que lo dice
  en su reporte con el motivo, y no lo usa con presión de 5 h en Claude salvo
  que el humano lo pida. Lo mismo vale si un puente responde
  `CODEX_NO_DISPONIBLE`: el trabajo vuelve a Claude aunque esté sobre el tope
  de 5 h, porque no hay alternativa. Si Claude está agotado, el conductor para
  y le avisa al humano.
- **Explorer en Codex.** `MODO: codex` en la primera línea del prompt. Si
  responde `CODEX_NO_DISPONIBLE`, se vuelve a invocar sin esa línea y con
  `RUTA: forzada CODEX_NO_DISPONIBLE`.
- **Revisión en Codex.** `review --wait --model gpt-6.1-sol` del script del
  plugin `codex`, o `adversarial-review --wait --model gpt-6.1-sol` para
  seguridad.

## Topes

- El esfuerzo llega hasta high. xhigh, max y ultra se usan solo si el humano
  los pide para una tarea puntual: un plan de GPT-6-Astra gastó entre 27 y 43
  puntos de la ventana de 5 h de Codex en xhigh, y entre 5 y 7 en medium.
- GPT-6-Astra y Claude Fable 5.1 se usan solo a pedido.
- En Windows, el sandbox de Codex no lee carpetas dentro de `AppData` ni
  ejecuta `flutter test`. Los tests los corre el `tester` en Claude.
