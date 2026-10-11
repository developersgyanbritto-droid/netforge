import type { ModuleDef } from '../schema';
import type { TopologySpec } from '@netforge/sim-engine';
import { challenge, check, info, lab, lesson, multi, quiz, realWorld, single, steps, table, term, text, textQ, tip, topo, warn } from '../helpers';
import { twoLans, twoSites } from '../topologies';

const threeRouters: TopologySpec = {
  devices: [
    { id: 'pc1', kind: 'pc', x: 20, y: 260, ip: '10.1.1.10/24', gateway: '10.1.1.1' },
    { id: 'r1', kind: 'router', x: 120, y: 80, interfaces: { 'Gi0/0': { ip: '10.1.1.1/24', up: true }, 'Gi0/1': { ip: '172.16.12.1/30', up: true } }, routes: ['0.0.0.0/0 via 172.16.12.2'] },
    { id: 'r2', kind: 'router', x: 320, y: 80, interfaces: { 'Gi0/0': { ip: '172.16.23.1/30', up: true }, 'Gi0/1': { ip: '172.16.12.2/30', up: true } }, routes: ['10.1.1.0/24 via 172.16.12.1', '10.3.3.0/24 via 172.16.23.2'] },
    { id: 'r3', kind: 'router', x: 520, y: 80, interfaces: { 'Gi0/0': { ip: '10.3.3.1/24', up: true }, 'Gi0/1': { ip: '172.16.23.2/30', up: true } }, routes: ['0.0.0.0/0 via 172.16.23.1'] },
    { id: 'srv1', kind: 'server', x: 620, y: 260, ip: '10.3.3.100/24', gateway: '10.3.3.1' },
  ],
  links: [['pc1', 'Fa0', 'r1', 'Gi0/0'], ['r1', 'Gi0/1', 'r2', 'Gi0/1'], ['r2', 'Gi0/0', 'r3', 'Gi0/1'], ['r3', 'Gi0/0', 'srv1', 'Fa0']],
};

