import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { ChatbotSimulator } from '../../src/ui/Simulator';
import demo from '../../src/adapters/demo';
import type { Controller } from '../../src/types';

/** A chat's To row (display only): chips titled "<name>: gets your messages" when selected. */
const toRow = (chat: HTMLElement) => within(within(chat).getByRole('group', { name: 'Recipients' }));
const isRecipient = (chat: HTMLElement, name: string) => toRow(chat).queryByTitle(name + ': gets your messages') !== null;

/** The simulator with the demo bot, nothing saved, and its own in-memory router. */
async function renderSimulator(): Promise<Controller> {
  const app = await new Promise<Controller>((resolve) => {
    render(<ChatbotSimulator adapters={[demo({ delayMs: 0 })]} profile="team" storageKey={null} routing="memory" onReady={resolve} />);
  });
  await screen.findByRole('textbox', { name: 'Filter users' });
  return app;
}

test('a typed message shows in the chat with the bot reply', async () => {
  const app = await renderSimulator();
  act(() => {
    app.addUser({ name: 'Lead', role: 'lead' });
  });
  const box = await screen.findByRole('textbox', { name: 'Message as Lead' });
  await userEvent.type(box, 'standup at 10{Enter}');
  const chat = screen.getByRole('region', { name: 'Lead' });
  expect(await within(chat).findByText('standup at 10')).toBeTruthy();
  expect(await within(chat).findByText('Saved: "standup at 10"')).toBeTruthy();
  expect(box).toHaveProperty('value', '');
});

test('recipients default to the linked users; a lead message lands only in their chats', async () => {
  const app = await renderSimulator();
  await act(async () => {
    const lead = app.addUser({ name: 'Lead', role: 'lead' });
    for (const name of ['Dana', 'Avi']) app.addUser({ name, role: 'member', linkFrom: { rel: 'leads', userId: lead.id } });
    app.addUser({ name: 'Solo', role: 'member' });
  });
  const leadChat = await screen.findByRole('region', { name: 'Lead' });
  // the To row shows the linked users, highlighted as recipients; it has no controls of its own
  for (const name of ['Dana', 'Avi']) expect(isRecipient(leadChat, name)).toBe(true);
  expect(toRow(leadChat).queryByRole('button')).toBeNull();

  await userEvent.type(within(leadChat).getByRole('textbox', { name: 'Message as Lead' }), 'review my draft?{Enter}');
  // the message arrives as itself, with the sender as a small name on top
  for (const name of ['Dana', 'Avi']) {
    const chat = screen.getByRole('region', { name });
    expect(await within(chat).findByText('review my draft?')).toBeTruthy();
    expect(within(chat).getByRole('button', { name: 'Lead' })).toBeTruthy();
  }
  expect(within(screen.getByRole('region', { name: 'Solo' })).getByText('No messages yet')).toBeTruthy();
});

test('message text is rendered as text, never as HTML', async () => {
  const app = await renderSimulator();
  act(() => {
    app.addUser({ name: 'Lead', role: 'lead' });
  });
  app.receive([{ to: app.session.users[0].address, text: '<img src=x onerror=alert(1)>' }]);
  const chat = await screen.findByRole('region', { name: 'Lead' });
  expect(await within(chat).findByText('<img src=x onerror=alert(1)>')).toBeTruthy();
  expect(chat.querySelector('img[src="x"]')).toBeNull();
});

test('a script "say" without "to" goes to the default recipients, like typing', async () => {
  const app = await renderSimulator();
  const r = await act(() =>
    app.run({
      users: [
        { ref: 'lead', name: 'Lead', role: 'lead' },
        { ref: 'dana', name: 'Dana', role: 'member', linkFrom: 'lead' },
      ],
      steps: [{ as: 'lead', say: 'review my draft?' }, { expect: { user: 'dana', text: 'review my draft?' } }],
    }),
  );
  expect(r.error).toBeUndefined();
  expect(r.ok).toBe(true);
});

test('the script editor formats valid JSON when you leave it, and leaves broken JSON alone', async () => {
  await renderSimulator();
  await userEvent.click(screen.getByRole('button', { name: 'Script' }));
  const editor = await screen.findByRole('textbox', { name: 'Script (JSON)' });
  await userEvent.clear(editor);
  await userEvent.click(editor);
  await userEvent.paste('{"steps":[{"wait":1}]}');
  await userEvent.tab();
  expect(editor).toHaveProperty('value', '{\n  "steps": [\n    {\n      "wait": 1\n    }\n  ]\n}');
  await userEvent.clear(editor);
  await userEvent.click(editor);
  await userEvent.paste('{"steps": [');
  await userEvent.tab();
  expect(editor).toHaveProperty('value', '{"steps": [');
});

