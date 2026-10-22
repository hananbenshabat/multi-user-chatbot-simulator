import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Fieldset,
  Group,
  JsonInput,
  NumberInput,
  PasswordInput,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { IconAlertCircle, IconLock } from '@tabler/icons-react';
import type { SettingValue, SettingsField } from '../../types';
import { useSim } from '../context';

/** Each adapter's settings, and whether unknown IDs from the server create users. Saved on its own. */
export function AdaptersSection() {
  const store = useSim();
  const adapters = Object.values(store.adapters);
  const initial = () => Object.fromEntries(adapters.map((a) => [a.type, { ...store.settingsFor(a.type) }]));
  const [values, setValues] = useState(initial);
  const [autoCreate, setAutoCreate] = useState(store.session.options.autoCreate !== false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const set = (type: string, key: string, v: SettingValue) => {
    setValues((all) => ({ ...all, [type]: { ...all[type], [key]: v } }));
    setDirty(true);
  };

  function save() {
    const out = structuredClone(values);
    for (const a of adapters) {
      for (const f of a.settingsFields || []) {
        const v = out[a.type][f.key];
        if (f.type === 'json' && typeof v === 'string' && v.trim()) {
          try {
            JSON.parse(v);
          } catch {
            setError(a.label + ' · ' + f.label + ': not valid JSON');
            return;
          }
        }
        if (f.type === 'number') out[a.type][f.key] = Number(v || 0);
      }
    }
    store.saveSettings(out, autoCreate);
    setError('');
    setDirty(false);
    store.notify({ title: 'Settings Saved', message: 'Adapter settings are in use now.', color: 'green', autoClose: 3000 });
  }

  function input(type: string, f: SettingsField) {
    const v = values[type][f.key];
    const str = v == null ? '' : String(v);
    const description = f.type === 'secret' ? 'Kept in this browser tab only, never saved or exported.' : f.hint;
    if (f.type === 'json') {
      return (
        <JsonInput
          key={f.key}
          label={f.label}
          description={description}
          value={str}
          onChange={(x) => set(type, f.key, x)}
          autosize
          minRows={3}
          maxRows={14}
          formatOnBlur
          validationError="Not valid JSON"
          spellCheck={false}
          className="cbs-mono"
        />
      );
    }
    if (f.type === 'secret') {
      return (
        <PasswordInput
          key={f.key}
          label={f.label}
          description={description}
          value={str}
          onChange={(e) => set(type, f.key, e.currentTarget.value)}
          autoComplete="off"
          leftSection={<IconLock size={16} />}
        />
      );
    }
    if (f.type === 'number') {
      return (
        <NumberInput
          key={f.key}
          label={f.label}
          description={description}
          value={str === '' ? '' : Number(v)}
          onChange={(x) => set(type, f.key, x)}
          min={0}
        />
      );
    }
    return (
      <TextInput
        key={f.key}
        label={f.label}
        description={description}
        value={str}
        type={f.type === 'url' ? 'url' : 'text'}
        onChange={(e) => set(type, f.key, e.currentTarget.value)}
        autoComplete="off"
      />
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Stack gap="lg">
        <Switch
          checked={autoCreate}
          onChange={(e) => {
            setAutoCreate(e.currentTarget.checked);
            setDirty(true);
          }}
          label={'Create a user automatically when the server messages an unknown ' + store.profile.identity.label}
          description="Off: the message shows as a note in the sender's chat instead."
        />
        {adapters.map((a) => (
          <Fieldset
            key={a.type}
            radius="md"
            legend={
              <Group gap={6}>
                <Text fw={600} size="sm">
                  {a.label}
                </Text>
                <Badge size="xs" variant="default">
                  {a.type}
                </Badge>
              </Group>
            }
          >
            {a.settingsFields?.length ? (
              <Stack gap="sm">{a.settingsFields.map((f) => input(a.type, f))}</Stack>
            ) : (
              <Text size="sm" c="dimmed">
                This adapter has no settings.
              </Text>
            )}
          </Fieldset>
        ))}
        {error && (
          <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />}>
            {error}
          </Alert>
        )}
        <Group justify="flex-end" gap="sm" className="cbs-settings-actions">
          <Button
            variant="default"
            disabled={!dirty}
            onClick={() => {
              setValues(initial());
              setAutoCreate(store.session.options.autoCreate !== false);
              setDirty(false);
              setError('');
            }}
          >
            Discard changes
          </Button>
          <Button type="submit" disabled={!dirty}>
            Save settings
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
