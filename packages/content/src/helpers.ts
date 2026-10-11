// Small authoring helpers so curriculum files read like content, not boilerplate.
import type { ActivityDef, Block, Question } from './schema';
import type { TopologySpec } from '@netforge/sim-engine';

type Skills = ActivityDef['skills'];

export function lesson(
  slug: string,
  title: string,
  summary: string,
  estMinutes: number,
  skills: Skills,
  objectives: string[],
  blocks: Block[],
  difficulty = 1,
): ActivityDef {
  return { slug, type: 'LESSON', title, summary, estMinutes, skills, difficulty, xp: 10 + estMinutes, content: { objectives, blocks } };
}

export function quiz(
  slug: string,
  title: string,
  summary: string,
  skills: Skills,
  questions: Question[],
  opts: { checkpoint?: boolean; passScore?: number; intro?: string; difficulty?: number } = {},
): ActivityDef {
  return {
    slug,
    type: 'QUIZ',
    title,
    summary,
    estMinutes: Math.max(5, Math.ceil(questions.length * 1.5)),
    difficulty: opts.difficulty ?? 2,
    xp: opts.checkpoint ? 50 : 30,
    skills,
    content: { intro: opts.intro, passScore: opts.passScore ?? 70, checkpoint: opts.checkpoint ?? false, questions },
  };
}

export interface LabOpts {
  kind?: 'configuration' | 'troubleshooting' | 'design' | 'project';
  scenario: string;
  objective: string;
  spec: TopologySpec;
  tasks: { id: string; title: string; description?: string; checks: unknown[] }[];
  hints?: string[];
  concepts?: string[];
  debrief?: string;
  allowTopologyChanges?: boolean;
  timeLimitSec?: number;
}

export function lab(slug: string, title: string, summary: string, estMinutes: number, skills: Skills, o: LabOpts, difficulty = 2): ActivityDef {
  return { slug, type: 'LAB', title, summary, estMinutes, skills, difficulty, xp: 60 + difficulty * 15, content: { mode: 'lab', ...o, kind: o.kind ?? 'configuration' } };
}

export function challenge(slug: string, title: string, summary: string, estMinutes: number, skills: Skills, o: LabOpts, difficulty = 3): ActivityDef {
  return { slug, type: 'CHALLENGE', title, summary, estMinutes, skills, difficulty, xp: 80 + difficulty * 15, content: { mode: 'lab', ...o, kind: o.kind ?? 'troubleshooting' } };
}

export function project(slug: string, title: string, summary: string, estMinutes: number, skills: Skills, o: LabOpts, difficulty = 4): ActivityDef {
  return { slug, type: 'PROJECT', title, summary, estMinutes, skills, difficulty, xp: 200 + difficulty * 25, content: { mode: 'lab', ...o, kind: 'project' } };
}

// ---- block shorthands ----
export const text = (md: string): Block => ({ type: 'text', md });
export const term = (t: string, definition: string, expansion?: string): Block => ({ type: 'term', term: t, definition, ...(expansion ? { expansion } : {}) });
export const info = (md: string, title?: string): Block => ({ type: 'callout', variant: 'info', md, ...(title ? { title } : {}) });
export const tip = (md: string, title?: string): Block => ({ type: 'callout', variant: 'tip', md, ...(title ? { title } : {}) });
export const warn = (md: string, title?: string): Block => ({ type: 'callout', variant: 'warning', md, ...(title ? { title } : {}) });
export const realWorld = (md: string, title?: string): Block => ({ type: 'callout', variant: 'real-world', md, ...(title ? { title } : {}) });
export const check = (question: string, options: string[], answer: number, explanation: string): Block => ({ type: 'check', question, options, answer, explanation });
export const table = (columns: string[], rows: string[][], caption?: string): Block => ({ type: 'table', columns, rows, ...(caption ? { caption } : {}) });
export const steps = (s: [string, string][], title?: string): Block => ({ type: 'steps', steps: s.map(([t, m]) => ({ title: t, md: m })), ...(title ? { title } : {}) });
export const topo = (spec: TopologySpec, goal: string, actions?: { label: string; from: string; to: string }[], title?: string, height?: number): Block => ({
  type: 'topology',
  spec,
  goal,
  ...(actions ? { actions } : {}),
  ...(title ? { title } : {}),
  ...(height ? { height } : {}),
});

// ---- question shorthands ----
export const single = (id: string, prompt: string, options: string[], answer: number, explanation: string): Question => ({ id, type: 'single', prompt, options, answer, explanation });
export const multi = (id: string, prompt: string, options: string[], answer: number[], explanation: string): Question => ({ id, type: 'multi', prompt, options, answer, explanation });
export const textQ = (id: string, prompt: string, answer: string[], explanation: string, placeholder?: string): Question => ({ id, type: 'text', prompt, answer, explanation, ...(placeholder ? { placeholder } : {}) });
