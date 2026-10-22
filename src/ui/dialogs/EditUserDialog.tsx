import { useState } from 'react';
import { Alert, Button, Checkbox, Fieldset, Group, Modal, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import * as core from '../../core';
import type { User } from '../../types';
import { useSim } from '../context';
import { errorText } from '../util';
import { FieldInputs, coerceFieldValues, initialFieldValues } from './FieldInputs';

interface LinkBox {
  rel: string;
  from: string;
  to: string;
  on: boolean;
}
interface LinkSet {
  title: string;
  boxes: (LinkBox & { other: User })[];
}

export function EditUserDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const store = useSim();
  const p = store.profile;
  const [name, setName] = useState(user.name);
  const [address, setAddress] = useState(user.address);
  const [role, setRole] = useState(user.role);
  const fields = core.fieldsFor(p, role);
  const [values, setValues] = useState(() => initialFieldValues(fields, user.fields));
  const [error, setError] = useState('');
  const isLinked = (rel: string, from: string, to: string) =>
    store.session.links.some((x) => x.rel === rel && x.from === from && x.to === to);

  // Every link this user can make, per relation, for the chosen role. Links made by others (a lead
  // linking this member) are changed from their side, so they're only listed (see linkedBy).
  const buildSets = (r0: string): LinkSet[] => {
    const sets: LinkSet[] = [];
    const others = store.session.users.filter((c) => c.id !== user.id);
    for (const r of p.relations) {
      if (core.roleFits(r.from, r0)) {
        const cands = others.filter((c) => core.roleFits(r.to, c.role));
        if (cands.length)
          sets.push({
            title: r.label + ' →',
            boxes: cands.map((c) => ({ rel: r.id, from: user.id, to: c.id, other: c, on: isLinked(r.id, user.id, c.id) })),
          });
      }
    }
    return sets;
  };
  const [sets, setSets] = useState(() => buildSets(user.role));
  const linkedBy = Object.entries(core.linksOf(store.session, user.id).in).map(([rel, users]) => ({
    label: core.relationDef(p, rel)?.label ?? rel,
    names: users.map((c) => c.name).join(', '),
  }));

  function changeRole(r: string) {
    setRole(r);
    setValues(initialFieldValues(core.fieldsFor(p, r), user.fields));
    setSets(buildSets(r));
  }

  function toggle(si: number, bi: number, on: boolean) {
    setSets((ss) => ss.map((s, i) => (i !== si ? s : { ...s, boxes: s.boxes.map((b, j) => (j === bi ? { ...b, on } : b)) })));
  }

  function submit() {
    try {
      store.saveUser(
        user,
        { name, address, role, fields: coerceFieldValues(fields, values) },
        sets.flatMap((s) => s.boxes),
      );
      onClose();
    } catch (e) {
      setError(errorText(e));
    }
  }

  const roleData = [{ value: '', label: '(no role)' }, ...p.roles.map((r) => ({ value: r.id, label: r.label }))];
  if (user.role && !p.roles.some((r) => r.id === user.role)) roleData.push({ value: user.role, label: user.role + ' (not in profile)' });

  return (
    <Modal opened onClose={onClose} title={'Edit ' + user.name} size="lg">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
            <TextInput label="Name" dir="auto" value={name} onChange={(e) => setName(e.currentTarget.value)} data-autofocus />
            <TextInput label={p.identity.label} value={address} onChange={(e) => setAddress(e.currentTarget.value)} />
            {(p.roles.length > 0 || user.role) && (
              <Select label="Role" data={roleData} value={role} onChange={(v) => changeRole(v ?? '')} allowDeselect={false} />
            )}
          </SimpleGrid>
          <FieldInputs fields={fields} values={values} onChange={setValues} />
          {(sets.length > 0 || linkedBy.length > 0) && (
            <Fieldset legend="Links" radius="md">
              <Stack gap="sm">
                {linkedBy.map((l) => (
                  <Text key={l.label} size="sm" dir="auto">
                    <Text span size="xs" c="dimmed" fw={600}>
                      {'← ' + l.label + ': '}
                    </Text>
                    {l.names}
                    <Text span size="xs" c="dimmed">
                      {' (changed from their side)'}
                    </Text>
                  </Text>
                ))}
                {sets.map((s, si) => (
                  <div key={s.title}>
                    <Text size="xs" c="dimmed" fw={600} mb={6}>
                      {s.title}
                    </Text>
                    <SimpleGrid cols={{ base: 2, xs: 3 }} spacing={6} className="cbs-linkset">
                      {s.boxes.map((b, bi) => (
                        <Checkbox
                          key={b.rel + b.from + b.to}
                          size="sm"
                          label={b.other.name}
                          checked={b.on}
                          onChange={(e) => toggle(si, bi, e.currentTarget.checked)}
                        />
                      ))}
                    </SimpleGrid>
                  </div>
                ))}
              </Stack>
            </Fieldset>
          )}
          {error && (
            <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />}>
              {error}
            </Alert>
          )}
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
