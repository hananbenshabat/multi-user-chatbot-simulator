import {
  Component,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { DirectionProvider, MantineProvider } from '@mantine/core';
import { Notifications, createNotificationsStore, hideNotification, showNotification, updateNotification } from '@mantine/notifications';
import * as core from '../core';
import type { Controller, SimulatorOptions, User } from '../types';
import { SimStore, type AddPreset } from './store';
import { buildTheme, darkTints } from './theme';
import { download, errorText, pickFile, plural, stamp } from './util';
import { StoreContext, UiContext, type ConfirmOptions, type UiApi } from './context';
import { SimRouter, SimRoutes } from './routes';
import { ConfirmDialog } from './dialogs/ConfirmDialog';
import { AddUsersDialog } from './dialogs/AddUsersDialog';
import { EditUserDialog } from './dialogs/EditUserDialog';
import { PeopleDialog } from './dialogs/PeopleDialog';
import { ScriptDialog } from './dialogs/ScriptDialog';

export interface ChatbotSimulatorProps extends SimulatorOptions {
  /** Called once with the controller (the same object mount() returns). */
  onReady?: (controller: Controller) => void;
  className?: string;
  style?: CSSProperties;
}

/** The simulator as a React component. Options are read once, when it mounts. */
export function ChatbotSimulator({ onReady, className, style, ...options }: ChatbotSimulatorProps) {
  const [store] = useState(() => new SimStore(options));
  return <SimulatorView store={store} onReady={onReady} className={className} style={style} />;
}

let instances = 0;

type Dialog = { kind: 'add'; pre: AddPreset } | { kind: 'edit' | 'targets'; user: User } | { kind: 'script' };

/** Renders a store (mount() creates the store itself so it can return the controller at once). */
export function SimulatorView({
  store,
  onReady,
  className,
  style,
}: {
  store: SimStore;
  onReady?: (c: Controller) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const [id] = useState(() => 'cbs-' + ++instances);
  const rootRef = useRef<HTMLDivElement>(null);
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);
  const [notes] = useState(createNotificationsStore);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [dialogKey, setDialogKey] = useState(0);
  const [asking, setAsking] = useState<{ o: ConfirmOptions; resolve: (r: { ok: boolean; checked: boolean }) => void } | null>(null);
  useSyncExternalStore(store.subscribe, store.getVersion);

  useEffect(() => {
    store.notify = (n) => {
      const data = {
        id: n.id,
        title: n.title,
        message: n.message,
        color: n.color,
        loading: n.loading,
        autoClose: n.autoClose ?? 5000,
        withCloseButton: true,
      };
      const known = n.id && [...notes.getState().notifications, ...notes.getState().queue].some((x) => x.id === n.id);
      if (known) updateNotification(data, notes);
      else showNotification(data, notes);
    };
    store.hideNotice = (nid) => {
      hideNotification(nid, notes);
    };
    store.start();
    onReady?.(store.controller);
    return () => store.stop();
    // onReady is only for the first mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, notes]);

  const a = store.profile.appearance;
  // Chat size as CSS variables (styles.css sizes chats from them)
  useLayoutEffect(() => {
    rootRef.current?.style.setProperty('--cbs-chat-w', a.chatWidth + 'px');
    rootRef.current?.style.setProperty('--cbs-chat-h', a.chatHeight + 'px');
  }, [a.chatWidth, a.chatHeight]);
  const theme = useMemo(() => buildTheme(a, portal), [a.accent, a.fontSize, portal]); // eslint-disable-line react-hooks/exhaustive-deps
  const tints = useMemo(() => darkTints(a.accent), [a.accent]);
  const scheme = store.theme;

  const confirm = useCallback(
    (o: ConfirmOptions) => new Promise<{ ok: boolean; checked: boolean }>((resolve) => setAsking({ o, resolve })),
    [],
  );

  const ui = useMemo<UiApi>(
    () => ({
      openAdd: (pre = {}) => setDialog({ kind: 'add', pre }),
      openEdit: (user) => setDialog({ kind: 'edit', user }),
      openTargets: (user) => setDialog({ kind: 'targets', user }),
      openScript: () => setDialog({ kind: 'script' }),
      confirm,
      exportFile: () => download('chatbot-sim-' + stamp() + '.json', store.exportJSON()),
      importFile: () =>
        pickFile(async (text, filename) => {
          try {
            const { next, unknown } = store.parseImport(text);
            const r = await confirm({
              title: 'Replace the Session?',
              message:
                'Replace the current ' +
                plural(store.session.users.length, 'user') +
                ' with ' +
                plural(next.users.length, 'user') +
                ' (profile "' +
                next.profile.name +
                '") from ' +
                filename +
                '?' +
                (unknown.length ? ' No adapter for type(s) ' + unknown.join(', ') + ': those users can be read but not used.' : ''),
              confirmLabel: 'Replace',
              danger: true,
            });
            if (r.ok) store.replaceSession(next);
          } catch (e) {
            store.notify({ title: 'Import Failed', message: errorText(e), color: 'red' });
          }
        }),
      clearAll: async () => {
        const r = await confirm({
          title: 'Remove Every User?',
          message: 'Remove all ' + plural(store.session.users.length, 'user') + ' and their messages. The profile and settings are kept.',
          confirmLabel: 'Remove all',
          danger: true,
        });
        if (r.ok) store.clearAll();
      },
      confirmRemove: async (user) => {
        const under = store.exclusiveUnder(user);
        const r = await confirm({
          title: 'Remove ' + user.name + '?',
          message: 'Their chat and links are removed too.',
          confirmLabel: 'Remove',
          danger: true,
          checkbox: under.length ? 'Also remove the ' + plural(under.length, 'user') + ' linked only under ' + user.name : undefined,
        });
        if (r.ok) store.removeUser(user, r.checked);
      },
      confirmClearChat: async (user) => {
        const r = await confirm({
          title: 'Clear the Chat of ' + user.name + '?',
          message: 'Their messages are removed; the user stays.',
          confirmLabel: 'Clear chat',
          danger: true,
        });
        if (r.ok) store.clearChat(user);
      },
    }),
    [store, confirm],
  );

  const close = () => setDialog(null);
  const onDialogError = (e: Error) => {
    setDialog(null);
    setAsking(null);
    setDialogKey((k) => k + 1);
    store.notify({ title: 'Something Went Wrong in That Dialog', message: e.message, color: 'red' });
  };
  // A dialog about a user closes if that user is gone (removed by a script, an import…).
  const live = dialog && 'user' in dialog ? core.findUser(store.session, dialog.user.id) : true;

  return (
    <div
      id={id}
      ref={rootRef}
      className={[
        'cbs-root',
        a.density === 'compact' && 'cbs-compact',
        a.layout === 'grid' && 'cbs-grid',
        a.bubbles === 'square' && 'cbs-square',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      dir={a.direction}
      data-mantine-color-scheme={scheme}
      style={style}
    >
      <DirectionProvider key={a.direction} initialDirection={a.direction} detectDirection={false}>
        <MantineProvider
          theme={theme}
          forceColorScheme={scheme}
          cssVariablesResolver={tints}
          cssVariablesSelector={'#' + id}
          getRootElement={() => rootRef.current ?? undefined}
        >
          <StoreContext.Provider value={store}>
            <UiContext.Provider value={ui}>
              <SimRouter routing={store.opts.routing}>
                <SimRoutes />
                <DialogBoundary key={dialogKey} onError={onDialogError}>
                  {dialog?.kind === 'add' && <AddUsersDialog pre={dialog.pre} onClose={close} />}
                  {dialog?.kind === 'edit' && live && <EditUserDialog user={dialog.user} onClose={close} />}
                  {dialog?.kind === 'targets' && live && <PeopleDialog user={dialog.user} onClose={close} />}
                  {dialog?.kind === 'script' && <ScriptDialog onClose={close} />}
                  {asking && (
                    <ConfirmDialog
                      {...asking.o}
                      onDone={(r) => {
                        asking.resolve(r);
                        setAsking(null);
                      }}
                    />
                  )}
                </DialogBoundary>
              </SimRouter>
            </UiContext.Provider>
          </StoreContext.Provider>
          <Notifications store={notes} position="bottom-right" zIndex={400} />
          <div ref={setPortal} className="cbs-portal" />
        </MantineProvider>
      </DirectionProvider>
    </div>
  );
}

/** A dialog that throws closes with a notification instead of blanking the whole simulator. */
class DialogBoundary extends Component<{ onError: (e: Error) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: Error) {
    this.props.onError(e);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
