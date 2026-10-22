import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'vitest';
import demo from '../src/adapters/demo';
import * as core from '../src/core';
import * as S from '../src/script';
import type { OutgoingMessage, Session } from '../src/types';
import { sendContext, settingsOf } from './helpers';

// The example scenarios ship as files in examples/scripts/ (import them in the Script dialog).
const EXAMPLES = new URL('../examples/scripts/', import.meta.url);
const exampleFile = (name: string) => S.parseScript(fs.readFileSync(new URL(name, EXAMPLES), 'utf8'));
const EXAMPLE = exampleFile('lead-asks-two-members.json');

// A headless engine with the controller's methods, on top of core + the demo adapter.
function engine() {
  const adapter = demo({ delayMs: 0 });
  const settings = settingsOf(adapter);
  const e: S.Engine & { session: Session } = {
    session: core.emptySession(core.PRESETS.team),
    defaultType: 'demo',
    setProfile(p) {
      e.session.profile = typeof p === 'string' ? core.preset(p) : core.normalizeProfile(p);
    },
    clear() {
      e.session = core.emptySession(e.session.profile);
    },
    addUser(f = {}) {
      const c = core.createUser(e.session, { type: 'demo', ...f });
      if (f.linkFrom) core.link(e.session, f.linkFrom.rel, f.linkFrom.userId, c.id);
      return c;
    },
    link(rel, a, b) {
      return core.link(e.session, rel, a, b);
    },
    async send(id, input) {
      const user = core.findUser(e.session, id) || core.findByAddress(e.session, id);
      if (!user) throw new Error('no user ' + id);
      const m = typeof input === 'string' ? { text: input } : input;
      let message: Partial<OutgoingMessage>;
      if ('contacts' in m) {
        message = { kind: 'contacts', contacts: m.contacts };
        core.addMessage(user, 'me', { contacts: m.contacts });
      } else if ('buttonId' in m) {
        const kind = m.kind || 'button';
        message = { kind, buttonId: m.buttonId, title: m.title };
        core.addMessage(user, 'me', { text: m.title, reply: { id: m.buttonId, kind } });
      } else {
        const targets = m.targets || [];
        message = { kind: 'text', text: m.text, targets };
        core.addMessage(user, 'me', targets.length ? { text: m.text, targets } : { text: m.text });
      }
      core.routeReplies(e.session, user, await adapter.send(sendContext(e.session, user, message, settings)));
    },
    actions() {
      return adapter.actions(settings).map((a) => ({ type: 'demo', ...a }));
    },
    async runAction(type, id) {
      core.routeReplies(e.session, null, await adapter.runAction(id, { settings, session: e.session, profile: e.session.profile }), {
        type,
      });
    },
  };
  return e;
}

test('the example script passes: targets, expectations, taps', async () => {
  const e = engine();
  const r = await S.runScript(e, EXAMPLE, { delay: 0 });
  assert.equal(r.ok, true, r.error ?? '');
  assert.equal(r.log.length, EXAMPLE.steps.length);
  assert.deepEqual(
    e.session.users.map((c) => c.name),
    ['Lead', 'Dana', 'Avi', 'Noa'],
  );
});

test('every example script in examples/scripts passes against the demo bot', async () => {
  const files = fs.readdirSync(EXAMPLES).filter((f: string) => f.endsWith('.json'));
  assert.ok(files.length >= 2);
  for (const f of files) {
    const r = await S.runScript(engine(), exampleFile(f), { delay: 0 });
    assert.equal(r.ok, true, f + ': ' + r.error);
  }
});

test('a failing expectation stops the run and says why', async () => {
  const e = engine();
  const r = await S.runScript(e, {
    users: [
      { ref: 'lead', role: 'lead' },
      { ref: 'm', role: 'member', linkFrom: 'lead', count: 2 },
    ],
    steps: [{ as: 'lead', say: 'hi', to: ['m1'] }, { expect: { user: 'm2', text: 'hi', within: 50 } }, { as: 'lead', say: 'never sent' }],
  });
  assert.equal(r.ok, false);
  assert.equal(r.failedAt, 1);
  assert.match(String(r.error), /step 2: Member 2 did not get "hi"/);
  assert.equal(e.session.users[0].messages.filter((m) => m.from === 'me').length, 1);
});