test('a group header counts the users under its root, not the root', async () => {
  const app = await renderSimulator();
  act(() => {
    const lead = app.addUser({ name: 'Lead', role: 'lead' });
    for (const name of ['Dana', 'Avi']) app.addUser({ name, role: 'member', linkFrom: { rel: 'leads', userId: lead.id } });
  });
  expect(await screen.findByText('(2)')).toBeTruthy();
});

test('only the leader can unlink (in Send to…), and a member’s recipients counter leaves out their leader', async () => {
  const app = await renderSimulator();
  act(() => {
    const lead = app.addUser({ name: 'Lead', role: 'lead' });
    for (const name of ['Dana', 'Avi']) app.addUser({ name, role: 'member', linkFrom: { rel: 'leads', userId: lead.id } });
  });
  const lead = await screen.findByRole('region', { name: 'Lead' });
  const dana = screen.getByRole('region', { name: 'Dana' });
  expect(within(lead).getByText('2')).toBeTruthy();
  expect(within(dana).queryByText('1')).toBeNull();
  expect(isRecipient(dana, 'Lead')).toBe(true);
  expect(within(dana).getAllByText('Lead')).toHaveLength(1);
  // a member can't unlink their lead
  await userEvent.click(within(dana).getByRole('button', { name: 'Choose recipients for Dana' }));
  let dialog = await screen.findByRole('dialog', { name: 'Choose Recipients for Dana' });
  expect(within(dialog).queryByRole('button', { name: 'Unlink Lead' })).toBeNull();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  // the lead can: Dana leaves the lead's To row
  await userEvent.click(within(lead).getByRole('button', { name: 'Choose recipients for Lead' }));
  dialog = await screen.findByRole('dialog', { name: 'Choose Recipients for Lead' });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Unlink Dana' }));
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(toRow(lead).queryByText('Dana')).toBeNull();
  expect(within(dana).getByRole('textbox', { name: 'Message as Dana' })).toHaveProperty('placeholder', 'Type a message');
});

test('Link User suggests existing users not linked yet, and picking one links them', async () => {
  const app = await renderSimulator();
  act(() => {
    const lead = app.addUser({ name: 'Lead', role: 'lead' });
    app.addUser({ name: 'Dana', role: 'member', linkFrom: { rel: 'leads', userId: lead.id } });
    app.addUser({ name: 'Avi', role: 'member' });
  });
  const lead = await screen.findByRole('region', { name: 'Lead' });
  // Send to… → New user… opens the Link dialog
  await userEvent.click(within(lead).getByRole('button', { name: 'Choose recipients for Lead' }));
  await userEvent.click(
    within(await screen.findByRole('dialog', { name: 'Choose Recipients for Lead' })).getByRole('button', { name: 'New user…' }),
  );
  const dialog = await screen.findByRole('dialog', { name: 'Link User' });
  await userEvent.type(within(dialog).getByLabelText('Name'), 'a');
  // Avi is offered; Dana is already linked to the lead, so she isn't. (hidden: the dropdown's
  // open transition never finishes in happy-dom)
  const avi = await screen.findByRole('option', { name: /^Avi · user-/, hidden: true });
  expect(screen.queryByRole('option', { name: /^Dana · user-/, hidden: true })).toBeNull();
  await userEvent.click(avi);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Link Avi' }));
  await screen.findByRole('button', { name: 'Lead (2)' });
  expect(isRecipient(lead, 'Avi')).toBe(true);
  expect(app.session.users).toHaveLength(3);
});

