// Types for echo-server.mjs (it stays plain JS so `node examples/echo-server.mjs` runs anywhere).
import type { Server } from 'node:http';

export interface EchoState {
  children: Map<string, Set<string>>;
  queue: unknown[];
  seen: Set<string>;
}

export function createState(): EchoState;
export function handleChat(state: EchoState, message: Record<string, unknown>): unknown[];
export function createServer(state?: EchoState): Server;
