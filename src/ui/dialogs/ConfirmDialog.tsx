import { useState } from 'react';
import { Button, Checkbox, Group, Modal, Stack, Text } from '@mantine/core';
import type { ConfirmOptions } from '../context';

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  checkbox,
  onDone,
}: ConfirmOptions & { onDone: (r: { ok: boolean; checked: boolean }) => void }) {
  const [checked, setChecked] = useState(false);
  return (
    <Modal opened onClose={() => onDone({ ok: false, checked })} title={title} size="sm" zIndex={300}>
      <Stack gap="md">
        <Text size="sm">{message}</Text>
        {checkbox && <Checkbox label={checkbox} checked={checked} onChange={(e) => setChecked(e.currentTarget.checked)} />}
        <Group justify="flex-end" gap="sm">
          {/* Enter must not destroy anything: focus starts on Cancel when the action is dangerous */}
          <Button variant="default" onClick={() => onDone({ ok: false, checked })} data-autofocus={danger || undefined}>
            Cancel
          </Button>
          <Button color={danger ? 'red' : undefined} onClick={() => onDone({ ok: true, checked })} data-autofocus={!danger || undefined}>
            {confirmLabel || 'OK'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
