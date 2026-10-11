import type { ModuleDef } from '../schema';
import type { TopologySpec } from '@netforge/sim-engine';
import { challenge, check, info, lab, lesson, multi, project, quiz, realWorld, single, steps, table, term, text, textQ, tip, warn } from '../helpers';
import { twoLans, twoSites } from '../topologies';

export const services: ModuleDef = {
  slug: 'network-services',
  track: 'core',
  title: 'Network Services: DHCP, DNS & NAT',
  summary: 'How hosts get addresses automatically, how names become IPs, and how private networks reach the Internet.',
  level: 9,
  prerequisites: ['routing'],
  activities: [
    lesson('dhcp-dora', 'DHCP: automatic addressing', 'Discover, Offer, Request, Acknowledge.', 10, ['network-services'],
      ['Describe the DHCP DORA exchange', 'List the settings DHCP provides'],
      [
        term('DHCP', 'A protocol that automatically leases IP settings (address, mask, gateway, DNS) to clients.', 'Dynamic Host Configuration Protocol'),
        steps([
          ['Discover (broadcast)', 'Client 0.0.0.0:68 → 255.255.255.255:67 — "Is there a DHCP server?"'],
          ['Offer', 'Server → client — "You can have 192.168.1.50/24, gateway .1, DNS .53, lease 8 hours."'],
          ['Request (broadcast)', 'Client — "I accept the offer from that server." (Broadcast so other servers withdraw their offers.)'],
          ['Acknowledge', 'Server — "Confirmed. The lease is yours."'],
        ], 'DORA'),
        info('DHCP Discover is a broadcast, so it does not cross routers. When the server is on another subnet, the router forwards it as a **DHCP relay** (`ip helper-address` on Cisco).'),
        realWorld('A PC showing 169.254.x.x failed DORA — check the cable, the VLAN, the relay and the server\'s pool.'),
        check('Which DHCP message does the server send first?', ['Discover', 'Offer', 'Request', 'ACK'], 1, 'The client discovers; the server offers.'),
      ], 2),
    lesson('dhcp-pools', 'DHCP pools, leases and reservations', 'Planning address assignment.', 7, ['network-services', 'ipv4-addressing'],
      ['Plan a DHCP scope with exclusions and reservations'],
      [
        table(['Concept', 'Meaning'], [
          ['Pool / scope', 'Range of addresses the server can lease, e.g. .100–.200'],
          ['Exclusion', 'Addresses never leased (router, servers, printers)'],
          ['Reservation', 'A fixed address always given to one MAC'],
          ['Lease time', 'How long a client may keep the address before renewing'],
        ]),
        text('```\nRouter(config)# ip dhcp excluded-address 192.168.1.1 192.168.1.99\nRouter(config)# ip dhcp pool STAFF\nRouter(dhcp-config)# network 192.168.1.0 255.255.255.0\nRouter(dhcp-config)# default-router 192.168.1.1\nRouter(dhcp-config)# dns-server 192.168.1.53\n```'),
        tip('Servers and network devices should use static addresses (or reservations) so their address never changes.'),
        check('Why exclude the router\'s address from the pool?', ['It speeds up DHCP', 'So it is never leased to a client, avoiding a duplicate IP', 'Routers cannot use DHCP', 'It is required by DNS'], 1, 'Leasing the gateway address to a PC would create a conflict.'),
      ]),
    lesson('dns-resolution', 'DNS: from names to addresses', 'What happens when you type a URL.', 10, ['network-services'],
      ['Trace a recursive DNS lookup'],
      [
        steps([
          ['Client → resolver', 'Your PC asks its configured DNS resolver: "What is the A record for www.example.com?"'],
          ['Resolver → root', 'The root server replies: "Ask the .com servers."'],
          ['Resolver → TLD', 'The .com server replies: "Ask example.com\'s authoritative servers."'],
          ['Resolver → authoritative', 'The authoritative server answers: 93.184.215.14.'],
          ['Resolver → client', 'The resolver returns the answer and caches it for the record\'s TTL.'],
        ], 'Recursive resolution'),
        table(['Record', 'Purpose', 'Example'], [
          ['A', 'Name → IPv4', 'www → 203.0.113.10'],
          ['AAAA', 'Name → IPv6', 'www → 2001:db8::10'],
          ['CNAME', 'Alias to another name', 'shop → www.example.com'],
          ['MX', 'Mail server for the domain', 'mail.example.com (priority 10)'],
          ['TXT', 'Free text (SPF, verification)', '"v=spf1 include:…"'],
          ['NS', 'Authoritative name servers', 'ns1.example.com'],
          ['PTR', 'IP → name (reverse)', '10.113.0.203.in-addr.arpa'],
        ]),
        check('Which record type maps a name to an IPv6 address?', ['A', 'AAAA', 'MX', 'PTR'], 1, 'AAAA ("quad A") records hold IPv6 addresses.'),
      ], 2),
    lesson('nat-pat', 'NAT and PAT', 'Sharing one public address.', 10, ['network-services'],
      ['Distinguish static NAT, dynamic NAT and PAT', 'Read a NAT translation table'],
      [
        text('Private addresses cannot be routed on the Internet. The edge router **translates** the source address of outgoing packets to a public one and reverses it for the replies.'),
        table(['Type', 'Mapping', 'Use'], [
          ['Static NAT', '1 private ↔ 1 public, permanent', 'Publishing an internal server'],
          ['Dynamic NAT', 'Private → public from a pool', 'Rare today'],
          ['PAT (NAT overload)', 'Many private → 1 public, distinguished by port', 'Every home and office'],
        ]),
        table(['Protocol', 'Inside local', 'Inside global', 'Outside global'], [
          ['TCP', '192.168.1.10:51000', '203.0.113.5:1024', '93.184.215.14:443'],
          ['TCP', '192.168.1.11:51000', '203.0.113.5:1025', '93.184.215.14:443'],
          ['UDP', '192.168.1.12:53000', '203.0.113.5:1026', '8.8.8.8:53'],
        ], 'A PAT translation table: three hosts share 203.0.113.5'),
        term('Inside local / inside global', 'Inside local = the host\'s private address. Inside global = the public address it appears as on the Internet.'),
        check('Two PCs both use source port 51000 to reach the same website. How does PAT tell the replies apart?', ['It cannot', 'It assigns different public source ports', 'It uses MAC addresses', 'It uses VLAN tags'], 1, 'PAT rewrites the source port so each flow is unique.'),
      ], 3),
    quiz('dns-quiz', 'DNS records drill', 'Pick the right record type.', ['network-services'], [
      single('q1', 'Which record tells the world where to deliver email for a domain?', ['A', 'MX', 'CNAME', 'TXT'], 1, 'MX = mail exchanger.'),
      single('q2', 'shop.example.com should simply point to www.example.com. Which record?', ['A', 'CNAME', 'NS', 'PTR'], 1, 'CNAME creates an alias.'),
      single('q3', 'Which record is used for reverse lookups?', ['PTR', 'AAAA', 'MX', 'SOA'], 0, 'PTR maps an IP back to a name.'),
      textQ('q4', 'Which port does DNS use?', ['53'], 'UDP/TCP 53.'),
    ]),
    quiz('services-checkpoint', 'Network services checkpoint', 'DHCP, DNS and NAT.', ['network-services'], [
      single('q1', 'Correct DHCP message order?', ['Offer, Discover, Ack, Request', 'Discover, Offer, Request, Ack', 'Request, Offer, Discover, Ack', 'Discover, Request, Offer, Ack'], 1, 'DORA.'),
      single('q2', 'A DHCP server is on another subnet. What must the client\'s gateway router do?', ['Nothing', 'Act as a DHCP relay (ip helper-address)', 'Run NAT', 'Create a VLAN'], 1, 'Broadcasts do not cross routers without a relay.'),
      single('q3', 'Most home routers use which form of NAT?', ['Static NAT', 'Dynamic NAT', 'PAT', 'No NAT'], 2, 'Many devices share one public IP.'),
      single('q4', 'In NAT terms, the private address of an internal host is called…', ['Inside global', 'Inside local', 'Outside local', 'Outside global'], 1, 'Inside local.'),
      multi('q5', 'Which settings can DHCP provide?', ['IP address & mask', 'Default gateway', 'DNS server', 'MAC address'], [0, 1, 2], 'MAC addresses are hardware addresses, not leased.'),
    ], { checkpoint: true }),
  ],
};

