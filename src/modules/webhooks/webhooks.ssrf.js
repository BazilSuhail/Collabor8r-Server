import dns from 'node:dns/promises';
import net from 'node:net';
import { env } from '../../config/env.js';

// Returns true when an IP literal is loopback, private, link-local, unique-local, unspecified or otherwise non-public.
export function isBlockedIp(ip) {
  const v = net.isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      a >= 224 // multicast / reserved / broadcast
    );
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s === '::' || s === '::1') return true;
    const mapped = s.match(/^::ffff:(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/);
    if (mapped) {
      if (mapped[1]) return isBlockedIp(mapped[1]);
      const hi = parseInt(mapped[2], 16);
      const lo = parseInt(mapped[3], 16);
      return isBlockedIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    const first = parseInt(s.split(':')[0] || '0', 16);
    return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00; // fc00::/7, fe80::/10, ff00::/8
  }
  return true;
}

// Synchronous checks that need no DNS: scheme and literal hostnames. Returns an error string or null.
export function checkWebhookUrlSyntax(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return 'Invalid URL';
  }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && !env.isProd)) {
    return env.isProd ? 'Webhook URL must use https' : 'Webhook URL must use http or https';
  }
  if (u.username || u.password) return 'Webhook URL must not contain credentials';
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return 'Webhook URL host is not allowed';
  if (net.isIP(host) && isBlockedIp(host)) return 'Webhook URL host is not allowed';
  return null;
}

// Full check including DNS resolution of every address the host maps to. Throws Error with a generic message.
export async function assertSafeWebhookUrl(raw) {
  const err = checkWebhookUrlSyntax(raw);
  if (err) throw new Error(err);
  const host = new URL(raw).hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) return;
  let addrs;
  try {
    addrs = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error('Webhook URL host could not be resolved');
  }
  if (!addrs.length || addrs.some((a) => isBlockedIp(a.address))) throw new Error('Webhook URL host is not allowed');
}
