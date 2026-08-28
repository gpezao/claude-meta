# SESSION-START — Cómo abrir una sesión

Modelo orquestado: hay **un solo rol**, el orquestador-conductor con
autoridad total. El detalle del proceso está en `MODELO-OPERATIVO.md`.

Toda sesión arranca con `cwd` en el directorio de trabajo del proyecto
(`META_DIR`) para que se cargue su shim `.claude/CLAUDE.md`, que fija
`RUTA_CODIGO`.

## Cómo abrirla (proyecto ya dado de alta)

```bash
cd <META_DIR>
claude
```

## Primer prompt (copiar y pegar)

> Lee `MODELO-OPERATIVO.md` para el proceso. Después lee el norte
> (`VISION.md`) y las decisiones en `decisions/`. Reconstruye el estado real
> corriendo `git -C RUTA_CODIGO log` y `git -C RUTA_CODIGO status` (no
> confíes en documentos de contexto como estado). Cuando termines, dame qué
> ves en el repo y qué propones como siguiente paso. Ahí te doy la intención
> concreta.

## Dar de alta un proyecto nuevo

```bash
# Si clonaste el repo:
./tools/new-project-meta.sh <proyecto>

# Si usas el plugin instalado, descarga el script primero:
curl -fsSL https://raw.githubusercontent.com/gpezao/claude-meta/main/tools/new-project-meta.sh \
  -o new-project-meta.sh && chmod +x new-project-meta.sh
./new-project-meta.sh <proyecto>
```

El generador verifica que `RUTA_CODIGO` exista y sea un repo git, y deja el
shim `CLAUDE.md`, el `settings.json`, un `VISION.md` a completar y las
carpetas `decisions/`, `handoffs/`, `retrospectives/`.

## Subagentes disponibles

El conductor spawnea en proceso: `planner`, `implementer`, `tester`,
`reviewer`, `security-reviewer`, `release`, `explorer`, `debugger`. Cuándo
usar cada uno: ver `MODELO-OPERATIVO.md`, sección "El pipeline en proceso".

## Si algo no calza al arrancar

Si el primer resumen del estado no coincide con lo que recuerdas del
trabajo previo, hay drift. El estado real es git: reconstrúyelo desde ahí
y, si hace falta, corrige el norte (`VISION.md`). Es más rápido eso que
avanzar con la cabeza en otro estado.
