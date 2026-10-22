// The profile's parts, one per Settings page. They edit a draft (SimStore.profileDraft) that the
// Settings page saves; bad values are fixed on save, never rejected.
import { useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  ColorInput,
  Fieldset,
  Group,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { IconAlertCircle, IconDownload, IconPlus, IconTrash, IconUpload } from '@tabler/icons-react';
import * as core from '../../core';
import type { Appearance, FieldDef, Profile, Relation, Role } from '../../types';
import { useSim, useUi } from '../context';
import { errorText, parseJson, prop } from '../../core/util';
import { download, pickFile, plural } from '../util';

/** Help text under the input, so inputs side by side line up whether or not they have help. */
const HELP_BELOW: ('label' | 'input' | 'description' | 'error')[] = ['label', 'input', 'description', 'error'];

/** The first IDs the pattern makes, then the rule. */
function patternHelp(pattern: string) {
  if (!pattern.trim()) return '{n} is a counter; {n:4} pads it to 4 digits';
  return 'Makes ' + [1, 2, 3].map((n) => core.formatPattern(pattern, n)).join(', ') + '… ({n} counts, {n:4} pads)';
}

/** The wording inputs: label key, input label, hint. */
const WORDING: [keyof Profile['labels'], string, string][] = [
  ['user', 'A user is called', 'User, Person, Persona…'],
  ['send', 'Send button', ''],
  ['placeholder', 'Message box hint', 'Can include {name}, the user’s name'],
  ['bot', 'The other side is called', 'bot, server, agent…'],
];

export interface DraftProps {
  draft: Profile;
  update: (fn: (d: Profile) => void) => void;
  replace: (p: Profile) => void;
}

const PALETTE = ['#3b6fd8', '#8a4fd8', '#2a9d8f', '#d8833b', '#c0392b', '#7f8c8d', '#e0a800', '#16a085'];
const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Choice' },
  { value: 'checkbox', label: 'Yes / no' },
];

export function GeneralSection({ draft, update, replace }: DraftProps) {
  const store = useSim();
  const ui = useUi();
  const [preset, setPreset] = useState<string>('generic');
  async function loadPreset() {
    const p = store.presets[preset];
    const r = await ui.confirm({
      title: 'Load a Preset?',
      message: 'Replace the profile being edited with the "' + (p.name || preset) + '" preset. Nothing is saved until you press Save.',
      confirmLabel: 'Load preset',
    });
    if (r.ok) replace(structuredClone(core.normalizeProfile(p)));
  }
  return (
    <Stack gap="md">
      <TextInput
        label="Profile name"
        value={draft.name}
        onChange={(e) => {
          const v = e.currentTarget.value;
          update((d) => {
            d.name = v;
          });
        }}
      />
      <Fieldset legend="Identity" radius="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <TextInput
            label="What a user's ID is called"
            placeholder="ID, Phone, Email, Username…"
            description="Shown on each chat and in the dialogs."
            inputWrapperOrder={HELP_BELOW}
            value={draft.identity.label}
            onChange={(e) => {
              const v = e.currentTarget.value;
              update((d) => {
                d.identity.label = v;
              });
            }}
          />
          <TextInput
            label="ID pattern for new users"
            value={draft.identity.pattern}
            className="cbs-mono"
            description={patternHelp(draft.identity.pattern)}
            inputWrapperOrder={HELP_BELOW}
            onChange={(e) => {
              const v = e.currentTarget.value;
              update((d) => {
                d.identity.pattern = v;
              });
            }}
          />
        </SimpleGrid>
      </Fieldset>
      <Fieldset legend="Wording" radius="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          {WORDING.map(([k, label, hint]) => (
            <TextInput
              key={k}
              label={label}
              placeholder={k === 'placeholder' ? undefined : hint}
              description={k === 'placeholder' ? hint : undefined}
              inputWrapperOrder={HELP_BELOW}
              value={draft.labels[k] ?? ''}
              onChange={(e) => {
                const v = e.currentTarget.value;
                update((d) => {
                  d.labels[k] = v;
                });
              }}
            />
          ))}
        </SimpleGrid>
      </Fieldset>
      <Fieldset legend="Start from a preset or a file" radius="md">
        <Group gap="sm" align="flex-end">
          <Select
            label="Preset"
            data={Object.entries(store.presets).map(([k, p]) => ({ value: k, label: p.name || k }))}
            value={preset}
            onChange={(v) => v && setPreset(v)}
            allowDeselect={false}
            w={220}
          />
          <Button variant="default" onClick={loadPreset}>
            Load preset
          </Button>
          <Button
            variant="default"
            leftSection={<IconDownload size={16} />}
            onClick={() =>
              download('profile-' + (core.slug(draft.name) || 'profile') + '.json', JSON.stringify(core.normalizeProfile(draft), null, 2))
            }
          >
            Export profile
          </Button>
          <Button
            variant="default"
            leftSection={<IconUpload size={16} />}
            onClick={() =>
              pickFile((t) => {
                try {
                  // a profile file, or a session export (which has one inside)
                  const p = parseJson(t);
                  replace(core.normalizeProfile(prop(p, 'profile') ?? p));
                } catch (e) {
                  store.notify({ title: 'Not a Profile File', message: errorText(e), color: 'red' });
                }
              })
            }
          >
            Import profile
          </Button>
        </Group>
      </Fieldset>
    </Stack>
  );
}

