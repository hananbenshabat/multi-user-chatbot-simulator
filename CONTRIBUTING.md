# Contributing

Setup: Node 20.19+ (or 22.12+), then `npm install`.

- `npm run dev`: the demo page with hot reload, at http://localhost:8765.
- `npm test`: Vitest. The logic tests (`test/*.test.ts`: core, scripts, adapters) run in Node; the UI tests (`test/ui/`) render the simulator in happy-dom with Testing Library. `npm run test:watch` reruns on save.
- `npm run lint` (oxlint), `npm run format` / `format:check` (oxfmt), `npm run typecheck`, `npm run knip` (unused files, exports and dependencies).
- `npm run build`: typecheck, then `dist/index.js` (ESM for React apps) with `dist/core.js`, `dist/script.js` and `dist/adapters/*.js` (no React; run in Node 18+), `dist/chatbot-sim.js` + `dist/chatbot-sim.css` (the one-file drop-in) and the type declarations.
- `npm run check`: all of the above plus `publint`. Run it before sending a change.
- A pre-commit hook (husky + lint-staged, installed by `npm install`) formats and lints the staged files.

Guidelines:

- **Two layers.** Logic goes in `src/core/` / `src/script/` (TypeScript, no DOM, no dependencies, runs in Node 18+) with a test in `test/`. The React UI in `src/ui/` stays a view over `SimStore` (`src/ui/store.ts`).
- **Types say what things are.** No `any`, no `as` casts, no `!`, no `@ts-` comments (lint enforces it). Untrusted input (files, server JSON, localStorage) arrives as `unknown` and is narrowed with the guards in `src/core/util.ts` (`isObj`, `objects`, `prop`, `oneOf`, `asJson`, `parseJson`).
- **Dependencies:** only permissive licenses (MIT, BSD, Apache-2.0, ISC). The runtime UI depends on React and Mantine only.
- Message content is user data: render it as React text, never `dangerouslySetInnerHTML`.
- Try every change in the demo page in both themes and at phone width (390 px).
- Keep `docs/` in step with the change, and add a line to `CHANGELOG.md`.