export const routing: ModuleDef = {
  slug: 'routing',
  track: 'core',
  title: 'Routing Fundamentals',
  summary: 'Routing tables, longest-prefix match, static and default routes, TTL and traceroute.',
  level: 6,
  prerequisites: ['subnetting'],
  activities: [
    lesson('what-routers-do', 'What routers do', 'Connecting networks and choosing paths.', 8, ['routing-concepts'],
      ['Describe the forwarding process of a router'],
      [
        steps([
          ['Receive', 'A frame arrives addressed to the router\'s MAC. The router strips the Ethernet header.'],
          ['Look up', 'It reads the destination IP and finds the best match in its routing table.'],
          ['Decrement TTL', 'TTL − 1. If it reaches 0 the packet is dropped and an ICMP Time Exceeded is sent back.'],
          ['Resolve next hop', 'ARP for the next-hop (or final host) MAC on the exit interface.'],
          ['Re-encapsulate & send', 'A brand-new frame with new MAC addresses carries the same IP packet onward.'],
        ], 'Router forwarding, step by step'),
        topo(twoLans(), 'Ping across the router and read every "route" and "info" event at Router1: lookup, TTL decrement, new frame.', [{ label: 'PC1 → Server', from: 'pc1', to: '192.168.2.100' }]),
        check('What does a router do when no route matches a destination and there is no default route?', ['Floods the packet', 'Drops it (and may send ICMP unreachable)', 'Sends it back to the source', 'Broadcasts it'], 1, 'Routers never flood. No route = drop.'),
      ], 2),
    lesson('routing-table', 'Reading a routing table', 'C, L, S and the longest prefix match.', 10, ['routing-concepts'],
      ['Interpret routing table codes', 'Apply longest-prefix match'],
      [
        text('```\nCodes: L - local, C - connected, S - static, * - candidate default\n\nGateway of last resort is 172.16.12.2 to network 0.0.0.0\n\nS*       0.0.0.0/0 [1/0] via 172.16.12.2\nC        10.1.1.0/24 is directly connected, GigabitEthernet0/0\nL        10.1.1.1/32 is directly connected, GigabitEthernet0/0\nS        10.2.0.0/16 [1/0] via 172.16.12.2\nC        172.16.12.0/30 is directly connected, GigabitEthernet0/1\n```'),
        table(['Code', 'Meaning', 'Admin distance'], [
          ['C', 'Connected network on an up interface with an IP', '0'],
          ['L', 'The router\'s own address (/32)', '0'],
          ['S', 'Static route configured by an admin', '1'],
          ['S*', 'Static default route (0.0.0.0/0)', '1'],
        ]),
        term('Longest prefix match', 'When several routes match a destination, the router uses the most specific one (the longest prefix). 10.2.5.9 matches both 10.2.0.0/16 and 0.0.0.0/0 — the /16 wins.'),
        term('Administrative distance', 'How trustworthy a route source is; lower is preferred when two sources offer the same prefix.', 'AD'),
        check('Destination 10.2.200.1 with the table above. Which route is used?', ['0.0.0.0/0', '10.1.1.0/24', '10.2.0.0/16', '172.16.12.0/30'], 2, '/16 is longer than /0 and matches 10.2.x.x.'),
      ], 2),
    lesson('static-routes', 'Static routes', 'Teaching a router about remote networks.', 10, ['static-routing', 'cli'],
      ['Write a static route', 'Explain why return routes are needed'],
      [
        text('Routers automatically know their **connected** networks. For anything else you must add a route (statically or via a routing protocol).\n\n```\nRouter(config)# ip route <destination-network> <mask> <next-hop-ip>\nRouter(config)# ip route 10.2.2.0 255.255.255.0 172.16.12.2\n```'),
        warn('Communication is two-way. If HQ has a route to the branch but the branch has no route back, pings still fail — the reply has nowhere to go.'),
        topo(twoSites({ r1Routes: ['10.2.2.0/24 via 172.16.12.2'] }), 'HQ-R knows about the branch, but Branch-R does not know about HQ. Run the ping and find where the reply dies.', [{ label: 'HQ-PC → Branch-PC', from: 'pc1', to: '10.2.2.10' }]),
        check('The echo request reaches Branch-PC, but no reply returns. What is missing?', ['A route on HQ-R to 10.2.2.0/24', 'A route on Branch-R to 10.1.1.0/24', 'A switch VLAN', 'A DNS server'], 1, 'The reply is addressed to 10.1.1.10; Branch-R needs a route to that network.'),
      ], 3),
    lesson('default-routes', 'Default routes', 'The route of last resort.', 7, ['static-routing'],
      ['Configure and explain a default route'],
      [
        text('A **default route** (0.0.0.0/0) matches every destination. It is used only when nothing more specific matches — perfect for a branch router with a single uplink, or an edge router pointing at the ISP.\n\n```\nRouter(config)# ip route 0.0.0.0 0.0.0.0 172.16.12.1\n```'),
        realWorld('Almost every home router has exactly one meaningful route: a default route towards the ISP.'),
        topo(twoSites({ r1Routes: ['10.2.2.0/24 via 172.16.12.2'], r2Routes: ['0.0.0.0/0 via 172.16.12.1'] }), 'Branch-R now has a default route pointing back to HQ. Ping again — both directions work.', [{ label: 'HQ-PC → Branch-PC', from: 'pc1', to: '10.2.2.10' }]),
        check('Which route matches 8.8.8.8 if the table has 10.0.0.0/8, 192.168.0.0/16 and 0.0.0.0/0?', ['10.0.0.0/8', '192.168.0.0/16', '0.0.0.0/0', 'None'], 2, 'Only the default route matches.'),
      ], 2),
    lesson('ttl-traceroute', 'TTL and traceroute', 'How we discover the path packets take.', 8, ['routing-concepts', 'troubleshooting'],
      ['Explain how traceroute uses TTL'],
      [
        text('Every IP packet carries a **TTL** (time to live). Each router decrements it; at 0 the packet is discarded and the router returns **ICMP Time Exceeded**. This prevents routing loops from circulating packets forever.\n\n**Traceroute** exploits this: it sends probes with TTL 1, 2, 3… Each router that drops a probe reveals itself.'),
        topo(threeRouters, 'Open PC1\'s terminal and type `tracert 10.3.3.100`. You should see three hops: R1, R2, then the server via R3.', [{ label: 'PC1 → Server (3 routers)', from: 'pc1', to: '10.3.3.100' }], 'Three routers in a line'),
        tip('Hops listed in traceroute are the addresses of the router interfaces facing back toward you.'),
        check('A packet leaves a host with TTL 64 and crosses 3 routers. What is the TTL when it reaches the destination?', ['64', '63', '61', '3'], 2, '64 − 3 = 61.'),
      ], 2),
    lab('router-basics-lab', 'Bring a router online', 'Configure interfaces from the CLI and enable them.', 15, ['cli', 'routing-concepts'], {
      scenario: 'A new router connects two LANs. The hosts are already configured (gateways .1). The router is fresh out of the box: no IP addresses and all interfaces shut down.',
      objective: 'Hosts in both LANs can reach each other through Router1.',
      spec: twoLans({ routerUp: false, routerIps: false }),
      tasks: [
        { id: 'g0', title: 'Configure Gi0/0 as 192.168.1.1/24 and enable it', checks: [{ type: 'interfaceIp', device: 'r1', iface: 'Gi0/0', ip: '192.168.1.1/24' }, { type: 'interfaceUp', device: 'r1', iface: 'Gi0/0' }] },
        { id: 'g1', title: 'Configure Gi0/1 as 192.168.2.1/24 and enable it', checks: [{ type: 'interfaceIp', device: 'r1', iface: 'Gi0/1', ip: '192.168.2.1/24' }, { type: 'interfaceUp', device: 'r1', iface: 'Gi0/1' }] },
        { id: 'verify', title: 'Verify', checks: [{ type: 'routeExists', device: 'r1', network: '192.168.2.0/24' }, { type: 'pingMatrix' }] },
      ],
      hints: [
        'Open Router1\'s terminal: `enable` → `configure terminal` → `interface g0/0`.',
        '`ip address 192.168.1.1 255.255.255.0` then `no shutdown`. Repeat for g0/1.',
        'Use `do show ip interface brief` to check status and `do show ip route` for connected routes.',
      ],
      concepts: ['IOS modes', 'Interfaces start shut down', 'Connected routes'],
      debrief: 'Once each interface had an address and was up, the router installed two connected routes (C) automatically. No static routes are needed when all networks are directly connected.',
    }, 2),
    lab('static-routing-lab', 'Connect two sites with static routes', 'Make HQ and Branch reach each other.', 18, ['static-routing', 'cli'], {
      scenario: 'HQ (10.1.1.0/24) and Branch (10.2.2.0/24) are connected by a point-to-point link 172.16.12.0/30. Interfaces are configured but neither router knows about the other\'s LAN.',
      objective: 'HQ-PC and Branch-PC can reach each other.',
      spec: twoSites(),
      tasks: [
        { id: 'hq', title: 'HQ-R has a route to the branch LAN', checks: [{ type: 'routeExists', device: 'r1', network: '10.2.2.0/24', nextHop: '172.16.12.2' }] },
        { id: 'br', title: 'Branch-R has a route back to HQ', description: 'A specific route or a default route both work.', checks: [{ type: 'ping', from: 'r2', to: '10.1.1.10' }] },
        { id: 'e2e', title: 'End-to-end connectivity', checks: [{ type: 'ping', from: 'pc1', to: 'pc2' }, { type: 'ping', from: 'pc2', to: 'pc1' }] },
      ],
      hints: ['The next hop is the OTHER router\'s address on the /30 link.', 'On HQ-R: `ip route 10.2.2.0 255.255.255.0 172.16.12.2`.', 'On Branch-R: `ip route 10.1.1.0 255.255.255.0 172.16.12.1` (or a default route).'],
      concepts: ['Static routes', 'Next hop', 'Return path'],
      debrief: 'Routing must work in both directions. Check `show ip route` on each router: the S entries are your work.',
    }, 3),
    lab('default-route-lab', 'Stub network with a default route', 'Use one route to reach everything.', 12, ['static-routing'], {
      scenario: 'A chain of three routers connects PC1 to a server. R2 in the middle already has routes. R1 and R3 are stub routers with a single uplink — configure each with the simplest possible routing.',
      objective: 'PC1 reaches the server using default routes on the stub routers.',
      spec: { ...threeRouters, devices: threeRouters.devices.map((d) => (d.id === 'r1' || d.id === 'r3' ? { ...d, routes: [] } : d)) },
      tasks: [
        { id: 'r1', title: 'R1 has a default route', checks: [{ type: 'routeExists', device: 'r1', network: '0.0.0.0/0', nextHop: '172.16.12.2' }] },
        { id: 'r3', title: 'R3 has a default route', checks: [{ type: 'routeExists', device: 'r3', network: '0.0.0.0/0', nextHop: '172.16.23.1' }] },
        { id: 'e2e', title: 'PC1 reaches the server', checks: [{ type: 'ping', from: 'pc1', to: 'srv1' }] },
      ],
      hints: ['A default route is `ip route 0.0.0.0 0.0.0.0 <next-hop>`.', 'R1\'s only neighbour is R2 at 172.16.12.2; R3\'s is R2 at 172.16.23.1.'],
      concepts: ['Default route', 'Stub networks'],
      debrief: 'Stub routers rarely need more than one route. The core router (R2) holds the specific routes.',
    }, 2),
    challenge('missing-route-challenge', 'Troubleshoot: one-way traffic', 'The branch can\'t reach the head office server.', 15, ['static-routing', 'troubleshooting'], {
      scenario: 'Since a router replacement last night, nobody at the branch can reach HQ. HQ staff say "the branch router answers our pings, so the WAN is fine". Find and fix the fault.',
      objective: 'Full connectivity between HQ and Branch.',
      spec: twoSites({ r1Routes: ['10.2.2.0/24 via 172.16.12.2'], r2Routes: ['10.1.1.0/24 via 172.16.12.3'] }),
      tasks: [{ id: 'fix', title: 'HQ-PC and Branch-PC can reach each other', checks: [{ type: 'ping', from: 'pc2', to: 'pc1' }, { type: 'ping', from: 'pc1', to: 'pc2' }] }],
      hints: ['Run `show ip route` on both routers and compare each next hop with the addresses actually configured on the link.', 'Branch-R\'s route points to a next hop that no device owns on the /30 link. Ping from Branch-PC and read the event log.'],
      concepts: ['Next-hop validity', '/30 addressing', 'ARP for the next hop'],
      debrief: '172.16.12.3 is the broadcast address of 172.16.12.0/30 — not HQ-R\'s address (.1). The route looked valid, but Branch-R\'s ARP requests for that next hop were never answered, so every packet towards HQ was discarded. Pinging Branch-R from HQ-R still worked because both ends of that test sit on the connected /30 — a ping that succeeds between routers does not prove the LANs can reach each other.',
    }, 3),
    quiz('static-route-quiz', 'Static route syntax drill', 'Read and write route commands.', ['static-routing', 'cli'], [
      textQ('q1', 'Write the command (config mode) for a default route via 203.0.113.1.', ['ip route 0.0.0.0 0.0.0.0 203.0.113.1'], 'Network 0.0.0.0 with mask 0.0.0.0.'),
      single('q2', 'What does "[1/0]" mean in a static route entry?', ['Hop count 1, cost 0', 'Administrative distance 1, metric 0', 'VLAN 1, port 0', 'Priority 1'], 1, '[AD/metric].'),
      single('q3', 'Which command shows the routing table?', ['show ip interface brief', 'show ip route', 'show running-config', 'show vlan'], 1, '`show ip route`.'),
      single('q4', 'A static route\'s next hop must be…', ['Any IP on the Internet', 'Reachable through a connected network', 'The router\'s own IP', 'A broadcast address'], 1, 'Otherwise the route cannot be resolved and is not installed.'),
    ]),
    quiz('routing-checkpoint', 'Routing checkpoint', 'Tables, matching and TTL.', ['routing-concepts', 'static-routing'], [
      single('q1', 'A router has 10.0.0.0/8 and 10.1.0.0/16 routes. Destination 10.1.5.5 uses…', ['10.0.0.0/8', '10.1.0.0/16', 'Both alternately', 'Neither'], 1, 'Longest prefix match.'),
      single('q2', 'Which entry appears automatically when an interface with an IP comes up?', ['S', 'C (and L)', 'S*', 'O'], 1, 'Connected and local routes.'),
      single('q3', 'What happens when TTL reaches 0 at a router?', ['Forwarded anyway', 'Dropped and ICMP Time Exceeded sent to the source', 'Reset to 64', 'Broadcast'], 1, 'This is the mechanism traceroute relies on.'),
      multi('q4', 'Which change at each router hop?', ['TTL', 'Source MAC', 'Destination IP', 'Destination MAC'], [0, 1, 3], 'The IP addresses stay the same (without NAT).'),
      textQ('q5', 'Admin distance of a static route?', ['1'], 'Static = 1, connected = 0.'),
    ], { checkpoint: true }),
  ],
};

