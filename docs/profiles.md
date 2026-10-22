# Profiles

A profile holds everything domain-specific: what a user's ID looks like, the kinds of users, how they relate, the extra values each one carries, the wording and the look. It travels with the session, so an exported file opens exactly as it was.

Edit it in **Settings** (the ⚙ icon in the toolbar; pages General, Roles, Relations, Fields, Appearance and JSON, at `#/settings/general` and so on). Changes are kept as a draft while you move between pages, until you press **Save profile**, or pass one to `mount({ profile })`. Every key is optional. Invalid values are fixed rather than rejected, so a hand-written profile can't break the page.

```json
{
  "name": "Support desk",
  "identity": { "label": "Email", "pattern": "user{n}@example.test" },
  "roles": [
    { "id": "customer", "label": "Customer", "color": "#d8833b" },
    { "id": "agent", "label": "Agent", "color": "#2a9d8f", "icon": "🎧", "idPattern": "agent{n}@example.test" }
  ],
  "relations": [{ "id": "assigned", "label": "Handles", "from": "agent", "to": "customer" }],
  "fields": [
    { "key": "language", "label": "Language", "type": "select", "options": ["en", "he"], "default": "en" },
    { "key": "plan", "label": "Plan", "type": "select", "options": ["free", "pro"], "roles": ["customer"] }
  ],
  "labels": { "user": "User", "send": "Send", "placeholder": "Type a message", "bot": "bot" },
  "appearance": { "groupBy": "assigned", "accent": "#1f7a5a" }
}
```

## Identity

| key | default | |
|---|---|---|
| `label` | `ID` | What the ID is called in the UI: Phone, Email, Username… |
| `pattern` | `user-{n}` | How new IDs are made. `{n}` is a counter; `{n:7}` pads it to 7 digits. A pattern without `{n}` gets the number appended. |

The ID is the user's `address`: what your bot knows the user by and what replies use in `to`. IDs match loosely: spaces, dashes, dots, `+` and brackets are ignored, and case doesn't matter. So `+1 (555) 000-0001` and `15550000001` are the same user.

## Roles

| key | |
|---|---|
| `id` | Lowercase slug; what adapters see in `user.role`. Renaming it doesn't update existing users. |
| `label` | Shown on the user's chip. |
| `color` | `#rrggbb`; tints the user's top edge and chip. |
| `icon` | Up to 4 characters, shown before the name. |
| `idPattern` | Overrides `identity.pattern` for this role. |

Users may also have no role.

## Relations

Directed, many-to-many links between users: `{ "id", "label", "from", "to" }`, where `from` and `to` are role ids or `"*"` (any role).

- Users get a **+ user** button for each relation they can start (named after the relation when there are several), and each group ends with a **+ Add user** tile. Both create a user already linked.
- A user's **✎ Edit** dialog lists every possible link as checkboxes.
- Adapters receive the links (`ctx.links`) and can message along them.
- When the bot messages an unknown ID, the new user is linked under the sender's group root. It uses the grouping relation if that fits, otherwise the first relation that fits. If the reply has no `toRole`, the user takes the role the relation points to.
- Removing a user can also remove the users linked *only* under it (you're asked).

## Fields

Custom values on each user: `{ "key", "label", "type", "options", "default", "roles", "showAsChip" }`.

| type | value |
|---|---|
| `text`, `textarea` | string |
| `number` | number, or `""` when empty |
| `select` | one of `options` (the first if the default isn't one) |
| `checkbox` | boolean |

`roles` limits a field to some roles (empty = all). `showAsChip` shows the value as a chip. Adapters receive the values in `user.fields`, and the HTTP body template can use `{{user.fields.<key>}}`.

## Labels

| key | default | |
|---|---|---|
| `user` | `User` | What a user is called ("+ Add user", "Add users"). |
| `send` | `Send` | The send button. |
| `placeholder` | `Type a message` | The message box hint; `{name}` is the user's name. |
| `bot` | `bot` | The other side, in the timeline. |

## Appearance

| key | values | default |
|---|---|---|
| `theme` | `auto`, `light`, `dark` | `auto`, which follows the system. Viewers can still toggle; see [theming](theming.md). |
| `accent` | `#rrggbb` | `#1f7a5a` |
| `groupBy` | a relation id, `role`, or `""` | the first relation |
| `layout` | `rows` (one row per group, scroll sideways), `grid` (wrap) | `rows` |
| `density` | `comfortable`, `compact` | `comfortable` |
| `bubbles` | `rounded`, `square` | `rounded` |
| `direction` | `ltr`, `rtl`, for the interface. Messages always follow their own text direction. | `ltr` |
| `fontSize` | 11–20 px | 14 |
| `chatWidth`, `chatHeight` | 220–800 px, 240–1200 px | 320, 480 |
| `showId`, `showTimestamps`, `showFields`, `showLinks` | booleans | `true` |

## Presets

`generic`, `team`, `support`, `classroom`, `phones`. Load one in the editor (General → Start from a preset), pass its name to `mount({ profile })`, or add your own with `mount({ presets: { mine: {…} } })`. Profiles can also be exported and imported on their own as JSON files.
