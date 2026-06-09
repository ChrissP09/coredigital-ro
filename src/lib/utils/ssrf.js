import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * Returns true if an IP literal falls in a private, loopback, link-local or
 * otherwise non-public range — i.e. something a user-supplied URL should never
 * be allowed to reach from our server.
 */
function ipIsPrivate(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    if (p[0] === 0) return true;                       // "this" network
    if (p[0] === 10) return true;                      // 10.0.0.0/8 private
    if (p[0] === 127) return true;                     // loopback
    if (p[0] === 169 && p[1] === 254) return true;     // link-local (cloud metadata)
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true; // 172.16.0.0/12
    if (p[0] === 192 && p[1] === 168) return true;     // 192.168.0.0/16
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT 100.64/10
    if (p[0] >= 224) return true;                      // multicast / reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;        // loopback / unspecified
    if (lower.startsWith('fe80')) return true;                // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
    if (mapped) return ipIsPrivate(mapped[1]);
    return false;
  }
  return true; // not a recognizable IP → block
}

/**
 * Throws if the hostname resolves to (or is) an internal address.
 * Use before any server-side fetch of a user-supplied URL to prevent SSRF.
 */
async function assertHostAllowed(hostname) {
  if (!hostname) throw new Error('Host invalid');
  const h = hostname.toLowerCase();

  if (h === 'localhost' || h.endsWith('.localhost') ||
      h.endsWith('.internal') || h.endsWith('.local')) {
    throw new Error('Adresă internă blocată');
  }

  if (net.isIP(h)) {
    if (ipIsPrivate(h)) throw new Error('Adresă IP internă blocată');
    return;
  }

  let addresses = [];
  try {
    addresses = (await dns.lookup(h, { all: true })).map((r) => r.address);
  } catch {
    throw new Error('Hostname nerezolvabil');
  }
  if (!addresses.length) throw new Error('Hostname nerezolvabil');

  for (const addr of addresses) {
    if (ipIsPrivate(addr)) throw new Error('Adresă internă blocată');
  }
}

export { assertHostAllowed, ipIsPrivate };
