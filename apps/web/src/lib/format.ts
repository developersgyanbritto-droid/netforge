import type { ActivityType, Mastery } from './types';

export const typeLabel: Record<ActivityType, string> = {
  LESSON: 'Lesson',
  QUIZ: 'Quiz',
  LAB: 'Lab',
  CHALLENGE: 'Challenge',
  PROJECT: 'Project',
};

export const masteryLabel: Record<Mastery, string> = {
  NOT_STARTED: 'Not started',
  LEARNING: 'Learning',
  PRACTICING: 'Practicing',
  COMPETENT: 'Competent',
  MASTERED: 'Mastered',
};

export const masteryTone: Record<Mastery, 'neutral' | 'warning' | 'accent' | 'success'> = {
  NOT_STARTED: 'neutral',
  LEARNING: 'warning',
  PRACTICING: 'accent',
  COMPETENT: 'success',
  MASTERED: 'success',
};

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

export function relativeTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}
