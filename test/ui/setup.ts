import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library cleans up between tests only when test globals exist; Vitest's are off.
afterEach(cleanup);

// happy-dom has no FontFaceSet; Mantine's autosize textarea listens on document.fonts.
if (!('fonts' in document)) {
  Object.defineProperty(document, 'fonts', { value: new EventTarget() });
}
