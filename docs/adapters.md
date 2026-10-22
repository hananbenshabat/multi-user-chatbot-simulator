# Adapters

Users never talk to a server directly. Each user has a `type`, and the adapter registered for that type turns the user's messages into calls to your bot and the bot's answers into replies. Register several adapters to mix bots, or several servers of one bot, on one board.

## The contract

```js
const myAdapter = {
  type: 'bot',                    // unique; stored on each user
  label: 'My bot',                // shown in dialogs and on users when there are several adapters

  // Optional: edited under Settings and passed to every call as `settings`.
  // type: text | url | number | json | secret (secrets stay in the browser tab and are never exported)
  settingsFields: [{ key: 'url', label: 'URL', type: 'url', default: 'http://localhost:8000', hint: 'optional help text' }],

  async send(ctx) { return [/* replies */]; },          // required

  pollInterval(settings) { return 0; },                 // optional: ms between polls, 0 = off
  async poll({ settings, session, profile }) { return []; },

  actions(settings) { return [{ id: 'reset', label: 'Reset test data', description: '' }]; },  // optional
  async runAction(id, { settings, session, profile }) { return []; },
};
```

### `send(ctx)`

| field | |
|---|---|
| `user` | the sender: `{ id, type, name, address, role, fields, messages }`. `address` is its ID. |
| `message` | what the user did; see below |
| `links` | `{ out: { <relation>: [users] }, in: { <relation>: [users] } }` |
| `parent`, `root` | the user it's grouped under, and the top of its group (or null) |
| `settings` | this adapter's settings, secrets included |
| `profile`, `session` | read only |

