// Tracks, skills, certification domains and achievements.
// Certification domain titles reference the publicly listed exam topic areas only;
// all teaching material in this repository is original.

export const tracks = [
  { slug: 'core', title: 'Networking Core', kind: 'CORE' as const, order: 1, description: 'From "what is a network?" to designing, configuring and troubleshooting multi-VLAN, multi-router networks.' },
  { slug: 'mikrotik', title: 'MikroTik RouterOS', kind: 'MIKROTIK' as const, order: 2, description: 'Apply your core knowledge to MikroTik RouterOS: interfaces, bridges, addressing, routing, firewall and NAT.' },
];

export const skills = [
  { slug: 'net-basics', name: 'Networking concepts', domain: 'Fundamentals', description: 'What networks are, LAN/WAN, client/server.' },
  { slug: 'devices', name: 'Network devices', domain: 'Fundamentals', description: 'Roles of hosts, switches, routers, servers, firewalls and access points.' },
  { slug: 'data-units', name: 'Data units & performance', domain: 'Fundamentals', description: 'Bits, bandwidth, latency, throughput, frames, packets, segments.' },
  { slug: 'mac-addressing', name: 'MAC addressing', domain: 'Fundamentals', description: 'Layer 2 addressing and its format.' },
  { slug: 'osi-model', name: 'OSI & TCP/IP models', domain: 'Fundamentals', description: 'Layers, encapsulation and protocol placement.' },
  { slug: 'protocols-ports', name: 'Protocols & ports', domain: 'Fundamentals', description: 'TCP vs UDP and well-known port numbers.' },
  { slug: 'ethernet-switching', name: 'Ethernet switching', domain: 'Network Access', description: 'Frame forwarding, MAC learning, flooding, domains.' },
  { slug: 'arp', name: 'ARP', domain: 'Network Access', description: 'Resolving IPv4 addresses to MAC addresses.' },
  { slug: 'ipv4-addressing', name: 'IPv4 addressing', domain: 'IP Connectivity', description: 'Address structure, masks, gateway, address types.' },
  { slug: 'subnetting', name: 'Subnetting', domain: 'IP Connectivity', description: 'Network/broadcast/host ranges and subnet design.' },
  { slug: 'vlsm', name: 'VLSM design', domain: 'IP Connectivity', description: 'Variable-length subnet allocation.' },
  { slug: 'routing-concepts', name: 'Routing concepts', domain: 'IP Connectivity', description: 'Routing tables, longest prefix match, TTL.' },
  { slug: 'static-routing', name: 'Static & default routing', domain: 'IP Connectivity', description: 'Configuring and verifying static routes.' },
  { slug: 'vlans', name: 'VLANs', domain: 'Network Access', description: 'Creating VLANs and access ports.' },
  { slug: 'trunking', name: 'Trunking (802.1Q)', domain: 'Network Access', description: 'Tagged links, allowed and native VLANs.' },
  { slug: 'inter-vlan-routing', name: 'Inter-VLAN routing', domain: 'IP Connectivity', description: 'Router-on-a-stick and SVIs.' },
  { slug: 'network-services', name: 'Network services', domain: 'IP Services', description: 'DHCP, DNS and NAT/PAT.' },
  { slug: 'security-fundamentals', name: 'Security fundamentals', domain: 'Security Fundamentals', description: 'Segmentation, ACL concepts, device hardening.' },
  { slug: 'troubleshooting', name: 'Troubleshooting', domain: 'Operations', description: 'Systematic fault isolation using tools and show commands.' },
  { slug: 'cli', name: 'Device CLI', domain: 'Operations', description: 'Navigating and configuring network devices from the command line.' },
  { slug: 'network-design', name: 'Network design', domain: 'Design', description: 'Planning topologies and addressing for real requirements.' },
  { slug: 'mikrotik-basics', name: 'MikroTik RouterOS', domain: 'MikroTik', description: 'RouterOS structure, configuration and services.' },
];

