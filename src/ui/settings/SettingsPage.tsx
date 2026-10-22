import { Navigate, Outlet, Link, useLocation, useOutletContext, useParams } from 'react-router';
import { Button, Group, NavLink, Paper, Stack, Text, Title } from '@mantine/core';
import {
  IconBraces,
  IconForms,
  IconPalette,
  IconPlugConnected,
  IconSettings,
  IconTopologyStar3,
  IconUsersGroup,
  type Icon,
} from '@tabler/icons-react';
import * as core from '../../core';
import type { Profile } from '../../types';
import { useSim } from '../context';
import { usePaths } from '../routes';
import { AdaptersSection } from './AdaptersSection';
import {
  AppearanceSection,
  FieldsSection,
  GeneralSection,
  JsonSection,
  RelationsSection,
  RolesSection,
  type DraftProps,
} from './ProfileSections';

interface Section {
  id: string;
  label: string;
  icon: Icon;
  title: string;
  description: string;
  profile: boolean;
  render: (p: DraftProps) => React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: 'general',
    label: 'General',
    icon: IconSettings,
    profile: true,
    title: 'General',
    description: 'The profile’s name, what a user’s ID looks like, and the wording used on the board.',
    render: (p) => <GeneralSection {...p} />,
  },
  {
    id: 'roles',
    label: 'Roles',
    icon: IconUsersGroup,
    profile: true,
    title: 'Roles',
    description:
      'The kinds of users (lead, member, customer…). The ID is what adapters receive; changing it doesn’t update existing users.',
    render: (p) => <RolesSection {...p} />,
  },
  {
    id: 'relations',
    label: 'Relations',
    icon: IconTopologyStar3,
    profile: true,
    title: 'Relations',
    description:
      'How users link (a lead leads members, an agent handles customers). A user can have many links; adapters see them and they can group the board.',
    render: (p) => <RelationsSection {...p} />,
  },
  {
    id: 'fields',
    label: 'Fields',
    icon: IconForms,
    profile: true,
    title: 'Fields',
    description:
      'Custom values on each user (language, plan, age…). Adapters receive them as user.fields; the HTTP body template can use {{user.fields.key}}.',
    render: (p) => <FieldsSection {...p} />,
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: IconPalette,
    profile: true,
    title: 'Appearance',
    description: 'Theme, accent color, grouping, layout and sizes.',
    render: (p) => <AppearanceSection {...p} />,
  },
  {
    id: 'json',
    label: 'JSON',
    icon: IconBraces,
    profile: true,
    title: 'Profile JSON',
    description: 'The whole profile. Valid edits apply as you type.',
    render: (p) => <JsonSection {...p} />,
  },
  {
    id: 'adapters',
    label: 'Adapters',
    icon: IconPlugConnected,
    profile: false,
    title: 'Adapters',
    description: 'Where each adapter sends messages, its keys, polling and actions.',
    render: () => <AdaptersSection />,
  },
];

/** /settings: a menu of sections on the left, the chosen one on the right. */
export function SettingsPage() {
  const store = useSim();
  const paths = usePaths();
  const { pathname } = useLocation();
  const active = pathname.split('/').pop();
  const editable = !store.opts.lockProfile;
  const draft = store.profileDraft ?? store.profile;
  const dirty = !!store.profileDraft && JSON.stringify(core.normalizeProfile(store.profileDraft)) !== JSON.stringify(store.profile);
  const props: DraftProps = {
    draft,
    update: (fn) => {
      const n = structuredClone(draft);
      fn(n);
      store.setProfileDraft(n);
    },
    replace: (p: Profile) => store.setProfileDraft(p),
  };
  const item = (s: Section) => (
    <NavLink
      key={s.id}
      component={Link}
      to={paths.settings + '/' + s.id}
      label={s.label}
      active={active === s.id}
      leftSection={<s.icon size={18} stroke={1.6} />}
      className="cbs-settings-link"
    />
  );

  return (
    <div className="cbs-settings">
      <nav className="cbs-settings-nav" aria-label="Settings">
        {editable && (
          <>
            <Text size="xs" fw={700} c="dimmed" tt="uppercase" px={12} mb={4}>
              Profile
            </Text>
            {SECTIONS.filter((s) => s.profile).map(item)}
          </>
        )}
        <Text size="xs" fw={700} c="dimmed" tt="uppercase" px={12} mt="md" mb={4}>
          Connection
        </Text>
        {SECTIONS.filter((s) => !s.profile).map(item)}
      </nav>
      <div className="cbs-settings-body">
        <Outlet context={props} />
        {editable && dirty && (
          <Paper withBorder radius="lg" shadow="md" p="sm" className="cbs-savebar">
            <Group justify="space-between" gap="sm">
              <Text size="sm" fw={500}>
                You have unsaved profile changes
              </Text>
              <Group gap="sm">
                <Button variant="default" onClick={() => store.setProfileDraft(null)}>
                  Discard
                </Button>
                <Button
                  onClick={() => {
                    store.setProfile(core.normalizeProfile(draft));
                    store.notify({ title: 'Profile Saved', message: draft.name, color: 'green', autoClose: 3000 });
                  }}
                >
                  Save profile
                </Button>
              </Group>
            </Group>
          </Paper>
        )}
      </div>
    </div>
  );
}

/** /settings/:section */
export function SettingsSection() {
  const store = useSim();
  const { section } = useParams();
  const props = useOutletContext<DraftProps>();
  const s = SECTIONS.find((x) => x.id === section);
  if (!s || (s.profile && store.opts.lockProfile)) return <Navigate to={store.opts.lockProfile ? '../adapters' : '../general'} replace />;
  return (
    <Paper withBorder radius="lg" p="xl" className="cbs-settings-card">
      <Stack gap={2} mb="lg">
        <Title order={3} lh={1.3}>
          {s.title}
        </Title>
        <Text size="sm" c="dimmed">
          {s.description}
        </Text>
      </Stack>
      {/* remount per section so local state (e.g. the JSON text) starts fresh */}
      <div key={s.id}>{s.render(props)}</div>
    </Paper>
  );
}
