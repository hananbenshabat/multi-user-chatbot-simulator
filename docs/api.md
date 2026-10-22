# API

There are two ways in, with the same options and the same controller:

- **Any page:** load `dist/chatbot-sim.js` and `dist/chatbot-sim.css`, then call `ChatbotSim.mount(element, options)`. It returns the controller right away. The bundle also sets `ChatbotSimCore`, `ChatbotSimScript` and `ChatbotSimAdapters` (`demo`, `httpJson`).
- **React (19.2+):** `import { ChatbotSimulator } from 'multi-user-chatbot-simulator'` and `import 'multi-user-chatbot-simulator/style.css'`, then render `<ChatbotSimulator {...options} onReady={(app) => …} />`. Options are read once, when it mounts. It also takes `className` and `style`. The package exports `mount`, `core`, `script`, `demo`, `httpJson` and the TypeScript types (`Controller`, `Adapter`, `Profile`, `Session`, …).

## Options

| option | default | |
|---|---|---|
| `adapters` | (required) | array of adapters; see [adapters.md](adapters.md) |
| `profile` | `'generic'` | preset name or profile object; see [profiles.md](profiles.md) |
| `presets` | | extra presets for the profile editor: `{ name: profile }` |
| `lockProfile` | `false` | always use `profile` (even over a saved or imported one) and hide the profile's Settings pages |
| `storageKey` | `'chatbot-sim'` | localStorage key for autosave; `null` keeps nothing between page loads |
| `title` | `'Multi-User Chatbot Simulator'` | toolbar title |
| `theme` | `'auto'` | default theme before the viewer toggles; see [theming.md](theming.md) |
| `onThemeChange` | | `(theme) => {}`, called with `'light'` or `'dark'` |
| `routing` | `'hash'` | URLs for the pages when the simulator has its own router: `'hash'` (`#/timeline`, `#/settings/adapters`; links and reloads work on any static host), `'browser'` (clean paths like `/settings/adapters`; the server must answer every path with the page, as Vite's dev server does) or `'memory'` (the URL is left alone). Inside an app that already uses React Router, the app's router is used instead and the pages nest under the route that renders the simulator (mount it on a splat route like `sim/*`). |

## Controller

`mount` returns it, and the component passes it to `onReady`:

| | |
|---|---|
| `session`, `profile` | the live session and profile (read them; change them through the methods) |
| `adapters`, `defaultType` | the registered adapters by type; the type new users get by default |
| `addUser({ type, name, role, address, fields, linkFrom: { rel, userId } })` | create a user (and link it); returns the user |
| `link(rel, fromId, toId)` | link two users |
| `send(userIdOrAddress, message)` | send as a user: `'text'`, `{ text, targets }`, `{ buttonId, title, kind }` or `{ contacts: [{ name, address }] }`. `targets` takes user ids or addresses; without it, typed text goes to the user's recipients (the To picker, by default everyone they're linked with). Resolves after the replies arrive. |
| `receive(replies, type?)` | deliver server messages from outside; each needs `to` |
| `actions()`, `runAction(type, id)` | list the adapters' actions (`[{ type, id, label }]`); run one |
| `run(script, { onStep, signal, delay })` | run a script; resolves to `{ ok, steps, error?, failedAt?, log }`; see [scripts.md](scripts.md) |
| `clear()` | remove every user, without asking (profile and settings stay) |
| `setProfile(nameOrObject)` | replace the profile |
| `setTheme('light' \| 'dark' \| 'auto')`, `theme` | set or read the theme |
| `exportJSON()`, `importJSON(text)` | the session as JSON / replace it |
| `destroy()` | save, stop polling, remove listeners, unmount (for `mount`; a component cleans up when React unmounts it) |

`send` makes scripted scenarios easy, for example in a browser test:

```js
const lead = app.addUser({ type: 'bot', role: 'lead', name: 'Lead' });
await app.send(lead.id, 'hello');
await app.send(lead.id, { text: 'only you two', targets: [dana.id, noa.id] });
await app.send(lead.id, { buttonId: 'start', title: 'Start', kind: 'button' });
```

## The core model

The model without the UI, as a plain ES module that also runs in Node (`import * as core from 'multi-user-chatbot-simulator/core'`, or `ChatbotSimCore` from the one-file build): `emptySession`, `createUser`, `link`, `linksOf`, `groups`, `routeReplies`, `normalizeMessage`, `normalizeProfile`, `exportSession`, `importSession`, `fillTemplate`, … Its types come with it; the shared ones are in `src/types.ts`.

## Export format (version 3)

```json
{
  "format": "chatbot-sim", "version": 3, "exportedAt": "2026-01-01T10:00:00.000Z",
  "profile": { },
  "options": { "autoCreate": true },
  "settings": { "<adapter type>": { "<key>": "value" } },
  "users": [{
    "id": "c…", "type": "bot", "name": "Dana", "address": "user-2", "role": "member", "fields": { },
    "messages": [{ "id": "m…", "from": "me|bot|system", "at": "…", "text": "…", "buttons": [], "list": { },
                   "image": { }, "contacts": [], "targets": [], "deliveredTo": [], "meta": { }, "reply": { "id": "…", "kind": "button|list" } }]
  }],
  "links": [{ "rel": "leads", "from": "c…", "to": "c…" }]
}
```

Secret settings are never exported. Older files still import: version 2 called the list `cards`, and version 1 used `parentId` instead of `links`.
