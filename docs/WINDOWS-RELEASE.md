# Windows release candidate – checklist (NOT done)

Nothing in this project has been built or run on Windows. This is the plan for the person/machine that does it. **Do not publish without the owner's approval.**

1. On Windows 10/11 x64: `npm ci`, `npm run typecheck && npm run lint && npm test`.
2. `npm run test:e2e` (needs Chromium: set `executablePath` in `playwright.config.ts` or run `npx playwright install chromium`).
3. `npm run build`, then `npm start` and manually check: window opens, draw/save/open, text with a system font (e.g. Segoe UI, Arial), Arabic/CJK fallback, export PNG/PDF.
4. Run `npm run test:electron` on Windows (the script uses `--no-sandbox`; remove for real runs).
5. Verify font discovery: `%WINDIR%\Fonts` and `%LOCALAPPDATA%\Microsoft\Windows\Fonts` (see `electron/fonts.cjs`). `.ttc` collections only expose their first face.
6. Check High-DPI (125 %/150 %/200 %) and two monitors with different scaling: canvas should stay crisp and rulers aligned.
7. Packaging (to add): `electron-builder` NSIS installer; ship `LICENSES.chromium.html` from `node_modules/electron/dist`, the Inter OFL text (`src/assets/fonts/LICENSE-Inter.txt`) and third-party notices. Code signing needs a certificate the owner must provide.
8. Antivirus/SmartScreen behaviour of an unsigned build is unknown.
