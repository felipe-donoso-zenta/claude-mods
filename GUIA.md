# Guia de claude-mods

Repo privado con mods de Claude Code: https://github.com/felipe-donoso-zenta/claude-mods

| Mod | Que hace | Version |
| --- | --- | --- |
| `dev-panel` | Panel de desarrollo: tarea, costo y contexto, limites, git de los repos y puertos | 0.2.0 |
| `statusline` | Banda sobre el prompt: modelo, rama git, cuenta de GitHub y contexto usado | 0.1.0 |

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

## 3. Saber en que version estas

- `dev-panel`: escribe `/panel version`.
- En cualquier caso: `claude plugin list`.

## 4. Avisos de actualizacion

Al iniciar sesion, y luego cada 6 horas, cada mod compara su version con `versions.json` del repo (leido con `gh`, usando tu propia sesion de GitHub):

| Campo | Significado | Aviso |
| --- | --- | --- |
| `latest` | Ultima version publicada | Toast de 10 s: "hay vX, actualiza" |
| `minSafe` | Minima version sin bugs ni vulnerabilidades conocidas | Toast urgente (⚠) de 20 s con el motivo (`notes`) |

Si no hay red o `gh` no tiene sesion, el chequeo se salta en silencio.

## 5. Actualizar

```
claude plugin marketplace update claude-mods
claude plugin update dev-panel@claude-mods
claude plugin update statusline@claude-mods
```

Luego `/reload-plugins` o abre una sesion nueva.

> Las instalaciones anteriores a estas versiones no traen el chequeo: hay que actualizar una vez a mano.

## 6. Publicar una version nueva (mantenedor)

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

## 7. Estructura del repo

```
claude-mods/
├── .claude-plugin/marketplace.json   # lista los mods para /plugin install
├── versions.json                     # latest y minSafe por mod
├── account-rotator/
│   ├── .claude-plugin/plugin.json    # nombre y version
│   └── hooks/register.tsx            # codigo del mod
└── dev-panel/  (igual)
```

## 8. Problemas comunes

- **No aparece el aviso**: revisa `gh auth status` y que la cuenta tenga acceso al repo.
- **`marketplace add` falla**: la cuenta activa de `gh` no es la que tiene acceso; cambia con `gh auth switch`.
- **Sigue la version vieja tras actualizar**: ejecuta `/reload-plugins` o reinicia la sesion.
