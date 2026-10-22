// Shared fixtures: adapter settings, send contexts the way the simulator builds them, and
// throwaway HTTP servers that close when the test ends.
import http from 'node:http';
import { onTestFinished } from 'vitest';
import * as core from '../src/core';
import type { Adapter, AdapterSettings, OutgoingMessage, Reply, SendContext, Session, User } from '../src/types';

type Settings = AdapterSettings;

/** The adapter's defaults, with some overridden. */
export function settingsOf(adapter: Adapter, over: Settings = {}): Settings {
  const s: Settings = {};
  for (const f of adapter.settingsFields || []) s[f.key] = f.default ?? '';
  return { ...s, ...over };
}

/** What a user did, as the adapter sees it; id and kind are filled in when left out. */
export function outgoing(m: Partial<OutgoingMessage>): OutgoingMessage {
  const kind = m.contacts ? 'contacts' : m.buttonId != null ? 'button' : 'text';
  return { id: core.uid('m'), kind, targets: [], ...m };
}

export function sendContext(session: Session, user: User, message: Partial<OutgoingMessage>, settings: Settings): SendContext {
  return {
    user,
    message: outgoing(message),
    settings,
    session,
    profile: session.profile,
    parent: core.parentOf(session, user),
    root: core.rootOf(session, user),
    links: core.linksOf(session, user.id),
  };
}

/** Send as `user` and return the replies as a list. */
export async function send(
  adapter: Adapter,
  session: Session,
  user: User,
  message: Partial<OutgoingMessage>,
  settings: Settings,
): Promise<Reply[]> {
  return core.replyList(await adapter.send(sendContext(session, user, message, settings)));
}

/** The text of a user's message (negative counts from the end); '' when there is none. */
export const textAt = (user: User, i: number) => user.messages.at(i)?.text ?? '';

/** Start `server` on a free port; it closes when the test ends. Returns its base URL. */
export async function listen(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  onTestFinished(() => {
    server.close();
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('server is not listening on a port');
  return 'http://127.0.0.1:' + addr.port;
}

/** A server that records the last JSON body it got and answers with `reply`. */
export async function recordingServer(reply = '{}') {
  const seen: { body?: Record<string, unknown> } = {};
  const server = http.createServer((req, res) => {
    let b = '';
    req.on('data', (c) => {
      b += c;
    });
    req.on('end', () => {
      seen.body = JSON.parse(b);
      res.end(reply);
    });
  });
  return { url: await listen(server), seen };
}
