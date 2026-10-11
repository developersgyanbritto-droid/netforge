// Windows-like command prompt for simulated end hosts.
import type { Network } from '../types';
import type { CliResult } from './ios';
import { getDevice } from '../network';
import { isValidIp, prefixToMask } from '../ip';
import { ping, traceroute } from '../sim';

const HELP = `Available commands:
  ipconfig            Show IP configuration
  ipconfig /all       Show IP configuration including MAC address
  ping <ip> [-n N]    Test reachability (default 4 echo requests)
  tracert <ip>        Show the routers on the path to a destination
  arp -a              Show the ARP cache (IP → MAC mappings learned)
  arp -d              Clear the ARP cache
  help                Show this help`;

export function hostPrompt(net: Network, deviceId: string): string {
  return `C:\\${getDevice(net, deviceId).name}>`;
}

/** Executes one host shell line. MUTATES `net`. */
export function runHost(net: Network, deviceId: string, raw: string): CliResult {
  const dev = getDevice(net, deviceId);
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { output: '', changed: false };
  const cmd = parts[0].toLowerCase();
  const nic = dev.interfaces[0];

  if (cmd === 'help' || cmd === '?') return { output: HELP, changed: false };

  if (cmd === 'ipconfig') {
    const all = parts[1]?.toLowerCase() === '/all';
    const lines = ['', `${nic.name === 'Fa0' ? 'FastEthernet0' : nic.name} Connection:(default port)`, ''];
    if (all) lines.push(`   Physical Address................: ${nic.mac.replace(/\./g, '').match(/.{2}/g)!.join('-').toUpperCase()}`);
    lines.push(
      `   IPv4 Address....................: ${nic.ip ?? '0.0.0.0'}`,
      `   Subnet Mask.....................: ${nic.prefix !== undefined ? prefixToMask(nic.prefix) : '0.0.0.0'}`,
      `   Default Gateway.................: ${dev.gateway ?? '0.0.0.0'}`,
    );
    return { output: lines.join('\n'), changed: false };
  }

  if (cmd === 'arp') {
    const flag = parts[1]?.toLowerCase();
    if (flag === '-d') {
      dev.arp = [];
      return { output: 'ARP cache cleared.', changed: true };
    }
    if (flag === '-a') {
      if (!dev.arp?.length) return { output: 'No ARP Entries Found', changed: false };
      const lines = [`  Internet Address      Physical Address      Type`];
      for (const e of dev.arp) lines.push(`  ${e.ip.padEnd(22)}${e.mac.padEnd(22)}dynamic`);
      return { output: lines.join('\n'), changed: false };
    }
    return { output: 'Usage: arp -a | arp -d', changed: false };
  }

  if (cmd === 'ping') {
    const ip = parts[1];
    if (!ip || !isValidIp(ip)) return { output: 'Usage: ping <IPv4 address> [-n count]', changed: false };
    const nIdx = parts.findIndex((p) => p.toLowerCase() === '-n');
    const count = nIdx > 0 ? Math.min(Math.max(Number(parts[nIdx + 1]) || 4, 1), 10) : 4;
    const out = ping(net, dev.id, ip, { count });
    const lines = ['', `Pinging ${ip} with 32 bytes of data:`, ''];
    for (const r of out.results) {
      if (r.status === 'success') lines.push(`Reply from ${ip}: bytes=32 TTL=${64 - (r.hops ?? 0)}`);
      else if (r.status === 'unreachable') lines.push(`Reply from ${r.from}: Destination host unreachable.`);
      else if (r.status === 'ttl-exceeded') lines.push(`Reply from ${r.from}: TTL expired in transit.`);
      else if (r.status === 'error') lines.push('PING: transmit failed. General failure.');
      else lines.push('Request timed out.');
    }
    const ok = out.results.filter((r) => r.status === 'success').length;
    const sent = out.results.length;
    lines.push('', `Ping statistics for ${ip}:`, `    Packets: Sent = ${sent}, Received = ${ok}, Lost = ${sent - ok} (${Math.round(((sent - ok) / sent) * 100)}% loss)`);
    const fail = out.results.find((r) => r.status !== 'success');
    if (fail?.reason) lines.push('', `[NetForge] Why: ${fail.reason}`);
    return { output: lines.join('\n'), changed: true, events: out.events };
  }

  if (cmd === 'tracert' || cmd === 'traceroute') {
    const ip = parts[1];
    if (!ip || !isValidIp(ip)) return { output: 'Usage: tracert <IPv4 address>', changed: false };
    const out = traceroute(net, dev.id, ip);
    const lines = ['', `Tracing route to ${ip} over a maximum of 15 hops:`, ''];
    for (const h of out.hops) {
      if (h.status === 'timeout') lines.push(`  ${String(h.ttl).padStart(2)}     *        *        *     Request timed out.`);
      else if (h.status === 'unreachable') lines.push(`  ${String(h.ttl).padStart(2)}     ${h.ip ?? ''}  reports: Destination host unreachable.`);
      else lines.push(`  ${String(h.ttl).padStart(2)}     ${h.ip}`);
    }
    lines.push('', out.reached ? 'Trace complete.' : 'Trace did not reach the destination.');
    return { output: lines.join('\n'), changed: true, events: out.events };
  }

  return { output: `'${parts[0]}' is not recognized as a command. Type "help" for the list of commands.`, changed: false };
}
