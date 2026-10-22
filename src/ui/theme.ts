// The Mantine theme for one simulator, built from the profile's appearance.
import { alpha, createTheme, darken, lighten, type CSSVariablesResolver, type MantineColorsTuple } from '@mantine/core';
import type { Appearance } from '../types';

/** Ten shades around `hex`, which sits at index 6 (the shade buttons and bubbles use). */
export function shades(hex: string): MantineColorsTuple {
  const l = (t: number) => lighten(hex, t);
  const d = (t: number) => darken(hex, t);
  return [l(0.92), l(0.8), l(0.64), l(0.48), l(0.32), l(0.16), hex, d(0.14), d(0.28), d(0.42)];
}

export function buildTheme(a: Appearance, portalTarget: HTMLElement | null) {
  // Modals, menus, tooltips and notifications render inside the simulator's root, so its
  // color scheme and CSS variables apply and nothing leaks into the host page.
  const inRoot = portalTarget ? { target: portalTarget } : {};
  return createTheme({
    primaryColor: 'accent',
    colors: { accent: shades(a.accent) },
    primaryShade: { light: 6, dark: 6 },
    autoContrast: true,
    defaultRadius: 'md',
    scale: a.fontSize / 14,
    cursorType: 'pointer',
    components: {
      Portal: { defaultProps: inRoot },
      Tooltip: { defaultProps: { openDelay: 400, withArrow: true, arrowSize: 6, multiline: true, maw: 280 } },
      Modal: {
        defaultProps: { centered: true, radius: 'lg', padding: 'lg', overlayProps: { backgroundOpacity: 0.45, blur: 2 } },
        styles: { title: { fontWeight: 650, fontSize: 'var(--mantine-font-size-lg)' } },
      },
      Menu: { defaultProps: { shadow: 'lg', radius: 'md', position: 'bottom-end', withinPortal: true } },
      Popover: { defaultProps: { shadow: 'lg', radius: 'md' } },
      Badge: { defaultProps: { radius: 'sm' } },
    },
  });
}

/**
 * In dark mode Mantine tints "light" buttons, badges and icons with 15% of the accent itself;
 * a dark accent then turns into a near-black block with unreadable text. Use a lighter shade
 * for the tint and the text instead.
 */
export function darkTints(accent: string): CSSVariablesResolver {
  const s = shades(accent);
  const bg = alpha(s[4], 0.16);
  const hover = alpha(s[4], 0.24);
  const color = s[2];
  return () => ({
    variables: {},
    light: {},
    dark: {
      '--mantine-color-accent-light': bg,
      '--mantine-color-accent-light-hover': hover,
      '--mantine-color-accent-light-color': color,
      '--mantine-primary-color-light': bg,
      '--mantine-primary-color-light-hover': hover,
      '--mantine-primary-color-light-color': color,
    },
  });
}
