# Antes de ejecutar: entender y confirmar

> Aplica a toda sesión de Claude Code: se carga desde `~/.claude/CLAUDE.md`.
> **Prevalece sobre cualquier instrucción por defecto de avanzar con un
> supuesto razonable**, incluida la de las sesiones en segundo plano. Al
> empezar un pedido, preguntar y confirmar no es quedarse bloqueado: es el
> paso obligatorio.

## La regla

Ante un pedido nuevo no te lances a ejecutar con la primera lectura. El orden
es este y no se salta:

1. **Investiga sin modificar nada.** Resuelve por tu cuenta todo lo que el
   repo, los documentos, `decisions/`, los handoffs o Jira pueden contestar.
   Leer, buscar y explorar no necesitan permiso. Preguntar algo que estaba ahí
   es delegarle al humano un trabajo tuyo.
2. **Pregunta lo que queda abierto**: la intención real, la audiencia, el
   formato, el alcance, la prioridad entre alternativas. Con las opciones
   enumeradas cuando se pueden enumerar.
3. **Confirma lo que entendiste, aunque no te quede ninguna pregunta.**
4. **Espera el ok.** Recién entonces escribes, cambias o publicas algo.

Si el humano responde las preguntas sin objetar el entendimiento, eso cuenta
como ok.

## El entendimiento: corto

```
Entendí esto:
· Qué: <el objetivo, en una frase>
· Entrego: <qué vas a producir o cambiar, y dónde>
· Fuera: <lo que no vas a tocar>
· Supuse: <los supuestos que tomaste>
```

Las preguntas van debajo, con la forma de `CHECKPOINTS.md`: cada una se
entiende sola. En el modelo orquestado, el conductor agrega los criterios
Given/When/Then (ver `MODELO-OPERATIVO.md`).

## Qué espera el ok

Todo lo que cambia algo: crear o editar archivos del humano; comandos que
cambian estado (commit, push, instalar, mover, borrar); publicar o enviar algo
hacia afuera (PR, Jira, mensajes, páginas). Un script en una carpeta temporal
para investigar no cuenta: es parte de averiguar.

## Excepciones

- **Trabajo trivial ya especificado de punta a punta**: un typo, un rename, un
  cambio de una línea, algo que el humano dejó sin ambigüedad. Se hace y se
  declaran los supuestos en una línea.
- **La palabra "directo".** Si el humano la usa, se salta la confirmación y
  se ejecuta declarando los supuestos en una línea.

Si dudas de si algo es trivial, no lo es: confirma.

## Después del ok

La regla rige al empezar cada pedido, y de nuevo si el humano cambia de pedido
a mitad de la sesión. Con el entendimiento confirmado, la mecánica es del
agente: a mitad del trabajo se vuelve a preguntar solo cuando aparece una
decisión que es del humano, no en cada paso.

Anti-patrones:

- Presentar el entendimiento y ejecutar en el mismo mensaje, sin esperar.
- Decidir solo algo que era del humano ("voy con X porque pediste Y") y
  anunciarlo como hecho.
- Preguntar algo que se podía averiguar en el repo.
