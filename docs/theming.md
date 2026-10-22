# Theming

## Day and night

The console has a light and a dark theme. It picks one in this order:

1. **The viewer's choice:** the sun/moon button in the toolbar. Remembered per browser, in localStorage under `<storageKey>:theme`.
2. **The host page's default:** `mount({ theme: 'light' | 'dark' })`.
3. **The profile:** `appearance.theme`.
4. **The system setting** (`prefers-color-scheme`). This is followed live, so switching the OS to dark mode switches the console.

When a viewer's choice matches the default again, it's forgotten, and the console goes back to following the system. That's how most sites behave.

## Embedding in a page with its own theme

If your site has its own day/night switch, drive the console from it and listen for changes:

```js
const app = ChatbotSim.mount(el, {
  adapters,
  onThemeChange: (theme) => document.documentElement.dataset.theme = theme,   // 'light' | 'dark'
});

siteToggle.addEventListener('click', () => app.setTheme(nextTheme));  // 'light' | 'dark' | 'auto'
console.log(app.theme);  // the theme shown now
```

`onThemeChange` is called once on mount and then on every change, including system changes.

## Look and feel

The UI is built with [Mantine](https://mantine.dev). The profile's [appearance](profiles.md#appearance) covers the accent color (every shade is derived from it), density, layout, bubble shape, direction, font size and chat size.

For anything else, override CSS under `.cbs-root`, the element the simulator renders inside your mount element. It carries `data-mantine-color-scheme="light"` or `"dark"`:

```css
#app .cbs-root { --cbs-board-bg: #eef2f7; }
#app .cbs-root[data-mantine-color-scheme='dark'] { --cbs-chat-bg: #0b0d10; }
#app .cbs-msg.cbs-me { border-radius: 6px; }
```

| token | |
|---|---|
| `--cbs-board-bg` | behind the chats |
| `--cbs-chat-bg` | inside a chat, behind the bubbles |
| `--cbs-bubble-bot`, `--cbs-bubble-border` | the bot's bubbles (yours use the accent color) |
| `--cbs-shadow` | chats and the timeline |
| `--cbs-chat-w`, `--cbs-chat-h` | set from the profile |

Mantine's own variables (`--mantine-color-*`, `--mantine-radius-*`, `--mantine-font-family`) are defined on the same element and can be overridden there too.

These class names are stable: `.cbs-header`, `.cbs-board`, `.cbs-group`, `.cbs-row`, `.cbs-chat` (with `data-user-id`), `.cbs-chat-head`, `.cbs-msgs`, `.cbs-msg` plus `.cbs-me` / `.cbs-bot` / `.cbs-system` / `.cbs-error`, `.cbs-composer`, `.cbs-add-tile` and `.cbs-timeline`.

Everything is scoped to the simulator. Mantine's page-wide reset isn't loaded, its variables are set on `.cbs-root` rather than `:root`, and dialogs, menus and notifications render inside `.cbs-root`, so nothing leaks into your page.