const officeSecuritySpec: TopologySpec = {
  devices: [
    { id: 'sw1', kind: 'switch', name: 'Office-SW', x: 300, y: 80, vlans: { '10': 'FINANCE' }, interfaces: { 'Fa0/1': { vlan: 10 }, 'Fa0/2': { vlan: 10 }, 'Fa0/10': { vlan: 10 } } },
    { id: 'pc1', kind: 'pc', name: 'Finance-1', x: 60, y: 280, ip: '172.20.0.11/24' },
    { id: 'pc2', kind: 'pc', name: 'Finance-2', x: 240, y: 280, ip: '172.20.0.12/24' },
    { id: 'lap1', kind: 'laptop', name: 'Guest-Laptop', x: 480, y: 280, ip: '172.20.0.50/24' },
  ],
  links: [['pc1', 'Fa0', 'sw1', 'Fa0/1'], ['pc2', 'Fa0', 'sw1', 'Fa0/2'], ['lap1', 'Fa0', 'sw1', 'Fa0/10']],
};

export const security: ModuleDef = {
  slug: 'security-fundamentals',
  track: 'core',
  title: 'Network Security Fundamentals',
  summary: 'Threats, segmentation, switch security, ACL logic and secure device management.',
  level: 10,
  prerequisites: ['inter-vlan-routing'],
  activities: [
    lesson('security-concepts', 'Security concepts', 'Confidentiality, integrity, availability.', 8, ['security-fundamentals'],
      ['Describe the CIA triad', 'Recognise common network threats'],
      [
        table(['Principle', 'Meaning', 'Threat example'], [
          ['Confidentiality', 'Only authorised parties can read data', 'Sniffing unencrypted Telnet passwords'],
          ['Integrity', 'Data is not altered undetected', 'ARP spoofing / man-in-the-middle'],
          ['Availability', 'Services stay reachable', 'Denial of service, broadcast storms'],
        ], 'The CIA triad'),
        table(['Threat', 'Description', 'Mitigation'], [
          ['MAC flooding', 'Fills the switch MAC table so it floods everything', 'Port security'],
          ['Rogue DHCP server', 'Hands out a malicious gateway', 'DHCP snooping'],
          ['ARP spoofing', 'Claims another host\'s IP', 'Dynamic ARP Inspection'],
          ['VLAN hopping', 'Abuses trunk negotiation or native VLAN', 'Disable auto-trunking, unused native VLAN'],
          ['Unauthorised access', 'Weak or default credentials', 'Strong passwords, SSH, AAA'],
        ]),
        info('Practice only in safe, simulated or authorised environments. Testing attacks on networks you do not own is illegal in most countries.'),
        check('A broadcast storm takes the network down. Which CIA principle is affected?', ['Confidentiality', 'Integrity', 'Availability'], 2, 'Users cannot reach services: availability.'),
      ], 2),
    lesson('segmentation', 'Network segmentation', 'Limit what each device can reach.', 8, ['security-fundamentals', 'vlans'],
      ['Explain how segmentation limits the impact of a compromise'],
      [
        text('A flat network lets a single infected laptop talk to every server. **Segmentation** splits the network into zones (VLANs/subnets) and forces traffic between zones through a point of control — a router ACL or firewall — where policy is enforced.'),
        table(['Zone', 'May reach', 'May not reach'], [
          ['Guest', 'Internet', 'Any internal VLAN'],
          ['Staff', 'Internet, internal servers', 'Management VLAN'],
          ['Finance', 'Finance servers, Internet', 'Guest'],
          ['Management', 'All network devices', '—'],
        ], 'Example zone policy'),
        realWorld('Many breach investigations find that attackers moved "laterally" across flat networks. Segmentation is one of the most effective defences.'),
        check('What enforces policy BETWEEN segments?', ['A hub', 'A router ACL or firewall', 'A longer cable', 'DNS'], 1, 'VLANs separate; ACLs/firewalls decide what may cross.'),
      ]),
    lesson('switch-security', 'Switch security features', 'Port security, DHCP snooping and DAI.', 10, ['security-fundamentals', 'ethernet-switching'],
      ['Describe port security, DHCP snooping and DAI'],
      [
        term('Port security', 'Limits which/how many MAC addresses may use a switch port; violations can shut the port down (err-disabled).'),
        text('```\ninterface fa0/5\n switchport mode access\n switchport port-security\n switchport port-security maximum 1\n switchport port-security mac-address sticky\n switchport port-security violation shutdown\n```'),
        term('DHCP snooping', 'Marks ports as trusted (towards real DHCP servers) or untrusted; DHCP server messages on untrusted ports are dropped. It also builds a binding table of IP ↔ MAC ↔ port.'),
        term('Dynamic ARP Inspection', 'Validates ARP packets against the DHCP snooping binding table and drops forged ARP replies.', 'DAI'),
        tip('Shut down unused ports and place them in an unused "parking" VLAN.'),
        check('An attacker plugs in a rogue DHCP server on an access port. Which feature blocks its offers?', ['Port security', 'DHCP snooping', 'STP', 'NAT'], 1, 'Untrusted ports may not send DHCP server messages.'),
      ], 3),
    lesson('acl-concepts', 'Access control lists', 'Permit and deny, top to bottom.', 12, ['security-fundamentals'],
      ['Explain ACL processing and wildcard masks', 'Choose standard vs extended ACLs'],
      [
        steps([
          ['Top-down', 'Rules are checked in order; the first match wins.'],
          ['Action', 'The matching rule permits or denies the packet.'],
          ['Implicit deny', 'If nothing matches, the packet is denied — every ACL ends with an invisible "deny any".'],
        ], 'How an ACL is processed'),
        table(['', 'Standard ACL', 'Extended ACL'], [
          ['Matches on', 'Source IP only', 'Source/destination IP, protocol, ports'],
          ['Numbers', '1–99, 1300–1999', '100–199, 2000–2699'],
          ['Placement', 'Close to the destination', 'Close to the source'],
        ]),
        text('**Wildcard masks** are inverted subnet masks: 0 = must match, 1 = ignore. `192.168.10.0 0.0.0.255` matches the whole /24.\n\n```\naccess-list 110 deny   ip 10.30.30.0 0.0.0.255 10.10.10.0 0.0.0.255\naccess-list 110 permit ip any any\ninterface g0/0.30\n ip access-group 110 in\n```'),
        warn('Forgetting the final `permit` makes the implicit deny block everything else.'),
        check('What is the wildcard mask for a /26 network?', ['255.255.255.192', '0.0.0.63', '0.0.0.64', '0.0.0.192'], 1, '255.255.255.255 − 255.255.255.192 = 0.0.0.63.'),
      ], 3),
    lesson('secure-management', 'Secure device management', 'SSH, passwords and least privilege.', 8, ['security-fundamentals', 'cli'],
      ['Harden management access to network devices'],
      [
        steps([
          ['Set a hostname and domain', 'Required to generate RSA keys: `hostname R1`, `ip domain-name corp.local`.'],
          ['Create local users', '`username admin secret <strong-password>`'],
          ['Generate keys', '`crypto key generate rsa modulus 2048`'],
          ['Allow only SSH', '`line vty 0 15` → `transport input ssh` → `login local`'],
          ['Protect privileged mode', '`enable secret <strong-password>` and `service password-encryption`'],
        ], 'SSH hardening checklist'),
        table(['Practice', 'Why'], [
          ['SSH instead of Telnet', 'Encrypts credentials and sessions'],
          ['Management VLAN + ACL on VTY lines', 'Only admins\' subnet can connect'],
          ['Disable unused services/ports', 'Smaller attack surface'],
          ['Centralised AAA (RADIUS/TACACS+)', 'Individual accounts and accounting'],
          ['Log and time-sync (syslog, NTP)', 'Investigate incidents with accurate timestamps'],
        ]),
        check('Which command allows only SSH on VTY lines?', ['transport input telnet', 'transport input ssh', 'login ssh', 'ssh enable'], 1, '`transport input ssh` under `line vty`.'),
      ], 2),
    lab('guest-isolation-lab', 'Isolate the guest laptop', 'An unauthorised device is sitting in the Finance VLAN.', 12, ['security-fundamentals', 'vlans', 'cli'], {
      scenario: 'A visitor\'s laptop was plugged into Fa0/10, which is configured for the FINANCE VLAN. It can reach the finance PCs directly. Move it into a new GUEST VLAN (30) so it is isolated, without disrupting Finance.',
      objective: 'Guest-Laptop cannot reach Finance; Finance PCs still reach each other.',
      spec: officeSecuritySpec,
      tasks: [
        { id: 'vlan', title: 'Create VLAN 30 named GUEST', checks: [{ type: 'vlanExists', device: 'sw1', vlan: 30, name: 'GUEST' }] },
        { id: 'port', title: 'Move Fa0/10 into VLAN 30', checks: [{ type: 'portAccessVlan', device: 'sw1', iface: 'Fa0/10', vlan: 30 }] },
        { id: 'verify', title: 'Verify the policy', checks: [
          { type: 'ping', from: 'lap1', to: 'pc1', expect: 'fail', label: 'Guest cannot reach Finance-1' },
          { type: 'ping', from: 'lap1', to: 'pc2', expect: 'fail', label: 'Guest cannot reach Finance-2' },
          { type: 'ping', from: 'pc1', to: 'pc2', label: 'Finance still works' },
        ] },
      ],
      hints: ['On Office-SW: `vlan 30` → `name GUEST`.', '`interface fa0/10` → `switchport access vlan 30`.'],
      concepts: ['Segmentation with VLANs', 'Least privilege'],
      debrief: 'The laptop is now in its own broadcast domain. In a full design, the guest VLAN would get its own subnet and an ACL or firewall allowing Internet access only.',
    }, 2),
    quiz('acl-quiz', 'ACL logic drill', 'Wildcards and rule order.', ['security-fundamentals'], [
      textQ('q1', 'Wildcard mask for a single host (equivalent to the keyword "host")?', ['0.0.0.0'], 'All bits must match.'),
      textQ('q2', 'Wildcard mask for 172.16.0.0/16?', ['0.0.255.255'], 'Inverse of 255.255.0.0.'),
      single('q3', 'An ACL has "permit 10.0.0.0 0.255.255.255" then "deny 10.1.1.1 0.0.0.0". Is 10.1.1.1 permitted?', ['Yes — first match wins', 'No — deny is more specific'], 0, 'ACLs stop at the first match; order matters.'),
      single('q4', 'Where should an extended ACL usually be placed?', ['Close to the source', 'Close to the destination', 'On every interface', 'On the switch'], 0, 'Drop unwanted traffic early.'),
    ]),
    quiz('security-checkpoint', 'Security checkpoint', 'Threats, mitigations and hardening.', ['security-fundamentals'], [
      single('q1', 'Which feature limits the number of MAC addresses on an access port?', ['DHCP snooping', 'Port security', 'DAI', 'PAT'], 1, 'Port security.'),
      single('q2', 'Which feature uses the DHCP snooping binding table to stop forged ARP replies?', ['DAI', 'STP', 'NAT', 'HSRP'], 0, 'Dynamic ARP Inspection.'),
      single('q3', 'What is at the end of every ACL?', ['permit any', 'An implicit deny any', 'Nothing', 'A log statement'], 1, 'Implicit deny.'),
      multi('q4', 'Which improve management security?', ['SSH instead of Telnet', 'Default passwords', 'enable secret', 'ACL on VTY lines'], [0, 2, 3], 'Never keep default credentials.'),
      single('q5', 'Putting guests in a separate VLAN mainly provides…', ['More bandwidth', 'Segmentation / isolation', 'Encryption', 'Faster DHCP'], 1, 'It isolates guest devices from internal ones.'),
    ], { checkpoint: true }),
  ],
};

