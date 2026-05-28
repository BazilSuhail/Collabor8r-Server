// Email-safe design tokens, mirroring the light palette in client/src/styles/shell.css.
// Plain hex strings only: email clients ignore CSS variables and mangle rgba alpha hex.
export const color = {
  brand: '#e4572e',
  brandSoft: '#fbe6dd',
  brandInk: '#ffffff',
  ink: '#1d1915',
  muted: '#6b645c',
  faint: '#978f86',
  surface: '#fffdfa',
  page: '#f3efe8',
  line: '#e9e2d8',
  success: '#0a7a63',
  successSoft: '#dcf1ea',
  warning: '#8f600a',
  warningSoft: '#f7ecd3',
  info: '#4a41c4',
  infoSoft: '#e5e3fa',
};

// Dark-mode surfaces for clients that honour prefers-color-scheme.
export const dark = {
  page: '#14110e',
  surface: '#1f1b17',
  ink: '#f3eee7',
  muted: '#b3aba1',
  faint: '#8a8279',
  line: '#3a332c',
  brandSoft: '#3a2219',
};

export const font = {
  sans: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif",
  mono: "ui-monospace,SFMono-Regular,Menlo,Consolas,'Courier New',monospace",
};

export const radius = { card: '14px', button: '10px', pill: '999px' };

export const size = { width: '560px', title: '26px', titleMobile: '22px', body: '15px', small: '12px' };

export const BRAND_NAME = 'Collabor8r';
