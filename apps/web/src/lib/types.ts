// Shapes returned by the API (kept in one place for the UI).
import type { Network, SimEvent, ValidationResult } from '@netforge/sim-engine';

export type Role = 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';
export type ActivityType = 'LESSON' | 'QUIZ' | 'LAB' | 'CHALLENGE' | 'PROJECT';
export type Status = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
export type Mastery = 'NOT_STARTED' | 'LEARNING' | 'PRACTICING' | 'COMPETENT' | 'MASTERED';

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  xp: number;
  dailyGoalMinutes: number;
  experience: string;
}

export interface ActivitySummary {
  id: string;
  slug: string;
  type: ActivityType;
  title: string;
  summary: string;
  order: number;
  estMinutes: number;
  difficulty: number;
  xp: number;
  checkpoint: boolean;
  status: Status;
  bestScore: number | null;
}

export interface ModuleState {
  id: string;
  slug: string;
  trackSlug: string;
  title: string;
  summary: string;
  level: number;
  estMinutes: number;
  prerequisites: { slug: string; title: string }[];
  activities: ActivitySummary[];
  completedCount: number;
  totalCount: number;
  complete: boolean;
  testedOut: boolean;
  locked: boolean;
  lockReason: string | null;
}

export interface TrackState {
  slug: string;
  title: string;
  description: string;
  kind: string;
  modules: ModuleState[];
}

export interface Outcome {
  xpAwarded: number;
  totalXp: number;
  level: number;
  leveledUp: boolean;
  newAchievements: { slug: string; title: string; description: string; icon: string }[];
  bestScore: number;
}

export interface ActivityDetail {
  activity: {
    id: string;
    slug: string;
    type: ActivityType;
    title: string;
    summary: string;
    estMinutes: number;
    difficulty: number;
    xp: number;
    content: unknown;
    skills: { slug: string; name: string }[];
  };
  module: { slug: string; title: string; locked: boolean };
  progress: { status: Status; bestScore: number | null; attempts: number; draft: Network | null; completedAt: string | null };
  bookmarked: boolean;
  prev: { slug: string; title: string; type: ActivityType } | null;
  next: { slug: string; title: string; type: ActivityType } | null;
}

export interface QuizResult {
  score: number;
  passed: boolean;
  passScore: number;
  results: { id: string; correct: boolean; given: unknown; correctAnswer: unknown; explanation: string }[];
  outcome: Outcome;
}

export interface LabResult {
  score: number;
  passed: boolean;
  hintsUsed: number;
  validation: ValidationResult;
  debrief: string | null;
  concepts: string[];
  outcome: Outcome;
}

export interface SubnetResult {
  score: number;
  passed?: boolean;
  overTime?: boolean;
  correct?: number;
  total?: number;
  results: { id: string; correct: boolean; given: string; answer: string; explanation: string }[];
  outcome?: Outcome;
}

export interface SkillRow {
  slug: string;
  name: string;
  domain: string;
  score: number;
  evidence: number;
  mastery: Mastery;
}

export interface PlanItem {
  kind: 'activity' | 'practice';
  slug?: string;
  href?: string;
  title: string;
  type?: ActivityType;
  minutes: number;
  reason: string;
}

export interface Dashboard {
  user: User;
  level: { level: number; currentFloor: number; next: number; progress: number };
  streak: number;
  goal: { minutes: number; doneToday: number };
  weekMinutes: number;
  history: { day: string; minutes: number; xp: number }[];
  nextUp: PlanItem | null;
  plan: PlanItem[];
  currentModule: { slug: string; title: string; completed: number; total: number; level: number } | null;
  counts: Record<'lessons' | 'quizzes' | 'labs' | 'challenges' | 'modules', { done: number; total: number }>;
  quizAverage: number | null;
  labPassRate: number | null;
  strongSkills: SkillRow[];
  weakSkills: SkillRow[];
  skillMap: SkillRow[];
  recentAttempts: { id: string; score: number; passed: boolean; createdAt: string; activity: { slug: string; title: string; type: ActivityType } }[];
  unreadNotifications: number;
}

export type { Network, SimEvent };
