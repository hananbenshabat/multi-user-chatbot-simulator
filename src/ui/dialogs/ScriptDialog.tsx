import { useState } from 'react';
import { Alert, Button, Group, Modal, ScrollArea, Stack, Text, Textarea, ThemeIcon, Tooltip } from '@mantine/core';
import { IconAlertCircle, IconCheck, IconDownload, IconPlayerPlay, IconRecordMail, IconUpload, IconX } from '@tabler/icons-react';
import * as script from '../../script';
import { readStore } from '../store';
import { useSim } from '../context';
import { parseJson } from '../../core/util';
import { download, errorText, pickFile } from '../util';

/** `text` pretty-printed when it is valid JSON; anything else is left as typed. */
function formatJson(text: string): string {
  try {
    return JSON.stringify(parseJson(text), null, 2);
  } catch {
    return text;
  }
}

// What the editor starts with before anything was written or imported.
const BLANK = JSON.stringify({ name: 'My scenario', profile: 'team', reset: true, delay: 300, users: [], steps: [] }, null, 2);

export function ScriptDialog({ onClose }: { onClose: () => void }) {
  const store = useSim();
  const [text, setText] = useState(() => formatJson(readStore('local', store.keyBase + ':script') || BLANK));
  const [error, setError] = useState('');
  /** Put pretty-printed JSON in the editor. */
  const show = (json: string) => {
    setText(json);
    setError('');
  };
  const last = store.lastRun;

  function run() {
    try {
      script.parseScript(text); // a bad script keeps the dialog open with the error
    } catch (e) {
      setError(errorText(e));
      return;
    }
    store.runScriptInUi(formatJson(text)).catch((e) => store.notify({ title: 'Script', message: e.message, color: 'red' }));
    onClose();
  }

  // Importing a file opens it in the editor; problems with it show right away.
  function importFile() {
    pickFile((t, filename) => {
      setText(formatJson(t));
      try {
        script.parseScript(t);
        setError('');
      } catch (e) {
        setError(filename + ': ' + errorText(e));
      }
    });
  }

  function exportFile() {
    let name = 'script';
    try {
      name = script.parseScript(text).name;
    } catch {
      /* export whatever is there */
    }
    download(
      (name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'script') + '.json',
      text,
    );
  }

  return (
    <Modal opened onClose={onClose} title="Script" size="xl">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          A JSON scenario: users to create, then steps (say, tap, share, add, link, action, wait, expect). It runs by itself and checks what
          arrives. Import a file to start (there are examples in <code>examples/scripts/</code>); every step is described in{' '}
          <code>docs/scripts.md</code>.
        </Text>
        <Textarea
          value={text}
          onChange={(e) => {
            setText(e.currentTarget.value);
            setError('');
          }}
          onBlur={() => setText(formatJson)}
          autosize
          minRows={14}
          maxRows={22}
          spellCheck={false}
          aria-label="Script (JSON)"
          className="cbs-mono"
          data-autofocus
        />
        {error && (
          <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />}>
            {error}
          </Alert>
        )}
        {last && (
          <Alert
            variant="light"
            color={last.ok ? 'green' : 'red'}
            icon={last.ok ? <IconCheck size={18} /> : <IconX size={18} />}
            title={last.ok ? 'Last run passed: ' + last.steps + ' steps' : 'Last run failed: ' + last.error}
          >
            <ScrollArea.Autosize mah={160} type="auto">
              <Stack gap={2}>
                {last.log.map((e, i) => (
                  <Group key={i} gap={6} wrap="nowrap" align="flex-start">
                    <ThemeIcon size={16} radius="xl" color={e.status === 'ok' ? 'green' : 'red'} variant="light" mt={2}>
                      {e.status === 'ok' ? <IconCheck size={11} /> : <IconX size={11} />}
                    </ThemeIcon>
                    <Text size="xs" dir="auto">
                      {e.text}
                      {e.error ? ': ' + e.error : ''}
                    </Text>
                  </Group>
                ))}
              </Stack>
            </ScrollArea.Autosize>
          </Alert>
        )}
        <Group justify="space-between" gap="sm">
          <Group gap="xs">
            <Button variant="default" size="sm" leftSection={<IconUpload size={16} />} onClick={importFile}>
              Import file
            </Button>
            <Button variant="default" size="sm" leftSection={<IconDownload size={16} />} onClick={exportFile}>
              Export file
            </Button>
            <Tooltip
              label={
                store.session.users.length
                  ? 'Rebuild these users and replay what was typed and tapped'
                  : 'Add users first: there is nothing to record'
              }
            >
              <Button
                variant="default"
                size="sm"
                // data-disabled (not disabled) so the tooltip still explains why
                data-disabled={!store.session.users.length || undefined}
                leftSection={<IconRecordMail size={16} />}
                onClick={() => {
                  if (store.session.users.length) show(JSON.stringify(script.scriptFromSession(store.session), null, 2));
                }}
              >
                From this session
              </Button>
            </Tooltip>
          </Group>
          <Group gap="sm" ml="auto">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button leftSection={<IconPlayerPlay size={16} />} onClick={run} disabled={!!store.scriptRun}>
              Run
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
