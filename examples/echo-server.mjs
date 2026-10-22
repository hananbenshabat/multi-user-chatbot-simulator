// Reference server for the HTTP JSON adapter. Node 18+, no dependencies.
//
//   node examples/echo-server.mjs [port]          (default 8000; key from TEST_KEY, default "dev")
//
//   POST /chat   body = the adapter's default template:
//                {id, kind, from, name, role, fields, parent, text, button, title, contacts, targets}
//                -> {replies: [...]}
//   GET  /poll   -> {replies: [...]}  messages queued for other users (then cleared)
//   POST /reset  -> {replies: []}     forget everything (wire it as an adapter action)
//
// What it shows, so a real bot's test endpoint can copy the pattern:
//   - a shared-secret header, checked on every request
//   - dropping repeated message ids (retries must not repeat side effects)
//   - replies to the sender, and replies to other users ("to") delivered by polling
//   - contacts: the sender can "invite" people; they get a message of their own
//   - targets: a message sent with the console's To picker is answered straight to those people
//
// Commands: "all: <text>" sends <text> to every user that named this sender as its parent.
import http from 'node:http';
import { pathToFileURL } from 'node:url';

const KEY = process.env.TEST_KEY || 'dev';

/** In-memory state; a real bot would use its own (test-only) storage. */
export function createState() {
  return { children: new Map(), queue: [], seen: new Set() };
}

/** One incoming message -> replies. Pure apart from `state`. */
export function handleChat(state, m) {
  if (m.id) {
    if (state.seen.has(m.id)) return [];
    state.seen.add(m.id);
  }
  if (m.parent) {
    if (!state.children.has(m.parent)) state.children.set(m.parent, new Set());
    state.children.get(m.parent).add(m.from);
  }
  if (m.kind === 'contacts' && Array.isArray(m.contacts)) {
    for (const c of m.contacts) state.queue.push({ to: c.address, toName: c.name, author: m.from, text: 'Invited you.' });
    return [{ text: 'Invited ' + m.contacts.length + '; they hear from me on the next poll.' }];
  }
  if (m.button) return [{ text: 'You picked "' + m.button + '" (' + m.kind + ')' }];
  const text = String(m.text || '');
  if (Array.isArray(m.targets) && m.targets.length) {
    // "author": the console shows who it's from as a small name on top of the message
    return m.targets.map((to) => ({ to, author: m.from, text, buttons: [{ id: 'ok', title: 'OK' }] }));
  }
  if (text.startsWith('all:')) {
    const members = [...(state.children.get(m.from) || [])];
    for (const to of members) state.queue.push({ to, author: m.from, text: text.slice(4).trim(), buttons: [{ id: 'ok', title: 'OK' }] });
    return [{ text: 'Queued for ' + members.length + ' user(s); they arrive on the next poll.' }];
  }
  return [
    {
      text: 'Echo: ' + text,
      buttons: [
        { id: 'yes', title: 'Yes' },
        { id: 'no', title: 'No' },
      ],
      list: {
        button: 'Options',
        rows: [
          { id: 'a', title: 'Option A', description: 'first' },
          { id: 'b', title: 'Option B' },
        ],
      },
    },
  ];
}

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    // Allow the console page from any origin. A real test endpoint should list its own origin.
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Test-Key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

export function createServer(state = createState()) {
  return http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return send(res, 204);
    if (req.headers['x-test-key'] !== KEY) return send(res, 401, { error: 'bad X-Test-Key' });
    try {
      if (req.method === 'GET' && req.url === '/poll') return send(res, 200, { replies: state.queue.splice(0) });
      if (req.method === 'POST' && req.url === '/reset') {
        Object.assign(state, createState());
        return send(res, 200, { replies: [] });
      }
      if (req.method === 'POST' && req.url === '/chat') return send(res, 200, { replies: handleChat(state, await readJson(req)) });
      send(res, 404, { error: 'not found' });
    } catch (e) {
      send(res, 400, { error: e.message });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.argv[2] || process.env.PORT || 8000);
  createServer().listen(port, '127.0.0.1', () => console.log(`echo server on http://127.0.0.1:${port} (X-Test-Key: ${KEY})`));
}
