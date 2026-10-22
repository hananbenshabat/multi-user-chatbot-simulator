// The one-file build (dist/chatbot-sim.js) for plain pages. It sets the globals earlier
// versions had: ChatbotSim (mount), ChatbotSimCore, ChatbotSimScript, ChatbotSimAdapters.
import './ui/styles.css';
import { mount } from './ui/mount';
import * as core from './core';
import * as script from './script';
import demo from './adapters/demo';
import httpJson from './adapters/http-json';

export const adapters = { demo, httpJson };

declare global {
  var ChatbotSimCore: typeof core;
  var ChatbotSimScript: typeof script;
  var ChatbotSimAdapters: typeof adapters;
}

globalThis.ChatbotSimCore = core;
globalThis.ChatbotSimScript = script;
globalThis.ChatbotSimAdapters = adapters;

export { mount, core, script };
