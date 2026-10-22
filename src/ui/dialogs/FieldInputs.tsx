import { Checkbox, Fieldset, NumberInput, Select, SimpleGrid, Textarea, TextInput } from '@mantine/core';
import * as core from '../../core';
import type { FieldDef, FieldValue } from '../../types';

/** Starting values for the fields of `role`: saved values first, then each field's default. */
export function initialFieldValues(fields: FieldDef[], saved?: Record<string, FieldValue> | null): Record<string, FieldValue> {
  return Object.fromEntries(fields.map((f) => [f.key, saved?.[f.key] ?? f.default]));
}

/** Values with each field's type (number, boolean or string). */
export function coerceFieldValues(fields: FieldDef[], values: Record<string, FieldValue>): Record<string, FieldValue> {
  return Object.fromEntries(fields.map((f) => [f.key, core.coerceField(f, values[f.key])]));
}

/** The profile's custom fields as inputs. */
export function FieldInputs({
  fields,
  values,
  onChange,
}: {
  fields: FieldDef[];
  values: Record<string, FieldValue>;
  onChange: (v: Record<string, FieldValue>) => void;
}) {
  if (!fields.length) return null;
  const set = (key: string, v: FieldValue) => onChange({ ...values, [key]: v });
  return (
    <Fieldset legend="Fields" radius="md">
      <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
        {fields.map((f) => {
          const v = values[f.key];
          if (f.type === 'checkbox')
            return (
              <Checkbox
                key={f.key}
                mt={22}
                label={f.label}
                checked={v === true || v === 'true'}
                onChange={(e) => set(f.key, e.currentTarget.checked)}
              />
            );
          if (f.type === 'select')
            return (
              <Select
                key={f.key}
                label={f.label}
                data={f.options}
                value={v == null ? null : String(v)}
                onChange={(x) => set(f.key, x ?? '')}
                allowDeselect={false}
                comboboxProps={{ withinPortal: true }}
              />
            );
          if (f.type === 'number')
            return (
              <NumberInput key={f.key} label={f.label} value={v === '' || v == null ? '' : Number(v)} onChange={(x) => set(f.key, x)} />
            );
          if (f.type === 'textarea')
            return (
              <Textarea
                key={f.key}
                label={f.label}
                autosize
                minRows={2}
                dir="auto"
                value={v == null ? '' : String(v)}
                onChange={(e) => set(f.key, e.currentTarget.value)}
              />
            );
          return (
            <TextInput
              key={f.key}
              label={f.label}
              dir="auto"
              value={v == null ? '' : String(v)}
              onChange={(e) => set(f.key, e.currentTarget.value)}
            />
          );
        })}
      </SimpleGrid>
    </Fieldset>
  );
}
