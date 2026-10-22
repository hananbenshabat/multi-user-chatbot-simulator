# Changelog

## 0.5.2 (2026-10-23)
- **Live demo** on GitHub Pages: https://hananbenshabat.github.io/multi-user-chatbot-simulator/ (`npm run build:site`, deployed by a GitHub Actions workflow), linked from the README. No changes to the package's code.

## 0.5.1 (2026-10-23)
- README: shorter, with install from npm and the one-file build from a CDN. No code changes.

## 0.5.0 (2026-10-23)
- **New UI in React + [Mantine](https://mantine.dev), in TypeScript.** A redesigned header (view switch, filter, menus), chat panels with avatars, role colors, polished bubbles and a typing indicator, a table timeline, notifications, and new dialogs (Add, Edit, recipients, contacts, Settings, Script, Profile editor). Removing a user asks once, with a checkbox to also remove the users linked only under them. Everything renders inside the simulator's root, so it doesn't touch the host page's styles.
- **Two builds:** `dist/chatbot-sim.js` + `dist/chatbot-sim.css` for any page (`ChatbotSim.mount()` and the `ChatbotSimCore`, `ChatbotSimScript` and `ChatbotSimAdapters` globals as before), and an ES module with the `<ChatbotSimulator>` React component and TypeScript types. Developing it now needs `npm install` (Vite, TypeScript); `npm run dev` serves the demo.
- **The logic is TypeScript:** `src/core.js` and `src/script.js` are split by concern into `src/core/` and `src/script/`, and the adapters moved to `src/adapters/`. They still have no dependencies; the build turns them into `dist/core.js`, `dist/script.js` and `dist/adapters/*.js` with type declarations, which run in Node 18+. The package exports (`/core`, `/script`, `/adapters/demo`, `/adapters/http-json`) point there. `core.replyList()` is new, and `routeReplies()` accepts what an adapter returns as is (a list or `{ replies }`).
- **Stricter types:** no `any`, casts or non-null assertions anywhere (enforced by lint). Field values are `FieldValue` (string, number or boolean), adapter settings are `AdapterSettings` (string, number or boolean values), message `meta` is `Json`. Everything read from outside (session files, server replies, saved recipients, the profile JSON editor) is validated instead of trusted; new `core.normalizeReply()`, `core.fieldValues()`, `core.settingsFrom()`. `demo()` and `httpJson()` return their exact adapter types.
- **Links are managed from the leader's side:** only the user who made a link (the lead) has the (−) to unlink it; a member's chat and Edit dialog show their lead read-only. Counts leave the leader out: a group header reads "Lead (3)", and a member's recipients counter doesn't count their lead.
- **Links live in the To row:** a chat's links and its recipients are one row: "To [★ Lead] [Dana −] [Noa −] (+)". The lead can't be removed, the users you linked have a (−) to unlink, and (+) is Link User. The separate links row in the chat header and the "Everyone (n)" chip are gone ("Everyone (n)" stays when Appearance → Show links is off). A hand-picked list that equals the default counts as the default.
- **Taps from scripts and code answer like clicks:** tapping a button on a message another user sent (`{ "tap": … }`, `app.send(id, { buttonId })`) answers just that user and puts the message's reply controls away, the same as clicking it.
- **README screenshot** (`docs/images/board.png`).
- **Answering puts a message's controls away:** after a quick reply or your own reply under a message, it shows just the name and the text (saved as `answered`). The reply box has a send button, off while empty, like the main one.
- **Share contacts button removed** from the chat (it only fit the demo bot's "invite" flow). Sending contacts still works from scripts (`share` steps) and code (`app.send(id, { contacts })`), for bots that handle shared contacts.
- **Add tiles** read "Add User", with "Linked to Lead" under them.
- **Messages say who they're from:** replies can carry `author` (the ID of the user they relay); the chat shows that name in small type on top of the bubble. The demo bot and the echo server use it instead of "Avi says: …" / "Lead answered: …" / "From Lead: …" in the text.
- **Quick replies and a reply box under a message:** buttons sit inline on one line; the latest message from each person has a "Type a message" box. Both answer just that message's author, without changing your recipients; hovering or focusing them shows it in the To row (only the author is highlighted).
- **The To row only shows; Send to… changes:** the To row lists the people this user can reach and highlights the current recipients. Recipients and links change in the **Send to…** dialog: tick to send (and link someone not linked yet), (−) to unlink someone you linked, **New user…** to add a linked user. The (−), ×, "clear" and link buttons in the To row are gone.
- **"Sent to" under the bubble:** a sent message's footer says who the bot's replies reached ("Sent to Lead · 12:24", or "Sent to 3 users" with the names on hover), saved as `deliveredTo` on the message. The "↪ names" line above the text is gone, and the demo bot no longer sends "Sent to N recipient(s).", "Forwarded to N…", "Sent your answer back." or "Invited N…" messages.
- **Fix (demo bot):** 👍/👎 answers go back to whoever asked (a member asking their lead, or anyone who messaged you), not only to the users linked above you; with nobody to answer, the bot says so instead of "Sent your answer back."
- **Team preset: "Works with" (member → member).** Members can link each other (from the To picker or their Link User button); groups still follow "Leads", so a linked teammate stays in the lead's group. Saved sessions whose Team profile was never edited get the new relation when they load or are imported.
- **Choosing recipients links you:** picking someone you aren't linked to in the To picker links you when a relation fits (a member picking their lead joins the lead's group), and a lead with hand-picked recipients gets new members added to them.
- **Link suggestions:** when a message arrives from someone who isn't linked to you (a script, the API, a bot's routing), the chat says "Avi isn't linked to you" with **Link Avi** and a dismiss button.
- **Recipients dialog:** a member's lead is marked "always"; **All linked / None** count only the people you can change, and are hidden when there are none (they used to both light up).
- **Link existing users:** in **Link User** (and Add with a link chosen), the Name field suggests existing users who can take the link and don't have it yet (those not linked anywhere first). Picking one links them instead of adding a new user; typing a name still adds a new one.
- **A member's lead is always a recipient:** their "To" chip has no ×, the recipients dialog keeps the lead ticked, and a chat's header lists only the links it made (a member's lead shows in the To row, not twice).
- **Message box hint:** "Type a message" (was "Message as {name}"; saved profiles with the old default get the new one).
- **Script editor:** the JSON is formatted by default (on open, on import and when you leave the editor); text that isn't valid JSON yet is left as typed. The **Format** button is gone.
- **Fix:** a script with no users and no steps is refused with a clear error (with `"reset": true` it used to just remove everyone and report "passed"), and **From this session** is unavailable when there is nothing to record.
- **Fix:** a script `say` step without `to` now goes to the user's default recipients, like typing; it used to go to nobody.
- **Tooling:** Vitest (tests now in TypeScript, plus UI tests with Testing Library and happy-dom), oxlint, oxfmt, knip and publint, and a husky pre-commit hook (lint-staged: oxfmt + oxlint on staged files); `npm run check` runs them all with the typecheck and the build.
- Each chat is a named `<section>` (a landmark for screen readers), and the recipients row is a named group.
- Removed `src/ui.js`, `src/profile-editor.js` and `src/chatbot-sim.css` (replaced by `src/ui/`).
- **"Card" is now "user" everywhere:** in the UI, the docs and the API. `app.addUser()`, `session.users`, `linkFrom: { rel, userId }`, adapters get `ctx.user`, HTTP templates use `{{user.*}}`, scripts use `"users"` and `{ "user": … }`, and profiles use `labels.user`, `chatWidth`/`chatHeight` and `showAsChip`. The CSS classes and tokens are `.cbs-user*` and `--cbs-chat-w`/`--cbs-chat-h`. Exports are version 3. Old names still load: version 1–2 exports, autosaved sessions, saved scripts, profiles, and `{{card.*}}` in HTTP templates.
- **Adding users:** each group ends with a dashed **+ Add user** tile, the same size as a chat. It opens the Add dialog with the group's role and link already chosen. A tile after the groups adds a user who starts a new group (on an empty board, the first user). The toolbar no longer has its own Add button. The small header buttons say **+ user**, with the relation named when there are several.
- **Recipients default to the links:** a user's typed messages are aimed at everyone they're linked with, both ways (a lead → their members, a member → their lead), unless the To picker says otherwise. The default shows as one "Everyone (n)" chip; "None" is a real choice. Choices are saved with the session. In the recipients dialog, **All linked** / **None** light up to match the checkboxes. Linked users show as chips with a (−) to unlink.
- **Pages and routing (React Router):** the board, the timeline and a new **Settings** page have their own URLs (`#/`, `#/timeline`, `#/settings/…`). Settings has the profile (General, Roles, Relations, Fields, Appearance, JSON) and the adapters, as pages instead of dialogs; unsaved profile edits stay as a draft until **Save profile**. New option `routing: 'hash' | 'browser' | 'memory'` (the demo page uses clean `browser` URLs). Inside an app with React Router, the app's router is used. React Router is a peer dependency of the React build.
- **The Actions menu is gone.** Adapter actions (reset test data, run a job…) still run from scripts (`{ "action": … }`) and code (`app.runAction()`).
- **Toolbar:** the ⋯ menu is gone. On the right: Script, then icons for export session, import session, remove all users (trash), Settings (⚙) and the theme.
- **Script files:** the built-in example is gone; scripts are files. The Script dialog has **Import file** and **Export file**. Two examples ship in `examples/scripts/`, and `npm test` runs them. `EXAMPLE` is no longer exported from the script module.
- The demo bot's "Relay my last message" is now **Forward to my group**, and the adapter is called **Demo bot**.
- **Toolbar:** Users and Timeline are a two-part switch. Profile, Settings, Export, Import and Clear moved into a ⋯ menu (keyboard: arrows, Home/End, Escape).

## 0.4.0
- **Renamed** from "Chat Cards" to **Multi-User Chatbot Simulator**. Globals are now `ChatbotSim`, `ChatbotSimCore`, `ChatbotSimScript` and `ChatbotSimAdapters`; CSS classes and tokens use the `cbs-` prefix; the stylesheet is `src/chatbot-sim.css`; the default storage key and export format are `chatbot-sim`. Older export files still import.
- **Scripts:** JSON scenarios with cards and steps (`say` with `to`, `tap`, `share`, `add`, `link`, `action`, `wait`, `expect`, `clear`), run from the toolbar's **Script** dialog or `app.run()`. Results per step, stop button, recording from a session, and a headless runner for Node.
- Controller: `run`, `clear`, `actions`, `defaultType`.
- The message box placeholder stays on one line on narrow cards.

## 0.3.0
- **To picker:** choose recipients on any card. The chosen IDs go to the adapter as `message.targets` (`{{message.targets}}` in the HTTP body), and replies addressed to them land in their cards. Sent bubbles show "→ names".
- Day/night theme: follows the system setting, with a toolbar toggle that remembers the viewer's choice. Hosts can set the default (`theme`), drive it (`setTheme`) and follow it (`onThemeChange`).
- Messages to adapters carry a stable `id` and a `kind` (`text`, `button`, `list`, `contacts`).
- Share contacts from any card; contact bubbles link to the matching card.
- Adapter actions (toolbar **Actions**), including configurable HTTP actions.
- Cards created for unknown IDs take the role their relation points to.
- The caret stays in the message box when the board re-renders; saving is batched.
- Documentation split into `docs/`; JSDoc types in `src/core.js`.

## 0.2.0
- Profiles: ID format, roles, many-to-many relations, custom fields, wording, appearance; presets; profile editor.
- Images and raw-data (`meta`) messages.

## 0.1.0
- Cards, adapters (demo and HTTP JSON), polling, timeline, export/import.
