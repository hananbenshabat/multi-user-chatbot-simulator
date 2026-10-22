# Scripts

A script is a JSON scenario the console runs by itself. It creates the users, then acts as them one step at a time: says things (to chosen people), taps buttons, shares contacts, runs actions, waits, and checks that the right people got the right messages. Use scripts to replay a flow after every change to your bot, to share a reproducible bug, or to set up a big board in one go.

- **In the UI:** the toolbar's **Script** button. **Import file** opens a script file, or paste and edit JSON, then press **Run**. Progress shows in the header, and **Stop** appears while it runs. Reopen the dialog to see each step's result. **From this session** turns what you just did by hand into a script; **Export file** saves the editor's script as a `.json` file.
- **In code:** `const result = await app.run(script)`. It also works headless in Node; see below.

## Example

This is `examples/scripts/lead-asks-two-members.json`. Import it in the Script dialog (**Import file**) and press **Run** to try it.

```json
{
  "name": "Lead asks two members",
  "profile": "team",
  "reset": true,
  "delay": 400,
  "users": [
    { "ref": "lead", "name": "Lead", "role": "lead" },
    { "ref": "dana", "name": "Dana", "role": "member", "linkFrom": "lead" },
    { "ref": "avi",  "name": "Avi",  "role": "member", "linkFrom": "lead" },
    { "ref": "noa",  "name": "Noa",  "role": "member", "linkFrom": "lead" }
  ],
  "steps": [
    { "as": "lead", "say": "Can you review my draft?", "to": ["dana", "noa"] },
    { "expect": { "user": "dana", "text": "Can you review my draft?" } },
    { "expect": { "user": "avi", "none": true } },
    { "as": "dana", "tap": "👍 Got it" },
    { "expect": { "user": "lead", "text": "Dana answered" } }
  ]
}
```

A bare array is just the steps: `[{ "as": "lead", "say": "hi" }]`.

## Top level

| key | default | |
|---|---|---|
| `name` | | shown in results |
| `profile` | keep | a preset name or a profile object, applied first |
| `reset` | `false` | remove all users first (profile and settings stay) |
| `delay` | `0` | milliseconds between steps, to watch it happen |
| `timeout` | `5000` | how long `tap` waits for its button to appear |
| `users` | `[]` | users to create before the steps |
| `steps` | (required) | a script needs at least one user or one step |

## Users

```json
{ "ref": "m", "name": "Member", "role": "member", "type": "http", "address": "user-7",
  "fields": { "language": "he" }, "linkFrom": "lead", "count": 3 }
```

- `ref` is how steps refer to the user. It defaults to the name, slugged.
- With `count`, you get several users: refs `m1`, `m2`, `m3` and names "Member 1"… (`address` must then be left out).
- `type` is the adapter. It defaults to the first one registered.
- `linkFrom` links the user under another: a ref, or `{ "user": ref, "rel": relation }`. Without `rel`, the profile's relation from that user's role to this role is used.
- A user whose `address` already exists is reused rather than created again.

## Steps

Wherever a step names a user, you can use a script `ref`, the user's name, its ID (address), or its internal id.

| step | does |
|---|---|
| `{ "as": c, "say": "text" }` | types a message as `c` |
| `{ "as": c, "say": "text", "to": [c1, c2] }` | …aimed at those users (`message.targets`); unknown entries are passed as raw IDs. Without `to`, it goes where the user's typed messages go: their recipients (by default everyone they're linked with). |
| `{ "as": c, "tap": "OK" }` | taps the newest button or list row titled "OK" (or with id "OK") in `c`'s chat; waits up to `timeout` for it to appear (per step: `"timeout": 2000`) |
| `{ "as": c, "share": [c1, { "name": "Zoe", "address": "zoe-1" }] }` | shares contacts |
| `{ "add": { user… } }` | creates a user (same fields as in `users`) |
| `{ "link": { "from": c1, "to": c2, "rel": "leads" } }` | links two users; `rel` is optional when the profile makes it clear |
| `{ "action": "reset", "adapter": "http" }` | runs an adapter action by id or label; `adapter` only when two adapters have the same action |
| `{ "wait": 1000 }` | waits, e.g. for a polled message |
| `{ "expect": { … } }` | checks messages; see below |
| `{ "clear": true }` | removes all users |

Each `say`, `tap` and `share` waits until the adapter has answered and the replies have been delivered before the next step starts.

## Expectations

`expect` looks at the bot messages a user has received **since the script started**:

| key | |
|---|---|
| `user` | which user (required) |
| `text` | passes when a message contains this text (case-insensitive) |
| `match` | passes when a message matches this regular expression (case-insensitive) |
| `last` | `true`: only the newest message counts |
| `none` | `true`: passes when the user got **no** messages |
| `within` | ms to keep checking. Default 1000; for `none`, how long to wait before checking (default 300). |

A failed expectation stops the run, and the error explains it: `step 2: Avi did not get "Can you cover"; last message: "…"`.

## Results

`app.run(script, { onStep, signal, delay })` never throws. It resolves to:

```js
{ ok: true, name: 'Lead asks two members', steps: 5, log: [{ index, text, status: 'ok' }, …] }
{ ok: false, name: '…', steps: 5, failedAt: 1, error: 'step 2: …', log: [...] }
```

- `onStep({ index, total, step, text, status, error })` is called with `status: 'run'` before each step and `'ok'`/`'fail'` after.
- `signal` is an `AbortSignal`. Aborting stops the run between steps (and cuts `wait` short).
- `delay` overrides the script's own.

## Script files

A script file is the JSON above saved as `.json`. The simulator ships two in `examples/scripts/` (`lead-asks-two-members.json`, `forward-to-group.json`), and `npm test` runs every file in that folder against the demo bot, so they always work.

- **Open one:** **Script → Import file** puts it in the editor; a broken file shows what's wrong right away. Press **Run**.
- **Save or share:** **Script → Export file** writes the editor's script to a `.json` file.
- The editor keeps the last script you ran (in this browser), so it's there when you reopen the dialog.

## Recording

**From this session** (or `scriptFromSession(app.session)` from `multi-user-chatbot-simulator/script`; `ChatbotSimScript.scriptFromSession` in the one-file build) writes a script that rebuilds the current users, profile and links, and replays every message typed, button tapped and contact shared, in time order. Add `expect` steps and you have a regression test.

## Headless (Node)

The script runner and the core have no DOM and no dependencies (`import { runScript } from 'multi-user-chatbot-simulator/script'`). `runScript(engine, script)` works with any object that has the controller's methods (`session`, `defaultType`, `setProfile`, `clear`, `addUser`, `link`, `send`, `actions`, `runAction`). `test/script.test.ts` builds one in about 50 lines around an adapter, which is a way to run scripts in CI against a real server through the HTTP adapter.
