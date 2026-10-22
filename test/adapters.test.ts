import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createServer } from '../examples/echo-server.mjs';
import demo from '../src/adapters/demo';
import httpJson from '../src/adapters/http-json';
import * as core from '../src/core';
import { listen, recordingServer, send, settingsOf, textAt } from './helpers';
import type { OutgoingMessage } from '../src/types';

test('http-json adapter talks to the echo server (send, auth, poll, template vars)', async () => {
  const base = await listen(createServer());
  const a = httpJson({ type: 'http' });
  const settings = settingsOf(a, { url: base + '/chat', authValue: 'dev', pollUrl: base + '/poll', pollSeconds: 1 });
  const s = core.emptySession(core.PRESETS.team);
  const lead = core.createUser(s, { type: 'http', name: 'Lead', role: 'lead' });
  const ann = core.createUser(s, { type: 'http', name: 'Ann', role: 'member' });
  core.link(s, 'leads', lead.id, ann.id);
  const poll = async () => a.poll({ settings, session: s, profile: s.profile });

  const echo = await send(a, s, lead, { text: 'hi' }, settings);
  assert.equal(echo[0].text, 'Echo: hi');
  assert.equal(echo[0].buttons?.length, 2);

  const tap: Partial<OutgoingMessage> = { id: 'm1', kind: 'button', buttonId: 'yes', title: 'Yes' };
  assert.equal((await send(a, s, ann, tap, settings))[0].text, 'You picked "yes" (button)');
  assert.deepEqual(await send(a, s, ann, tap, settings), [], 'same id is dropped');

  const queued = await send(a, s, lead, { text: 'all: meeting moved' }, settings);
  assert.match(String(queued[0].text), /1 user/);
  assert.equal(a.pollInterval(settings), 1000);
  const pushed = await poll();
  assert.equal(pushed.length, 1);
  const r = core.routeReplies(s, null, pushed, { type: 'http' });
  assert.equal(r.delivered[0].user, ann);
  assert.deepEqual(await poll(), []);

  const invite = await send(a, s, lead, { id: 'm2', kind: 'contacts', contacts: [{ name: 'Zoe', address: 'zoe-1' }] }, settings);
  assert.match(String(invite[0].text), /Invited 1/);
  const invited = core.routeReplies(s, null, await poll(), { type: 'http' });
  assert.equal(invited.created[0].name, 'Zoe');

  const withActions = { ...settings, actions: JSON.stringify([{ id: 'reset', label: 'Reset', url: base + '/reset' }]) };
  assert.deepEqual(a.actions(withActions), [{ id: 'reset', label: 'Reset', description: '' }]);
  assert.deepEqual(await a.runAction('reset', { settings: withActions, session: s, profile: s.profile }), []);
  assert.throws(() => a.actions({ ...settings, actions: '[bad' }), /Actions setting/);

  await assert.rejects(send(a, s, lead, { text: 'x' }, { ...settings, authValue: 'wrong' }), /HTTP 401/);
  await assert.rejects(send(a, s, lead, { text: 'x' }, { ...settings, body: '{bad' }), /Body template/);
});

test('http-json body template sees user (and the old card.*), fields, parent and links', async () => {
  const { url, seen } = await recordingServer('{"replies":[]}');
  const a = httpJson();
  const s = core.emptySession(core.PRESETS.support);
  const agent = core.createUser(s, { type: 'http', role: 'agent' });
  const cust = core.createUser(s, { type: 'http', role: 'customer', fields: { language: 'he' } });
  core.link(s, 'assigned', agent.id, cust.id);
  const settings = settingsOf(a, {
    url,
    body: JSON.stringify({
      who: '{{user.address}}',
      lang: '{{user.fields.language}}',
      agent: '{{parent.address}}',
      mine: '{{links.assigned_in}}',
      t: '{{message.text}}',
      id: '{{message.id}}',
      k: '{{message.kind}}',
      b: '{{message.buttonId}}',
      old: '{{card.address}}',
    }),
  });
  await send(a, s, cust, { id: 'mX', kind: 'text', text: 'hello' }, settings);
  assert.deepEqual(seen.body, {
    who: cust.address,
    lang: 'he',
    agent: agent.address,
    mine: [agent.address],
    t: 'hello',
    id: 'mX',
    k: 'text',
    b: null,
    old: cust.address,
  });
});

