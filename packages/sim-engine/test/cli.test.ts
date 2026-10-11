import { describe, expect, it } from 'vitest';
import { buildNetwork, getDevice, iosPrompt, ping, runHost, runIos, type IosSession } from '../src';
import { twoLans, vlanOffice } from './fixtures';

function session(deviceId: string): IosSession {
  return { deviceId, mode: 'user' };
}

function run(net: ReturnType<typeof buildNetwork>, s: IosSession, lines: string[]): string[] {
  return lines.map((l) => runIos(net, s, l).output);
}

describe('IOS CLI', () => {
  it('moves between modes with abbreviations', () => {
    const net = buildNetwork(twoLans(false));
    const s = session('r1');
    expect(iosPrompt(net, s)).toBe('Router1>');
    run(net, s, ['en', 'conf t', 'int g0/0']);
    expect(iosPrompt(net, s)).toBe('Router1(config-if)#');
    run(net, s, ['end']);
    expect(s.mode).toBe('priv');
  });

  it('configures a router so pings succeed', () => {
    const net = buildNetwork(twoLans(false));
    const s = session('r1');
    const out = run(net, s, ['enable', 'configure terminal', 'interface GigabitEthernet 0/0', 'no shutdown', 'int g0/1', 'no shut', 'end']);
    expect(out[3]).toMatch(/changed state to up/);
    expect(ping(net, 'pc1', '192.168.2.10', { count: 1 }).results[0].status).toBe('success');
    const brief = runIos(net, s, 'show ip interface brief').output;
    expect(brief).toMatch(/GigabitEthernet0\/0\s+192\.168\.1\.1\s+YES manual up\s+up/);
    expect(runIos(net, s, 'sh ip ro').output).toMatch(/C\s+192\.168\.2\.0\/24 is directly connected, GigabitEthernet0\/1/);
  });

  it('rejects invalid and ambiguous input', () => {
    const net = buildNetwork(twoLans(true));
    const s = session('r1');
    runIos(net, s, 'enable');
    expect(runIos(net, s, 'show ip blah').output).toMatch(/Invalid input/);
    expect(runIos(net, s, 'c').output).toMatch(/Ambiguous/); // configure / clear
    expect(runIos(net, s, 'show ip').output).toMatch(/Incomplete/);
    expect(runIos(net, s, 'show vlan').output).toMatch(/Invalid input/); // not a switch
  });

  it('configures VLANs and ports on a switch', () => {
    const net = buildNetwork(vlanOffice());
    const s = session('sw2');
    const out = run(net, s, ['en', 'conf t', 'vlan 30', 'name VOICE', 'int fa0/3', 'switchport mode access', 'switchport access vlan 40', 'do show vlan brief']);
    expect(out[6]).toMatch(/Creating vlan 40/);
    expect(out[7]).toMatch(/30\s+VOICE/);
    expect(out[7]).toMatch(/40\s+VLAN0040\s+active\s+Fa0\/3/);
    const sw = getDevice(net, 'sw2');
    expect(sw.interfaces.find((i) => i.name === 'Fa0/3')!.switchport!.accessVlan).toBe(40);
  });

  it('sets trunk allowed lists', () => {
    const net = buildNetwork(vlanOffice());
    const s = session('sw1');
    run(net, s, ['en', 'conf t', 'int g0/1', 'switchport trunk allowed vlan 10', 'end']);
    expect(ping(net, 'pcB', '10.20.0.11', { count: 1 }).results[0].status).toBe('timeout');
    expect(runIos(net, s, 'show interfaces trunk').output).toMatch(/Gi0\/1\s+10/);
  });

  it('creates router-on-a-stick sub-interfaces from the CLI', () => {
    const net = buildNetwork(vlanOffice({ router: false }));
    // add a router through the engine and cable it
    const spec = vlanOffice();
    const full = buildNetwork(spec);
    const r = full.devices.find((d) => d.id === 'r1')!;
    r.interfaces = r.interfaces.filter((i) => !i.parent);
    r.interfaces.forEach((i) => (i.adminUp = false));
    const s = session('r1');
    const out = run(full, s, [
      'en', 'conf t', 'int g0/0', 'no shut',
      'int g0/0.10', 'encapsulation dot1Q 10', 'ip address 10.10.0.1 255.255.255.0',
      'int g0/0.20', 'encap dot1q 20', 'ip add 10.20.0.1 255.255.255.0', 'end',
    ]);
    expect(out.join('\n')).not.toMatch(/Invalid/);
    expect(iosPrompt(full, s)).toBe('Router1#');
    expect(ping(full, 'pcA', '10.20.0.11', { count: 1 }).results[0].status).toBe('success');
    expect(net.devices.length).toBe(6);
  });

  it('adds static routes and validates network/mask consistency', () => {
    const net = buildNetwork(twoLans(true));
    const s = session('r1');
    run(net, s, ['en', 'conf t']);
    expect(runIos(net, s, 'ip route 10.1.1.0 255.255.0.0 192.168.1.2').output).toMatch(/Inconsistent/);
    expect(runIos(net, s, 'ip route 10.1.0.0 255.255.0.0 192.168.1.2').output).toBe('');
    expect(runIos(net, s, 'do show ip route').output).toMatch(/S\s+10\.1\.0\.0\/16 \[1\/0\] via 192\.168\.1\.2/);
  });

  it('host shell: ipconfig, ping, arp', () => {
    const net = buildNetwork(twoLans(true));
    expect(runHost(net, 'pc1', 'ipconfig').output).toMatch(/Default Gateway\.+: 192\.168\.1\.1/);
    const p = runHost(net, 'pc1', 'ping 192.168.2.10');
    expect(p.output).toMatch(/Received = 4, Lost = 0/);
    expect(p.events!.length).toBeGreaterThan(5);
    expect(runHost(net, 'pc1', 'arp -a').output).toMatch(/192\.168\.1\.1/);
    expect(runHost(net, 'pc1', 'tracert 192.168.2.10').output).toMatch(/1\s+192\.168\.1\.1[\s\S]*2\s+192\.168\.2\.10/);
    const bad = runHost(net, 'pc1', 'ping 192.168.3.3');
    expect(bad.output).toMatch(/Why:/);
  });
});