`message` always has an `id` (unique and stable, the same as the bubble's), a `kind`, and `targets`:

| kind | fields | when |
|---|---|---|
| `text` | `text` | the user typed |
| `button` | `buttonId`, `title` | the user tapped a reply button |
| `list` | `buttonId`, `title` | the user picked a list row |
| `contacts` | `contacts: [{ name, address }]` | the user shared contacts (other users, or someone typed in) |

`targets` is the list of IDs a typed message is aimed at. By default that's everyone the user is linked with, in either direction (a lead's messages go to their members, a member's to their lead). The **To** picker (the people button) overrides it, including "None" for `[]`, and the choice is remembered until the user changes it. Button taps and shared contacts carry `[]`. This is how one user addresses specific other users: send `targets` to your API, and the API answers with replies whose `to` is each target. Each reply lands in that user's chat, and the sender's bubble says who the replies reached ("Sent to Lead", or "Sent to 3 users" with the names on hover), so your bot doesn't need to confirm what it sent. When a reply relays what another user said, set `author` to that user's ID: the chat shows their name in small type on top of the message (instead of "Lead says: …" in the text), and the receiver's quick replies and reply box answer just that author (the message they send carries `targets: [author]`).

```
Lead ── "Can you review my draft?"  targets: [user-2, user-4] ──► your API
Lead ◄── { replies: [ { text: "Delivered to 2" },
                      { to: "user-2", author: "user-1", text: "…", buttons: [OK] },
                      { to: "user-4", author: "user-1", text: "…", buttons: [OK] } ] }
         → shown in Lead's, Dana's and Noa's chats
```

Use `message.id` to drop duplicates on the server: the console never reuses it.

Return an array of replies, or `{ replies: [...] }`. If `send` throws, the error shows as a warning in the sender's chat. Each user's messages are sent one at a time, in order. Different users run in parallel.

## Replies

```js
{
  to: 'user-2',                   // optional: deliver to another user; omitted = the sender
  toName: 'Dana', toRole: 'member', link: true,   // used when `to` is unknown and a user is created
  text: 'Pick one',               // `body` is accepted too
  buttons: [{ id: 'a', title: 'Option A' }],      // or ['Yes', 'No']
  list: { button: 'More', rows: [{ id: 'x', title: 'X', description: 'optional' }] },
  image: { url: 'https://… or data:image/…', alt: '…' },
  contacts: [{ name: 'Dana', address: 'user-2' }],
  meta: { anything: 'shown as collapsible JSON' },
}
```

- Any combination of `text`, `buttons`, `list`, `image`, `contacts` and `meta` makes one bubble. A reply with none of them is ignored.
- `to` matches user IDs loosely (see [profiles](profiles.md#identity)).
- An unknown `to` creates a user when "Create a user automatically…" is on in Settings (the default). The user is linked into the sender's group unless `link: false`. When it's off, the sender's chat shows a note instead.
- Images must be `http(s):` or `data:image/…` URLs; anything else is dropped. Text is never parsed as HTML.

## Polling and pushing

Bots often message people without being asked: reminders, broadcasts, a reply that arrives later. There are two ways to get those in:

- **Polling:** implement `pollInterval` and `poll`. Each returned reply must have `to`.
- **Pushing:** call `app.receive(replies, type)` from your own websocket or server-sent events code.

## Actions

`actions(settings)` lists commands the adapter offers, and `runAction(id, …)` runs one. Replies it returns are delivered like polled ones. Typical uses: reset the test data, run a scheduled job now, move the server's clock forward. Run them from a script (`{ "action": "reset" }`, see [scripts.md](scripts.md)) or from code (`app.actions()`, `app.runAction(type, id)`); a notification shows "done" or the error.

## Built-in: HTTP JSON

`httpJson({ type, label, defaults })` (`ChatbotSimAdapters.httpJson` in the one-file build) sends each message as a JSON POST and reads replies from the response. Register it once per server. `defaults` presets any setting:

| setting | |
|---|---|
| `url` | where messages are POSTed |
| `authHeader`, `authValue` | a shared-secret header; the value is a secret |
| `headers` | extra headers, as a JSON object |
| `body` | the JSON body template (below) |
| `repliesPath` | where the replies are in the response: `replies`, `data.out`, or `""` for the whole response |
| `pollUrl`, `pollSeconds` | GET for queued replies; 0 = off |
| `actions` | `[{ "id", "label", "url", "method": "POST", "body": {}, "description" }]` |
| `timeoutMs` | per request, default 15000 |

The default body:

```json
{
  "id": "{{message.id}}", "kind": "{{message.kind}}",
  "from": "{{user.address}}", "name": "{{user.name}}", "role": "{{user.role}}", "fields": "{{user.fields}}",
  "parent": "{{parent.address}}",
  "text": "{{message.text}}", "button": "{{message.buttonId}}", "title": "{{message.title}}", "contacts": "{{message.contacts}}",
  "targets": "{{message.targets}}"
}
```

Placeholders: `user.*`, `parent.*`, `root.*` (each `{ id, name, address, role, fields }`), `message.*` (`id`, `kind`, `text`, `buttonId`, `title`, `contacts`, `targets`), `links.<relation>` (IDs linked out), `links.<relation>_in` (IDs linked in), and `now`.

- A value that is exactly `"{{x}}"` keeps its JSON type: objects, arrays and numbers stay as they are, and a missing value becomes `null`.
- Inside a longer string, values are interpolated, with objects written as JSON.

The server must allow CORS from the console's origin (including the custom auth header), or be served from the same origin. See [server.md](server.md) and `examples/echo-server.mjs`.

## Writing your own

When your API doesn't fit the HTTP adapter's shape, map it in a small adapter instead of changing the server:

```js
const myBot = {
  type: 'mybot',
  label: 'My bot',
  settingsFields: [
    { key: 'url', label: 'API URL', type: 'url', default: 'http://localhost:3000/api/test' },
    { key: 'token', label: 'Token', type: 'secret' },
  ],
  async send({ user, message, settings }) {
    const res = await fetch(settings.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + settings.token },
      body: JSON.stringify({ user: user.address, input: message }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    // map your bot's output to replies
    return data.outbox.map((o) => ({ to: o.recipient, text: o.body, buttons: o.choices }));
  },
};
ChatbotSim.mount(el, { adapters: [myBot] });
```

In TypeScript, type it as `Adapter` (`import type { Adapter } from 'multi-user-chatbot-simulator'`). `src/adapters/demo.ts` is a complete adapter that needs no server, and a good starting point.
