import { useEffect, useRef } from 'react';
import { Anchor, Badge, Center, Paper, Stack, Table, Text, ThemeIcon } from '@mantine/core';
import { IconMessageOff } from '@tabler/icons-react';
import * as core from '../core';
import type { Message } from '../types';
import { useSim } from './context';
import { timeLabel } from './Bubble';
import { UserName } from './UserName';

/** One line for a message: its text, or what it carries. */
const summary = (m: Message) =>
  (m.text ||
    (m.image
      ? '[image]'
      : m.contacts
        ? '[contacts: ' + m.contacts.map((c) => c.name || c.address).join(', ') + ']'
        : m.meta !== undefined
          ? '[data]'
          : '')) +
  (m.buttons ? '  [' + m.buttons.map((b) => b.title).join(' | ') + ']' : '') +
  (m.list ? '  [☰ ' + m.list.rows.map((r) => r.title).join(' | ') + ']' : '');

export function Timeline() {
  const store = useSim();
  const p = store.profile;
  const end = useRef<HTMLDivElement>(null);
  const items = core.timeline(store.session).filter((t) => store.matches(t.user));

  // Scroll to the end when an item arrives.
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- items.length is the trigger, not an input
  }, [items.length]);

  if (!items.length) {
    return (
      <Center py={80}>
        <Stack align="center" gap="xs">
          <ThemeIcon size={56} radius="xl" variant="light" color="gray">
            <IconMessageOff size={28} />
          </ThemeIcon>
          <Text c="dimmed">No messages yet</Text>
        </Stack>
      </Center>
    );
  }

  return (
    <Paper withBorder radius="lg" className="cbs-timeline">
      <Table highlightOnHover verticalSpacing="xs" horizontalSpacing="md" stickyHeader>
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={96}>Time</Table.Th>
            <Table.Th w={220}>User</Table.Th>
            <Table.Th w={90}>Direction</Table.Th>
            <Table.Th>Message</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {items.map(({ user, message: m }) => {
            return (
              <Table.Tr key={user.id + m.id} className={'cbs-tl-' + m.from}>
                <Table.Td>
                  <Text size="xs" c="dimmed" ff="monospace" style={{ whiteSpace: 'nowrap' }}>
                    {timeLabel(m.at)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Anchor
                    component="button"
                    type="button"
                    size="sm"
                    fw={500}
                    truncate
                    onClick={() => store.reveal(user.id)}
                    title="Show user"
                  >
                    <UserName user={user} profile={p} />
                  </Anchor>
                </Table.Td>
                <Table.Td>
                  {m.from === 'me' && (
                    <Badge size="sm" variant="light">
                      → {p.labels.bot}
                    </Badge>
                  )}
                  {m.from === 'bot' && (
                    <Badge size="sm" variant="light" color="gray">
                      ← {p.labels.bot}
                    </Badge>
                  )}
                  {m.from === 'system' && (
                    <Badge size="sm" variant="light" color={m.error ? 'red' : 'yellow'}>
                      note
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>
                  {m.targets && (
                    <Text span size="xs" c="dimmed">
                      → {m.targets.map((t) => store.nameOf(t)).join(', ')} ·{' '}
                    </Text>
                  )}
                  <Text span size="sm" dir="auto" className="cbs-tl-text">
                    {summary(m)}
                  </Text>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
      <div ref={end} />
    </Paper>
  );
}