test('recipients dialog: a member’s locked lead needs no All/None; a lead’s All/None match the boxes', async () => {
  const app = await renderSimulator();
  act(() => {
    const lead = app.addUser({ name: 'Lead', role: 'lead' });
    for (const name of ['Dana', 'Avi']) app.addUser({ name, role: 'member', linkFrom: { rel: 'leads', userId: lead.id } });
  });
  const dana = await screen.findByRole('region', { name: 'Dana' });
  await userEvent.click(within(dana).getByRole('button', { name: 'Choose recipients for Dana' }));
  let dialog = await screen.findByRole('dialog', { name: 'Choose Recipients for Dana' });
  expect(within(dialog).queryByRole('button', { name: 'All linked' })).toBeNull();
  expect(within(dialog).getByText('always')).toBeTruthy();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

  const lead = screen.getByRole('region', { name: 'Lead' });
  await userEvent.click(within(lead).getByRole('button', { name: 'Choose recipients for Lead' }));
  dialog = await screen.findByRole('dialog', { name: 'Choose Recipients for Lead' });
  expect(within(dialog).getByRole('button', { name: 'All linked' }).getAttribute('aria-pressed')).toBe('true');
  expect(within(dialog).getByRole('button', { name: 'None' }).getAttribute('aria-pressed')).toBe('false');
});

test('choosing an unlinked user as a recipient links you to them', async () => {
  const app = await renderSimulator();
  act(() => {
    const lead = app.addUser({ name: 'Lead', role: 'lead' });
    app.addUser({ name: 'Noa', role: 'member', linkFrom: { rel: 'leads', userId: lead.id } });
    app.addUser({ name: 'Avi', role: 'member' });
  });
  const avi = await screen.findByRole('region', { name: 'Avi' });
  await userEvent.click(within(avi).getByRole('button', { name: 'Choose recipients for Avi' }));
  const dialog = await screen.findByRole('dialog', { name: 'Choose Recipients for Avi' });
  await userEvent.click(within(dialog).getByRole('checkbox', { name: /Lead/ }));
  await userEvent.click(within(dialog).getByRole('button', { name: /^Send to/ }));
  // Lead now leads Avi: Avi is in the Lead's To row and group
  expect(await screen.findByRole('button', { name: 'Lead (2)' })).toBeTruthy();
  expect(isRecipient(screen.getByRole('region', { name: 'Lead' }), 'Avi')).toBe(true);
});

test('a message from someone not linked offers to link them', async () => {
  const app = await renderSimulator();
  act(() => {
    app.addUser({ name: 'Lead', role: 'lead' });
    app.addUser({ name: 'Avi', role: 'member' });
  });
  const [leadUser, aviUser] = app.session.users;
  await act(() => app.send(aviUser.id, { text: 'hi boss', targets: [leadUser.address] }));
  const lead = await screen.findByRole('region', { name: 'Lead' });
  expect(await within(lead).findByText("Avi isn't linked to you.")).toBeTruthy();
  await userEvent.click(within(lead).getByRole('button', { name: 'Link Avi' }));
  expect(await screen.findByRole('button', { name: 'Lead (1)' })).toBeTruthy();
  expect(isRecipient(lead, 'Avi')).toBe(true);
  expect(within(lead).queryByText("Avi isn't linked to you.")).toBeNull();
});

test('a member picking another member links them with "Works with"; both stay under the lead', async () => {
  const app = await renderSimulator();
  act(() => {
    const lead = app.addUser({ name: 'Lead', role: 'lead' });
    for (const name of ['Dana', 'Avi']) app.addUser({ name, role: 'member', linkFrom: { rel: 'leads', userId: lead.id } });
  });
  const dana = await screen.findByRole('region', { name: 'Dana' });
  await userEvent.click(within(dana).getByRole('button', { name: 'Choose recipients for Dana' }));
  const dialog = await screen.findByRole('dialog', { name: 'Choose Recipients for Dana' });
  await userEvent.click(within(dialog).getByRole('checkbox', { name: /Avi/ }));
  await userEvent.click(within(dialog).getByRole('button', { name: /^Send to/ }));
  // Dana → Avi; the group (by "leads") is unchanged
  await waitFor(() => expect(isRecipient(dana, 'Avi')).toBe(true));
  expect(screen.getByRole('button', { name: 'Lead (2)' })).toBeTruthy();
  const avi = screen.getByRole('region', { name: 'Avi' });
  expect(isRecipient(avi, 'Lead')).toBe(true);
  expect(isRecipient(avi, 'Dana')).toBe(true);
});