const vlanLabSpec: TopologySpec = {
  devices: [
    { id: 'sw1', kind: 'switch', x: 300, y: 80 },
    { id: 'pc1', kind: 'pc', name: 'Sales-1', x: 40, y: 280, ip: '192.168.10.11/24' },
    { id: 'pc2', kind: 'pc', name: 'Sales-2', x: 200, y: 280, ip: '192.168.10.12/24' },
    { id: 'pc3', kind: 'pc', name: 'Eng-1', x: 400, y: 280, ip: '192.168.10.21/24' },
    { id: 'pc4', kind: 'pc', name: 'Eng-2', x: 560, y: 280, ip: '192.168.10.22/24' },
  ],
  links: [['pc1', 'Fa0', 'sw1', 'Fa0/1'], ['pc2', 'Fa0', 'sw1', 'Fa0/2'], ['pc3', 'Fa0', 'sw1', 'Fa0/11'], ['pc4', 'Fa0', 'sw1', 'Fa0/12']],
};

function twoFloors(opts: { trunk: boolean; sw2Vlans?: Record<string, string> }): TopologySpec {
  const vlans = { '10': 'SALES', '20': 'ENG' };
  return {
    devices: [
      { id: 'sw1', kind: 'switch', name: 'SW-Floor1', x: 160, y: 80, vlans, interfaces: { 'Fa0/1': { vlan: 10 }, 'Fa0/2': { vlan: 20 }, ...(opts.trunk ? { 'Gi0/1': { mode: 'trunk' as const } } : {}) } },
      { id: 'sw2', kind: 'switch', name: 'SW-Floor2', x: 460, y: 80, vlans: opts.sw2Vlans ?? vlans, interfaces: { 'Fa0/1': { vlan: 10 }, 'Fa0/2': { vlan: 20 }, ...(opts.trunk ? { 'Gi0/1': { mode: 'trunk' as const } } : {}) } },
      { id: 'pc1', kind: 'pc', name: 'Sales-F1', x: 40, y: 280, ip: '10.10.0.11/24', gateway: '10.10.0.1' },
      { id: 'pc2', kind: 'pc', name: 'Eng-F1', x: 220, y: 280, ip: '10.20.0.11/24', gateway: '10.20.0.1' },
      { id: 'pc3', kind: 'pc', name: 'Sales-F2', x: 400, y: 280, ip: '10.10.0.12/24', gateway: '10.10.0.1' },
      { id: 'pc4', kind: 'pc', name: 'Eng-F2', x: 580, y: 280, ip: '10.20.0.12/24', gateway: '10.20.0.1' },
    ],
    links: [['pc1', 'Fa0', 'sw1', 'Fa0/1'], ['pc2', 'Fa0', 'sw1', 'Fa0/2'], ['pc3', 'Fa0', 'sw2', 'Fa0/1'], ['pc4', 'Fa0', 'sw2', 'Fa0/2'], ['sw1', 'Gi0/1', 'sw2', 'Gi0/1']],
  };
}