export function RolesSection({ draft, update }: DraftProps) {
  const store = useSim();
  const used = (role: string) => store.session.users.filter((u) => u.role === role).length;
  return (
    <Stack gap="sm">
      <ScrollArea type="auto">
        <Table verticalSpacing={6} miw={720}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Label</Table.Th>
              <Table.Th w={150}>Color</Table.Th>
              <Table.Th w={80}>Icon</Table.Th>
              <Table.Th>ID pattern (optional)</Table.Th>
              <Table.Th w={110} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {draft.roles.map((r: Role, i) => (
              <Table.Tr key={i}>
                <Table.Td>
                  <TextInput
                    size="xs"
                    aria-label="Role ID"
                    value={r.id}
                    onChange={(e) => {
                      const v = e.currentTarget.value;
                      update((d) => {
                        d.roles[i].id = v;
                      });
                    }}
                  />
                </Table.Td>
                <Table.Td>
                  <TextInput
                    size="xs"
                    aria-label="Role label"
                    value={r.label}
                    onChange={(e) => {
                      const v = e.currentTarget.value;
                      update((d) => {
                        d.roles[i].label = v;
                      });
                    }}
                  />
                </Table.Td>
                <Table.Td>
                  <ColorInput
                    size="xs"
                    aria-label="Role color"
                    value={r.color || ''}
                    swatches={PALETTE}
                    swatchesPerRow={8}
                    format="hex"
                    onChange={(v) =>
                      update((d) => {
                        d.roles[i].color = v;
                      })
                    }
                  />
                </Table.Td>
                <Table.Td>
                  <TextInput
                    size="xs"
                    aria-label="Role icon"
                    maxLength={4}
                    value={r.icon || ''}
                    onChange={(e) => {
                      const v = e.currentTarget.value;
                      update((d) => {
                        d.roles[i].icon = v;
                      });
                    }}
                  />
                </Table.Td>
                <Table.Td>
                  <TextInput
                    size="xs"
                    aria-label="Role ID pattern"
                    placeholder="profile default"
                    className="cbs-mono"
                    value={r.idPattern || ''}
                    onChange={(e) => {
                      const v = e.currentTarget.value;
                      update((d) => {
                        d.roles[i].idPattern = v;
                      });
                    }}
                  />
                </Table.Td>
                <Table.Td>
                  <Group gap={6} justify="flex-end" wrap="nowrap">
                    {used(r.id) > 0 && (
                      <Badge size="sm" variant="light" color="gray">
                        {plural(used(r.id), 'user')}
                      </Badge>
                    )}
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label="Remove role"
                      onClick={() =>
                        update((d) => {
                          d.roles.splice(i, 1);
                        })
                      }
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      <Group>
        <Button
          variant="light"
          leftSection={<IconPlus size={16} />}
          onClick={() =>
            update((d) => {
              const n = d.roles.length + 1;
              d.roles.push({ id: 'role' + n, label: 'Role ' + n, color: PALETTE[(n - 1) % PALETTE.length], icon: '', idPattern: '' });
            })
          }
        >
          Add role
        </Button>
      </Group>
    </Stack>
  );
}

export function RelationsSection({ draft, update }: DraftProps) {
  const roleEnds = [
    { value: '*', label: 'any role' },
    ...draft.roles.filter((r) => r.id).map((r) => ({ value: r.id, label: r.label || r.id })),
  ];
  return (
    <Stack gap="sm">
      <ScrollArea type="auto">
        <Table verticalSpacing={6} miw={640}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Label</Table.Th>
              <Table.Th>From</Table.Th>
              <Table.Th>To</Table.Th>
              <Table.Th w={50} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {draft.relations.map((r: Relation, i) => (
              <Table.Tr key={i}>
                <Table.Td>
                  <TextInput
                    size="xs"
                    aria-label="Relation ID"
                    value={r.id}
                    onChange={(e) => {
                      const v = e.currentTarget.value;
                      update((d) => {
                        d.relations[i].id = v;
                      });
                    }}
                  />
                </Table.Td>
                <Table.Td>
                  <TextInput
                    size="xs"
                    aria-label="Relation label"
                    value={r.label}
                    onChange={(e) => {
                      const v = e.currentTarget.value;
                      update((d) => {
                        d.relations[i].label = v;
                      });
                    }}
                  />
                </Table.Td>
                <Table.Td>
                  <Select
                    size="xs"
                    aria-label="From role"
                    data={roleEnds}
                    value={r.from}
                    allowDeselect={false}
                    onChange={(v) =>
                      v &&
                      update((d) => {
                        d.relations[i].from = v;
                      })
                    }
                  />
                </Table.Td>
                <Table.Td>
                  <Select
                    size="xs"
                    aria-label="To role"
                    data={roleEnds}
                    value={r.to}
                    allowDeselect={false}
                    onChange={(v) =>
                      v &&
                      update((d) => {
                        d.relations[i].to = v;
                      })
                    }
                  />
                </Table.Td>
                <Table.Td>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label="Remove relation"
                    onClick={() =>
                      update((d) => {
                        d.relations.splice(i, 1);
                      })
                    }
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      <Group>
        <Button
          variant="light"
          leftSection={<IconPlus size={16} />}
          onClick={() =>
            update((d) => {
              const n = d.relations.length + 1;
              d.relations.push({ id: 'rel' + n, label: 'Linked', from: '*', to: '*' });
            })
          }
        >
          Add relation
        </Button>
      </Group>
    </Stack>
  );
}

export function FieldsSection({ draft, update }: DraftProps) {
  return (
    <Stack gap="sm">
      {draft.fields.map((f: FieldDef, i) => (
        <Paper key={i} withBorder radius="md" p="sm">
          <Stack gap="xs">
            <Group gap="sm" align="flex-end" wrap="nowrap">
              <TextInput
                size="xs"
                label="Key"
                className="cbs-mono"
                value={f.key}
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  update((d) => {
                    d.fields[i].key = v;
                  });
                }}
                style={{ flex: 1 }}
              />
              <TextInput
                size="xs"
                label="Label"
                value={f.label}
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  update((d) => {
                    d.fields[i].label = v;
                  });
                }}
                style={{ flex: 1 }}
              />
              <Select
                size="xs"
                label="Type"
                data={FIELD_TYPES}
                value={f.type || 'text'}
                allowDeselect={false}
                onChange={(v) => {
                  if (core.isFieldType(v))
                    update((d) => {
                      d.fields[i].type = v;
                    });
                }}
                w={130}
              />
              <ActionIcon
                variant="subtle"
                color="red"
                mb={2}
                aria-label="Remove field"
                onClick={() =>
                  update((d) => {
                    d.fields.splice(i, 1);
                  })
                }
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
            <Group gap="sm" align="flex-end">
              {f.type === 'select' && (
                <TextInput
                  size="xs"
                  label="Choices (comma separated)"
                  value={(f.options || []).join(', ')}
                  style={{ flex: 1 }}
                  onChange={(e) => {
                    const v = e.currentTarget.value;
                    update((d) => {
                      d.fields[i].options = v
                        .split(',')
                        .map((x) => x.trim())
                        .filter(Boolean);
                    });
                  }}
                />
              )}
              {f.type === 'checkbox' ? (
                <Checkbox
                  size="xs"
                  label="On by default"
                  checked={!!f.default}
                  onChange={(e) => {
                    const v = e.currentTarget.checked;
                    update((d) => {
                      d.fields[i].default = v;
                    });
                  }}
                />
              ) : (
                <TextInput
                  size="xs"
                  label="Default"
                  value={f.default == null ? '' : String(f.default)}
                  style={{ flex: 1 }}
                  onChange={(e) => {
                    const v = e.currentTarget.value;
                    update((d) => {
                      d.fields[i].default = v;
                    });
                  }}
                />
              )}
            </Group>
            <Group gap="md">
              {draft.roles.length > 0 && (
                <Group gap="xs">
                  <Text size="xs" c="dimmed">
                    Only for
                  </Text>
                  {draft.roles
                    .filter((r) => r.id)
                    .map((r) => (
                      <Checkbox
                        key={r.id}
                        size="xs"
                        label={r.label || r.id}
                        checked={(f.roles || []).includes(r.id)}
                        onChange={(e) => {
                          const on = e.currentTarget.checked;
                          update((d) => {
                            const rs = d.fields[i].roles || [];
                            d.fields[i].roles = on ? [...rs, r.id] : rs.filter((x) => x !== r.id);
                          });
                        }}
                      />
                    ))}
                  <Text size="xs" c="dimmed">
                    (none = all roles)
                  </Text>
                </Group>
              )}
              <Switch
                size="xs"
                label="Show as a chip"
                checked={f.showAsChip !== false}
                onChange={(e) => {
                  const v = e.currentTarget.checked;
                  update((d) => {
                    d.fields[i].showAsChip = v;
                  });
                }}
              />
            </Group>
          </Stack>
        </Paper>
      ))}
      <Group>
        <Button
          variant="light"
          leftSection={<IconPlus size={16} />}
          onClick={() =>
            update((d) => {
              const n = d.fields.length + 1;
              d.fields.push({ key: 'field' + n, label: 'Field ' + n, type: 'text', options: [], default: '', roles: [], showAsChip: true });
            })
          }
        >
          Add field
        </Button>
      </Group>
    </Stack>
  );
}

export function AppearanceSection({ draft, update }: DraftProps) {
  const a = core.normalizeAppearance(draft.appearance);
  const setA = <K extends keyof Appearance>(k: K, v: Appearance[K]) =>
    update((d) => {
      d.appearance = { ...a, [k]: v };
    });
  const groupOptions = [
    { value: '', label: 'Nothing (one group)' },
    { value: 'role', label: 'Role' },
    ...draft.relations.filter((r) => r.id).map((r) => ({ value: core.slug(r.id), label: 'Relation: ' + (r.label || r.id) })),
  ];
  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
      <Select
        label="Theme"
        allowDeselect={false}
        value={a.theme}
        onChange={(v) => v && setA('theme', v)}
        data={[
          { value: 'auto', label: 'Follow the system' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />
      <ColorInput
        label="Accent color"
        format="hex"
        value={a.accent}
        swatches={PALETTE}
        swatchesPerRow={8}
        onChange={(v) => setA('accent', v)}
      />
      <Select
        label="Group the board by"
        allowDeselect={false}
        value={a.groupBy}
        data={groupOptions}
        onChange={(v) => setA('groupBy', v ?? '')}
      />
      <Select
        label="Layout"
        allowDeselect={false}
        value={a.layout}
        onChange={(v) => v && setA('layout', v)}
        data={[
          { value: 'rows', label: 'Rows (one row per group, scroll sideways)' },
          { value: 'grid', label: 'Grid (wrap)' },
        ]}
      />
      <Select
        label="Density"
        allowDeselect={false}
        value={a.density}
        onChange={(v) => v && setA('density', v)}
        data={[
          { value: 'comfortable', label: 'Comfortable' },
          { value: 'compact', label: 'Compact' },
        ]}
      />
      <Select
        label="Bubbles"
        allowDeselect={false}
        value={a.bubbles}
        onChange={(v) => v && setA('bubbles', v)}
        data={[
          { value: 'rounded', label: 'Rounded' },
          { value: 'square', label: 'Square' },
        ]}
      />
      <Select
        label="Direction"
        allowDeselect={false}
        value={a.direction}
        description="Messages always follow their own text direction."
        onChange={(v) => v && setA('direction', v)}
        data={[
          { value: 'ltr', label: 'Left to right' },
          { value: 'rtl', label: 'Right to left' },
        ]}
      />
      <NumberInput label="Font size (px)" min={11} max={20} value={a.fontSize} onChange={(v) => setA('fontSize', Number(v))} />
      <NumberInput
        label="Chat width (px)"
        min={220}
        max={800}
        step={10}
        value={a.chatWidth}
        onChange={(v) => setA('chatWidth', Number(v))}
      />
      <NumberInput
        label="Chat height (px)"
        min={240}
        max={1200}
        step={10}
        value={a.chatHeight}
        onChange={(v) => setA('chatHeight', Number(v))}
      />
      <Stack gap="xs" mt="xs">
        <Switch label="Show IDs" checked={a.showId} onChange={(e) => setA('showId', e.currentTarget.checked)} />
        <Switch label="Show times" checked={a.showTimestamps} onChange={(e) => setA('showTimestamps', e.currentTarget.checked)} />
      </Stack>
      <Stack gap="xs" mt="xs">
        <Switch label="Show fields on users" checked={a.showFields} onChange={(e) => setA('showFields', e.currentTarget.checked)} />
        <Switch label="Show links on users" checked={a.showLinks} onChange={(e) => setA('showLinks', e.currentTarget.checked)} />
      </Stack>
    </SimpleGrid>
  );
}

/** The whole profile as JSON; valid edits go straight into the draft. */
export function JsonSection({ draft, replace }: DraftProps) {
  const [text, setText] = useState(() => JSON.stringify(draft, null, 2));
  const [error, setError] = useState('');
  function change(v: string) {
    setText(v);
    try {
      replace(core.normalizeProfile(parseJson(v)));
      setError('');
    } catch (e) {
      setError('Not valid JSON yet: ' + errorText(e));
    }
  }
  return (
    <Stack gap="sm">
      <Textarea
        value={text}
        onChange={(e) => change(e.currentTarget.value)}
        autosize
        minRows={18}
        maxRows={30}
        spellCheck={false}
        className="cbs-mono"
        aria-label="Profile (JSON)"
      />
      {error && (
        <Alert color="yellow" variant="light" icon={<IconAlertCircle size={18} />}>
          {error}. The last valid version is kept.
        </Alert>
      )}
    </Stack>
  );
}
