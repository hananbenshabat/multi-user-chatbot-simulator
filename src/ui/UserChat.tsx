import { memo, useLayoutEffect, useRef, useState } from 'react';
import { ActionIcon, Badge, Button, CloseButton, Group, Indicator, Menu, Paper, ScrollArea, Text, Textarea, Tooltip } from '@mantine/core';
import { IconDotsVertical, IconEraser, IconPencil, IconSend2, IconTrash, IconUsers } from '@tabler/icons-react';
import * as core from '../core';
import type { User } from '../types';
import { useSimStatic, useUi } from './context';
import { Bubble } from './Bubble';
import { UserName } from './UserName';
import { personOf, type Person } from './store';

// Unsent text survives re-renders and a collapsed group.
const drafts = new WeakMap<User, string>();

/** One user's chat. Re-renders only when `rev` changes (see SimStore.rev). */
export const UserChat = memo(
  function UserChat({ user }: { user: User; rev: string }) {
    const store = useSimStatic();
    const ui = useUi();
    const p = store.profile;
    const a = p.appearance;
    const adapter = store.adapters[user.type];
    const role = core.roleDef(p, user.role);
    const [draft, setDraft] = useState(drafts.get(user) || '');
    const [replyTo, setReplyTo] = useState<string | null>(null);
    const msgs = useRef<HTMLDivElement>(null);
    const atBottom = useRef(true);
    const input = useRef<HTMLTextAreaElement>(null);
    const targets = store.recipientsOf(user);
    const waiting = (store.pending[user.id] || 0) > 0;

    // Follow new messages unless the reader scrolled up.
    useLayoutEffect(() => {
      const el = msgs.current;
      if (el && atBottom.current) el.scrollTop = el.scrollHeight;
    });

    function setText(v: string) {
      drafts.set(user, v);
      setDraft(v);
    }
    function submit() {
      const text = draft.trim();
      if (!text) return;
      setText('');
      atBottom.current = true;
      store.send(user, { text });
      input.current?.focus();
    }

    const chips = a.showFields
      ? core
          .fieldsFor(p, user.role)
          .filter((f: { showAsChip: boolean }) => f.showAsChip)
          .map((f: { key: string; label: string }) => {
            const v = user.fields?.[f.key];
            if (v === '' || v == null || v === false) return null;
            return (
              <Badge key={f.key} variant="default" size="sm" tt="none" fw={500}>
                {v === true ? f.label : f.label + ': ' + String(v)}
              </Badge>
            );
          })
      : [];
    const color = role?.color || 'gray';
    // Leaders (who link to this user) are always recipients: not counted on the Send to button.
    const isLeader = (t: { address: string }) => store.isLeaderOf(user, t.address);
    const counted = targets.filter((t) => !isLeader(t)).length;
    // The To row shows who this user can reach (everyone linked, either way, plus anyone else
    // chosen), highlighting the current recipients. It only displays: changes go through Send to….
    // While a reply under a message is hovered or focused, only that message's author is highlighted.
    const people: Person[] = a.showLinks ? core.linkedUsers(store.session, user.id).map(personOf) : [];
    for (const t of [...targets, ...(replyTo ? [{ name: store.nameOf(replyTo), address: replyTo }] : [])]) {
      if (!people.some((x) => core.addrKey(x.address) === core.addrKey(t.address))) people.push(t);
    }
    const selected = new Set((replyTo ? [replyTo] : targets.map((t) => t.address)).map(core.addrKey));
    // The reply box goes on the latest message from each person.
    const latestFrom = new Set<string>();
    const seenAuthors = new Set<string>();
    for (let i = user.messages.length - 1; i >= 0; i--) {
      const m = user.messages[i];
      if (m.from !== 'bot' || !m.author || seenAuthors.has(core.addrKey(m.author))) continue;
      seenAuthors.add(core.addrKey(m.author));
      latestFrom.add(m.id);
    }

    return (
      <Paper
        component="section"
        withBorder
        radius="lg"
        className={'cbs-chat' + (adapter ? '' : ' cbs-broken')}
        data-user-id={user.id}
        aria-label={user.name}
      >
        <header className="cbs-chat-head">
          <Group gap="sm" wrap="nowrap" align="center">
            <div className="cbs-who">
              <Text fw={650} size="sm" truncate dir="auto">
                <UserName user={user} profile={p} />
              </Text>
              {a.showId && (
                <Text size="xs" c="dimmed" ff="monospace" truncate title={p.identity.label}>
                  {user.address}
                </Text>
              )}
            </div>
            <Menu width={190} position="bottom-end">
              <Menu.Target>
                <ActionIcon variant="subtle" color="gray" aria-label={'Options for ' + user.name}>
                  <IconDotsVertical size={18} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => ui.openEdit(user)}>
                  Edit
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconEraser size={16} />}
                  onClick={() => ui.confirmClearChat(user)}
                  disabled={!user.messages.length}
                >
                  Clear chat
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={() => ui.confirmRemove(user)}>
                  Remove
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>

          <Group gap={6} mt={8} className="cbs-chips">
            {user.role && (
              <Badge color={color} variant="light" size="sm">
                {role ? role.label : user.role}
              </Badge>
            )}
            {(store.types.length > 1 || !adapter) && (
              <Tooltip label={adapter ? 'Adapter' : 'No adapter registered for type "' + user.type + '"'}>
                <Badge
                  color={adapter ? undefined : 'red'}
                  variant={adapter ? 'default' : 'light'}
                  size="sm"
                  fw={500}
                  c={adapter ? 'dimmed' : undefined}
                >
                  {adapter ? adapter.label : user.type + ' ⚠'}
                </Badge>
              </Tooltip>
            )}
            {chips}
          </Group>
        </header>

        {/* The scrollbar floats over the messages instead of taking room, so the padding is even on all sides. */}
        <ScrollArea
          className="cbs-msgs-area"
          classNames={{ viewport: 'cbs-msgs-viewport' }}
          viewportRef={msgs}
          type="hover"
          scrollbarSize={6}
          onScrollPositionChange={() => {
            const el = msgs.current;
            if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          }}
        >
          <div className="cbs-msgs" role="log" aria-live="polite">
            {!user.messages.length && !waiting && (
              <Text size="xs" c="dimmed" ta="center" className="cbs-empty-chat">
                No messages yet
              </Text>
            )}
            {user.messages.map((m) => (
              <Bubble key={m.id} user={user} m={m} replyBox={latestFrom.has(m.id)} onReplyPreview={setReplyTo} />
            ))}
            {waiting && (
              <div className="cbs-typing" role="status" aria-label="Waiting for a reply">
                <span />
                <span />
                <span />
              </div>
            )}
          </div>
        </ScrollArea>

        <form
          className="cbs-composer"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {/* someone messaged this user without being linked: offer to link them */}
          {store.linkSuggestionsFor(user).map((c) => (
            <Group key={c.id} gap={6} wrap="nowrap" className="cbs-link-suggest" role="status">
              <Text size="xs" style={{ flex: 1 }} dir="auto">
                {c.name} isn't linked to you.
              </Text>
              <Button size="compact-xs" variant="light" onClick={() => store.acceptLinkSuggestion(user, c)}>
                {'Link ' + c.name}
              </Button>
              <CloseButton
                size="sm"
                aria-label={'Dismiss: ' + c.name + " isn't linked"}
                onClick={() => store.dismissLinkSuggestion(user, c)}
              />
            </Group>
          ))}
          {people.length > 0 && (
            <Group gap={4} className="cbs-targets" role="group" aria-label="Recipients">
              <Text size="xs" c="dimmed">
                To
              </Text>
              {people.map((t) => {
                const c = core.findByAddress(store.session, t.address);
                const on = selected.has(core.addrKey(t.address));
                return (
                  <span
                    key={t.address}
                    className={'cbs-to-chip' + (on ? ' cbs-to-chip-on' : '')}
                    dir="auto"
                    title={(c ? c.name : t.name || t.address) + (on ? ': gets your messages' : ': not a recipient now')}
                    data-selected={on || undefined}
                  >
                    {c ? <UserName user={c} profile={p} /> : t.name || t.address}
                  </span>
                );
              })}
            </Group>
          )}
          <Group gap={6} wrap="nowrap" align="flex-end">
            <Tooltip label="Send to… (recipients and links)">
              <Indicator label={counted} size={16} disabled={!counted} offset={4}>
                <ActionIcon
                  variant={targets.length ? 'light' : 'subtle'}
                  color={targets.length ? undefined : 'gray'}
                  size={36}
                  radius="xl"
                  aria-label={'Choose recipients for ' + user.name}
                  onClick={() => ui.openTargets(user)}
                >
                  <IconUsers size={18} />
                </ActionIcon>
              </Indicator>
            </Tooltip>
            <Textarea
              ref={input}
              className="cbs-input"
              autosize
              minRows={1}
              maxRows={5}
              radius="xl"
              variant="filled"
              dir="auto"
              aria-label={'Message as ' + user.name}
              placeholder={p.labels.placeholder.replace('{name}', user.name)}
              value={draft}
              onChange={(e) => setText(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <Tooltip label={p.labels.send}>
              <ActionIcon type="submit" size={36} radius="xl" variant="filled" aria-label={p.labels.send} disabled={!draft.trim()}>
                <IconSend2 size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </form>
      </Paper>
    );
  },
  (a, b) => a.user === b.user && a.rev === b.rev,
);
