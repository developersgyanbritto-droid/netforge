// Deterministic pseudo-random generation (seeded) so the server can regenerate and grade any
// practice set the client received, without storing it.
import { hostCount, ipToNum, numToIp, prefixForHosts, prefixToMask, subnetInfo, networkNum } from './ip';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type SubnetQuestionKind = 'network' | 'broadcast' | 'first-host' | 'last-host' | 'hosts' | 'mask' | 'prefix-for-hosts' | 'same-subnet';

export interface SubnetQuestion {
  id: string;
  kind: SubnetQuestionKind;
  prompt: string;
  /** Data for visual aids */
  ip?: string;
  prefix?: number;
  answer: string;
  explanation: string;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

const KINDS: Record<Difficulty, SubnetQuestionKind[]> = {
  easy: ['network', 'hosts', 'mask', 'broadcast'],
  medium: ['network', 'broadcast', 'first-host', 'last-host', 'hosts', 'prefix-for-hosts', 'mask'],
  hard: ['network', 'broadcast', 'first-host', 'last-host', 'prefix-for-hosts', 'same-subnet'],
};

const PREFIXES: Record<Difficulty, number[]> = {
  easy: [8, 16, 24, 24, 25, 26],
  medium: [19, 20, 22, 25, 26, 27, 28, 29],
  hard: [11, 13, 18, 21, 23, 27, 29, 30],
};

function randomPrivateIp(rnd: () => number): string {
  const pick = rnd();
  const r = () => Math.floor(rnd() * 256);
  if (pick < 0.34) return `10.${r()}.${r()}.${r()}`;
  if (pick < 0.67) return `172.${16 + Math.floor(rnd() * 16)}.${r()}.${r()}`;
  return `192.168.${r()}.${r()}`;
}

export function generateSubnetQuestions(seed: number, count = 10, difficulty: Difficulty = 'medium'): SubnetQuestion[] {
  const rnd = mulberry32(seed);
  const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const out: SubnetQuestion[] = [];
  for (let i = 0; i < count; i++) {
    const kind = pick(KINDS[difficulty]);
    const prefix = pick(PREFIXES[difficulty]);
    const ip = randomPrivateIp(rnd);
    const info = subnetInfo(ip, prefix);
    const id = `q${i + 1}`;
    const blockNote = prefix % 8 === 0 ? '' : ` The block size in the interesting octet is ${2 ** ((32 - prefix) % 8 || 8)}.`;
    switch (kind) {
      case 'network':
        out.push({ id, kind, ip, prefix, prompt: `What is the network address of ${ip}/${prefix}?`, answer: info.network, explanation: `AND the address with the mask ${info.mask}: the host bits become 0 → ${info.network}.${blockNote}` });
        break;
      case 'broadcast':
        out.push({ id, kind, ip, prefix, prompt: `What is the broadcast address of ${ip}/${prefix}?`, answer: info.broadcast, explanation: `Set all ${32 - prefix} host bits to 1 → ${info.broadcast}.${blockNote}` });
        break;
      case 'first-host':
        out.push({ id, kind, ip, prefix, prompt: `What is the first usable host address in the subnet of ${ip}/${prefix}?`, answer: info.firstHost!, explanation: `Network ${info.network} + 1 = ${info.firstHost}.` });
        break;
      case 'last-host':
        out.push({ id, kind, ip, prefix, prompt: `What is the last usable host address in the subnet of ${ip}/${prefix}?`, answer: info.lastHost!, explanation: `Broadcast ${info.broadcast} − 1 = ${info.lastHost}.` });
        break;
      case 'hosts':
        out.push({ id, kind, prefix, prompt: `How many usable host addresses does a /${prefix} network provide?`, answer: String(hostCount(prefix)), explanation: `2^${32 - prefix} − 2 = ${hostCount(prefix)} (network and broadcast addresses are not usable).` });
        break;
      case 'mask':
        out.push({ id, kind, prefix, prompt: `Write /${prefix} as a dotted-decimal subnet mask.`, answer: prefixToMask(prefix), explanation: `${prefix} one-bits followed by ${32 - prefix} zero-bits = ${prefixToMask(prefix)}.` });
        break;
      case 'prefix-for-hosts': {
        const hosts = 2 + Math.floor(rnd() * (difficulty === 'hard' ? 4000 : 500));
        const p = prefixForHosts(hosts);
        out.push({ id, kind, prompt: `A department needs ${hosts} host addresses. What is the longest prefix (smallest subnet) that fits? Answer like /24.`, answer: `/${p}`, explanation: `/${p} gives ${hostCount(p)} usable hosts; /${p + 1} would give only ${hostCount(p + 1)}.` });
        break;
      }
      case 'same-subnet': {
        const base = ipToNum(info.network);
        const size = 2 ** (32 - prefix);
        const sameSide = rnd() < 0.5;
        const otherNum = sameSide ? base + Math.floor(rnd() * (size - 2)) + 1 : (base + size + Math.floor(rnd() * Math.max(1, size - 2)) + 1) >>> 0;
        const other = numToIp(otherNum >>> 0);
        const same = networkNum(ipToNum(other), prefix) === networkNum(ipToNum(ip), prefix);
        out.push({ id, kind, ip, prefix, prompt: `With a /${prefix} mask, are ${ip} and ${other} in the same subnet? Answer yes or no.`, answer: same ? 'yes' : 'no', explanation: `${ip} is in ${info.network}/${prefix}; ${other} is in ${numToIp(networkNum(ipToNum(other), prefix))}/${prefix}.` });
        break;
      }
    }
  }
  return out;
}

export function normaliseAnswer(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '');
}

export function gradeSubnetAnswers(seed: number, count: number, difficulty: Difficulty, answers: Record<string, string>) {
  const qs = generateSubnetQuestions(seed, count, difficulty);
  const results = qs.map((q) => {
    const given = normaliseAnswer(answers[q.id] ?? '');
    const want = normaliseAnswer(q.answer);
    const correct = given === want || (q.kind === 'prefix-for-hosts' && `/${given}` === want);
    return { id: q.id, correct, given: answers[q.id] ?? '', answer: q.answer, explanation: q.explanation };
  });
  const correct = results.filter((r) => r.correct).length;
  return { results, correct, total: qs.length, score: Math.round((correct / qs.length) * 100) };
}