export const troubleshooting: ModuleDef = {
  slug: 'troubleshooting',
  track: 'core',
  title: 'Troubleshooting Methodology',
  summary: 'Structured fault isolation, the right tools, and multi-fault scenarios.',
  level: 11,
  prerequisites: ['inter-vlan-routing'],
  activities: [
    lesson('troubleshooting-method', 'A structured method', 'Stop guessing — isolate.', 8, ['troubleshooting'],
      ['Apply a structured troubleshooting process'],
      [
        steps([
          ['Define the problem', 'Who is affected, what exactly fails, since when, what changed?'],
          ['Gather information', 'ping, traceroute, show commands, logs, user reports.'],
          ['Isolate', 'Narrow down by layer and by location. What works? What doesn\'t?'],
          ['Hypothesise & test', 'Change one thing at a time and re-test.'],
          ['Fix & verify', 'Confirm the original symptom is gone and nothing else broke.'],
          ['Document', 'Record cause and fix for next time.'],
        ]),
        table(['Approach', 'Idea', 'Good when'], [
          ['Bottom-up', 'Start at Layer 1 and move up', 'Physical changes, new installs'],
          ['Top-down', 'Start at the application', 'Single application failing'],
          ['Divide and conquer', 'Start in the middle (e.g. ping the gateway)', 'Most cases — fastest'],
          ['Follow the path', 'Check each hop source → destination', 'Routing problems'],
        ]),
        check('Users can ping the gateway but not the server in another subnet. Which layers are probably fine?', ['None', 'Layers 1–2 and local Layer 3', 'Only Layer 7', 'Only Layer 1'], 1, 'Reaching the gateway proves cabling, VLAN and local addressing work.'),
      ]),
    lesson('symptoms-by-layer', 'Symptoms by layer', 'Map what you see to where to look.', 8, ['troubleshooting', 'osi-model'],
      ['Associate symptoms with likely layers and causes'],
      [
        table(['Symptom', 'Likely layer', 'Check'], [
          ['Interface down/down', '1', 'Cable, port shut down on the other end'],
          ['Administratively down', '1/2 config', '`no shutdown`'],
          ['Ping fails to same-subnet host, ARP incomplete', '2', 'VLAN assignment, trunks, VLAN exists'],
          ['Local works, remote fails', '3', 'Gateway, mask, routes'],
          ['One direction works', '3', 'Return route'],
          ['IP works, name fails', '7 (DNS)', 'DNS server setting, records'],
          ['Intermittent / conflicting replies', '2/3', 'Duplicate IPs, loops'],
        ]),
        tip('"Can ping by IP but not by name" is almost always DNS.'),
        check('A PC shows "Destination host unreachable" from its gateway. Where do you look?', ['The PC cable', 'The gateway\'s routing table', 'The DNS server', 'The switch VLAN'], 1, 'The router replied — it has no route for the destination.'),
      ]),
    lesson('troubleshooting-tools', 'The toolbox', 'Which command answers which question.', 8, ['troubleshooting', 'cli'],
      ['Choose the right command for a question'],
      [
        table(['Question', 'Command (where)'], [
          ['Is the interface up and addressed?', '`show ip interface brief` (router/switch), `ipconfig` (PC)'],
          ['Can I reach it?', '`ping <ip>`'],
          ['Where does the path stop?', '`traceroute` / `tracert`'],
          ['Does the router know the network?', '`show ip route`'],
          ['Which VLAN is a port in?', '`show vlan brief`'],
          ['Is the trunk carrying the VLAN?', '`show interfaces trunk`'],
          ['Where is this MAC?', '`show mac address-table`'],
          ['Did ARP resolve?', '`show ip arp` (router), `arp -a` (PC)'],
          ['What is configured?', '`show running-config`'],
        ]),
        info('In this simulator every command reads the real simulated state — the output changes as you fix things.'),
        check('Which command tells you whether VLAN 20 is allowed on a trunk?', ['show vlan brief', 'show interfaces trunk', 'show ip route', 'show arp'], 1, '`show interfaces trunk` lists allowed VLANs per trunk.'),
      ]),
    lesson('documentation-baselines', 'Documentation and baselines', 'Know what "normal" looks like.', 6, ['troubleshooting', 'network-design'],
      ['Explain why documentation speeds up troubleshooting'],
      [
        table(['Document', 'Contains'], [
          ['Topology diagram', 'Devices, links, interface names'],
          ['IP address plan', 'Subnets, VLANs, gateways, reserved addresses'],
          ['Configuration backups', 'Known-good configs for comparison'],
          ['Baseline', 'Normal utilisation, latency, error counters'],
          ['Change log', 'What changed, when, by whom'],
        ]),
        realWorld('"What changed?" solves a large share of outages. A change log turns guesswork into a quick comparison.'),
        check('Why compare against a baseline?', ['To find a new IP plan', 'To recognise what is abnormal', 'To replace monitoring', 'To create VLANs'], 1, 'You cannot spot abnormal without knowing normal.'),
      ]),
    challenge('interface-down-challenge', 'Troubleshoot: the right-hand LAN vanished', 'Nobody can reach the server network.', 10, ['troubleshooting', 'cli'], {
      scenario: 'Since this morning nobody on the left LAN can reach PC3 or the server on the right LAN. PC3 and the server can still talk to each other. Find and fix the problem.',
      objective: 'Full connectivity between both LANs.',
      spec: (() => {
        const s = twoLans();
        const r = s.devices.find((d) => d.id === 'r1')!;
        r.interfaces = { ...r.interfaces, 'Gi0/1': { ip: '192.168.2.1/24', up: false } };
        return s;
      })(),
      tasks: [{ id: 'fix', title: 'Both LANs communicate', checks: [{ type: 'pingMatrix' }] }],
      hints: ['Right LAN hosts can talk locally — so the problem is between them and the router.', '`show ip interface brief` on Router1.'],
      concepts: ['Interface status', 'Connected routes disappear when an interface is down'],
      debrief: 'Gi0/1 was administratively down. A down interface removes its connected route, so the router had no path to 192.168.2.0/24.',
    }, 2),
    challenge('multi-fault-challenge', 'Troubleshoot: the branch office is offline', 'Multiple faults. Fix them all.', 20, ['troubleshooting', 'static-routing', 'ipv4-addressing'], {
      scenario: 'After a weekend of maintenance, the branch office cannot reach HQ at all. The maintenance team touched both routers and the Branch-PC. There may be more than one problem.',
      objective: 'HQ-PC and Branch-PC communicate in both directions.',
      spec: (() => {
        const s = twoSites({ r1Routes: ['10.2.2.0/24 via 172.16.12.2'], r2Routes: ['0.0.0.0/0 via 172.16.12.1'] });
        s.devices = s.devices.map((d) => {
          if (d.id === 'pc2') return { ...d, gateway: '10.2.2.254' };
          if (d.id === 'r1') return { ...d, interfaces: { ...d.interfaces, 'Gi0/1': { ip: '172.16.12.1/30', up: false } } };
          return d;
        });
        return s;
      })(),
      tasks: [
        { id: 'local', title: 'Branch-PC uses a working default gateway', checks: [{ type: 'hostConfig', device: 'pc2', network: '10.2.2.0/24', gateway: '10.2.2.1' }, { type: 'noErrors' }] },
        { id: 'wan', title: 'The WAN link is up', checks: [{ type: 'interfaceUp', device: 'r1', iface: 'Gi0/1' }] },
        { id: 'e2e', title: 'End-to-end connectivity', checks: [{ type: 'ping', from: 'pc2', to: 'pc1' }, { type: 'ping', from: 'pc1', to: 'pc2' }] },
      ],
      hints: ['Work outward from the branch PC: its own settings first, then its gateway, then the WAN.', 'Branch-PC\'s gateway does not exist. Branch-R is 10.2.2.1.', 'Check `show ip interface brief` on HQ-R.'],
      concepts: ['Divide and conquer', 'Multiple simultaneous faults', 'Verify after every fix'],
      debrief: 'Two independent faults: a wrong gateway on Branch-PC and HQ-R\'s WAN interface left shut down. Fixing only one would not restore service — always re-test after each change.',
    }, 4),
    quiz('troubleshooting-checkpoint', 'Troubleshooting checkpoint', 'Pick the most efficient next step.', ['troubleshooting'], [
      single('q1', 'A user cannot reach any website by name but can ping 8.8.8.8. Likely cause?', ['Cable', 'DNS', 'Default gateway', 'VLAN'], 1, 'IP connectivity works, name resolution does not.'),
      single('q2', 'Interface shows "administratively down". Fix?', ['Replace the cable', 'no shutdown', 'Change the VLAN', 'Add a route'], 1, 'It was disabled by configuration.'),
      single('q3', 'traceroute stops after the first hop. What does that suggest?', ['The PC has no IP', 'The first router lacks a route or the next hop is down', 'DNS failure', 'The destination is the first hop'], 1, 'Check the first router\'s routing table and onward link.'),
      single('q4', 'Best first test when "the network is down" for one user?', ['Reboot the core switch', 'Ping the user\'s default gateway', 'Change their IP', 'Replace their PC'], 1, 'Divide and conquer: confirm local connectivity first.'),
      multi('q5', 'Which are part of a structured method?', ['Change several things at once', 'Define the problem', 'Verify the fix', 'Document the cause'], [1, 2, 3], 'One change at a time.'),
    ], { checkpoint: true }),
  ],
};

