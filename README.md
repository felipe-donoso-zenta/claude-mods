# claude-mods

Mods privados para Claude Code: una **línea de estado** y un **panel de desarrollo**, con avisos de actualización para parchar bugs y vulnerabilidades a tiempo.

| Mod | Qué hace | Versión |
| --- | --- | --- |
| [`statusline`](#statusline) | Banda sobre el prompt: modelo y esfuerzo, rama git, cuenta de GitHub y contexto usado | 0.2.2 |
| [`dev-panel`](#dev-panel) | Panel lateral: tarea, costo y límites, actividad, puertos y git de todos tus repos | 0.6.2 |

Se instalan juntos y **no repiten datos**:

| Dato | Dónde vive |
| --- | --- |
| Modelo, esfuerzo, rama actual, cuenta de GitHub, contexto usado | `statusline`: lo que quieres ver siempre, de un vistazo |
| Tarea en curso, costo y presupuesto, límites de 5 h y semana, actividad, puertos, git de todos los repos | `dev-panel`: lo que cambia mientras Claude trabaja |

## Contenido

[Instalar](#instalar) · [statusline](#statusline) · [dev-panel](#dev-panel) · [Versiones y avisos](#versiones-y-avisos) · [Actualizar](#actualizar) · [Publicar una versión](#publicar-una-versión-mantenedor) · [Seguridad](#seguridad) · [Estructura](#estructura-del-repo) · [Problemas comunes](#problemas-comunes)

## Instalar

**Requisitos**

- Claude Code.
- `gh` (GitHub CLI) con sesión iniciada: `gh auth status`.
- Acceso de lectura a este repo privado. La cuenta activa de `gh` debe ser una que lo tenga.

**Desde una sesión de Claude Code**

```
/plugin marketplace add felipe-donoso-zenta/claude-mods
/plugin install statusline@claude-mods
/plugin install dev-panel@claude-mods
```

**Desde una shell**

```
claude plugin marketplace add felipe-donoso-zenta/claude-mods
claude plugin install statusline@claude-mods
claude plugin install dev-panel@claude-mods
```

Luego `/reload-plugins` o abre una sesión nueva.

> Si ya tenías una `statusLine` en `settings.json`, verás dos barras. Quita ese bloque para dejar solo el mod.

## statusline

Una sola línea, con colores, justo encima del prompt:

```
✺ sonnet-5-5 · high  │  ⎇ main ●3 ↑1  │  ◉ felipe-donoso-zenta  │  ▰▰▱▱▱▱▱▱▱▱ 9%
```

| Segmento | Qué muestra | Se refresca |
| --- | --- | --- |
| `✺` y modelo | Glifo que rota entre `✻ ✽ ✺ ✹` y el nombre corto del modelo | 1 s |
| `· esfuerzo` | Esfuerzo de razonamiento que realmente usa la petición (`high`, `max`…) | por turno |
| `⎇ rama` | Solo dentro de un repo. `✓` sin cambios o `●N` archivos modificados; `↑N` (verde) commits por subir, `↓N` (rojo) por bajar | 5 s |
| `◉ cuenta` | Cuenta activa de `gh`: con cuál harás commit o push | 15 s |
| `▰▱ %` | Contexto usado, en 10 celdas. Verde hasta 60 %, amarillo desde 60 %, rojo desde 80 % (conviene `/compact`) | 1 s |
| `↑ vX` / `⚠ vX desactualizado` | **Solo si el mod está atrás.** Hay versión nueva, o la tuya tiene bugs o vulnerabilidades. También sale un toast | al iniciar y cada hora |

- No tiene comandos ni opciones.
- Se oculta mientras Claude muestra una encuesta.
- Para ver su versión cuando está al día: `claude plugin list`.

## dev-panel

Panel lateral que se queda al lado del chat y se actualiza solo. Cada sección se puede ocultar.

| Sección | Qué muestra |
| --- | --- |
| `▶ TAREA` | El plan de Claude como checklist: `▶` en curso, `✓` hecho, `○` pendiente, con el avance `2/5` |
| `$ COSTO` | Costo de la sesión y del último turno, prompts, tiempo, presupuesto opcional y límites de 5 h y semana, con barras verdes, ámbar (≥ 75 %) o rojas (≥ 90 %) |
| `≋ ACTIVIDAD` | Costo por turno en miniatura, herramientas usadas, agentes en curso y archivos editados |
| `⇄ PUERTOS` | Puertos de desarrollo escuchando (node, docker, java, python…), cada 30 s |
| `⎇ GIT` | Todos los repos de la carpeta y sus subcarpetas: rama, `~N` cambios o `✓`, `↑↓`, último commit y archivos tocados. Cada repo se pliega |
| `☰ OPCIONES` | Plegado por defecto. Al abrirlo: `r` actualizar · `t` tema · `c` compacto · `s` ajustes · `1`–`5` mostrar u ocultar secciones |
| Pie | Versión instalada y si está al día |

**Aviso de parche arriba.** Si el mod está desactualizado, lo primero del panel es una línea roja o ámbar con el comando para actualizar. No hace falta hacer scroll.

**Notificaciones** (toast y sonido propio para cada una):

- Un turno largo terminó, a partir de los segundos que elijas.
- Claude necesita un permiso.
- Un turno terminó con error o fue rechazado.
- Alertas: contexto al 80 %, límites de 5 h y semana al 80 y 95 %, presupuesto al 50, 80 y 100 %.

**Ajustes** (`s`): avisos, sonido, permisos, errores, turno mínimo, alertas, presupuesto, tema (`claude`, `ocean`, `neon`, `forest`, `mono`), vista completa o compacta y secciones visibles. Las preferencias se guardan entre sesiones.

**Comandos**

```
/panel [settings | theme <nombre> | compact | hide <sección> | show <sección> | reset | version]
/notify [on | off | sound on|off | min <segundos> | test]
```

Secciones: `task`, `cost`, `activity`, `ports`, `git`.

## Versiones y avisos

Cada mod declara su `version` en `.claude-plugin/plugin.json` (semver). Al iniciar sesión, y luego **cada hora**, compara su versión con `versions.json` de este repo. Lo lee con `gh api`, usando tu propia sesión de GitHub: una petición pequeña por hora.

| Campo | Significado | Qué ve el usuario |
| --- | --- | --- |
| `latest` | Última versión publicada | Toast de 10 s: «hay vX, actualiza» |
| `minSafe` | Mínima versión sin bugs ni vulnerabilidades conocidas | Aviso urgente ⚠ de 20 s con el motivo (`notes`), fijo en la banda y arriba del panel |

Si no hay red o `gh` no tiene sesión, el chequeo se salta en silencio.

Para ver la versión: pie del panel, `/panel version` o `claude plugin list`.

## Actualizar

```
claude plugin marketplace update claude-mods
claude plugin update statusline@claude-mods
claude plugin update dev-panel@claude-mods
```

Luego `/reload-plugins` o una sesión nueva. El aviso solo avisa: no actualiza solo.

## Publicar una versión (mantenedor)

El aviso depende de `versions.json`. **Si empujas código sin subir la versión, nadie se entera.**

1. Sube `version` en `<mod>/.claude-plugin/plugin.json`: patch para fixes, minor para funciones.
2. Edita `versions.json`:
   - `latest`: la versión nueva.
   - `minSafe`: la versión nueva **solo si** la anterior tiene un bug serio o una vulnerabilidad. Explica en `notes`.
3. `claude plugin validate <mod>`.
4. Commit y push a `main`.

```json
{
  "statusline": { "latest": "0.2.3", "minSafe": "0.2.3", "notes": "parche de seguridad" },
  "dev-panel": { "latest": "0.6.2", "minSafe": "0.6.2", "notes": "" }
}
```

Quien tenga una versión por debajo de `minSafe` verá el aviso urgente en menos de una hora.

## Seguridad

**Qué hacen los mods**

- Ejecutan solo `git`, `gh` y PowerShell (puertos y sonido), siempre como lista de argumentos, sin shell.
- Cada llamada parte desde la carpeta del propio mod. En Windows un programa se busca primero en la carpeta de trabajo, así que un `git.exe` o `gh.cmd` plantado en un repo clonado nunca se ejecuta.
- `git` corre con `--no-optional-locks`, `core.fsmonitor=false` y `log.showSignature=false`: la configuración de un repo ajeno no ejecuta programas ni bloquea tu git.
- Todo texto que viene de repos, prompts o `versions.json` se limpia de caracteres de control antes de dibujarse. `versions.json` solo aporta versiones `x.y.z` y una nota de 120 caracteres.
- Sin peticiones de red propias: el único acceso es `gh api` a este repo.
- No guardan ni envían credenciales. `statusline` lee el archivo de `gh` solo para sacar el nombre de la cuenta.

**Riesgo que queda.** Quien pueda hacer push a `main` controla el código que se instala. Mitigaciones:

- Activar 2FA en la cuenta dueña del repo, de preferencia con passkey.
- No dar acceso de escritura a nadie más. La protección de ramas no existe en repos privados del plan gratuito.
- Iniciar `gh` sin permisos que los mods no usan, por ejemplo `gh auth refresh -h github.com --remove-scopes delete_repo`.

¿Encontraste un problema de seguridad? Avisa al mantenedor en privado antes de abrir un issue.

## Estructura del repo

```
claude-mods/
├── .claude-plugin/marketplace.json    # lista los mods para /plugin install
├── versions.json                      # latest y minSafe por mod
├── statusline/
│   ├── .claude-plugin/plugin.json     # nombre y versión
│   └── hooks/register.tsx             # código del mod
└── dev-panel/
    ├── .claude-plugin/plugin.json
    └── hooks/register.tsx
```

## Problemas comunes

| Síntoma | Causa y solución |
| --- | --- |
| `marketplace add` falla | La cuenta activa de `gh` no tiene acceso al repo. Cambia con `gh auth switch` |
| No aparece ningún aviso | Revisa `gh auth status` y que la cuenta pueda leer el repo |
| Sigue la versión vieja tras actualizar | Ejecuta `/reload-plugins` o abre una sesión nueva |
| Veo dos barras de estado | Quita el bloque `statusLine` de `settings.json` |
| Instalé una versión anterior a los avisos | No trae el chequeo: actualiza una vez a mano |
| Las opciones del panel no responden | Están plegadas: pulsa `▸ mostrar opciones` |