test('a sent message says who it reached under the bubble: a name, or a count', async () => {
  const app = await renderSimulator();
  act(() => {
    const lead = app.addUser({ name: 'Lead', role: 'lead' });
    for (const name of ['Dana', 'Avi']) app.addUser({ name, role: 'member', linkFrom: { rel: 'leads', userId: lead.id } });
  });
  const [lead, dana] = app.session.users;
  await act(() => app.send(dana.id, 'one'));
  await act(() => app.send(lead.id, 'two'));
  const danaChat = screen.getByRole('region', { name: 'Dana' });
  const leadChat = screen.getByRole('region', { name: 'Lead' });
  expect(await within(danaChat).findByText(/Sent to Lead/)).toBeTruthy();
  expect(await within(leadChat).findByText(/Sent to 2 users/)).toBeTruthy();
  expect(within(leadChat).queryByText(/recipient\(s\)/)).toBeNull();
  expect(dana.messages.find((m) => m.from === 'me')?.deliveredTo).toEqual([lead.address]);
});

test('replying under a message: hovering shows only its author in To; the reply box answers just them', async () => {
  const app = await renderSimulator();
  act(() => {
    const lead = app.addUser({ name: 'Lead', role: 'lead' });
    for (const name of ['Dana', 'Avi']) app.addUser({ name, role: 'member', linkFrom: { rel: 'leads', userId: lead.id } });
  });
  const [leadUser, , aviUser] = app.session.users;
  await act(() => app.send(aviUser.id, 'got a minute?'));
  const lead = screen.getByRole('region', { name: 'Lead' });
  expect(await within(lead).findByText('got a minute?')).toBeTruthy();
  expect(isRecipient(lead, 'Dana')).toBe(true);
  // hover the reply controls: the To row shows just Avi
  const box = within(lead).getByRole('textbox', { name: 'Reply to Avi as Lead' });
  const area = box.closest('.cbs-replies');
  if (!area) throw new Error('no reply area');
  fireEvent.mouseEnter(area);
  expect(isRecipient(lead, 'Avi')).toBe(true);
  expect(isRecipient(lead, 'Dana')).toBe(false);
  fireEvent.mouseLeave(area);
  expect(isRecipient(lead, 'Dana')).toBe(true);
  // its send button works like the main one: off while empty
  const sendIt = within(lead).getByRole('button', { name: 'Send to Avi' });
  expect(sendIt).toHaveProperty('disabled', true);
  await userEvent.type(box, 'sure');
  expect(sendIt).toHaveProperty('disabled', false);
  // a reply typed there goes to Avi only, and the saved To stays
  await userEvent.click(sendIt);
  const mine = leadUser.messages.filter((m) => m.from === 'me');
  const sent = mine[mine.length - 1];
  expect(sent?.text).toBe('sure');
  expect(sent?.targets).toEqual([aviUser.address]);
  expect(await within(screen.getByRole('region', { name: 'Avi' })).findByText('sure')).toBeTruthy();
  expect(within(screen.getByRole('region', { name: 'Dana' })).queryByText('sure')).toBeNull();
  // answered: the message keeps its name and text, the reply controls are gone
  expect(within(lead).getByText('got a minute?')).toBeTruthy();
  expect(within(lead).queryByRole('textbox', { name: 'Reply to Avi as Lead' })).toBeNull();
  expect(within(lead).queryByRole('button', { name: '👍 Got it' })).toBeNull();
  // the same for anyone: Dana tapping 👍 on a question from the lead puts its controls away
  await act(() => app.send(leadUser.id, 'review my draft?'));
  const dana = screen.getByRole('region', { name: 'Dana' });
  await userEvent.click(await within(dana).findByRole('button', { name: '👍 Got it' }));
  expect(within(dana).queryByRole('button', { name: '👍 Got it' })).toBeNull();
  expect(within(dana).getByText('review my draft?')).toBeTruthy();
});

test('a tap from a script answers like a click: to the author only, and the controls go away', async () => {
  const app = await renderSimulator();
  const r = await act(() =>
    app.run({
      users: [
        { ref: 'lead', name: 'Lead', role: 'lead' },
        { ref: 'dana', name: 'Dana', role: 'member', linkFrom: 'lead' },
      ],
      steps: [{ as: 'lead', say: 'review?' }, { as: 'dana', tap: '👍 Got it' }, { expect: { user: 'lead', text: 'Got it' } }],
    }),
  );
  expect(r.ok).toBe(true);
  const dana = screen.getByRole('region', { name: 'Dana' });
  expect(within(dana).queryByRole('button', { name: '👍 Got it' })).toBeNull();
  expect(app.session.users[1].messages.find((m) => m.from === 'bot')?.answered).toBe(true);
});