test('count, refs by name and address, share, link, action, wait, clear', async () => {
  const e = engine();
  const r = await S.runScript(e, [
    { add: { ref: 'boss', name: 'Boss', role: 'lead', address: 'boss-1' } },
    { add: { ref: 'w', name: 'Worker', role: 'member', linkFrom: 'boss', count: 3 } },
    { as: 'Boss', share: ['w2', { name: 'Zed', address: 'zed-9' }] },
    { expect: { user: 'zed-9', text: 'invited you' } },
    { add: { ref: 'solo', role: 'member' } },
    { link: { from: 'boss-1', to: 'solo' } },
    { action: 'Say hello to every user' },
    { expect: { user: 'solo', match: '^hello solo|hello member', last: true } },
    { wait: 10 },
    { clear: true },
  ]);
  assert.equal(r.ok, true, r.error ?? '');
  assert.equal(e.session.users.length, 0);
});

test('tap finds list rows too, and waits for its button', async () => {
  const e = engine();
  const r = await S.runScript(e, {
    users: [{ ref: 'a', role: 'lead' }],
    steps: [
      { as: 'a', say: 'hello' },
      { as: 'a', tap: 'Show raw data' },
      { expect: { user: 'a', text: 'raw data' } },
      { as: 'a', tap: 'nope', timeout: 50 },
    ],
  });
  assert.equal(r.ok, false);
  assert.match(String(r.error), /step 4: .* has no button or list row "nope"/);
  assert.equal(e.session.users[0].messages.find((m) => m.reply?.id === 'meta')?.reply?.kind, 'list');
});

test('parse errors name the bad step; unknown keys are refused', () => {
  assert.throws(() => S.parseScript('{'), /not valid JSON/);
  assert.throws(() => S.parseScript({ steps: [{ as: 'a' }] }), /step 1: unknown step/);
  assert.throws(() => S.parseScript({ steps: [{ as: 'a', say: 'x', colour: 1 }] }), /step 1: unknown key "colour"/);
  assert.throws(() => S.parseScript({ steps: [{ say: 'x' }] }), /step 1: "as"/);
  assert.throws(() => S.parseScript({ steps: [{ expect: { user: 'a' } }] }), /needs "text", "match" or "none"/);
  assert.throws(() => S.parseScript({ steps: [{ expect: { user: 'a', match: '(' } }] }), /regular expression/);
  assert.throws(() => S.parseScript({ users: [{ ref: 'a' }, { ref: 'a' }], steps: [] }), /user 2: ref "a" is used twice/);
  assert.equal(S.parseScript([{ wait: 1 }]).steps[0].kind, 'wait');
  assert.throws(() => S.parseScript({ reset: true, users: [], steps: [] }), /no users and no steps/);
});

test('a bad script comes back as ok: false (runScript never throws)', async () => {
  const r = await S.runScript(engine(), '{"steps": [{"as": "x"}]}');
  assert.equal(r.ok, false);
  assert.match(String(r.error), /unknown step/);
});

test('stopping aborts between steps', async () => {
  const ctrl = new AbortController();
  const p = S.runScript(engine(), [{ wait: 5000 }, { add: { ref: 'x' } }], { signal: ctrl.signal });
  setTimeout(() => ctrl.abort(), 20);
  const r = await p;
  assert.equal(r.ok, false);
  assert.match(String(r.error), /stopped/);
});

test('recording a session gives a script that replays it', async () => {
  const e = engine();
  assert.equal((await S.runScript(e, EXAMPLE, { delay: 0 })).ok, true);
  const rec = S.scriptFromSession(e.session);
  assert.deepEqual(
    rec.users.map((c) => c.ref),
    ['lead', 'dana', 'avi', 'noa'],
  );
  assert.deepEqual(rec.users[1].linkFrom, { user: 'lead', rel: 'leads' });
  assert.deepEqual(rec.steps, [
    { as: 'lead', say: 'Can you review my draft?', to: ['dana', 'noa'] },
    { as: 'dana', tap: 'ack' },
  ]);
  const e2 = engine();
  const r = await S.runScript(e2, JSON.stringify(rec), { delay: 0 });
  assert.equal(r.ok, true, r.error ?? '');
  assert.deepEqual(
    e2.session.users.map((c) => c.messages.length),
    e.session.users.map((c) => c.messages.length),
  );
});

test('scripts from before 0.5 ("cards", { "card": … }) still parse', () => {
  const parsed = S.parseScript({
    cards: [
      { ref: 'lead', role: 'lead' },
      { ref: 'm', role: 'member', linkFrom: { card: 'lead' } },
    ],
    steps: [{ as: 'lead', say: 'hi' }, { expect: { card: 'lead', text: 'hi' } }],
  });
  assert.equal(parsed.users.length, 2);
  assert.deepEqual(parsed.users[1].linkFrom, { user: 'lead' });
  assert.deepEqual(parsed.steps[1], { kind: 'expect', user: 'lead', text: 'hi', none: false, last: false, within: null });
});