export const vlans: ModuleDef = {
  slug: 'vlans',
  track: 'core',
  title: 'VLANs & Trunking',
  summary: 'Segment one physical switch into many logical networks and carry them across trunks.',
  level: 7,
  prerequisites: ['ethernet-switching', 'ipv4-addressing'],
  activities: [
    lesson('why-vlans', 'Why VLANs?', 'One switch, many broadcast domains.', 8, ['vlans'],
      ['Explain the problems VLANs solve'],
      [
        text('Without VLANs, every port on a switch is in the same broadcast domain: Sales, Engineering, Guests and Servers all see each other\'s broadcasts and can talk directly. Buying a separate switch per department is expensive and inflexible.'),
        term('VLAN', 'A logical broadcast domain created on a switch. Ports in different VLANs behave as if they were on separate switches.', 'Virtual LAN'),
        table(['Benefit', 'Example'], [
          ['Security', 'Guest Wi-Fi users cannot reach the Finance PCs'],
          ['Performance', 'Broadcasts stay inside each VLAN'],
          ['Flexibility', 'Move a user to another department by changing one port setting'],
          ['Cost', 'One physical switch serves many departments'],
        ]),
        realWorld('"The finance department should not communicate directly with the guest Wi-Fi" — that requirement is solved first with VLANs.'),
        check('Two PCs are in different VLANs on the same switch, with no router. Can they communicate?', ['Yes, always', 'No', 'Only with the same IP', 'Only via broadcast'], 1, 'Different VLANs are different Layer 2 networks; a Layer 3 device is required.'),
      ], 2),
    lesson('access-ports', 'Access ports', 'Putting a port into a VLAN.', 9, ['vlans', 'cli'],
      ['Create VLANs and assign access ports'],
      [
        text('An **access port** belongs to exactly one VLAN and carries untagged frames — the connected PC has no idea VLANs exist.\n\n```\nSwitch(config)# vlan 10\nSwitch(config-vlan)# name SALES\nSwitch(config-vlan)# exit\nSwitch(config)# interface fa0/1\nSwitch(config-if)# switchport mode access\nSwitch(config-if)# switchport access vlan 10\n```'),
        topo({ ...vlanLabSpec, devices: vlanLabSpec.devices.map((d) => (d.id === 'sw1' ? { ...d, vlans: { '10': 'SALES', '20': 'ENG' }, interfaces: { 'Fa0/1': { vlan: 10 }, 'Fa0/2': { vlan: 10 }, 'Fa0/11': { vlan: 20 }, 'Fa0/12': { vlan: 20 } } } : d)) },
          'All four PCs share one subnet, but Sales and Engineering are in different VLANs. Run both pings: same VLAN works, different VLAN fails — even though the IPs are in the same subnet.', [
            { label: 'Sales-1 → Sales-2 (VLAN 10)', from: 'pc1', to: '192.168.10.12' },
            { label: 'Sales-1 → Eng-1 (VLAN 10 → 20)', from: 'pc1', to: '192.168.10.21' },
          ]),
        info('Every switch port starts in VLAN 1 (the default VLAN). VLAN 1 cannot be deleted.'),
        check('Which command assigns a port to VLAN 30?', ['vlan 30', 'switchport access vlan 30', 'switchport trunk vlan 30', 'ip vlan 30'], 1, '`switchport access vlan 30` in interface configuration mode.'),
      ], 2),
    lesson('trunks-8021q', 'Trunks and 802.1Q tagging', 'Carrying many VLANs over one link.', 10, ['trunking'],
      ['Explain 802.1Q tagging', 'Configure a trunk'],
      [
        text('When VLANs span multiple switches, the link between them must carry traffic for every VLAN. A **trunk** does this by inserting a 4-byte **802.1Q tag** containing the VLAN ID into each frame.\n\n```\nSwitch(config)# interface g0/1\nSwitch(config-if)# switchport mode trunk\nSwitch(config-if)# switchport trunk allowed vlan 10,20\n```'),
        topo(twoFloors({ trunk: true }), 'Ping between Sales PCs on different floors. Inspect the frame on the inter-switch link — it carries an 802.1Q tag. The frames to and from the PCs are untagged.', [{ label: 'Sales-F1 → Sales-F2', from: 'pc1', to: '10.10.0.12' }, { label: 'Eng-F1 → Eng-F2', from: 'pc2', to: '10.20.0.12' }]),
        term('802.1Q', 'The IEEE standard for VLAN tagging on Ethernet trunks. The tag sits between the source MAC and EtherType and holds a 12-bit VLAN ID (1–4094).'),
        check('Which links usually need to be trunks?', ['PC to switch', 'Switch to switch carrying several VLANs', 'Printer to switch', 'Any link with a server'], 1, 'Trunks carry multiple VLANs between switches (or to routers/servers that understand tags).'),
      ], 3),
    lesson('native-vlan', 'The native VLAN', 'The one VLAN that travels untagged.', 7, ['trunking', 'security-fundamentals'],
      ['Explain the native VLAN and mismatch risks'],
      [
        text('On an 802.1Q trunk, frames for the **native VLAN** (VLAN 1 by default) are sent **untagged**. Both ends must agree on the native VLAN; otherwise untagged frames land in different VLANs on each side.'),
        warn('A native VLAN mismatch silently merges two VLANs. Best practice: set an unused VLAN (e.g. 999) as native on all trunks and never put users in it.'),
        text('```\nSwitch(config-if)# switchport trunk native vlan 999\n```'),
        check('On a trunk with native VLAN 1, how are VLAN 1 frames sent?', ['Tagged with VLAN 1', 'Untagged', 'Dropped', 'Tagged with VLAN 0'], 1, 'Native VLAN frames are untagged.'),
      ], 3),
    lesson('vlan-design', 'VLAN design practices', 'How real networks lay out VLANs.', 7, ['vlans', 'network-design'],
      ['Plan VLAN IDs and subnets'],
      [
        table(['VLAN', 'Name', 'Subnet', 'Purpose'], [
          ['10', 'STAFF', '10.10.0.0/24', 'Employee PCs'],
          ['20', 'VOICE', '10.20.0.0/24', 'IP phones'],
          ['30', 'GUEST', '10.30.0.0/24', 'Guest Wi-Fi (Internet only)'],
          ['40', 'SERVERS', '10.40.0.0/24', 'Internal servers'],
          ['99', 'MGMT', '10.99.0.0/24', 'Switch & AP management'],
          ['999', 'NATIVE', '—', 'Unused native VLAN'],
        ], 'Typical office VLAN plan'),
        tip('Match VLAN IDs to the third octet of the subnet (VLAN 30 ↔ 10.30.0.0/24). It makes troubleshooting much faster.'),
        info('One VLAN = one subnet = one broadcast domain. Keep that rule and designs stay simple.'),
        check('Why put switch management in its own VLAN?', ['It is faster', 'To restrict who can reach device management interfaces', 'VLAN 1 is required for management', 'To save IP addresses'], 1, 'Isolating management traffic is a basic security practice.'),
      ]),
    lab('vlan-config-lab', 'Segment the office with VLANs', 'Create VLANs and assign access ports.', 15, ['vlans', 'cli'], {
      scenario: 'Sales and Engineering share one switch and one subnet. Management wants them separated so they cannot reach each other at Layer 2. Sales PCs are on Fa0/1–2, Engineering on Fa0/11–12.',
      objective: 'VLAN 10 (SALES) and VLAN 20 (ENG) exist, and only same-department PCs can communicate.',
      spec: vlanLabSpec,
      tasks: [
        { id: 'create', title: 'Create VLAN 10 named SALES and VLAN 20 named ENG', checks: [{ type: 'vlanExists', device: 'sw1', vlan: 10, name: 'SALES' }, { type: 'vlanExists', device: 'sw1', vlan: 20, name: 'ENG' }] },
        { id: 'assign', title: 'Assign the access ports', checks: [
          { type: 'portAccessVlan', device: 'sw1', iface: 'Fa0/1', vlan: 10 }, { type: 'portAccessVlan', device: 'sw1', iface: 'Fa0/2', vlan: 10 },
          { type: 'portAccessVlan', device: 'sw1', iface: 'Fa0/11', vlan: 20 }, { type: 'portAccessVlan', device: 'sw1', iface: 'Fa0/12', vlan: 20 },
        ] },
        { id: 'verify', title: 'Verify isolation', checks: [
          { type: 'ping', from: 'pc1', to: 'pc2', label: 'Sales PCs reach each other' },
          { type: 'ping', from: 'pc3', to: 'pc4', label: 'Engineering PCs reach each other' },
          { type: 'ping', from: 'pc1', to: 'pc3', expect: 'fail', label: 'Sales cannot reach Engineering' },
        ] },
      ],
      hints: ['`vlan 10` then `name SALES` creates and names the VLAN.', '`interface fa0/1` → `switchport mode access` → `switchport access vlan 10`.', 'Verify with `show vlan brief`.'],
      concepts: ['VLAN database', 'Access ports', 'Layer 2 isolation'],
      debrief: 'Even with IPs in the same subnet, Sales and Engineering can no longer exchange frames — ARP broadcasts do not cross VLANs. (In practice each VLAN should also get its own subnet.)',
    }, 2),
    lab('trunk-lab', 'Extend VLANs across floors', 'Configure a trunk between two switches.', 12, ['trunking', 'cli'], {
      scenario: 'Sales and Engineering staff work on two floors. VLANs and access ports are configured on both switches, but the link between the switches is still a default access port in VLAN 1.',
      objective: 'Same-VLAN PCs on different floors can communicate.',
      spec: twoFloors({ trunk: false }),
      tasks: [
        { id: 'trunk', title: 'Make Gi0/1 a trunk on both switches', checks: [{ type: 'portMode', device: 'sw1', iface: 'Gi0/1', mode: 'trunk' }, { type: 'portMode', device: 'sw2', iface: 'Gi0/1', mode: 'trunk' }] },
        { id: 'verify', title: 'Verify both VLANs across floors', checks: [{ type: 'ping', from: 'pc1', to: 'pc3' }, { type: 'ping', from: 'pc2', to: 'pc4' }] },
      ],
      hints: ['On each switch: `interface g0/1` → `switchport mode trunk`.', 'Use `show interfaces trunk` to verify.'],
      concepts: ['802.1Q trunks', 'Tagged vs untagged frames'],
      debrief: 'An access link can only carry one VLAN. The trunk tags each frame so the other switch knows which VLAN it belongs to.',
    }, 2),
    challenge('vlan-missing-challenge', 'Troubleshoot: Engineering on floor 2 is isolated', '"Users in VLAN 20 on the second floor cannot reach their colleagues."', 12, ['vlans', 'trunking', 'troubleshooting'], {
      scenario: 'Sales works fine on both floors. Engineering PCs on floor 2 cannot reach Engineering on floor 1. The trunk is up. Find the fault.',
      objective: 'Engineering PCs on both floors communicate.',
      spec: twoFloors({ trunk: true, sw2Vlans: { '10': 'SALES' } }),
      tasks: [{ id: 'fix', title: 'Engineering connectivity restored', checks: [{ type: 'ping', from: 'pc4', to: 'pc2' }, { type: 'ping', from: 'pc1', to: 'pc3', label: 'Sales still works' }] }],
      hints: ['Compare `show vlan brief` on both switches.', 'A switch drops frames for VLANs that are not in its VLAN database — even on a trunk.'],
      concepts: ['VLAN database consistency', 'Trunk forwarding rules'],
      debrief: 'VLAN 20 was never created on SW-Floor2. Its access port pointed at a non-existent VLAN and trunk frames tagged 20 were discarded.',
    }, 3),
    quiz('trunk-quiz', 'Trunking drill', 'Tags, native VLANs and allowed lists.', ['trunking'], [
      single('q1', 'How large is an 802.1Q tag?', ['2 bytes', '4 bytes', '8 bytes', '12 bytes'], 1, '4 bytes, including the 12-bit VLAN ID.'),
      single('q2', 'What happens to a frame from VLAN 30 on a trunk with "allowed vlan 10,20"?', ['Forwarded untagged', 'Dropped', 'Converted to VLAN 10', 'Forwarded to all VLANs'], 1, 'VLANs not in the allowed list are not carried.'),
      textQ('q3', 'Which command displays trunk ports and allowed VLANs on a Cisco switch?', ['show interfaces trunk', 'show interface trunk'], '`show interfaces trunk`.'),
      single('q4', 'Valid VLAN ID range for normal use?', ['0–4095', '1–4094', '1–1024', '2–1001 only'], 1, '0 and 4095 are reserved.'),
    ]),
    quiz('vlan-checkpoint', 'VLAN checkpoint', 'Access ports, trunks and design.', ['vlans', 'trunking'], [
      single('q1', 'Each VLAN is a separate…', ['Collision domain only', 'Broadcast domain', 'Routing table', 'MAC address'], 1, 'VLAN = broadcast domain.'),
      single('q2', 'A PC is connected to a switch port. What mode should that port be?', ['Trunk', 'Access', 'Native', 'Routed'], 1, 'End devices connect to access ports.'),
      multi('q3', 'Which are good practices?', ['Use an unused VLAN as native', 'Put users in VLAN 1', 'One subnet per VLAN', 'Allow only needed VLANs on trunks'], [0, 2, 3], 'Avoid VLAN 1 for user traffic.'),
      single('q4', 'Two switches have a native VLAN mismatch (1 vs 99). What is the risk?', ['No risk', 'Untagged traffic leaks between VLAN 1 and VLAN 99', 'The trunk speeds up', 'VLAN IDs change'], 1, 'Untagged frames enter a different VLAN on each side.'),
      single('q5', 'What is required for VLAN 10 and VLAN 20 hosts to communicate?', ['A trunk', 'A Layer 3 device (router or L3 switch)', 'The same VLAN name', 'A hub'], 1, 'Inter-VLAN traffic must be routed.'),
    ], { checkpoint: true }),
  ],
};

