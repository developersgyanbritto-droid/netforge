import Link from 'next/link';
import { ArrowRight, Bug, Eye, FlaskConical, GraduationCap, Hammer, Layers, MousePointerClick, Network, Terminal, Wrench } from 'lucide-react';
import { ButtonLink } from '@/components/ui';
import { HeroSim } from '@/components/site/HeroSim';
import { loadPublicCurriculum } from '@/lib/server-curriculum';

const LOOP = [
  { icon: Eye, title: 'See', text: 'Concepts are drawn, not described. Every lesson shows the network it talks about.' },
  { icon: MousePointerClick, title: 'Interact', text: 'Click devices, open their tables, send packets and watch each hop decide.' },
  { icon: Hammer, title: 'Build', text: 'Drag devices onto a canvas, cable them, configure IPs, VLANs and routes.' },
  { icon: Bug, title: 'Break & debug', text: 'Troubleshooting challenges hand you a broken network and a ticket from a user.' },
  { icon: GraduationCap, title: 'Prove it', text: 'Labs are validated by the simulation engine on the server — not by a checkbox.' },
];

export default async function Landing() {
  const curriculum = await loadPublicCurriculum();
  const core = curriculum.find((t) => t.slug === 'core');
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: 'Networking Core — from zero to multi-VLAN routed networks',
    description: 'Interactive networking curriculum with simulations, labs and troubleshooting challenges.',
    provider: { '@type': 'Organization', name: 'NetForge Academy' },
    hasCourseInstance: { '@type': 'CourseInstance', courseMode: 'online', courseWorkload: 'PT60H' },
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--accent-soft),transparent_60%)] opacity-70" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 lg:grid-cols-[1fr_1.15fr] lg:py-20">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-success" /> Beginner → CCNA-level practical skills
            </p>
            <h1 className="text-4xl leading-[1.08] font-semibold tracking-tight sm:text-5xl">Learn networking by building networks.</h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              Interactive lessons, a real network simulation engine and validated hands-on labs. Configure switches and routers, send packets, break things — and understand exactly why they broke.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/register" size="lg">
                Start learning — free <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink href="/curriculum" size="lg" variant="outline">
                Explore the curriculum
              </ButtonLink>
            </div>
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 text-sm">
              {[
                [String(curriculum.reduce((s, t) => s + t.modules.length, 0) || 14), 'modules'],
                [String(core?.modules.reduce((s, m) => s + m.labs, 0) || 25), 'labs & challenges'],
                ['IOS-style', 'CLI'],
              ].map(([v, k]) => (
                <div key={k}>
                  <dt className="sr-only">{k}</dt>
                  <dd className="text-2xl font-semibold">{v}</dd>
                  <dd className="text-muted">{k}</dd>
                </div>
              ))}
            </dl>
          </div>
          <HeroSim />
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">Not another video course.</h2>
        <p className="mt-2 max-w-2xl text-muted">Every concept follows the same loop: learn it, see it, simulate it, practise it, make mistakes, troubleshoot, then build a real project with it.</p>
        <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {LOOP.map((s, i) => (
            <li key={s.title} className="rounded-xl border border-border bg-surface p-4">
              <div className="mb-3 flex items-center justify-between">
                <s.icon className="h-5 w-5 text-accent" aria-hidden />
                <span className="font-mono text-xs text-faint">0{i + 1}</span>
              </div>
              <h3 className="font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="labs" className="border-y border-border bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">A simulator that keeps real state.</h2>
            <p className="mt-2 text-muted">
              Behind every lab is a deterministic engine modelling interfaces, MAC tables, ARP caches, VLANs, trunks, routing tables and TTL. Change an IP and the behaviour changes. Remove a route and replies stop — and the engine tells you where and why.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                [Network, 'Topology builder', 'PCs, laptops, servers, switches and routers on a drag-and-drop canvas.'],
                [Terminal, 'Real command line', 'show ip route, show vlan brief, switchport, ip route, ping, tracert — output generated from live state.'],
                [Layers, 'Packet inspector', 'Step through every frame: Ethernet, 802.1Q tag, ARP, IP and ICMP headers.'],
                [Wrench, 'Error-based learning', '"Your gateway 192.168.20.1 is not in your network 192.168.10.0/24" instead of "wrong".'],
                [FlaskConical, 'Validated labs', 'Objectives are checked by the server re-running the engine on your configuration.'],
              ].map(([Icon, t, d]) => {
                const I = Icon as typeof Network;
                return (
                  <li key={t as string} className="flex gap-3">
                    <I className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                    <span>
                      <strong>{t as string}.</strong> <span className="text-muted">{d as string}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-[#0b0f14] p-4 font-mono text-[12.5px] leading-relaxed text-[#c9d6e3]" aria-label="Example CLI session">
            <p className="text-[#7c8a9b]">! Lab: Build router-on-a-stick</p>
            <p>
              <span className="text-[#7ee0f1]">Gateway-R(config)#</span> interface g0/0.20
            </p>
            <p>
              <span className="text-[#7ee0f1]">Gateway-R(config-subif)#</span> encapsulation dot1Q 20
            </p>
            <p>
              <span className="text-[#7ee0f1]">Gateway-R(config-subif)#</span> ip address 10.20.0.1 255.255.255.0
            </p>
            <p>
              <span className="text-[#7ee0f1]">Gateway-R(config-subif)#</span> do show ip route
            </p>
            <p className="text-[#9fb0c2]">C        10.10.0.0/24 is directly connected, GigabitEthernet0/0.10</p>
            <p className="text-[#9fb0c2]">C        10.20.0.0/24 is directly connected, GigabitEthernet0/0.20</p>
            <p className="mt-2">
              <span className="text-[#7ee0f1]">C:\Sales-F1&gt;</span> ping 10.20.0.12
            </p>
            <p className="text-[#9fb0c2]">Reply from 10.20.0.12: bytes=32 TTL=63</p>
            <p className="mt-2 text-[#4ade80]">✓ Task 3: Full connectivity — passed</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">A guided path, not a pile of videos.</h2>
            <p className="mt-2 max-w-2xl text-muted">Modules unlock as you master their prerequisites. Already experienced? Pass a checkpoint quiz to test out.</p>
          </div>
          <Link href="/curriculum" className="flex items-center gap-1 text-sm font-medium text-accent hover:underline">
            Full curriculum <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <ol className="mt-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(core?.modules ?? []).map((m) => (
            <li key={m.slug} className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-2 font-mono text-xs font-semibold">{m.level}</span>
              <div>
                <h3 className="text-sm font-semibold">{m.title}</h3>
                <p className="mt-0.5 text-xs text-muted">
                  {m.lessons} lessons · {m.labs} labs & challenges
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Start with &ldquo;What is a network?&rdquo;</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted">Finish able to design, configure, troubleshoot and explain a multi-device network — and ready to pursue certifications like CCNA or MTCNA.</p>
          <ButtonLink href="/register" size="lg" className="mt-8">
            Create your free account <ArrowRight className="h-4 w-4" />
          </ButtonLink>
          <p className="mt-4 text-xs text-faint">No certification is awarded by this platform. Content is original and aligned to public exam topic areas.</p>
        </div>
      </section>
    </>
  );
}