// ---------------- Projects ----------------

const homeSpec: TopologySpec = {
  devices: [{ id: 'r1', kind: 'router', name: 'Home-Router', x: 300, y: 40 }],
  links: [],
};

const officeVlanSpec: TopologySpec = {
  devices: [
    { id: 'r1', kind: 'router', name: 'Office-R', x: 300, y: 20 },
    { id: 'sw1', kind: 'switch', name: 'Office-SW', x: 300, y: 150 },
    { id: 'pc1', kind: 'pc', name: 'Staff-1', x: 40, y: 300 },
    { id: 'pc2', kind: 'pc', name: 'Staff-2', x: 180, y: 300 },
    { id: 'lap1', kind: 'laptop', name: 'Guest-1', x: 330, y: 300 },
    { id: 'srv1', kind: 'server', name: 'File-Server', x: 520, y: 300 },
  ],
  links: [['r1', 'Gi0/0', 'sw1', 'Gi0/1'], ['pc1', 'Fa0', 'sw1', 'Fa0/1'], ['pc2', 'Fa0', 'sw1', 'Fa0/2'], ['lap1', 'Fa0', 'sw1', 'Fa0/10'], ['srv1', 'Fa0', 'sw1', 'Fa0/20']],
};

const branchesSpec: TopologySpec = {
  devices: [
    { id: 'r1', kind: 'router', name: 'HQ-R', x: 300, y: 40 },
    { id: 'r2', kind: 'router', name: 'BranchA-R', x: 60, y: 160 },
    { id: 'r3', kind: 'router', name: 'BranchB-R', x: 540, y: 160 },
    { id: 'srv1', kind: 'server', name: 'HQ-Server', x: 300, y: 200, ip: '10.0.0.100/24', gateway: '10.0.0.1' },
    { id: 'pc1', kind: 'pc', name: 'A-PC', x: 60, y: 320, ip: '10.1.0.10/24', gateway: '10.1.0.1' },
    { id: 'pc2', kind: 'pc', name: 'B-PC', x: 540, y: 320, ip: '10.2.0.10/24', gateway: '10.2.0.1' },
  ],
  links: [['r1', 'Gi0/0', 'srv1', 'Fa0'], ['r1', 'Gi0/1', 'r2', 'Gi0/1'], ['r1', 'Gi0/2', 'r3', 'Gi0/1'], ['r2', 'Gi0/0', 'pc1', 'Fa0'], ['r3', 'Gi0/0', 'pc2', 'Fa0']],
};