function roasSpec(opts: { trunkToRouter: boolean; subifs: boolean; wrongEncap?: boolean }): TopologySpec {
  const base = twoFloors({ trunk: true });
  const sw1 = base.devices.find((d) => d.id === 'sw1')!;
  sw1.interfaces = { ...sw1.interfaces, 'Gi0/2': opts.trunkToRouter ? { mode: 'trunk' } : {} };
  base.devices.push({
    id: 'r1',
    kind: 'router',
    name: 'Gateway-R',
    x: 160,
    y: -60,
    interfaces: opts.subifs
      ? { 'Gi0/0': { up: true }, 'Gi0/0.10': { ip: '10.10.0.1/24' }, 'Gi0/0.20': { ip: '10.20.0.1/24', ...(opts.wrongEncap ? { dot1q: 30 } : {}) } }
      : {},
  });
  base.links.push(['sw1', 'Gi0/2', 'r1', 'Gi0/0']);
  return base;
}

export const interVlan: ModuleDef = {
  slug: 'inter-vlan-routing',
  track: 'core',
  title: 'Inter-VLAN Routing',
  summary: 'Route between VLANs with router-on-a-stick sub-interfaces and understand Layer 3 switches.',
  level: 8,
  prerequisites: ['vlans', 'routing'],
  activities: [
    lesson('intervlan-problem', 'The inter-VLAN problem', 'Separated on purpose — but some traffic must cross.', 6, ['inter-vlan-routing'],
      ['Explain why VLANs need routing to communicate'],
      [
        text('VLANs isolate departments, but Sales still needs the Engineering file server and everyone needs the Internet. Since each VLAN is its own subnet, crossing between them is a **routing** job — exactly like crossing between any two networks.'),
        table(['Method', 'How', 'Scales?'], [
          ['Router with one interface per VLAN', 'One physical router port per VLAN', 'Poorly — ports run out'],
          ['Router-on-a-stick', 'One trunk to the router, one sub-interface per VLAN', 'Small/medium sites'],
          ['Layer 3 switch (SVIs)', 'The switch routes internally between VLAN interfaces', 'Best for campus networks'],
        ]),
        check('Each VLAN\'s default gateway is…', ['The switch MAC', 'A router (or SVI) address inside that VLAN\'s subnet', 'The DNS server', 'Always 0.0.0.0'], 1, 'Each VLAN/subnet needs its own gateway address.'),
      ]),
    lesson('router-on-a-stick', 'Router-on-a-stick', 'One trunk, many gateways.', 10, ['inter-vlan-routing', 'trunking'],
      ['Explain how sub-interfaces route between VLANs'],
      [
        text('The switch port to the router becomes a **trunk**. On the router, the physical interface is split into **sub-interfaces** (Gi0/0.10, Gi0/0.20…). Each sub-interface is bound to a VLAN with `encapsulation dot1Q <vlan>` and holds that VLAN\'s gateway IP.'),
        topo(roasSpec({ trunkToRouter: true, subifs: true }), 'Ping from Sales (VLAN 10) to Engineering (VLAN 20). Follow the frame: tagged 10 up the trunk to the router, routed, then tagged 20 back down the same cable.', [{ label: 'Sales-F1 → Eng-F2', from: 'pc1', to: '10.20.0.12' }], 'Router-on-a-stick', 420),
        info('The traffic crosses the trunk twice ("up the stick and back down"), so the trunk bandwidth is shared by all inter-VLAN traffic.'),
        check('What does `encapsulation dot1Q 20` on Gi0/0.20 do?', ['Sets the IP', 'Associates the sub-interface with VLAN 20 tags', 'Creates VLAN 20 on the switch', 'Enables the interface'], 1, 'Frames tagged 20 are processed by that sub-interface; frames it sends get tag 20.'),
      ], 3),
    lesson('subinterface-config', 'Configuring sub-interfaces', 'The exact commands.', 8, ['inter-vlan-routing', 'cli'],
      ['Write a router-on-a-stick configuration'],
      [
        steps([
          ['Switch: trunk to the router', '```\ninterface g0/2\n switchport mode trunk\n```'],
          ['Router: enable the physical interface', '```\ninterface g0/0\n no shutdown\n```'],
          ['Router: one sub-interface per VLAN', '```\ninterface g0/0.10\n encapsulation dot1Q 10\n ip address 10.10.0.1 255.255.255.0\ninterface g0/0.20\n encapsulation dot1Q 20\n ip address 10.20.0.1 255.255.255.0\n```'],
          ['Hosts: use the sub-interface IP as gateway', 'VLAN 10 hosts → 10.10.0.1, VLAN 20 hosts → 10.20.0.1.'],
        ]),
        warn('The physical interface must be up. Sub-interfaces inherit the parent\'s state.'),
        check('Which mode must the switch port facing the router be in?', ['Access VLAN 10', 'Trunk', 'Shutdown', 'Access VLAN 1'], 1, 'It must carry tagged frames for every routed VLAN.'),
      ], 3),
    lesson('l3-switch-svi', 'Layer 3 switches and SVIs', 'Routing inside the switch.', 7, ['inter-vlan-routing', 'devices'],
      ['Compare router-on-a-stick with SVIs'],
      [
        term('SVI', 'A virtual interface on a Layer 3 switch representing a whole VLAN (e.g. `interface vlan 10`). It acts as that VLAN\'s gateway.', 'Switched Virtual Interface'),
        text('```\nL3-Switch(config)# ip routing\nL3-Switch(config)# interface vlan 10\nL3-Switch(config-if)# ip address 10.10.0.1 255.255.255.0\n```'),
        table(['', 'Router-on-a-stick', 'L3 switch with SVIs'], [
          ['Throughput', 'Limited by one trunk link', 'Hardware-speed internal routing'],
          ['Cost', 'Uses an existing router', 'Requires a multilayer switch'],
          ['Typical use', 'Small branch', 'Campus distribution/core'],
        ]),
        info('This simulator models router-on-a-stick today; SVIs on multilayer switches are on the roadmap.'),
        check('What global command enables routing on many Cisco L3 switches?', ['router on', 'ip routing', 'enable routing', 'switchport routed'], 1, '`ip routing`.'),
      ], 2),
    lab('roas-lab', 'Build router-on-a-stick', 'Route between Sales and Engineering VLANs.', 20, ['inter-vlan-routing', 'trunking', 'cli'], {
      scenario: 'VLANs 10 (Sales, 10.10.0.0/24) and 20 (Engineering, 10.20.0.0/24) span two floors over a trunk. A router (Gateway-R) is cabled to SW-Floor1 Gi0/2 but not configured. Hosts already use .1 as gateway in each VLAN.',
      objective: 'Every PC can reach every other PC, across VLANs and floors.',
      spec: roasSpec({ trunkToRouter: false, subifs: false }),
      tasks: [
        { id: 'trunk', title: 'SW-Floor1 Gi0/2 is a trunk', checks: [{ type: 'portMode', device: 'sw1', iface: 'Gi0/2', mode: 'trunk' }] },
        { id: 'subifs', title: 'Gateway-R has sub-interfaces for VLAN 10 and 20', checks: [
          { type: 'interfaceIp', device: 'r1', iface: 'Gi0/0.10', ip: '10.10.0.1/24' },
          { type: 'interfaceIp', device: 'r1', iface: 'Gi0/0.20', ip: '10.20.0.1/24' },
          { type: 'interfaceUp', device: 'r1', iface: 'Gi0/0' },
        ] },
        { id: 'verify', title: 'Full connectivity', checks: [{ type: 'noErrors' }, { type: 'pingMatrix' }] },
      ],
      hints: [
        'Switch: `interface g0/2` → `switchport mode trunk`.',
        'Router: `interface g0/0` → `no shutdown`, then `interface g0/0.10` → `encapsulation dot1Q 10` → `ip address 10.10.0.1 255.255.255.0`.',
        'Repeat for g0/0.20 with VLAN 20 and 10.20.0.1.',
      ],
      concepts: ['Sub-interfaces', '802.1Q encapsulation', 'Per-VLAN gateways'],
      debrief: 'One cable now carries both VLANs to the router, which routes between its two sub-interfaces. Check `show ip route`: two connected networks via Gi0/0.10 and Gi0/0.20.',
    }, 3),
    challenge('roas-troubleshoot', 'Troubleshoot: VLAN 20 has no gateway', '"Users in VLAN 20 cannot communicate with the gateway."', 15, ['inter-vlan-routing', 'troubleshooting'], {
      scenario: 'After a change window, Engineering (VLAN 20) users cannot ping their gateway 10.20.0.1 and cannot reach Sales. Sales (VLAN 10) is fine. The switch configuration was not touched.',
      objective: 'Engineering reaches its gateway and Sales again.',
      spec: roasSpec({ trunkToRouter: true, subifs: true, wrongEncap: true }),
      tasks: [{ id: 'fix', title: 'VLAN 20 connectivity restored', checks: [{ type: 'ping', from: 'pc2', to: '10.20.0.1', label: 'Eng-F1 reaches its gateway' }, { type: 'pingMatrix' }] }],
      hints: ['Only VLAN 20 is broken and the switch is unchanged — focus on the router side for VLAN 20.', 'Run `show running-config` on Gateway-R and compare the two sub-interfaces.'],
      concepts: ['dot1Q encapsulation must match the VLAN ID', 'Layer-by-layer isolation'],
      debrief: 'Gi0/0.20 was set to `encapsulation dot1Q 30`. Frames tagged VLAN 20 arrived at the router with no matching sub-interface and were discarded.',
    }, 3),
    quiz('intervlan-checkpoint', 'Inter-VLAN routing checkpoint', 'Sub-interfaces, trunks and SVIs.', ['inter-vlan-routing', 'trunking'], [
      single('q1', 'In router-on-a-stick, how many physical router interfaces are used for 3 VLANs?', ['1', '2', '3', '6'], 0, 'One physical interface with three sub-interfaces.'),
      single('q2', 'What must each VLAN\'s hosts use as default gateway?', ['The router\'s physical IP', 'The sub-interface IP for their VLAN', 'Any router IP', 'The switch IP'], 1, 'The gateway must be inside their own subnet.'),
      textQ('q3', 'Complete the command to bind a sub-interface to VLAN 40: encapsulation ____ 40', ['dot1q', 'dot1Q'], '`encapsulation dot1Q 40`.'),
      single('q4', 'A VLAN 20 host cannot reach its gateway, VLAN 10 works. Most likely cause?', ['The trunk is down', 'Wrong encapsulation/IP on the VLAN 20 sub-interface', 'DNS failure', 'The PC cable is unplugged in VLAN 10'], 1, 'Isolate: shared components work, so check the VLAN 20-specific config.'),
      single('q5', 'Which is generally faster for inter-VLAN routing in a campus?', ['Router-on-a-stick', 'Layer 3 switch SVIs', 'Hub', 'Static NAT'], 1, 'L3 switches route in hardware without a single trunk bottleneck.'),
    ], { checkpoint: true }),
  ],
};
