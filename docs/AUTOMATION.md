# Automation

## Headless batch CLI
```bash
npm run build:cli
node dist-cli/main.js --out export --format png --sizes "4500x5400 large, 1500x1800 small" --transparent design.vstudio
```
Options: `--format png|jpeg|pdf|svg`, `--artboard NAME|all`, `--sizes "WxH [name],…"` (content scaled to **fit**/**fill**/none with `--mode`), `--actions FILE.json`, `--transparent`, `--scale N`/`--width PX`, `--ppi N`, `--quality 1-100`. Fonts: bundled Inter plus system fonts, so text renders like in the app. Bad input (unknown artboard, malformed sizes, invalid file, invalid action list) stops the run with a message — nothing is skipped silently.
Smoke test: `npm run test:cli`.

## Action lists (JSON)
```json
[
  {"type":"cleanup"},
  {"type":"reduceColors","max":6},
  {"type":"replaceColor","from":"#ff0000","to":"#cc0000"},
  {"type":"resizeArtboard","artboard":"Front","width":4500,"height":5400,"mode":"fit"},
  {"type":"setBackground","color":null},
  {"type":"setPpi","ppi":300}
]
```
Validated with zod; applied in order to a copy of each document (`src/automation/actions.ts`).

## In-app batch
File → *Batch Resize & Export…* exports one file per listed size (PNG/JPEG/PDF/SVG). File → *Export…* has presets (print-on-demand T-shirt, web 1×/2×, JPEG, PDF, SVG), per-artboard or all-artboards export, bleed, ppi.

## Plugins
`src/automation/plugin.ts`: a plugin is a bundled TypeScript module `{ id, name, version, commands[] }`; commands receive a narrow `PluginApi` (`doc`, `selection`, undoable `apply`, `select`, `notify`). One example ships (*Print-on-demand tools → Add Print-Area Guides*). **Third-party scripts are not loaded at runtime**: the CSP forbids `eval`, and no sandbox exists yet (see DECISIONS.md ADR-012).
