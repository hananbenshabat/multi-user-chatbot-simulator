// Small helpers shared by the UI components.

export const plural = (n: number, word: string) => n + ' ' + word + (n === 1 ? '' : 's');

/** First letter upper-case (for profile wording used in titles, e.g. "user" → "User"). */
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The message of anything thrown. */
export { errorText } from '../core/util';

/** A sortable timestamp for file names: 202610221830. */
export function stamp() {
  return new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
}

/** Save `text` as a JSON file. */
export function download(filename: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = filename;
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}

/** Ask for a JSON file and hand over its text. */
export function pickFile(onText: (text: string, name: string) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener(
    'change',
    async () => {
      const f = input.files?.[0];
      if (f) onText(await f.text(), f.name);
    },
    { once: true },
  );
  input.click();
}