test('demo adapter forwards along links and answers flow back', async () => {
  const a = demo({ delayMs: 0 });
  const settings = settingsOf(a);
  const s = core.emptySession(core.PRESETS.team);
  const lead = core.createUser(s, { type: 'demo', name: 'Lead', role: 'lead' });
  const ann = core.createUser(s, { type: 'demo', name: 'Ann', role: 'member' });
  core.link(s, 'leads', lead.id, ann.id);

  core.routeReplies(s, lead, await send(a, s, lead, { text: 'standup at 10' }, settings));
  core.routeReplies(s, lead, await send(a, s, lead, { buttonId: 'forward', title: 'Forward to my group' }, settings));
  assert.equal(ann.messages.length, 1);
  assert.match(textAt(ann, 0), /standup at 10/);

  core.routeReplies(s, ann, await send(a, s, ann, { buttonId: 'ack', title: '👍 Got it' }, settings));
  assert.equal(textAt(lead, -1), '👍 Got it');
  assert.equal(lead.messages.at(-1)?.author, ann.address, 'the answer says who it is from');

  const [img] = await send(a, s, ann, { buttonId: 'image', title: 'img' }, settings);
  assert.ok(core.normalizeMessage(img)?.image?.url.startsWith('data:image/svg'));

  const inv = core.routeReplies(
    s,
    lead,
    await send(a, s, lead, { kind: 'contacts', contacts: [{ name: 'Zoe', address: 'zoe' }] }, settings),
  );
  assert.equal(inv.created[0].name, 'Zoe');
  assert.ok(core.linksOf(s, inv.created[0].id).in.leads, 'invited user is linked under the lead');

  assert.equal(a.actions(settings).length, 2);
  const hello = core.replyList(await a.runAction('broadcast', { settings, session: s, profile: s.profile }));
  assert.equal(hello.length, s.users.length);
});

test('targets: a lead message aimed at chosen members comes back routed to exactly those users', async () => {
  const base = await listen(createServer());
  const a = httpJson({ type: 'http' });
  const settings = settingsOf(a, { url: base + '/chat', authValue: 'dev' });
  const s = core.emptySession(core.PRESETS.team);
  const lead = core.createUser(s, { type: 'http', name: 'Lead', role: 'lead' });
  const [ann, ben, cat] = ['Ann', 'Ben', 'Cat'].map((name) => core.createUser(s, { type: 'http', name, role: 'member' }));
  for (const m of [ann, ben, cat]) core.link(s, 'leads', lead.id, m.id);

  const replies = await send(a, s, lead, { id: 't1', kind: 'text', text: 'lunch at 1?', targets: [ann.address, cat.address] }, settings);
  const r = core.routeReplies(s, lead, replies);
  assert.deepEqual(
    r.delivered.map((d) => d.user.name),
    ['Ann', 'Cat'],
  );
  assert.equal(textAt(ann, 0), 'lunch at 1?');
  assert.equal(ann.messages[0].author, lead.address);
  assert.equal(ben.messages.length, 0);

  // without targets the payload carries an empty list, not null
  const spy = await recordingServer();
  await send(a, s, lead, { id: 't2', kind: 'text', text: 'x' }, settingsOf(a, { url: spy.url }));
  assert.deepEqual(spy.seen.body?.targets, []);
});

test('demo adapter sends a targeted message only to the chosen users', async () => {
  const a = demo({ delayMs: 0 });
  const s = core.emptySession(core.PRESETS.team);
  const lead = core.createUser(s, { type: 'demo', name: 'Lead', role: 'lead' });
  const ann = core.createUser(s, { type: 'demo', name: 'Ann', role: 'member' });
  const ben = core.createUser(s, { type: 'demo', name: 'Ben', role: 'member' });
  core.routeReplies(s, lead, await send(a, s, lead, { kind: 'text', text: 'hi Ann', targets: [ann.address] }, settingsOf(a)));
  assert.equal(textAt(ann, 0), 'hi Ann');
  assert.equal(ann.messages[0].author, lead.address);
  assert.equal(ben.messages.length, 0);
});

test('demo adapter: 👍 goes back to whoever asked, even someone above you or not linked', async () => {
  const a = demo({ delayMs: 0 });
  const s = core.emptySession(core.PRESETS.team);
  const lead = core.createUser(s, { type: 'demo', name: 'Lead', role: 'lead' });
  const avi = core.createUser(s, { type: 'demo', name: 'Avi', role: 'member' });
  // Avi asks the Lead; the Lead has nobody above them, so linked-above alone would answer no one
  core.routeReplies(s, avi, await send(a, s, avi, { kind: 'text', text: 'got a minute?', targets: [lead.address] }, settingsOf(a)));
  assert.equal(textAt(lead, 0), 'got a minute?');
  assert.equal(lead.messages[0].author, avi.address);
  core.routeReplies(s, lead, await send(a, s, lead, { buttonId: 'ack', title: '👍 Got it' }, settingsOf(a)));
  assert.equal(lead.messages.filter((m) => m.from === 'bot').length, 1, 'no "sent" confirmation: the simulator shows it');
  assert.equal(textAt(avi, -1), '👍 Got it');
  assert.equal(avi.messages.at(-1)?.author, lead.address);
  // with nobody to answer, it says so instead of claiming it sent something
  const fresh = demo({ delayMs: 0 });
  const [reply] = await send(fresh, s, lead, { buttonId: 'ack', title: '👍 Got it' }, settingsOf(fresh));
  assert.match(String(reply.text), /Nobody to answer/);
});
