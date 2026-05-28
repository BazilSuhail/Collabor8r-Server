// Lexicographic rank strings for manual ordering (base-36 midpoints).

export const INITIAL_RANK = 'm';

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

// Returns s with a < s < b. a '' is the lowest bound, b null the highest.
// Generated ranks never end in '0', so a lone '0' is never produced.
const midpoint = (a, b) => {
  if (b !== null) {
    let n = 0;
    while (n < a.length && n < b.length && a[n] === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const lo = a ? DIGITS.indexOf(a[0]) : -1;
  const hi = b === null ? DIGITS.length : DIGITS.indexOf(b[0]);
  if (hi - lo > 1) {
    const mid = Math.round((lo + hi) / 2);
    return mid > 0 ? DIGITS[mid] : `0${midpoint('', null)}`;
  }
  if (b !== null && b.length > 1) {
    return hi === 0 ? `0${midpoint('', b.slice(1))}` : b[0];
  }
  return DIGITS[lo] + midpoint(a.slice(1), null);
};

export const rankBetween = (prev, next) =>
  prev == null && next == null ? INITIAL_RANK : midpoint(prev ?? '', next ?? null);

export const rankAfter = (last) => (last == null ? INITIAL_RANK : midpoint(last, null));
