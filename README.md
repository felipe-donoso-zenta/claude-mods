# claude-mods

Mods privados de Claude Code: `account-rotator`, `dev-panel` y `statusline`.

## Instalar

Requiere `gh` con sesion iniciada y acceso a este repo.

En una sesion de Claude Code:

```
/plugin marketplace add felipe-donoso-zenta/claude-mods
/plugin install account-rotator@claude-mods
/plugin install dev-panel@claude-mods
/plugin install statusline@claude-mods
```

Desde una shell:

```
claude plugin marketplace add felipe-donoso-zenta/claude-mods
claude plugin install account-rotator@claude-mods
claude plugin install dev-panel@claude-mods
claude plugin install statusline@claude-mods
```

## Versiones y avisos

Cada mod tiene su `version` en `.claude-plugin/plugin.json` (semver). Al iniciar sesion, y cada 6 horas, compara su version con `versions.json` de este repo:

- `latest`: ultima version publicada. Si la instalada es menor, avisa con un toast.
- `minSafe`: version minima sin bugs ni vulnerabilidades conocidas. Si la instalada es menor, el aviso es urgente (⚠, 20 s).

`account-rotator` muestra su version en la banda; en `dev-panel` usa `/panel version`.

Actualizar:

```
claude plugin marketplace update claude-mods
claude plugin update account-rotator@claude-mods
claude plugin update dev-panel@claude-mods
claude plugin update statusline@claude-mods
```

## Publicar una version

1. Sube `version` en el `plugin.json` del mod.
2. Actualiza `latest` en `versions.json` (y `minSafe` si la anterior tiene un bug o una vulnerabilidad; escribe el motivo en `notes`).
3. Commit y push a `main`.
