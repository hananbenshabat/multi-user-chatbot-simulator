import { Link, NavLink, useLocation } from 'react-router';
import { ActionIcon, Badge, Button, CloseButton, Divider, Group, Loader, Text, TextInput, ThemeIcon, Tooltip } from '@mantine/core';
import {
  IconDownload,
  IconLayoutColumns,
  IconListDetails,
  IconMessages,
  IconMoon,
  IconPlayerPlay,
  IconPlayerStopFilled,
  IconSearch,
  IconSettings,
  IconSun,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react';
import { useSim, useUi } from './context';
import { usePaths } from './routes';
import { plural } from './util';

function iconButton(label: string, icon: React.ReactNode, onClick: () => void, color?: string) {
  return (
    <Tooltip label={label}>
      <ActionIcon variant="default" size={36} aria-label={label} onClick={onClick} c={color ? color + '.7' : undefined}>
        {icon}
      </ActionIcon>
    </Tooltip>
  );
}

export function Header() {
  const store = useSim();
  const ui = useUi();
  const s = store.session;
  const messages = s.users.reduce((n, u) => n + u.messages.length, 0);
  const dark = store.theme === 'dark';
  const paths = usePaths();
  const { pathname } = useLocation();
  const page = pathname.startsWith(paths.settings) ? 'settings' : pathname.startsWith(paths.timeline) ? 'timeline' : 'users';

  return (
    <header className="cbs-header">
      <Link to={paths.home} className="cbs-brand" aria-label="Go to users" title="Go to users">
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon size={34} radius="md" variant="gradient" gradient={{ from: 'accent.5', to: 'accent.8', deg: 135 }}>
            <IconMessages size={20} stroke={1.8} />
          </ThemeIcon>
          <div className="cbs-brand-text">
            <Text fw={700} size="md" lh={1.2} truncate>
              {store.opts.title}
            </Text>
            <Text size="xs" c="dimmed" lh={1.3} truncate>
              {s.profile.name} · {plural(s.users.length, 'user')} · {plural(messages, 'message')}
            </Text>
          </div>
        </Group>
      </Link>

      {/* real links (href), so they can be opened in a new tab, copied and bookmarked */}
      <nav className="cbs-viewnav" aria-label="View">
        <NavLink to={paths.home} end className="cbs-viewnav-item">
          <IconLayoutColumns size={16} />
          Users
        </NavLink>
        <NavLink to={paths.timeline} className="cbs-viewnav-item">
          <IconListDetails size={16} />
          Timeline
        </NavLink>
      </nav>

      {page !== 'settings' && (
        <TextInput
          className="cbs-search"
          size="sm"
          radius="md"
          placeholder="Filter users"
          aria-label="Filter users"
          leftSection={<IconSearch size={16} />}
          value={store.filter}
          onChange={(e) => store.setFilter(e.currentTarget.value)}
          rightSection={store.filter ? <CloseButton size="sm" aria-label="Clear filter" onClick={() => store.setFilter('')} /> : null}
        />
      )}

      {store.scriptRun && (
        <Group gap="xs" wrap="nowrap" className="cbs-script-status">
          <Badge size="lg" variant="light" leftSection={<Loader size={12} />} className="cbs-script-badge">
            <span className="cbs-ellipsis">{store.scriptStatus}</span>
          </Badge>
          <Button size="xs" color="red" variant="light" leftSection={<IconPlayerStopFilled size={14} />} onClick={() => store.stopScript()}>
            Stop
          </Button>
        </Group>
      )}

      <Group gap="xs" wrap="nowrap" className="cbs-header-end">
        <Tooltip label="Run a JSON scenario">
          <Button
            variant="default"
            size="sm"
            leftSection={<IconPlayerPlay size={16} />}
            onClick={ui.openScript}
            disabled={!!store.scriptRun}
          >
            Script
          </Button>
        </Tooltip>

        <Divider orientation="vertical" mx={2} />

        {iconButton('Export session', <IconDownload size={18} />, ui.exportFile)}
        {iconButton('Import session', <IconUpload size={18} />, ui.importFile)}
        {iconButton('Remove all users', <IconTrash size={18} />, ui.clearAll, 'red')}

        <Divider orientation="vertical" mx={2} />

        <Tooltip label="Settings">
          <ActionIcon
            component={Link}
            to={paths.settings}
            variant={page === 'settings' ? 'light' : 'default'}
            size={36}
            aria-label="Settings"
            aria-current={page === 'settings' ? 'page' : undefined}
          >
            <IconSettings size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
          <ActionIcon
            variant="default"
            size={36}
            aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={() => store.setThemePref(dark ? 'light' : 'dark')}
          >
            {dark ? <IconSun size={18} /> : <IconMoon size={18} />}
          </ActionIcon>
        </Tooltip>
      </Group>
    </header>
  );
}
