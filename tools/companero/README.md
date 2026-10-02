# Compañero (etapa 0)

Avisos nativos de Windows cuando una sesión de Claude Code **te necesita** o
**termina**, y un resumen al iniciar Windows y una vez al día. Sirve para
dejar de vigilar a los agentes: ellos te avisan.

**No gasta tokens.** Solo lee archivos locales. Nunca llama a un modelo ni
hace llamadas de red.

## Instalar

En PowerShell, desde esta carpeta:

```powershell
powershell -ExecutionPolicy Bypass -File .\instalar.ps1
```

No necesita administrador. Hace cuatro cosas:

1. Registra el protocolo `companero:`, para que el clic en un aviso abra la sesión.
2. Registra el nombre "Compañero" con el que aparecen los avisos.
3. Crea el acceso directo de arranque en tu carpeta Inicio.
4. Lanza el vigía.

Para revertirlo todo: `.\desinstalar.ps1`.

Requisitos: Node (cualquier versión reciente) y Git for Windows. Si no hay Git
Bash, el clic abre Windows Terminal.

## Qué vas a ver

| Cuándo | Aviso | Sonido |
|---|---|---|
| Una sesión pasa a esperar tu input | **"forms - shamarin te necesita"** y debajo sus decisiones (`D1 … · D2 …`) | Sí |
| Una sesión termina | **"IDS-3812 terminó"** y su titular | No |
| Al arrancar, y cada día desde las 6:00 | Quién te espera (la más antigua primero), checkpoints pendientes en `revision/` y sesiones trabajando | Solo si algo te espera |

**Clic en un aviso de sesión:** abre esa sesión en Git Bash con
`claude attach <id>`. Al salir de la sesión (`←` o `Ctrl+Z`) queda la
terminal abierta; la sesión sigue corriendo igual.

## Cómo funciona

```
~/.claude/jobs/<id>/state.json ──┐
                                 ├─ vigia.mjs (cada 5 s) ─→ avisar.ps1 ─→ aviso de Windows
*-meta/revision/*/checkpoint.md ─┘                                          │ clic
                                                     abrir-sesion.ps1 ←─────┘
                                                     → Git Bash: claude attach <id>
```

- **`fuentes/claude-code.mjs`** lee el `state.json` que Claude Code mantiene por
  cada sesión en segundo plano: estado, nombre y titular (para una sesión
  bloqueada, su línea `needs input:`). Si ese archivo deja de poder leerse, usa
  `claude agents --json`, que trae nombre y estado pero no el titular.
- **`fuentes/revision.mjs`** cuenta los `checkpoint.md` con `estado: pendiente`.
- **`nucleo.mjs`** decide qué avisar. Es lógica pura, sin acceso a disco.
- Cada herramienta es una fuente aparte: Kiro se suma después como
  `fuentes/kiro.mjs` sin tocar el resto.

Log y estado del vigía: `%LOCALAPPDATA%\companero\` (`vigia.log`, y
`clics.log` para los clics en los avisos).

## Límites conocidos

- **Solo sesiones en segundo plano.** Las que abres en una terminal normal no
  dejan `state.json`. Llegan en la etapa 1, con un hook.
- **`state.json` es un archivo interno de Claude Code, sin documentar.** Una
  actualización puede cambiarlo; para eso está el respaldo con
  `claude agents --json`.
- **En Windows 10 la consola del clic se ve un instante.** En Windows 11 no:
  el script corre con `conhost --headless`. En los dos casos, Git Bash sale al
  frente con la sesión (`ventana.ps1`).
- **El aviso dura unos segundos en pantalla** y después queda en el centro de
  notificaciones de Windows. Si tienes activado "No molestar", Windows los
  guarda sin mostrarlos.

## Etapas siguientes

- **Etapa 1:** la píldora arriba al centro, siempre visible, que se expande al
  pasar el mouse; el hilo de cada sesión (sus decisiones y su historial); el
  resumen al volver de una pausa; las sesiones interactivas.
- **Etapa 2:** el copiloto a pedido ("¿qué atiendo primero?"), con un modelo
  chico y solo los titulares como entrada.

## Pruebas

```bash
node --test
```

Incluye una prueba de punta a punta del vigía en modo simulación
(`COMPANERO_SIMULAR=1`: los avisos van al log en vez de mostrarse).
