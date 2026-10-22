// The simulator's model without any UI: profiles, the session, links and groups, messages and
// reply routing, import/export and templates. Runs in the browser and in Node.
export {
  PRESETS,
  coerceField,
  defaultFields,
  fieldValues,
  fieldsFor,
  isFieldType,
  normalizeAppearance,
  normalizeProfile,
  preset,
  upgradePreset,
  relationDef,
  relationsFrom,
  relationsTo,
  roleDef,
  roleFits,
} from './profile';
export {
  VERSION,
  addrKey,
  createUser,
  emptySession,
  findByAddress,
  findUser,
  formatPattern,
  nextAddress,
  timeline,
  userInfo,
  type NewUser,
  type UserInfo,
} from './session';
export {
  exclusiveDescendants,
  groupRelation,
  groups,
  link,
  linkedUsers,
  linksOf,
  parentOf,
  relationFor,
  removeUser,
  rootOf,
  unlink,
  type Group,
} from './links';
export { addMessage, normalizeMessage, normalizeReply, replyList, routeReplies, type MessageBody, type Routed } from './messages';
export { exportSession, importSession, settingsFrom } from './io';
export { fillTemplate, getPath } from './template';
export { slug, uid } from './util';
