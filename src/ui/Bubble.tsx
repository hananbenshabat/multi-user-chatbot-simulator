import { useState, type KeyboardEvent } from 'react';
import { ActionIcon, Anchor, Button, Collapse, Group, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { IconAddressBook, IconChevronDown, IconSend2, IconCode, IconCornerDownLeft, IconListDetails } from '@tabler/icons-react';
import * as core from '../core';
import type { Message, User } from '../types';
import { useSimStatic } from './context';
import { plural } from './util';

export function timeLabel(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface BubbleProps {
  user: User;
  m: Message;
  /** show a "Type a message" box that answers just this message's author */
  replyBox?: boolean;
  /** while the reply controls are hovered or focused: who a reply goes to (null when they aren't) */
  onReplyPreview?: (address: string | null) => void;
}

export function Bubble({ user, m, replyBox, onReplyPreview }: BubbleProps) {
  const store = useSimStatic();
  const a = store.profile.appearance;
  const [listOpen, setListOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [reply, setReply] = useState('');
  // A relayed message (from another user) is answered to that user only; the saved To stays as it is.
  const author = m.from === 'bot' ? m.author : undefined;
  const only = author ? [author] : undefined;
  // Answering a relayed message (a quick reply or your own text) puts its reply controls away.
  // (The controls vanish under the pointer, so the To row's preview is cleared here, not on mouse-out.)
  function tap(id: string, title: string, kind: 'button' | 'list') {
    if (!author) return store.send(user, { buttonId: id, title, kind });
    onReplyPreview?.(null);
    return store.answer(user, m, { buttonId: id, title, kind, targets: only });
  }
  function sendReply() {
    if (!reply.trim() || !author) return;
    onReplyPreview?.(null);
    store.answer(user, m, { text: reply.trim(), targets: [author] });
    setReply('');
  }
  function onReplyKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    sendReply();
  }
  const canAnswer = !!author && !m.answered;
  const preview = author && onReplyPreview ? { onPreview: () => onReplyPreview(author), onDone: () => onReplyPreview(null) } : null;
  // Who a sent message reached (or, until the bot answers, who it's aimed at): one name, or a count.
  const who = m.from === 'me' ? (m.deliveredTo ?? m.targets ?? []) : [];
  const names = who.map((t) => store.nameOf(t));
  const sentTo =
    names.length === 1
      ? 'Sent to ' + names[0]
      : names.length > 1
        ? 'Sent to ' + plural(names.length, store.profile.labels.user.toLowerCase())
        : '';
  const foot = [m.reply ? m.reply.id : '', sentTo, a.showTimestamps ? timeLabel(m.at) : ''].filter(Boolean).join(' · ');

  return (
    <div className={'cbs-msg cbs-' + m.from + (m.error ? ' cbs-error' : '')} data-mid={m.id}>
      {m.image && (
        <img
          className="cbs-img"
          src={m.image.url}
          alt={m.image.alt || ''}
          loading="lazy"
          onLoad={(e) => {
            const box = e.currentTarget.closest('.cbs-msgs-viewport');
            if (box) box.scrollTop = box.scrollHeight;
          }}
        />
      )}
      {author && (
        <UnstyledButton
          className="cbs-author"
          dir="auto"
          onClick={() => {
            const c = core.findByAddress(store.session, author);
            if (c) store.reveal(c.id);
          }}
        >
          {store.nameOf(author)}
        </UnstyledButton>
      )}
      {m.text && (
        <div className="cbs-text" dir="auto">
          {m.text}
        </div>
      )}
      {m.contacts && (
        <Stack gap={4} mt={4} className="cbs-contacts">
          {m.contacts.map((c, i) => {
            const known = core.findByAddress(store.session, c.address);
            return (
              <Group key={i} gap={6} wrap="nowrap">
                <IconAddressBook size={16} style={{ flex: 'none' }} />
                {known ? (
                  <Anchor
                    component="button"
                    type="button"
                    size="sm"
                    fw={600}
                    dir="auto"
                    className="cbs-contact-link"
                    onClick={() => store.reveal(known.id)}
                  >
                    {c.name || known.name}
                  </Anchor>
                ) : (
                  <Text size="sm" fw={600} dir="auto">
                    {c.name || '?'}
                  </Text>
                )}
                <Text size="xs" className="cbs-muted-on" ff="monospace" truncate>
                  {c.address}
                </Text>
              </Group>
            );
          })}
        </Stack>
      )}
      {((m.buttons && !(author && m.answered)) || (replyBox && canAnswer)) && (
        // Quick replies on one line, then (on the latest message from someone) a reply box just for them.
        // Hovering or focusing here shows in the To row who an answer goes to.
        <div
          className="cbs-replies"
          onMouseEnter={preview?.onPreview}
          onMouseLeave={preview?.onDone}
          onFocus={preview?.onPreview}
          onBlur={preview?.onDone}
        >
          {m.buttons && !(author && m.answered) && (
            <Group gap={4} mt={6}>
              {m.buttons.map((b) => (
                <Button key={b.id} variant="light" size="compact-sm" title={'id: ' + b.id} onClick={() => tap(b.id, b.title, 'button')}>
                  <span dir="auto">{b.title}</span>
                </Button>
              ))}
            </Group>
          )}
          {replyBox && canAnswer && (
            <TextInput
              size="xs"
              radius="xl"
              mt={6}
              dir="auto"
              placeholder={store.profile.labels.placeholder.replace('{name}', user.name)}
              aria-label={'Reply to ' + store.nameOf(author) + ' as ' + user.name}
              value={reply}
              onChange={(e) => setReply(e.currentTarget.value)}
              onKeyDown={onReplyKey}
              rightSectionWidth={30}
              rightSection={
                <ActionIcon
                  size={22}
                  radius="xl"
                  variant="filled"
                  aria-label={'Send to ' + store.nameOf(author)}
                  disabled={!reply.trim()}
                  onClick={sendReply}
                >
                  <IconSend2 size={13} />
                </ActionIcon>
              }
            />
          )}
        </div>
      )}
      {m.list && (
        <>
          <Button
            variant="light"
            size="xs"
            fullWidth
            mt={8}
            leftSection={<IconListDetails size={14} />}
            rightSection={<IconChevronDown size={14} className={listOpen ? 'cbs-chevron' : 'cbs-chevron cbs-chevron-closed'} />}
            aria-expanded={listOpen}
            onClick={() => setListOpen((o) => !o)}
          >
            <span dir="auto">{m.list.button}</span>
          </Button>
          <Collapse expanded={listOpen}>
            <Stack gap={2} mt={4} className="cbs-list">
              {m.list.rows.map((r) => (
                <UnstyledButton key={r.id} className="cbs-list-row" title={'id: ' + r.id} onClick={() => tap(r.id, r.title, 'list')}>
                  <Text size="sm" fw={500} dir="auto">
                    {r.title}
                  </Text>
                  {r.description && (
                    <Text size="xs" c="dimmed" dir="auto">
                      {r.description}
                    </Text>
                  )}
                </UnstyledButton>
              ))}
            </Stack>
          </Collapse>
        </>
      )}
      {m.meta !== undefined && (
        <div className="cbs-meta">
          <UnstyledButton className="cbs-meta-toggle" onClick={() => setMetaOpen((o) => !o)} aria-expanded={metaOpen}>
            <IconCode size={13} /> data
          </UnstyledButton>
          <Collapse expanded={metaOpen}>
            <pre>{JSON.stringify(m.meta, null, 2)}</pre>
          </Collapse>
        </div>
      )}
      {foot && (
        <time className="cbs-time" dateTime={m.at} title={names.length > 1 ? names.join(', ') : undefined}>
          {m.reply && <IconCornerDownLeft size={10} />} {foot}
        </time>
      )}
    </div>
  );
}
