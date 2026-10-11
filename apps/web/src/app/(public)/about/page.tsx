import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About',
  description: 'Why NetForge Academy exists and how it teaches networking through simulation and practice.',
};

export default function AboutPage() {
  return (
    <article className="prose-nf mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">About NetForge Academy</h1>
      <p className="text-muted">Networking is usually taught as something to memorise: layer numbers, port lists and command syntax. We think it should be something you can see, build, break and fix.</p>
      <h2 className="mt-8 text-xl font-semibold">How we teach</h2>
      <ul>
        <li><strong>Learn → Visualise → Simulate → Practise → Troubleshoot → Build.</strong> Every concept follows this loop.</li>
        <li><strong>A real engine.</strong> Labs run on a deterministic simulation of switches, routers and hosts. Outputs are computed from state, never canned.</li>
        <li><strong>Mistakes are lessons.</strong> When something fails, the platform explains the rule you broke, not just that you were wrong.</li>
        <li><strong>Prerequisites matter.</strong> Modules unlock in order, but experienced learners can test out with checkpoint quizzes.</li>
      </ul>
      <h2 className="mt-8 text-xl font-semibold">What to expect</h2>
      <p>Completing the curriculum builds a solid, practical foundation — enough to pursue certifications such as CCNA or MikroTik MTCNA and junior network roles. It does not make anyone an expert overnight, and it does not award certifications. All material is original and aligned to publicly listed exam topic areas; we are not affiliated with Cisco or MikroTik.</p>
      <h2 className="mt-8 text-xl font-semibold">What the simulator models today</h2>
      <p>Ethernet switching with MAC learning and flooding, VLANs, 802.1Q trunks and native VLANs, ARP, IPv4 addressing, connected/static/default routing with longest-prefix match, router-on-a-stick sub-interfaces, TTL, ICMP echo/time-exceeded/unreachable, ping and traceroute, broadcast-storm detection, and an IOS-style CLI. DHCP, DNS, NAT, STP, OSPF, IPv6 and a RouterOS CLI are on the roadmap.</p>
    </article>
  );
}
