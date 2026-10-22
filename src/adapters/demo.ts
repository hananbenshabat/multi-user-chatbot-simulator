/* Demo adapter: a small bot that runs in the browser (no server).
 * Works with any profile. It shows every feature: buttons, lists, images, meta,
 * and messages pushed to other users ("to") along the profile's relations.
 * Use it as a template for your own adapter. */
import type { Adapter, Reply } from '../types';

export interface DemoOptions {
  type?: string;
  label?: string;
  /** how long the bot "types" before answering (ms); default 250 */
  delayMs?: number;
}

/** The demo bot has actions (and no polling). */
export type DemoAdapter = Adapter & Required<Pick<Adapter, 'actions' | 'runAction'>>;

const ANSWER_BUTTONS = [
  { id: 'ack', title: '👍 Got it' },
  { id: 'nack', title: '👎 Not now' },
];

/** The bot's main menu under `text`. */
const menu = (text: string): Reply => ({
  text,
  buttons: [
    { id: 'forward', title: 'Forward to my group' },
    { id: 'who', title: 'Who am I linked to?' },
  ],
  list: {
    button: 'More',
    rows: [
      { id: 'image', title: 'Send an image', description: 'An inline SVG picture' },
      { id: 'meta', title: 'Show raw data', description: 'A message with a meta payload' },
    ],
  },
});

export default function demo(opts: DemoOptions = {}): DemoAdapter {
  const type = opts.type || 'demo';
  const last = new Map<string, string>(); // user id -> last text it typed (in memory only)
  // Who last asked each user something with 👍/👎 (recipient address -> asker address): the answer goes back there.
  const askedBy = new Map<string, string>();
  /** A question from `asker` to the user at `to`, with the answer buttons. */
  const ask = (asker: { name: string; address: string }, to: string, text: string): Reply => {
    askedBy.set(to.toLowerCase(), asker.address);
    return { to, author: asker.address, text, buttons: ANSWER_BUTTONS };
  };
  const delay = opts.delayMs ?? 250;

  return {
    type,
    label: opts.label || 'Demo bot',
    settingsFields: [
      { key: 'greeting', label: 'Greeting', default: 'Hi {name}! Type anything, then forward it to your group (the users linked to you).' },
    ],

    async send({ user, message, settings, links, profile }) {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      const said = message.buttonId;
      const outgoing = Object.values(links.out).flat();
      const incoming = Object.values(links.in).flat();

      if (said === 'forward') {
        const text = last.get(user.id);
        if (!text) return [menu('Type a message first, then forward it.')];
        if (!outgoing.length) return [menu('Nobody is linked under you. Add someone with the "+ Add user" tile in your group.')];
        return outgoing.map((c) => ask(user, c.address, text));
      }
      if (said === 'ack' || said === 'nack') {
        // to whoever asked: the simulator sends taps on a relayed message to its author (targets);
        // else who last asked this user; for questions from before this bot started, the users above
        const asker = message.targets[0] ?? askedBy.get(user.address.toLowerCase());
        const to = asker ? [asker] : incoming.map((c) => c.address);
        if (!to.length) return [{ text: 'Nobody to answer: this question came from before the bot started.' }];
        return to.map((a) => ({ to: a, author: user.address, text: message.title }));
      }
      if (said === 'who') {
        const rel = (id: string) => profile.relations.find((r) => r.id === id)?.label ?? id;
        const lines = [
          ...Object.entries(links.out).map(([r, cs]) => rel(r) + ' → ' + cs.map((c) => c.name).join(', ')),
          ...Object.entries(links.in).map(([r, cs]) => rel(r) + ' ← ' + cs.map((c) => c.name).join(', ')),
        ];
        return [menu(lines.length ? lines.join('\n') : 'No links yet.')];
      }
      if (said === 'image') {
        const svg =
          '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" rx="12" fill="#1f7a5a"/><text x="120" y="68" font-family="sans-serif" font-size="22" fill="#fff" text-anchor="middle">' +
          user.name.replace(/[<&>"]/g, '') +
          '</text></svg>';
        const base64 = btoa(String.fromCharCode(...new TextEncoder().encode(svg)));
        return [{ text: 'Here is a picture.', image: { url: 'data:image/svg+xml;base64,' + base64, alt: 'Name badge' } }];
      }
      if (message.kind === 'contacts' && message.contacts) {
        // Invite everyone shared; unknown IDs become new users linked under the sender. (No "sent"
        // confirmation: the simulator shows who a message reached under its bubble.)
        return message.contacts.map((c) => ({
          to: c.address,
          toName: c.name || c.address,
          author: user.address,
          text: 'Invited you. Say hi!',
        }));
      }
      if (said === 'meta') {
        return [
          { text: 'This message carries raw data (open "data").', meta: { user: user.address, role: user.role, fields: user.fields } },
        ];
      }
      const text = message.text;
      if (text && message.targets.length) {
        // Sent with the To picker: straight to the chosen people, wherever they are.
        last.set(user.id, text);
        return message.targets.map((to) => ask(user, to, text));
      }
      if (text) {
        last.set(user.id, text);
        return [menu('Saved: "' + text + '"')];
      }
      return [menu(String(settings.greeting).replace('{name}', user.name))];
    },

    // Commands a script can run ({ "action": "broadcast" }) or code can (app.runAction).
    actions() {
      return [
        { id: 'broadcast', label: 'Say hello to every user', description: 'A message the bot sends on its own' },
        { id: 'forget', label: 'Forget saved messages', description: 'Clears what "Forward to my group" would send' },
      ];
    },

    async runAction(id, { session }) {
      if (id === 'forget') {
        last.clear();
        return [];
      }
      if (id === 'broadcast') {
        return session.users
          .filter((c) => c.type === type)
          .map((c) => ({ to: c.address, text: 'Hello ' + c.name + ', this is a broadcast.' }));
      }
      throw new Error('unknown action ' + id);
    },
  };
}
