// Multi-User Chatbot Simulator: the React component, mount() for any page, the core model,
// scripts and the bundled adapters. The stylesheet is "multi-user-chatbot-simulator/style.css".
import './ui/styles.css';

export { ChatbotSimulator, type ChatbotSimulatorProps } from './ui/Simulator';
export { mount } from './ui/mount';
export * as core from './core';
export * as script from './script';
export { default as demo } from './adapters/demo';
export { default as httpJson } from './adapters/http-json';
export * from './types';
