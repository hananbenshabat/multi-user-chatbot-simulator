import { test } from 'vitest';
import assert from 'node:assert/strict';
import * as core from '../src/core';

function team() {
  const s = core.emptySession(core.PRESETS.team);
  const lead = core.createUser(s, { type: 't', name: 'Lead', role: 'lead', address: '+1 555-000-0001' });
  const a = core.createUser(s, { type: 't', name: 'Ann', role: 'member' });
  const b = core.createUser(s, { type: 't', name: 'Ben', role: 'member' });
  core.link(s, 'leads', lead.id, a.id);
  core.link(s, 'leads', lead.id, b.id);
  return { s, lead, a, b };
}

test('profiles are normalized: bad ids, unknown roles and appearance values are fixed', () => {
  const p = core.normalizeProfile({
    roles: [{ id: 'Team Lead', label: 'Lead' }, { id: 'team-lead' }, { id: '' }],
    relations: [{ id: 'x', from: 'team-lead', to: 'ghost' }, { id: 'role' }],
    fields: [
      { key: 'age', type: 'number', default: '7' },
      { key: 'tier', type: 'select', options: ['a', 'b'], default: 'zzz' },
      { key: 'on', type: 'checkbox', default: 'true' },
    ],
    appearance: { theme: 'neon', chatWidth: 99999, accent: 'red', groupBy: 'nope' },
  });
  assert.deepEqual(
    p.roles.map((r) => r.id),
    ['team-lead'],
  );
  assert.deepEqual(p.relations, [{ id: 'x', label: 'x', from: 'team-lead', to: '*' }]);
  assert.deepEqual(
    p.fields.map((f) => f.default),
    [7, 'a', true],
  );
  assert.equal(p.appearance.theme, 'auto');
  assert.equal(p.appearance.chatWidth, 800);
  assert.equal(p.appearance.accent, '#1f7a5a');
  assert.equal(p.appearance.groupBy, 'x');
  for (const name of Object.keys(core.PRESETS)) assert.ok(core.preset(name).name);
});

test('IDs follow the profile and role patterns, padded counters, no duplicates', () => {
  const s = core.emptySession(core.PRESETS.support);
  const c1 = core.createUser(s, { type: 't', role: 'customer' });
  const a1 = core.createUser(s, { type: 't', role: 'agent' });
  assert.equal(c1.address, 'user1@example.test');
  assert.equal(a1.address, 'agent1@example.test');
  assert.equal(c1.fields.plan, 'free');
  assert.equal(a1.fields.plan, undefined);
  assert.equal(core.formatPattern('s{n:4}', 7), 's0007');
  assert.equal(core.formatPattern('fixed', 3), 'fixed3');
  assert.throws(() => core.createUser(s, { type: 't', address: 'USER1@example.test' }), /already used/);
});

test('links: dedupe, no self links, linksOf both directions', () => {
  const { s, lead, a } = team();
  assert.equal(core.link(s, 'leads', lead.id, a.id), s.links[0]);
  assert.equal(core.link(s, 'leads', a.id, a.id), null);
  assert.equal(s.links.length, 2);
  const l = core.linksOf(s, a.id);
  assert.deepEqual(
    l.in.leads.map((c) => c.name),
    ['Lead'],
  );
  assert.equal(core.unlink(s, 'leads', lead.id, a.id), 1);
});

test('groups by relation; a user under two roots shows in both; by role; none', () => {
  const { s, lead, a } = team();
  const lead2 = core.createUser(s, { type: 't', name: 'Lead2', role: 'lead' });
  core.link(s, 'leads', lead2.id, a.id);
  const g = core.groups(s);
  assert.deepEqual(
    g.map((x) => x.users.map((c) => c.name)),
    [
      ['Lead', 'Ann', 'Ben'],
      ['Lead2', 'Ann'],
    ],
  );
  assert.equal(core.parentOf(s, a), lead);
  s.profile.appearance.groupBy = 'role';
  assert.deepEqual(
    core.groups(s).map((x) => x.title + ':' + x.users.length),
    ['Lead:2', 'Member:2'],
  );
  s.profile.appearance.groupBy = '';
  assert.equal(core.groups(s).length, 1);
});

test('cycles still produce groups', () => {
  const s = core.emptySession(core.PRESETS.generic);
  const x = core.createUser(s, { type: 't' });
  const y = core.createUser(s, { type: 't' });
  core.link(s, 'linked', x.id, y.id);
  core.link(s, 'linked', y.id, x.id);
  assert.equal(core.groups(s).flatMap((g) => g.users).length, 2);
  assert.equal(core.rootOf(s, x).id === x.id || core.rootOf(s, x).id === y.id, true);
});