export const certDomains = [
  { cert: 'FUNDAMENTALS' as const, code: 'F1', title: 'Networking concepts & models', skills: ['net-basics', 'devices', 'data-units', 'osi-model', 'protocols-ports'] },
  { cert: 'FUNDAMENTALS' as const, code: 'F2', title: 'Addressing', skills: ['mac-addressing', 'ipv4-addressing', 'subnetting'] },
  { cert: 'FUNDAMENTALS' as const, code: 'F3', title: 'Operations & troubleshooting', skills: ['troubleshooting', 'cli'] },
  { cert: 'CCNA' as const, code: '1', title: 'Network Fundamentals', skills: ['net-basics', 'devices', 'osi-model', 'protocols-ports', 'ipv4-addressing', 'subnetting', 'vlsm', 'mac-addressing'] },
  { cert: 'CCNA' as const, code: '2', title: 'Network Access', skills: ['ethernet-switching', 'arp', 'vlans', 'trunking'] },
  { cert: 'CCNA' as const, code: '3', title: 'IP Connectivity', skills: ['routing-concepts', 'static-routing', 'inter-vlan-routing'] },
  { cert: 'CCNA' as const, code: '4', title: 'IP Services', skills: ['network-services'] },
  { cert: 'CCNA' as const, code: '5', title: 'Security Fundamentals', skills: ['security-fundamentals'] },
  { cert: 'MTCNA' as const, code: 'RouterOS', title: 'RouterOS introduction', skills: ['mikrotik-basics'] },
  { cert: 'MTCNA' as const, code: 'Routing', title: 'Routing', skills: ['static-routing', 'mikrotik-basics'] },
  { cert: 'MTCNA' as const, code: 'Bridging', title: 'Bridging & switching', skills: ['ethernet-switching', 'vlans', 'mikrotik-basics'] },
  { cert: 'MTCNA' as const, code: 'Firewall', title: 'Firewall & NAT', skills: ['security-fundamentals', 'network-services', 'mikrotik-basics'] },
];

export type AchievementCriteria =
  | { kind: 'lessons_completed'; count: number }
  | { kind: 'labs_completed'; count: number }
  | { kind: 'challenges_completed'; count: number }
  | { kind: 'modules_completed'; count: number }
  | { kind: 'quiz_perfect' }
  | { kind: 'lab_no_hints' }
  | { kind: 'streak'; days: number }
  | { kind: 'xp_total'; xp: number }
  | { kind: 'subnetting_perfect' };

export const achievements: { slug: string; title: string; description: string; icon: string; xp: number; criteria: AchievementCriteria }[] = [
  { slug: 'first-steps', title: 'First Steps', description: 'Complete your first lesson.', icon: 'footprints', xp: 20, criteria: { kind: 'lessons_completed', count: 1 } },
  { slug: 'curious-mind', title: 'Curious Mind', description: 'Complete 10 lessons.', icon: 'book-open', xp: 50, criteria: { kind: 'lessons_completed', count: 10 } },
  { slug: 'scholar', title: 'Scholar', description: 'Complete 40 lessons.', icon: 'graduation-cap', xp: 150, criteria: { kind: 'lessons_completed', count: 40 } },
  { slug: 'hands-on', title: 'Hands-On', description: 'Pass your first lab.', icon: 'wrench', xp: 40, criteria: { kind: 'labs_completed', count: 1 } },
  { slug: 'lab-regular', title: 'Lab Regular', description: 'Pass 5 labs or projects.', icon: 'flask-conical', xp: 100, criteria: { kind: 'labs_completed', count: 5 } },
  { slug: 'lab-veteran', title: 'Lab Veteran', description: 'Pass 10 labs or projects.', icon: 'server', xp: 200, criteria: { kind: 'labs_completed', count: 10 } },
  { slug: 'troubleshooter', title: 'Troubleshooter', description: 'Solve 3 challenges.', icon: 'search-check', xp: 120, criteria: { kind: 'challenges_completed', count: 3 } },
  { slug: 'module-master', title: 'Module Complete', description: 'Complete a full module.', icon: 'layers', xp: 60, criteria: { kind: 'modules_completed', count: 1 } },
  { slug: 'halfway', title: 'Halfway There', description: 'Complete 6 modules.', icon: 'milestone', xp: 200, criteria: { kind: 'modules_completed', count: 6 } },
  { slug: 'flawless', title: 'Flawless', description: 'Score 100% on a quiz.', icon: 'target', xp: 40, criteria: { kind: 'quiz_perfect' } },
  { slug: 'no-hints', title: 'Unassisted', description: 'Pass a lab without using hints.', icon: 'shield-check', xp: 60, criteria: { kind: 'lab_no_hints' } },
  { slug: 'subnet-ace', title: 'Subnet Ace', description: 'Score 100% in a subnetting challenge.', icon: 'binary', xp: 100, criteria: { kind: 'subnetting_perfect' } },
  { slug: 'streak-3', title: 'Consistent', description: 'Study 3 days in a row.', icon: 'flame', xp: 30, criteria: { kind: 'streak', days: 3 } },
  { slug: 'streak-7', title: 'Committed', description: 'Study 7 days in a row.', icon: 'calendar-check', xp: 100, criteria: { kind: 'streak', days: 7 } },
  { slug: 'xp-1000', title: '1K Club', description: 'Earn 1,000 XP.', icon: 'zap', xp: 0, criteria: { kind: 'xp_total', xp: 1000 } },
];
