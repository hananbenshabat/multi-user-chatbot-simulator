# Adding a test endpoint to your bot

The console needs one HTTP endpoint that takes a message "from" a user, runs your bot, and returns everything the bot wanted to send, to anyone. This page describes a pattern that works for most bots, whatever channel they normally run on.

## 1. Run the bot with a capturing sender

Most bots have one place where they send messages, such as a client for a messaging platform. For tests, give the bot a sender with the same methods that **records** messages instead of sending them:

```python
class CaptureSender:
    def __init__(self):
        self.out = []

    def text(self, to, body):
        self.out.append({"to": "+" + to, "text": body})
        return True

    def buttons(self, to, body, buttons):            # buttons: [(id, title)]
        self.out.append({"to": "+" + to, "text": body, "buttons": [{"id": i, "title": t} for i, t in buttons]})
        return True

    def list(self, to, body, button, rows):         # rows: [(id, title, description)]
        self.out.append({"to": "+" + to, "text": body,
                         "list": {"button": button, "rows": [{"id": i, "title": t, "description": d} for i, t, d in rows]}})
        return True
```

Pre-approved message templates (common on business messaging platforms) have no text of their own. Render them to text for the console, e.g. `"[template " + name + "] " + " · ".join(params)`, or use `meta` to show the raw parameters.

## 2. Turn the console's message into your bot's input

With the HTTP adapter's default body you receive:

```json
{ "id": "m…", "kind": "text|button|list|contacts", "from": "+15550000001", "name": "…", "role": "…",
  "text": "…", "button": "…", "title": "…", "contacts": [{ "name": "…", "address": "…" }] }
```

Build whatever your handler expects from it. For example, a webhook-style dict with `from` (in the format your bot uses, such as digits only), a type, and the text, button reply or contacts. Pass `id` through so your duplicate check works as it does in production. If your bot expects a different body, change the body template in Settings rather than the bot.

## 3. Return the captured messages

Run the handler **synchronously** inside the request. Production webhooks often answer at once and process in the background; the test endpoint must wait, so the replies come back in the response:

```python
def test_message(request):
    if not hmac.compare_digest(request.headers.get("X-Test-Key", ""), TEST_KEY):
        return 401
    sender = CaptureSender()
    bot = make_bot(sender=sender, storage=test_storage, clock=test_clock)   # your bot, wired for tests
    bot.handle(to_bot_input(request.json))
    return {"replies": sender.out}
```

Replies to other users (`"to"` someone else) are fine: the console delivers each one to the matching user, and creates users for unknown IDs.

## 4. Keep it safe

- **Off by default.** Enable the endpoint with a flag or environment variable, only where you test.
- **A secret header** (the adapter's "Auth header"), compared in constant time. Keep the value out of the page source: testers enter it in Settings, where it stays in the browser tab.
- **Separate data.** Point the bot at a test store, a key prefix or a separate table, so test users never mix with real ones. Add a reset action.
- **Never send for real.** The capturing sender must replace the real one, not wrap it.
- **CORS:** allow only the console's origin, the `Content-Type` and auth headers, and `POST`/`GET`/`OPTIONS`.
- Hide the console page from search engines (`<meta name="robots" content="noindex">`) and from your sitemap.

## 5. Optional: time and jobs

Bots that depend on time (reminders, reply windows, daily jobs) are easier to test with a clock the endpoint controls. Inject `now` into the bot and expose actions:

```json
[
  { "id": "reset", "label": "Reset test data", "url": "https://…/test/reset" },
  { "id": "day", "label": "Move the clock 1 day forward", "url": "https://…/test/clock", "body": { "days": 1 } },
  { "id": "cron", "label": "Run the daily job", "url": "https://…/test/cron" }
]
```

Paste that into the HTTP adapter's **Actions** setting (Settings → Adapters), or put it in `defaults.actions`, then run them from a script, e.g. `{ "action": "day" }` before an `expect`. Each action can return `{"replies": [...]}` for the messages it caused.

## Checklist

- [ ] `POST /test/message`: auth, input mapping, synchronous run, `{replies}`
- [ ] unique `id` handled by the same duplicate check as production
- [ ] all outgoing message types captured (text, buttons, lists, templates, media → `image` or `meta`)
- [ ] separate test storage + reset action
- [ ] CORS for the console's origin
- [ ] disabled unless explicitly enabled
