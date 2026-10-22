import { useState } from 'react';
import {
  ActionIcon,
  Button,
  Checkbox,
  Fieldset,
  Group,
  Modal,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { IconMinus, IconSearch, IconUserPlus } from '@tabler/icons-react';
import * as core from '../../core';
import type { User } from '../../types';
import { personOf, type Person } from '../store';
import { useSim, useUi } from '../context';
import { UserName } from '../UserName';

/** People compare by address, loosely (see core.addrKey). */
const key = (c: Person) => core.addrKey(c.address);

/**
 * Send to…: who `user`'s typed messages go to, and their links. Linked users first (with "All
 * linked"), then everyone else, plus someone not on the board. Ticking someone not linked links them
 * (store.setTargets), the users this one linked have an unlink (−), and "New user…" adds someone linked.
 */
export function PeopleDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const store = useSim();
  const ui = useUi();
  const p = store.profile;
  // read on every render: unlinking here moves people between the sections
  const linked = core.linkedUsers(store.session, user.id);
  const others = store.session.users.filter((c) => c.id !== user.id && !linked.includes(c));
  /** The link this user made to `c` (only those can be undone from here). */
  const madeLink = (c: User) => store.session.links.find((l) => l.from === user.id && l.to === c.id);
  const outRels = core.relationsFrom(p, user.role);
  // Recipients open with who the messages go to now; sharing starts with everyone linked.
  const [selected] = useState<Person[]>(() => store.recipientsOf(user));
  const [chosen, setChosen] = useState(() => new Set(selected.map((t) => core.addrKey(t.address))));
  const [q, setQ] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualAddr, setManualAddr] = useState('');
  // People chosen earlier who aren't on the board (typed in by hand): listed so they can be unticked.
  const known = new Set(store.session.users.map((c) => core.addrKey(c.address)));
  const extra = selected.filter((t) => !known.has(core.addrKey(t.address)));

  // A user's leaders are always recipients: their boxes stay ticked (sharing contacts is free).
  const locked = (c: Person) => store.isLeaderOf(user, c.address);
  const toggle = (c: Person, on: boolean) =>
    setChosen((s) => {
      const n = new Set(s);
      if (on) n.add(key(c));
      else n.delete(key(c));
      return n;
    });
  const setLinked = (on: boolean) =>
    setChosen((s) => {
      const n = new Set(s);
      for (const c of linked) {
        if (on) n.add(key(c));
        else if (!locked(c)) n.delete(key(c));
      }
      return n;
    });
  // All linked / None are about the linked users you can change; a locked lead doesn't count.
  const changeable = linked.filter((c) => !locked(c));
  const allLinked = changeable.length > 0 && changeable.every((c) => chosen.has(key(c)));
  const noneLinked = changeable.every((c) => !chosen.has(key(c)));
  const visible = (c: User) => !q.trim() || (c.name + ' ' + c.address).toLowerCase().includes(q.trim().toLowerCase());

  // Everyone ticked, plus someone typed in below.
  const people: Person[] = [
    ...store.session.users.filter((c) => c.id !== user.id && chosen.has(key(c))).map(personOf),
    ...extra.filter((t) => chosen.has(key(t))),
    ...(manualAddr.trim() ? [{ name: manualName.trim(), address: manualAddr.trim() }] : []),
  ];

  function submit() {
    store.setTargets(user, people);
    onClose();
  }

  const list = (users: User[]) => (
    <ScrollArea.Autosize mah={220} type="auto" offsetScrollbars>
      <Stack gap={4}>
        {users.filter(visible).map((c) => {
          const link = madeLink(c);
          return (
            <Group key={c.id} gap={6} wrap="nowrap" justify="space-between">
              <Checkbox
                size="sm"
                checked={chosen.has(key(c)) || locked(c)}
                disabled={locked(c)}
                onChange={(e) => toggle(c, e.currentTarget.checked)}
                classNames={{ body: 'cbs-person-check' }}
                label={
                  <Group gap={8} wrap="nowrap">
                    <Text size="sm" dir="auto" truncate>
                      <UserName user={c} profile={p} />
                    </Text>
                    <Text size="xs" c="dimmed" ff="monospace" truncate>
                      {c.address}
                    </Text>
                    {locked(c) && (
                      <Text size="xs" c="dimmed">
                        always
                      </Text>
                    )}
                  </Group>
                }
              />
              {link && (
                <Tooltip label={'Unlink ' + c.name}>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="gray"
                    aria-label={'Unlink ' + c.name}
                    onClick={() => {
                      store.unlink(link.rel, user.id, c.id);
                      toggle(c, false); // unticked, or saving would link them again
                    }}
                  >
                    <IconMinus size={14} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
          );
        })}
      </Stack>
    </ScrollArea.Autosize>
  );

  const count = people.length;
  return (
    <Modal opened onClose={onClose} size="lg" title={'Choose Recipients for ' + user.name}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Messages {user.name} types go to the people ticked here (as <code>message.targets</code>). Ticking someone not linked links
            them; (−) unlinks someone {user.name} linked.
          </Text>
          {(linked.length > 0 || others.length > 0) && (
            <TextInput
              placeholder="Filter people"
              leftSection={<IconSearch size={16} />}
              value={q}
              onChange={(e) => setQ(e.currentTarget.value)}
              data-autofocus
            />
          )}
          {linked.length > 0 && (
            <Fieldset radius="md" legend={'Linked to ' + user.name}>
              {changeable.length > 0 && (
                <Group gap="xs" mb="xs">
                  {/* lit up when it matches the checkboxes; a partial choice lights neither */}
                  <Button.Group>
                    <Button
                      size="compact-xs"
                      variant={allLinked ? 'filled' : 'default'}
                      aria-pressed={allLinked}
                      onClick={() => setLinked(true)}
                    >
                      All linked
                    </Button>
                    <Button
                      size="compact-xs"
                      variant={noneLinked ? 'filled' : 'default'}
                      aria-pressed={noneLinked}
                      onClick={() => setLinked(false)}
                    >
                      None
                    </Button>
                  </Button.Group>
                </Group>
              )}
              {list(linked)}
            </Fieldset>
          )}
          {others.length > 0 && (
            <Fieldset radius="md" legend={linked.length ? 'Everyone else' : 'Users'}>
              {list(others)}
            </Fieldset>
          )}
          <Fieldset radius="md" legend="Someone not on the board">
            {extra.length > 0 && (
              <Stack gap={4} mb="sm">
                {extra.map((t) => (
                  <Checkbox
                    key={key(t)}
                    size="sm"
                    checked={chosen.has(key(t))}
                    onChange={(e) => toggle(t, e.currentTarget.checked)}
                    classNames={{ body: 'cbs-person-check' }}
                    label={
                      <Group gap={8} wrap="nowrap">
                        <Text size="sm" dir="auto" truncate>
                          {t.name || t.address}
                        </Text>
                        <Text size="xs" c="dimmed" ff="monospace" truncate>
                          {t.address}
                        </Text>
                      </Group>
                    }
                  />
                ))}
              </Stack>
            )}
            <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
              <TextInput label="Name" dir="auto" value={manualName} onChange={(e) => setManualName(e.currentTarget.value)} />
              <TextInput label={p.identity.label} value={manualAddr} onChange={(e) => setManualAddr(e.currentTarget.value)} />
            </SimpleGrid>
          </Fieldset>
          <Group justify="flex-end" gap="sm">
            {outRels[0] && (
              <Button
                variant="subtle"
                mr="auto"
                leftSection={<IconUserPlus size={16} />}
                onClick={() => {
                  const r = outRels[0];
                  const to = r.to !== '*' ? r.to : '';
                  onClose();
                  ui.openAdd({ type: user.type, role: to, linkFrom: { rel: r.id, userId: user.id }, asLink: true });
                }}
              >
                New user…
              </Button>
            )}
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">{count ? 'Send to ' + count : selected.length ? 'Clear recipients' : 'Done'}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
