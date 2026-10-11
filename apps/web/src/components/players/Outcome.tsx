'use client';

import { Award, Sparkles, TrendingUp } from 'lucide-react';
import type { Outcome } from '@/lib/types';

export function OutcomeBanner({ outcome }: { outcome?: Outcome }) {
  if (!outcome) return null;
  if (!outcome.xpAwarded && !outcome.newAchievements.length && !outcome.leveledUp) return null;
  return (
    <div className="space-y-2 rounded-lg border border-accent/30 bg-accent-soft/50 p-3 text-sm" role="status">
      {outcome.xpAwarded > 0 && (
        <p className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" /> <strong>+{outcome.xpAwarded} XP</strong> <span className="text-muted">({outcome.totalXp} total)</span>
        </p>
      )}
      {outcome.leveledUp && (
        <p className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-success" /> Level up — you are now <strong>level {outcome.level}</strong>.
        </p>
      )}
      {outcome.newAchievements.map((a) => (
        <p key={a.slug} className="flex items-center gap-2">
          <Award className="h-4 w-4 text-warning" /> Achievement unlocked: <strong>{a.title}</strong> <span className="text-muted">— {a.description}</span>
        </p>
      ))}
    </div>
  );
}
