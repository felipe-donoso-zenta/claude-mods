# Guia de claude-mods

Repo privado con mods de Claude Code: https://github.com/felipe-donoso-zenta/claude-mods

| Mod | Que hace | Version |
| --- | --- | --- |
| `dev-panel` | Panel de desarrollo: tarea, costo y contexto, limites, git de los repos y puertos | 0.6.1 |
| `statusline` | Banda sobre el prompt: modelo y esfuerzo, rama git, cuenta de GitHub y contexto usado | 0.2.1 |

Se instalan juntos y no repiten datos:

| Dato | Donde vive |
| --- | --- |
| Modelo, esfuerzo, rama actual, cuenta de GitHub, contexto usado | `statusline` (lo que necesitas ver siempre, de un vistazo) |
| Tarea en curso, costo y presupuesto, limites 5 h y semanal, actividad, puertos, git de todos los repos | `dev-panel` (lo que cambia mientras Claude trabaja) |

## 1. Requisitos

- Claude Code instalado.
- `gh` (GitHub CLI) con sesion iniciada: `gh auth status`.
- Acceso al repo privado (la cuenta de GitHub debe estar invitada).

## 2. Instalar

En una sesion de Claude Code:

```
/plugin marketplace add felipe-donoso-zenta/claude-mods
/plugin install dev-panel@claude-mods
/plugin install statusline@claude-mods
```

Desde una shell:

```
claude plugin marketplace add felipe-donoso-zenta/claude-mods
claude plugin install dev-panel@claude-mods
claude plugin install statusline@claude-mods
```

## 3. Que hace `statusline`

Dibuja una sola linea, con colores, justo encima del prompt:

```
✺ sonnet-5-5  │  ⎇ main ●3 ↑1  │  ◉ felipe-donoso-zenta  │  ▰▰▱▱▱▱▱▱▱▱ 9%
```

| Segmento | Que muestra | Se refresca |
| --- | --- | --- |
| `✺` y modelo | Glifo que rota entre `✻ ✽ ✺ ✹` y el nombre corto del modelo en uso | cada 1 s |
| `· esfuerzo` | Esfuerzo de razonamiento junto al modelo (`high`, `max`...), el que realmente usa la peticion | por turno |
| `⎇ rama` | Rama de git; solo aparece dentro de un repo. `✓` sin cambios o `●N` con N archivos modificados; `↑N` (verde) commits por subir, `↓N` (rojo) commits por bajar | cada 5 s |
| `◉ cuenta` | Cuenta activa de `gh`, para saber con cual haras commit o push | cada 60 s |
| `▰▱` y `%` | Contexto usado de la conversacion en 10 celdas: verde hasta 60 %, amarillo desde 60 %, rojo desde 80 % (conviene `/compact`) | cada 1 s |
| `↑ vX` o `⚠ vX desactualizado` | Solo si el mod esta atras: hay version nueva, o la tuya tiene bugs o vulnerabilidades conocidas. Tambien sale un toast | al iniciar y cada hora |

Notas:

- No tiene comandos ni opciones.
- Se oculta mientras Claude muestra una encuesta.
- No es la linea de estado de abajo (`statusLine` en `settings.json`). Si sigues viendo dos barras, quita ese bloque de `settings.json`.
- Para ver su version: el segmento de aviso solo aparece cuando esta desactualizado; usa `claude plugin list`.

## 4. Saber en que version estas

- `dev-panel`: la ultima linea del panel muestra la version y si esta al dia; tambien `/panel version`.
- En cualquier caso: `claude plugin list`.

## 5. Avisos de actualizacion

Al iniciar sesion, y luego cada hora, cada mod compara su version con `versions.json` del repo (leido con `gh`, usando tu propia sesion de GitHub):

| Campo | Significado | Aviso |
| --- | --- | --- |
| `latest` | Ultima version publicada | Toast de 10 s: "hay vX, actualiza" |
| `minSafe` | Minima version sin bugs ni vulnerabilidades conocidas | Toast urgente (⚠) de 20 s con el motivo (`notes`) |

Si no hay red o `gh` no tiene sesion, el chequeo se salta en silencio.

## 6. Actualizar

```
claude plugin marketplace update claude-mods
claude plugin update dev-panel@claude-mods
claude plugin update statusline@claude-mods
```

Luego `/reload-plugins` o abre una sesion nueva.

> Las instalaciones anteriores a estas versiones no traen el chequeo: hay que actualizar una vez a mano.

## 7. Publicar una version nueva (mantenedor)

1. Sube `version` en `<mod>/.claude-plugin/plugin.json` (semver: patch para fixes, minor para features).
2. Edita `versions.json`:
   - `latest`: la version nueva.
   - `minSafe`: la version nueva **solo si** la anterior tiene un bug serio o una vulnerabilidad; explica en `notes`.
3. Valida: `claude plugin validate <mod>`.
4. Commit y push a `main`.

Ejemplo de `versions.json`:

```json
{
  "statusline": { "latest": "0.1.1", "minSafe": "0.1.1", "notes": "fix de seguridad en lectura de credenciales" },
  "dev-panel": { "latest": "0.2.0", "minSafe": "0.2.0", "notes": "" }
}
```

## 8. Estructura del repo

```
claude-mods/
├── .claude-plugin/marketplace.json   # lista los mods para /plugin install
├── versions.json                     # latest y minSafe por mod
├── dev-panel/
└── statusline/
    ├── .claude-plugin/plugin.json    # nombre y version
    └── hooks/register.tsx            # codigo del mod
```

## 9. Problemas comunes

- **No aparece el aviso**: revisa `gh auth status` y que la cuenta tenga acceso al repo.
- **`marketplace add` falla**: la cuenta activa de `gh` no es la que tiene acceso; cambia con `gh auth switch`.
- **Sigue la version vieja tras actualizar**: ejecuta `/reload-plugins` o reinicia la sesion.