export const projects: ModuleDef = {
  slug: 'projects',
  track: 'core',
  title: 'Capstone Projects',
  summary: 'Apply everything: design, build and verify complete networks from requirements.',
  level: 12,
  prerequisites: ['troubleshooting', 'security-fundamentals'],
  activities: [
    project('home-network-project', 'Project 1: Build a home network', 'From an empty room to a working home LAN.', 30, ['network-design', 'ipv4-addressing', 'devices'], {
      scenario: 'A family needs a home network: two desktop PCs, a laptop and a small NAS (server) for photos. You have the home router. Use 192.168.0.0/24 with the router at 192.168.0.1 on Gi0/0.',
      objective: 'Every device reaches every other device and the router.',
      spec: homeSpec,
      allowTopologyChanges: true,
      tasks: [
        { id: 'devices', title: 'Add the equipment', description: 'One switch, two PCs, one laptop, one server.', checks: [
          { type: 'deviceCount', kind: 'switch', min: 1 }, { type: 'deviceCount', kind: 'pc', min: 2 }, { type: 'deviceCount', kind: 'laptop', min: 1 }, { type: 'deviceCount', kind: 'server', min: 1 },
        ] },
        { id: 'router', title: 'Configure the router LAN interface', checks: [{ type: 'interfaceIp', device: 'r1', iface: 'Gi0/0', ip: '192.168.0.1/24' }, { type: 'interfaceUp', device: 'r1', iface: 'Gi0/0' }] },
        { id: 'verify', title: 'Everything talks', checks: [{ type: 'noErrors' }, { type: 'pingMatrix', kinds: ['pc', 'laptop', 'server', 'router'], label: 'All hosts and the router reach each other' }] },
      ],
      hints: ['Connect the router Gi0/0 to the switch, and every host to the switch.', 'Give each host a unique 192.168.0.x/24 address with gateway 192.168.0.1.', 'Router: `interface g0/0`, `ip address 192.168.0.1 255.255.255.0`, `no shutdown`.'],
      concepts: ['Physical design', 'Addressing plan', 'Gateway configuration'],
      debrief: 'This is the same structure as almost every home network. A real home router also runs DHCP, NAT and Wi-Fi — services you studied in the Network Services module.',
    }, 3),
    project('office-vlan-project', 'Project 2: Multi-VLAN small office', 'Staff, guests and servers on separate VLANs with routing.', 45, ['vlans', 'trunking', 'inter-vlan-routing', 'network-design', 'cli'], {
      scenario: 'Design the office network.\n\n| VLAN | Name | Subnet | Gateway | Ports |\n|---|---|---|---|---|\n| 10 | STAFF | 10.10.10.0/24 | 10.10.10.1 | Fa0/1–2 |\n| 30 | GUEST | 10.30.30.0/24 | 10.30.30.1 | Fa0/10 |\n| 40 | SERVERS | 10.40.40.0/24 | 10.40.40.1 | Fa0/20 |\n\nOffice-R routes between VLANs using sub-interfaces on Gi0/0, connected to Office-SW Gi0/1. Configure the hosts with any valid address in their VLAN\'s subnet.',
      objective: 'All VLANs exist, ports are assigned, routing works and every host reaches the file server.',
      spec: officeVlanSpec,
      tasks: [
        { id: 'vlans', title: 'VLANs created on Office-SW', checks: [{ type: 'vlanExists', device: 'sw1', vlan: 10, name: 'STAFF' }, { type: 'vlanExists', device: 'sw1', vlan: 30, name: 'GUEST' }, { type: 'vlanExists', device: 'sw1', vlan: 40, name: 'SERVERS' }] },
        { id: 'ports', title: 'Ports assigned and trunk configured', checks: [
          { type: 'portAccessVlan', device: 'sw1', iface: 'Fa0/1', vlan: 10 }, { type: 'portAccessVlan', device: 'sw1', iface: 'Fa0/2', vlan: 10 },
          { type: 'portAccessVlan', device: 'sw1', iface: 'Fa0/10', vlan: 30 }, { type: 'portAccessVlan', device: 'sw1', iface: 'Fa0/20', vlan: 40 },
          { type: 'portMode', device: 'sw1', iface: 'Gi0/1', mode: 'trunk' },
        ] },
        { id: 'router', title: 'Router sub-interfaces', checks: [
          { type: 'interfaceIp', device: 'r1', iface: 'Gi0/0.10', ip: '10.10.10.1/24' }, { type: 'interfaceIp', device: 'r1', iface: 'Gi0/0.30', ip: '10.30.30.1/24' }, { type: 'interfaceIp', device: 'r1', iface: 'Gi0/0.40', ip: '10.40.40.1/24' },
        ] },
        { id: 'hosts', title: 'Hosts addressed', checks: [
          { type: 'hostConfig', device: 'pc1', network: '10.10.10.0/24', gateway: '10.10.10.1' }, { type: 'hostConfig', device: 'pc2', network: '10.10.10.0/24', gateway: '10.10.10.1' },
          { type: 'hostConfig', device: 'lap1', network: '10.30.30.0/24', gateway: '10.30.30.1' }, { type: 'hostConfig', device: 'srv1', network: '10.40.40.0/24', gateway: '10.40.40.1' },
        ] },
        { id: 'verify', title: 'Connectivity verified', checks: [{ type: 'noErrors' }, { type: 'pingMatrix' }] },
      ],
      hints: ['Do the switch first: VLANs, access ports, then the trunk to the router.', 'Router: `interface g0/0` → `no shutdown`; then each `interface g0/0.<vlan>` with `encapsulation dot1Q <vlan>` and the gateway address.', 'Hosts: Staff 10.10.10.11/.12, Guest 10.30.30.11, Server 10.40.40.10.'],
      concepts: ['VLAN design', 'Router-on-a-stick', 'Per-VLAN addressing'],
      debrief: 'You built a segmented office. Right now the router forwards between all VLANs — the next step in a real deployment is an ACL that stops GUEST from reaching STAFF and SERVERS (see the ACL lesson).',
    }, 4),
    project('branch-routing-project', 'Project 3: Connect two branches to HQ', 'Point-to-point links, addressing and static routing across three sites.', 45, ['static-routing', 'subnetting', 'network-design', 'cli'], {
      scenario: 'HQ-R connects to Branch A (Gi0/1) and Branch B (Gi0/2). Hosts are configured. All three routers are unconfigured.\n\n| Network | Subnet | Addresses |\n|---|---|---|\n| HQ LAN (HQ-R Gi0/0) | 10.0.0.0/24 | HQ-R .1 |\n| Branch A LAN (BranchA-R Gi0/0) | 10.1.0.0/24 | BranchA-R .1 |\n| Branch B LAN (BranchB-R Gi0/0) | 10.2.0.0/24 | BranchB-R .1 |\n| HQ ↔ A link | 172.16.1.0/30 | HQ-R .1, BranchA-R .2 |\n| HQ ↔ B link | 172.16.2.0/30 | HQ-R .1, BranchB-R .2 |\n\nBranch routers should use a **default route** to HQ; HQ needs specific routes to each branch.',
      objective: 'All three sites communicate.',
      spec: branchesSpec,
      tasks: [
        { id: 'ifaces', title: 'All router interfaces addressed and up', checks: [
          { type: 'interfaceIp', device: 'r1', iface: 'Gi0/0', ip: '10.0.0.1/24' }, { type: 'interfaceIp', device: 'r1', iface: 'Gi0/1', ip: '172.16.1.1/30' }, { type: 'interfaceIp', device: 'r1', iface: 'Gi0/2', ip: '172.16.2.1/30' },
          { type: 'interfaceIp', device: 'r2', iface: 'Gi0/0', ip: '10.1.0.1/24' }, { type: 'interfaceIp', device: 'r2', iface: 'Gi0/1', ip: '172.16.1.2/30' },
          { type: 'interfaceIp', device: 'r3', iface: 'Gi0/0', ip: '10.2.0.1/24' }, { type: 'interfaceIp', device: 'r3', iface: 'Gi0/1', ip: '172.16.2.2/30' },
        ] },
        { id: 'routes', title: 'Routing configured', checks: [
          { type: 'routeExists', device: 'r1', network: '10.1.0.0/24', nextHop: '172.16.1.2' }, { type: 'routeExists', device: 'r1', network: '10.2.0.0/24', nextHop: '172.16.2.2' },
          { type: 'routeExists', device: 'r2', network: '0.0.0.0/0', nextHop: '172.16.1.1' }, { type: 'routeExists', device: 'r3', network: '0.0.0.0/0', nextHop: '172.16.2.1' },
        ] },
        { id: 'verify', title: 'All sites communicate', checks: [{ type: 'noErrors' }, { type: 'pingMatrix' }] },
      ],
      hints: ['Configure and `no shutdown` every interface first, then check `show ip route` for connected routes.', '/30 mask = 255.255.255.252.', 'HQ-R: `ip route 10.1.0.0 255.255.255.0 172.16.1.2`; BranchA-R: `ip route 0.0.0.0 0.0.0.0 172.16.1.1`.'],
      concepts: ['Point-to-point /30 links', 'Hub-and-spoke routing', 'Default vs specific routes'],
      debrief: 'Branch A ↔ Branch B traffic goes via HQ — a hub-and-spoke design. Notice how few routes the branches need thanks to default routing. At larger scale a dynamic routing protocol such as OSPF would maintain these routes automatically.',
    }, 4),
  ],
};

