# statusline

Linea de estado de Claude Code: glifo animado + modelo, rama git (cambios, ↑ommits por subir, ↓ por bajar), cuenta activa de GitHub y barra de contexto usado.

```
✺ Sonnet 5.5  │  ⎇ main ✓ ↑1  │  ◉ felipe-donoso-zenta  │  ▰▱▱▱▱▱▱▱▱▱ 9%
```

La barra pasa a amarillo desde 60% y a rojo desde 80%. La rama solo aparece dentro de un repo git.

## Instalar

Requiere Node. Copia `statusline.js` y agregalo a `~/.claude/settings.json`:

```json
"statusLine": {
  "type": "command",
  "command": "node C:/Users/<tu-usuario>/.claude/statusline/statusline.js",
  "refreshInterval": 1
}
```

Si existe `~/.orca/agent-hooks/claude-statusline.cmd`, reenvia el payload a Orca; si no, lo ignora.
