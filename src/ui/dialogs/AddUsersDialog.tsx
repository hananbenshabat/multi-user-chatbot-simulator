import { useMemo, useState } from 'react';
import { Autocomplete, Button, Group, Modal, NumberInput, Select, SimpleGrid, Stack, TextInput } from '@mantine/core';
import { IconLink, IconUserPlus } from '@tabler/icons-react';
import * as core from '../../core';
import type { User } from '../../types';
import type { AddPreset } from '../store';
import { useSim } from '../context';
import { capitalize } from '../util';
import { FieldInputs, coerceFieldValues, initialFieldValues } from './FieldInputs';

/** How an existing user shows in the Name suggestions (names can repeat; IDs can't). */
const optionOf = (c: User) => c.name + ' · ' + c.address;

export function AddUsersDialog({ pre, onClose }: { pre: AddPreset; onClose: () => void }) {
  const store = useSim();
  const p = store.profile;
  const [type, setType] = useState(pre.type && store.adapters[pre.type] ? pre.type : store.types[0]);
  const [role, setRole] = useState(pre.role != null ? pre.role : (p.roles[0]?.id ?? ''));
  const [count, setCount] = useState<number | string>(1);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const fields = core.fieldsFor(p, role);
  const [values, setValues] = useState(() => initialFieldValues(fields));

  // Who the new users can be linked under, for the chosen role.
  const linkOptions = useMemo(() => {
    const out = [{ value: '', label: '— not linked —' }];
    for (const r of core.relationsTo(p, role)) {
      for (const c of store.session.users)
        if (core.roleFits(r.from, c.role)) out.push({ value: r.id + '|' + c.id, label: c.name + ' · ' + r.label });
    }
    return out;
  }, [p, role, store.session.users]);
  const wanted = pre.linkFrom ? pre.linkFrom.rel + '|' + pre.linkFrom.userId : '';
  const [link, setLink] = useState(wanted);
  const linkValue = linkOptions.some((o) => o.value === link) ? link : '';
  const n = Number(count) || 1;

  // Existing users that could take this link and don't have it yet; those without any link first.
  const [rel = '', fromId = ''] = linkValue ? linkValue.split('|') : [];
  const candidates = useMemo(() => {
    const relation = core.relationDef(p, rel);
    if (!relation) return [];
    const s = store.session;
    const hasIt = (c: User) => s.links.some((l) => l.rel === rel && l.from === fromId && l.to === c.id);
    const unattached = (c: User) => !s.links.some((l) => l.to === c.id);
    return s.users
      .filter((c) => c.id !== fromId && core.roleFits(relation.to, c.role) && !hasIt(c))
      .sort((a, b) => Number(unattached(b)) - Number(unattached(a)));
  }, [p, rel, fromId, store.session]);
  // The existing user picked from the suggestions: then nothing new is created. Typing clears it,
  // so a new user can still have the same name as an existing one.
  const [picked, setPicked] = useState<User | null>(null);
  const existing = picked && candidates.includes(picked) ? picked : null;
  function changeName(v: string) {
    const c = candidates.find((x) => optionOf(x) === v);
    setPicked(c ?? null);
    setName(c ? c.name : v);
  }

  function changeRole(r: string) {
    setRole(r);
    setValues(initialFieldValues(core.fieldsFor(p, r)));
  }

  function submit() {
    if (existing) store.linkExisting(rel, fromId, existing.id);
    else store.addUsers({ type, role, count: n, name, address, fields: coerceFieldValues(fields, values), link: linkValue });
    onClose();
  }

  const noun = p.labels.user.toLowerCase();
  const verb = pre.asLink ? 'Link' : 'Add';
  const nameInput = candidates.length ? (
    <Autocomplete
      label="Name"
      placeholder={'automatic, or pick an existing ' + noun}
      dir="auto"
      data={candidates.map(optionOf)}
      value={name}
      onChange={changeName}
      description={
        existing
          ? 'Links ' + existing.name + ' (' + existing.address + ') instead of adding a new ' + noun + '.'
          : n > 1
            ? 'Each gets a number after the name.'
            : undefined
      }
      comboboxProps={{ withinPortal: true }}
      data-autofocus
    />
  ) : (
    <TextInput
      label="Name"
      placeholder="automatic"
      dir="auto"
      value={name}
      onChange={(e) => setName(e.currentTarget.value)}
      description={n > 1 ? 'Each gets a number after the name.' : undefined}
    />
  );

  return (
    <Modal opened onClose={onClose} title={verb + ' ' + capitalize(p.labels.user)} size="lg">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Stack gap="md">
          {candidates.length > 0 && nameInput}
          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
            {!existing && store.types.length > 1 && (
              <Select
                label="Adapter"
                data={store.types.map((t) => ({ value: t, label: store.adapters[t].label }))}
                value={type}
                onChange={(v) => v && setType(v)}
                allowDeselect={false}
              />
            )}
            {!existing && p.roles.length > 0 && (
              <Select
                label="Role"
                data={[{ value: '', label: '(no role)' }, ...p.roles.map((r) => ({ value: r.id, label: r.label }))]}
                value={role}
                onChange={(v) => changeRole(v ?? '')}
                allowDeselect={false}
              />
            )}
            {linkOptions.length > 1 && (
              <Select
                label="Link to"
                data={linkOptions}
                value={linkValue}
                onChange={(v) => setLink(v ?? '')}
                allowDeselect={false}
                searchable
              />
            )}
            {!existing && (
              <NumberInput
                label="How many"
                min={1}
                max={200}
                value={count}
                onChange={setCount}
                data-autofocus={candidates.length ? undefined : true}
              />
            )}
          </SimpleGrid>
          {!existing && (
            <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
              {!candidates.length && nameInput}
              {n <= 1 && (
                <TextInput
                  label={p.identity.label}
                  placeholder={'automatic: ' + core.nextAddress(store.session, role)}
                  value={address}
                  onChange={(e) => setAddress(e.currentTarget.value)}
                />
              )}
            </SimpleGrid>
          )}
          {!existing && <FieldInputs fields={fields} values={values} onChange={setValues} />}
          <Group justify="flex-end" gap="sm" mt="xs">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            {existing ? (
              <Button type="submit" leftSection={<IconLink size={16} />}>
                {'Link ' + existing.name}
              </Button>
            ) : (
              <Button type="submit" leftSection={<IconUserPlus size={16} />}>
                {n > 1 ? verb + ' ' + n + ' ' + noun + 's' : verb + ' ' + noun}
              </Button>
            )}
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
