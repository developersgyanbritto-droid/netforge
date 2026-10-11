// Content model: every activity's `content` JSON is validated by these schemas — at seed time,
// on every admin save, and when rendering. Bump `CONTENT_VERSION` on breaking changes.
import { z } from 'zod';

export const CONTENT_VERSION = 1;

const cidr = z.string().regex(/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/, 'Expected CIDR like 192.168.1.10/24');
const ip = z.string().regex(/^\d{1,3}(\.\d{1,3}){3}$/, 'Expected an IPv4 address');
const kind = z.enum(['pc', 'laptop', 'server', 'switch', 'router']);

export const topologySpecSchema = z.object({
  devices: z
    .array(
      z.object({
        id: z.string().min(1).max(30),
        kind,
        name: z.string().max(32).optional(),
        x: z.number(),
        y: z.number(),
        ip: cidr.optional(),
        gateway: ip.optional(),
        interfaces: z
          .record(
            z.object({
              ip: cidr.optional(),
              up: z.boolean().optional(),
              mode: z.enum(['access', 'trunk']).optional(),
              vlan: z.number().int().optional(),
              allowed: z.union([z.literal('all'), z.array(z.number().int())]).optional(),
              native: z.number().int().optional(),
              dot1q: z.number().int().optional(),
              description: z.string().optional(),
            }),
          )
          .optional(),
        vlans: z.record(z.string()).optional(),
        routes: z.array(z.string()).optional(),
      }),
    )
    .max(60),
  links: z.array(z.tuple([z.string(), z.string(), z.string(), z.string()])).max(150),
});

const label = { label: z.string().optional() };
export const checkSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ping'), from: z.string(), to: z.string(), expect: z.enum(['success', 'fail']).optional(), ...label }),
  z.object({ type: z.literal('hostConfig'), device: z.string(), ip: ip.optional(), network: cidr.optional(), gateway: ip.optional(), ...label }),
  z.object({ type: z.literal('interfaceIp'), device: z.string(), iface: z.string(), ip: z.string().optional(), network: cidr.optional(), ...label }),
  z.object({ type: z.literal('interfaceUp'), device: z.string(), iface: z.string(), ...label }),
  z.object({ type: z.literal('vlanExists'), device: z.string(), vlan: z.number().int(), name: z.string().optional(), ...label }),
  z.object({ type: z.literal('portAccessVlan'), device: z.string(), iface: z.string(), vlan: z.number().int(), ...label }),
  z.object({ type: z.literal('portMode'), device: z.string(), iface: z.string(), mode: z.enum(['access', 'trunk']), ...label }),
  z.object({ type: z.literal('trunkAllows'), device: z.string(), iface: z.string(), vlans: z.array(z.number().int()), ...label }),
  z.object({ type: z.literal('routeExists'), device: z.string(), network: cidr, nextHop: ip.optional(), ...label }),
  z.object({ type: z.literal('deviceCount'), kind, min: z.number().int().min(1), ...label }),
  z.object({ type: z.literal('pingMatrix'), kinds: z.array(kind).optional(), ...label }),
  z.object({ type: z.literal('noErrors'), ...label }),
]);

export const labTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  checks: z.array(checkSchema).min(1),
});

// ---------- lesson blocks ----------

const md = z.string().min(1);
export const blockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), md }),
  z.object({ type: z.literal('term'), term: z.string(), expansion: z.string().optional(), definition: z.string() }),
  z.object({ type: z.literal('callout'), variant: z.enum(['info', 'tip', 'warning', 'real-world']), title: z.string().optional(), md }),
  z.object({
    type: z.literal('topology'),
    title: z.string().optional(),
    goal: z.string(),
    spec: topologySpecSchema,
    actions: z.array(z.object({ label: z.string(), from: z.string(), to: ip })).optional(),
    editable: z.boolean().optional(),
    height: z.number().int().min(200).max(700).optional(),
  }),
  z.object({ type: z.literal('encapsulation') }),
  z.object({ type: z.literal('osi') }),
  z.object({ type: z.literal('subnet-explorer'), ip, prefix: z.number().int().min(0).max(32) }),
  z.object({ type: z.literal('binary'), value: z.number().int().min(0).max(255).optional() }),
  z.object({
    type: z.literal('check'),
    question: z.string(),
    options: z.array(z.string()).min(2),
    answer: z.number().int().min(0),
    explanation: z.string(),
  }),
  z.object({ type: z.literal('table'), caption: z.string().optional(), columns: z.array(z.string()), rows: z.array(z.array(z.string())) }),
  z.object({ type: z.literal('steps'), title: z.string().optional(), steps: z.array(z.object({ title: z.string(), md })).min(2) }),
]);

