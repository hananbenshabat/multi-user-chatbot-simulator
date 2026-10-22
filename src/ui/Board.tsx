import { useEffect, useRef } from 'react';
import { ActionIcon, Group, Text, ThemeIcon, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconPlus } from '@tabler/icons-react';
import * as core from '../core';
import type { AddPreset } from './store';
import { useSim, useUi } from './context';
import { UserChat } from './UserChat';
import { capitalize } from './util';

export function Board() {
  const store = useSim();
  const box = useRef<HTMLDivElement>(null);
  const p = store.profile;
  const groups = core.groups(store.session);

  // Flash a chat when something arrives; scroll a revealed user into view.
  useEffect(() => {
    const copies = (id: string) => box.current?.querySelectorAll<HTMLElement>('[data-user-id="' + CSS.escape(id) + '"]') ?? [];
    const offFlash = store.onFlash((id) =>
      copies(id).forEach((n) => {
        n.classList.remove('cbs-flash');
        void n.offsetWidth; // restart the animation
        n.classList.add('cbs-flash');
      }),
    );
    const offReveal = store.onReveal((id) => copies(id)[0]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }));
    store.flushReveal(); // a user to show may be waiting from before the board mounted
    return () => {
      offFlash();
      offReveal();
    };
  }, [store]);

  // The tile at the end of a group adds a user that belongs there: linked to the group's
  // root, or with the group's role. None for a root that can't start the group's relation.
  function groupTile(g: core.Group) {
    if (g.root) {
      const r = core.relationDef(p, core.groupRelation(store.session));
      if (!r || !core.roleFits(r.from, g.root.role)) return null;
      const to = r.to !== '*' ? core.roleDef(p, r.to) : null;
      return (
        <AddTile
          pre={{ type: g.root.type, role: to ? to.id : '', linkFrom: { rel: r.id, userId: g.root.id } }}
          hint={'Linked to ' + g.root.name}
        />
      );
    }
    if (p.appearance.groupBy === 'role') {
      const role = core.roleDef(p, g.users[0].role);
      if (role) return <AddTile pre={{ role: role.id }} hint={role.label} />;
    }
    return <AddTile pre={{}} />;
  }

  const shownGroups = groups.map((g) => ({ g, shown: g.users.filter((u) => store.matches(u)) })).filter((x) => x.shown.length);
  const filtering = !!store.filter.trim();

  return (
    <div ref={box} className="cbs-board">
      {shownGroups.map(({ g, shown }) => {
        const collapsed = store.collapsed.has(g.key);
        const withHead = !!g.title || groups.length > 1;
        return (
          <section key={g.key} className="cbs-group">
            {withHead && (
              <Group gap="xs" className="cbs-group-head">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  onClick={() => store.toggleGroup(g.key)}
                  aria-expanded={!collapsed}
                  aria-label={(collapsed ? 'Show ' : 'Hide ') + (g.title || 'All')}
                >
                  <IconChevronDown size={16} className={collapsed ? 'cbs-chevron cbs-chevron-closed' : 'cbs-chevron'} />
                </ActionIcon>
                <UnstyledButton onClick={() => store.toggleGroup(g.key)}>
                  <Text fw={650} size="sm">
                    {g.title || 'All'}{' '}
                    <Text span inherit fw={500} c="dimmed">
                      ({g.users.filter((u) => u !== g.root).length})
                    </Text>
                  </Text>
                </UnstyledButton>
              </Group>
            )}
            {!collapsed && (
              <div className="cbs-row">
                {shown.map((u) => (
                  <UserChat key={u.id} user={u} rev={store.rev(u.id)} />
                ))}
                {!filtering && groupTile(g)}
              </div>
            )}
          </section>
        );
      })}
      {filtering && !shownGroups.length && (
        <Text c="dimmed" ta="center" py="xl">
          No users match “{store.filter}”.
        </Text>
      )}
      {/* Users that start a new group (or the first user) come from a tile after the groups.
          With a single ungrouped list, that list's own tile already does this. */}
      {!filtering && (!groups.length || groups[0].key !== 'all') && (
        <section className="cbs-group">
          <div className="cbs-row">
            <AddTile pre={{}} hint={groups.length ? 'Starts a new group' : 'Add the first user to start chatting'} />
          </div>
        </section>
      )}
    </div>
  );
}

function AddTile({ pre, hint }: { pre: AddPreset; hint?: string }) {
  const store = useSim();
  const ui = useUi();
  return (
    <UnstyledButton className="cbs-add-tile" onClick={() => ui.openAdd(pre)}>
      <ThemeIcon size={52} radius="xl" variant="light">
        <IconPlus size={26} stroke={1.8} />
      </ThemeIcon>
      <Text fw={600} size="sm">
        Add {capitalize(store.profile.labels.user)}
      </Text>
      {hint && (
        <Text size="xs" c="dimmed" ta="center" px="md">
          {hint}
        </Text>
      )}
    </UnstyledButton>
  );
}