// ---------------- MikroTik track ----------------

export const mikrotik: ModuleDef = {
  slug: 'mikrotik-routeros-fundamentals',
  track: 'mikrotik',
  title: 'RouterOS Fundamentals',
  summary: 'Map your Cisco-style knowledge onto MikroTik RouterOS: interfaces, bridges, addressing, routing, firewall and NAT.',
  level: 6,
  prerequisites: ['routing'],
  activities: [
    lesson('what-is-routeros', 'What is RouterOS?', 'MikroTik\'s operating system and how to reach it.', 7, ['mikrotik-basics'],
      ['Describe RouterOS and its management interfaces'],
      [
        text('**RouterOS** is the operating system on MikroTik RouterBOARD and CHR (cloud) devices. One OS provides routing, switching, firewall, VPN, wireless and QoS.'),
        table(['Interface', 'What it is', 'Typical use'], [
          ['WinBox', 'Native GUI application', 'Day-to-day administration'],
          ['WebFig', 'Browser-based GUI', 'When WinBox is unavailable'],
          ['Terminal (CLI)', 'SSH or console, hierarchical menus', 'Scripting, precise changes'],
          ['API', 'Programmatic access', 'Automation'],
        ]),
        info('All three interfaces edit the same configuration — a rule added in WinBox appears in `/ip firewall filter print` on the CLI.'),
        check('Which MikroTik tool is a native GUI application?', ['WebFig', 'WinBox', 'Terminal', 'The Dude'], 1, 'WinBox.'),
      ]),
    lesson('routeros-cli', 'The RouterOS command line', 'Menus, print, add, set, remove.', 9, ['mikrotik-basics', 'cli'],
      ['Navigate RouterOS menus and use print/add/set/remove'],
      [
        text('RouterOS commands are organised as a **menu tree**. Instead of modes (`configure terminal`), you name the menu path and an action:\n\n```\n/ip address print\n/ip address add address=192.168.88.1/24 interface=ether2\n/ip address set 0 comment="LAN gateway"\n/ip address remove 0\n```'),
        table(['Cisco IOS', 'RouterOS'], [
          ['show ip interface brief', '/ip address print   and   /interface print'],
          ['show ip route', '/ip route print'],
          ['interface g0/1 → ip address …', '/ip address add address=10.0.0.1/24 interface=ether1'],
          ['ip route 0.0.0.0 0.0.0.0 203.0.113.1', '/ip route add dst-address=0.0.0.0/0 gateway=203.0.113.1'],
          ['shutdown / no shutdown', '/interface disable ether3   /   /interface enable ether3'],
          ['show running-config', '/export'],
        ], 'Cisco ↔ RouterOS equivalents'),
        tip('Press Tab to complete and `?` for help, just like on Cisco. Changes in RouterOS apply immediately — there is no separate "copy run start".'),
        check('Which command lists IP addresses on RouterOS?', ['show ip address', '/ip address print', '/print ip', 'ip address show'], 1, '`/ip address print`.'),
      ], 2),
    lesson('interfaces-bridges', 'Interfaces and bridges', 'How RouterOS switches between ports.', 9, ['mikrotik-basics', 'ethernet-switching', 'vlans'],
      ['Explain the role of a bridge in RouterOS'],
      [
        text('On RouterOS each Ethernet port (`ether1`, `ether2`…) is a routed interface by default. To make several ports behave like one switch, you add them to a **bridge**. The bridge is the Layer 2 domain; the gateway IP goes on the bridge interface.\n\n```\n/interface bridge add name=bridge-lan\n/interface bridge port add bridge=bridge-lan interface=ether2\n/interface bridge port add bridge=bridge-lan interface=ether3\n/ip address add address=192.168.88.1/24 interface=bridge-lan\n```'),
        text('VLANs are configured with bridge VLAN filtering:\n\n```\n/interface bridge port set [find interface=ether3] pvid=10\n/interface bridge vlan add bridge=bridge-lan vlan-ids=10 tagged=bridge-lan,ether2 untagged=ether3\n/interface bridge set bridge-lan vlan-filtering=yes\n```'),
        warn('Enabling `vlan-filtering` on the bridge you are managing the router through can lock you out. Plan management access first (or use Safe Mode).'),
        table(['Concept', 'Cisco', 'RouterOS'], [
          ['Access port in VLAN 10', 'switchport access vlan 10', 'bridge port pvid=10 + untagged member'],
          ['Trunk', 'switchport mode trunk', 'tagged member of bridge VLAN entries'],
          ['VLAN gateway', 'Sub-interface / SVI', 'VLAN interface on the bridge with an IP'],
        ]),
        check('Where does the LAN gateway IP usually live on a MikroTik with switched ports?', ['On ether1', 'On the bridge interface', 'On every port', 'In /system'], 1, 'The bridge represents the whole LAN segment.'),
      ], 3),
    lesson('routeros-routing-dhcp', 'Routing, DHCP and DNS on RouterOS', 'The everyday services.', 9, ['mikrotik-basics', 'static-routing', 'network-services'],
      ['Configure a default route, DHCP server and DNS on RouterOS'],
      [
        steps([
          ['WAN address and default route', '```\n/ip address add address=203.0.113.2/30 interface=ether1\n/ip route add dst-address=0.0.0.0/0 gateway=203.0.113.1\n```'],
          ['DHCP server for the LAN', '```\n/ip pool add name=lan-pool ranges=192.168.88.100-192.168.88.200\n/ip dhcp-server network add address=192.168.88.0/24 gateway=192.168.88.1 dns-server=192.168.88.1\n/ip dhcp-server add name=lan-dhcp interface=bridge-lan address-pool=lan-pool disabled=no\n```'],
          ['DNS cache for clients', '```\n/ip dns set servers=1.1.1.1,8.8.8.8 allow-remote-requests=yes\n```'],
        ]),
        warn('`allow-remote-requests=yes` must be paired with a firewall rule that blocks DNS from the WAN, otherwise the router becomes an open resolver.'),
        check('Which RouterOS parameter sets the next hop of a route?', ['next-hop=', 'gateway=', 'via=', 'nexthop-ip='], 1, '`gateway=`.'),
      ], 3),
    lesson('routeros-firewall-nat', 'Firewall and NAT on RouterOS', 'Chains, connection states and masquerade.', 12, ['mikrotik-basics', 'security-fundamentals', 'network-services'],
      ['Explain input/forward/output chains', 'Configure source NAT masquerade'],
      [
        table(['Chain', 'Traffic', 'Example'], [
          ['input', 'Destined TO the router itself', 'WinBox, SSH, DNS to the router'],
          ['forward', 'Passing THROUGH the router', 'LAN users browsing the web'],
          ['output', 'Originated BY the router', 'Router\'s own DNS or NTP queries'],
        ], 'Filter chains'),
        text('A minimal, stateful policy:\n\n```\n/ip firewall filter\nadd chain=input connection-state=established,related action=accept\nadd chain=input connection-state=invalid action=drop\nadd chain=input in-interface=bridge-lan action=accept\nadd chain=input action=drop comment="drop everything else to the router"\nadd chain=forward connection-state=established,related action=accept\nadd chain=forward connection-state=invalid action=drop\nadd chain=forward in-interface=bridge-lan out-interface=ether1 action=accept\nadd chain=forward action=drop\n```'),
        text('PAT for the LAN:\n\n```\n/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade\n```'),
        info('Rules are evaluated top-down per chain, first match wins — the same logic as Cisco ACLs.'),
        check('Traffic from a LAN PC to a website on the Internet is processed in which filter chain?', ['input', 'forward', 'output', 'srcnat only'], 1, 'It passes through the router: forward.'),
      ], 3),
    quiz('mikrotik-checkpoint', 'RouterOS checkpoint', 'Commands, bridges and firewall chains.', ['mikrotik-basics'], [
      single('q1', 'Which command shows the routing table in RouterOS?', ['show ip route', '/ip route print', '/route show', 'print routes'], 1, '`/ip route print`.'),
      single('q2', 'To make ether2–ether5 act as one switch you…', ['Add them to a bridge', 'Give them the same IP', 'Disable them', 'Put them in /system'], 0, 'Bridge ports form one L2 domain.'),
      single('q3', 'Traffic to WinBox on the router hits which chain?', ['forward', 'input', 'output', 'dstnat'], 1, 'Traffic to the router itself = input.'),
      textQ('q4', 'Which NAT action is typically used for PAT on a dynamic WAN address?', ['masquerade'], '`action=masquerade` in the srcnat chain.'),
      single('q5', 'RouterOS equivalent of Cisco "show running-config"?', ['/export', '/system print', '/config show', '/ip print'], 0, '`/export` prints the configuration as commands.'),
    ], { checkpoint: true }),
  ],
};