export const lessonContentSchema = z.object({
  objectives: z.array(z.string()).min(1),
  blocks: z.array(blockSchema).min(1),
});

// ---------- assessments ----------

export const questionSchema = z.discriminatedUnion('type', [
  z.object({ id: z.string(), type: z.literal('single'), prompt: z.string(), options: z.array(z.string()).min(2), answer: z.number().int(), explanation: z.string() }),
  z.object({ id: z.string(), type: z.literal('multi'), prompt: z.string(), options: z.array(z.string()).min(2), answer: z.array(z.number().int()).min(1), explanation: z.string() }),
  z.object({ id: z.string(), type: z.literal('text'), prompt: z.string(), answer: z.array(z.string()).min(1), explanation: z.string(), placeholder: z.string().optional() }),
]);

export const quizContentSchema = z.object({
  intro: z.string().optional(),
  passScore: z.number().int().min(1).max(100).default(70),
  /** Checkpoint quizzes are always available and count for test-out */
  checkpoint: z.boolean().default(false),
  questions: z.array(questionSchema).min(1),
});

export const labContentSchema = z.object({
  mode: z.literal('lab').default('lab'),
  kind: z.enum(['configuration', 'troubleshooting', 'design', 'project']).default('configuration'),
  scenario: md,
  objective: z.string(),
  spec: topologySpecSchema,
  tasks: z.array(labTaskSchema).min(1),
  hints: z.array(z.string()).default([]),
  concepts: z.array(z.string()).default([]),
  debrief: z.string().default(''),
  /** Allow adding/removing devices (design challenges & projects) */
  allowTopologyChanges: z.boolean().default(false),
  timeLimitSec: z.number().int().positive().optional(),
});

export const subnettingChallengeSchema = z.object({
  mode: z.literal('subnetting'),
  scenario: md,
  difficulty: z.enum(['easy', 'medium', 'hard']),
  count: z.number().int().min(3).max(30),
  timeLimitSec: z.number().int().positive().optional(),
  passScore: z.number().int().min(1).max(100).default(80),
});

export const challengeContentSchema = z.discriminatedUnion('mode', [labContentSchema.extend({ mode: z.literal('lab') }), subnettingChallengeSchema]);

export type Block = z.infer<typeof blockSchema>;
export type LessonContent = z.infer<typeof lessonContentSchema>;
export type Question = z.infer<typeof questionSchema>;
export type QuizContent = z.infer<typeof quizContentSchema>;
export type LabContent = z.infer<typeof labContentSchema>;
export type SubnettingChallenge = z.infer<typeof subnettingChallengeSchema>;
export type ChallengeContent = z.infer<typeof challengeContentSchema>;

export type ActivityType = 'LESSON' | 'QUIZ' | 'LAB' | 'CHALLENGE' | 'PROJECT';

export function contentSchemaFor(type: ActivityType) {
  switch (type) {
    case 'LESSON':
      return lessonContentSchema;
    case 'QUIZ':
      return quizContentSchema;
    case 'LAB':
    case 'PROJECT':
      return labContentSchema;
    case 'CHALLENGE':
      return challengeContentSchema;
  }
}

export function parseContent(type: ActivityType, content: unknown) {
  return contentSchemaFor(type).safeParse(content);
}

/** Quiz questions without answers/explanations — what the client receives before grading. */
export function publicQuiz(q: QuizContent) {
  return {
    intro: q.intro,
    passScore: q.passScore,
    checkpoint: q.checkpoint,
    questions: q.questions.map((x) =>
      x.type === 'text' ? { id: x.id, type: x.type, prompt: x.prompt, placeholder: x.placeholder } : { id: x.id, type: x.type, prompt: x.prompt, options: x.options },
    ),
  };
}

// ---------- curriculum authoring types ----------

export interface ActivityDef {
  slug: string;
  type: ActivityType;
  title: string;
  summary: string;
  estMinutes: number;
  difficulty?: number;
  xp?: number;
  skills: (string | [string, number])[];
  content: unknown;
}

export interface ModuleDef {
  slug: string;
  track: string;
  title: string;
  summary: string;
  level: number;
  prerequisites: string[];
  activities: ActivityDef[];
}
