# Evals del plugin orchestration

Casos para `claude plugin eval`. Cada carpeta es un caso: `prompt.md` (el
pedido y sus límites), `graders/*.md` (las comprobaciones) y, si hace falta,
`case.yaml`.

| Caso | Etiquetas | Qué comprueba |
|---|---|---|
| `intake-confirma-antes` | reglas | Ante un pedido ambiguo, confirma lo entendido y pregunta sin escribir nada |
| `checkpoint-autocontenido` | reglas | Las decisiones llevan ID, contexto, opciones descritas y recomendación |
| `redaccion-neutral` | reglas | Un documento comparativo sin recomendación ni contexto interno |
| `reviewer-bug-sembrado` | agentes | El reviewer encuentra un error sembrado en un diff |
| `skill-cierre-de-card` | skills | Al terminar el código de una card se carga `cierre-de-card` |
| `skill-cuota` | skills | Al preguntar cómo delegar un rol se carga `cuota` |
| `puente-sin-codex` | agentes, shell | Sin Codex, el puente encuentra el equilibrio y responde `CODEX_NO_DISPONIBLE` en vez de hacer el rol |
| `skill-cuota-encuentra-el-equilibrio` | shell | El conductor corre el equilibrio con la ruta que anota el hook de inicio de sesión |
| `release-no-pushea-a-main` | agentes, shell | Release no pushea a `main` sin autorización explícita |

## Las reglas globales

Las corridas no cargan `~/.claude/CLAUDE.md`, que es por donde las cuatro
reglas globales llegan a una sesión real. Los casos con la etiqueta `reglas`
las reciben por `append_system_prompt`, copiado desde los archivos del plugin.
Después de editar una regla:

```bash
node evals/sincronizar-reglas.mjs            # actualiza los case.yaml
node evals/sincronizar-reglas.mjs --revisar  # sale con 1 si alguno quedó viejo
```

## Cómo correr

Desde `plugins/orchestration`:

```bash
node evals/sincronizar-reglas.mjs --revisar

# Reglas: sin brazo de comparación, porque las reglas llegan igual en los dos.
claude plugin eval . --tag reglas --ablation none --allow-tools Write Edit --trust-plugin --no-publish

# Agentes y skills: con y sin plugin.
claude plugin eval . --tag skills --trust-plugin --no-publish
claude plugin eval . --case reviewer-bug-sembrado --trust-plugin --no-publish

# Casos con shell (solo Linux, macOS o WSL2; ver abajo).
claude plugin eval . --tag shell --allow-tools Bash --scaffold --trust-plugin --no-publish
```

- `--case` acepta un solo patrón: con varios, rige el último. `--tag` y
  `--case` juntos se combinan como "y".
- Cada caso declara `plugins: ["../.."]`. Sin esa línea el plugin no se
  carga, porque no tiene `plugin.json` propio (su manifiesto está en el
  marketplace), y el caso corre sin plugin.
- Cada corrida es una llamada real al modelo con tu cuenta. Por defecto cada
  caso corre 3 veces por brazo; `--runs 1` sirve para probar y
  `--max-cost-usd` pone un techo. Referencia, con una corrida por brazo y a
  precio de lista: entre USD 0,12 y 0,20 por caso de reglas o de skills, y
  USD 0,53 el del reviewer.
- Sin `--no-publish`, el informe HTML también se publica en claude.ai.

Los casos con la etiqueta `shell` conceden Bash, que exige el sandbox del
sistema operativo. Windows nativo no lo tiene: esos casos corren en Linux, en
macOS o en WSL2 con Claude Code instalado del lado Linux (más `bubblewrap` y
`socat`). En Windows nativo terminan con error de corrida. `--scaffold`
ejecuta el `repo.sh` del caso de release, que arma un repo de prueba. En WSL
se corren desde Ubuntu sobre la ruta `/mnt/c/...` del repo; `command -v
claude` tiene que dar el binario de Linux, no el de Windows.

Los resultados quedan en `evals/results/`, que no se versiona. Los traces de
cada corrida se borran al terminar; `--keep-temp` los conserva para revisar por
qué falló un grader. En WSL quedan en el `/tmp` de Ubuntu, que se vacía cuando
la distro se detiene: hay que leerlos en la misma sesión. El
`aggregate-result.json` de `results/` trae igual el trace en la evidencia de
los graders `llm`.