test('remove: links go with the user; cascade only takes exclusive descendants', () => {
  const { s, lead, a, b } = team();
  const lead2 = core.createUser(s, { type: 't', role: 'lead' });
  core.link(s, 'leads', lead2.id, a.id);
  assert.deepEqual(core.exclusiveDescendants(s, lead.id, 'leads'), [b.id]);
  assert.equal(core.removeUser(s, lead.id, { cascade: 'leads' }), 2);
  assert.deepEqual(
    s.users.map((c) => c.name),
    ['Ann', lead2.name],
  );
  assert.equal(s.links.length, 1);
});

test('routing: sender, known "to", and auto-created users linked into the group', () => {
  const { s, lead, a } = team();
  const r = core.routeReplies(s, a, [
    { text: 'menu', buttons: [{ id: 'x', title: 'X' }, 'Y'] },
    { to: '15550000001', text: 'to the lead' },
    { to: 'new-1', toName: 'Newbie', toRole: 'member', text: 'welcome' },
    { text: '' },
  ]);
  assert.equal(r.delivered.length, 3);
  assert.deepEqual(a.messages[0].buttons, [
    { id: 'x', title: 'X' },
    { id: 'Y', title: 'Y' },
  ]);
  assert.equal(lead.messages[0].text, 'to the lead');
  assert.equal(r.created[0].name, 'Newbie');
  assert.ok(s.links.some((l) => l.rel === 'leads' && l.from === lead.id && l.to === r.created[0].id));
  const off = core.routeReplies(s, a, [{ to: 'ghost', text: 'x' }], { autoCreate: false });
  assert.equal(off.unrouted.length, 1);
  const polled = core.routeReplies(s, null, [{ to: 'p1', text: 'pushed' }], { type: 't' });
  assert.equal(polled.created.length, 1);
});

test('normalizeMessage: aliases, images only from safe URLs, meta kept', () => {
  assert.deepEqual(core.normalizeMessage('hey'), { text: 'hey' });
  assert.deepEqual(core.normalizeMessage({ body: 'b' }), { text: 'b' });
  assert.equal(core.normalizeMessage({}), null);
  assert.equal(core.normalizeMessage({ image: 'javascript:alert(1)' }), null);
  assert.deepEqual(core.normalizeMessage({ image: { url: 'https://x.test/a.png', alt: 'A' } }), {
    image: { url: 'https://x.test/a.png', alt: 'A' },
  });
  assert.deepEqual(core.normalizeMessage({ meta: { a: 1 } }), { meta: { a: 1 } });
  assert.deepEqual(core.normalizeMessage({ contacts: [{ name: 'A', phone: '+1 5' }, { name: 'no address' }] }), {
    contacts: [{ name: 'A', address: '+1 5' }],
  });
  assert.deepEqual(core.normalizeMessage({ text: 'x', targets: ['u1', '', null] }), { text: 'x', targets: ['u1'] });
  const l = core.normalizeMessage({ list: { rows: [{ id: 'x', title: 'X' }, {}] } });
  assert.deepEqual(l, { list: { button: 'Choose', rows: [{ id: 'x', title: 'X', description: '' }] } });
});

test('export strips secrets; import round-trips profile, links and fields', () => {
  const { s, lead } = team();
  core.addMessage(lead, 'me', { text: 'שלום', reply: { id: 'go', kind: 'list' }, targets: ['u9'] });
  lead.fields = { note: 'x' };
  s.settings = { t: { url: 'http://x', authValue: 'secret!' } };
  const text = core.exportSession(s, { t: ['authValue'] });
  assert.ok(!text.includes('secret!'));
  const back = core.importSession(text);
  assert.equal(back.profile.name, 'Team');
  assert.equal(back.users.length, 3);
  assert.equal(back.links.length, 2);
  assert.equal(back.users[0].messages[0].text, 'שלום');
  assert.deepEqual(back.users[0].messages[0].reply, { id: 'go', kind: 'list' });
  // older saved messages can have a reply without a kind: it was a button
  const old = core.importSession({ users: [{ type: 't', messages: [{ from: 'me', text: 'x', reply: { id: 'go' } }] }] });
  assert.deepEqual(old.users[0].messages[0].reply, { id: 'go', kind: 'button' });
  assert.deepEqual(back.users[0].messages[0].targets, ['u9']);
  assert.deepEqual(back.users[0].fields, { note: 'x' });
  assert.throws(() => core.importSession('nope'), /not valid JSON/);
  assert.throws(() => core.importSession('{"users":[{}]}'), /type/);
  assert.throws(() => core.importSession('{"version":99,"users":[]}'), /newer/);
});

test('import: links to unknown relations or users are dropped; v1 parentId becomes a link', () => {
  const s = core.importSession({
    profile: core.PRESETS.team,
    users: [
      { id: 'a', type: 't' },
      { id: 'b', type: 't', parentId: 'a' },
    ],
    links: [
      { rel: 'ghost', from: 'a', to: 'b' },
      { rel: 'leads', from: 'a', to: 'zzz' },
    ],
  });
  assert.deepEqual(s.links, [{ rel: 'leads', from: 'a', to: 'b' }]);
});

test('timeline is ordered by time across users', () => {
  const { s, lead, a } = team();
  core.addMessage(a, 'me', { text: 'second' }, '2026-01-01T10:00:02Z');
  core.addMessage(lead, 'me', { text: 'first' }, '2026-01-01T10:00:01Z');
  assert.deepEqual(
    core.timeline(s).map((t) => t.message.text),
    ['first', 'second'],
  );
});

test('fillTemplate keeps types for whole placeholders, interpolates (objects as JSON) inside strings', () => {
  const vars = { n: 5, x: { y: true }, user: { fields: { lang: 'he' } }, parent: null };
  const out = core.fillTemplate(
    {
      a: '{{n}}',
      b: 'id-{{n}}',
      c: ['{{missing}}'],
      d: '{{x.y}}',
      e: '{{user.fields}}',
      f: 'p={{parent.address}}',
      g: 'f={{user.fields}}',
    },
    vars,
  );
  assert.deepEqual(out, { a: 5, b: 'id-5', c: [null], d: true, e: { lang: 'he' }, f: 'p=', g: 'f={"lang":"he"}' });
  assert.equal(core.getPath({ a: [{ b: 1 }] }, 'a[0].b'), 1);
  assert.deepEqual(core.getPath({ a: 1 }, ''), { a: 1 });
});

test('names from before 0.5 still load: "cards" exports, labels.card, cardWidth, showOnCard', () => {
  const s = core.importSession({
    format: 'chatbot-sim',
    version: 2,
    profile: { labels: { card: 'Agent' }, appearance: { cardWidth: 400, cardHeight: 600 }, fields: [{ key: 'plan', showOnCard: false }] },
    cards: [{ id: 'c1', type: 't', name: 'Dana', messages: [{ from: 'me', text: 'hi' }] }],
  });
  assert.equal(s.users.length, 1);
  assert.equal(s.users[0].messages[0].text, 'hi');
  assert.equal(s.profile.labels.user, 'Agent');
  assert.equal('card' in s.profile.labels, false);
  assert.equal(s.profile.appearance.chatWidth, 400);
  assert.equal(s.profile.appearance.chatHeight, 600);
  assert.equal(s.profile.fields[0].showAsChip, false);
  assert.equal(JSON.parse(core.exportSession(s)).version, 3);
  assert.equal(core.normalizeProfile({ labels: { card: 'Card' } }).labels.user, 'User', 'the old default is not kept');
});

test('linkedUsers: both directions, each user once; roleFits', () => {
  const { s, lead, a } = team();
  assert.deepEqual(
    core.linkedUsers(s, lead.id).map((c) => c.name),
    ['Ann', 'Ben'],
  );
  assert.deepEqual(
    core.linkedUsers(s, a.id).map((c) => c.name),
    ['Lead'],
  );
  core.link(s, 'leads', lead.id, a.id); // a duplicate link is ignored anyway
  s.links.push({ rel: 'other', from: a.id, to: lead.id }); // a second link to the same person
  assert.deepEqual(
    core.linkedUsers(s, a.id).map((c) => c.name),
    ['Lead'],
  );
  assert.equal(core.roleFits('*', 'member'), true);
  assert.equal(core.roleFits('lead', 'member'), false);
});

test('the old Team preset gets "Works with"; edited profiles are left alone', () => {
  const old = core.normalizeProfile({ ...core.PRESETS.team, relations: [{ id: 'leads', label: 'Leads', from: 'lead', to: 'member' }] });
  assert.deepEqual(
    core.upgradePreset(old).relations.map((r) => r.id),
    ['leads', 'works-with'],
  );
  const edited = core.normalizeProfile({
    ...core.PRESETS.team,
    relations: [{ id: 'leads', label: 'Manages', from: 'lead', to: 'member' }],
  });
  assert.equal(core.upgradePreset(edited), edited);
  assert.equal(core.upgradePreset(core.preset('support')).relations.length, 1);
});
