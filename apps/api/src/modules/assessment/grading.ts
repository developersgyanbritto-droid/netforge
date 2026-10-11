import { buildNetwork, checkNetworkIntegrity, networkSchema, validateLab, type LabTask, type Network } from '@netforge/sim-engine';
import type { LabContent, QuizContent } from '@netforge/content';
import { unprocessable } from '../../lib/errors';
import { labScore } from '../gamification/rules';

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function gradeQuiz(quiz: QuizContent, answers: Record<string, unknown>) {
  const results = quiz.questions.map((q) => {
    const given = answers[q.id];
    let correct = false;
    if (q.type === 'single') correct = given === q.answer;
    else if (q.type === 'multi') {
      const g = Array.isArray(given) ? [...new Set(given as number[])].sort() : [];
      const want = [...q.answer].sort();
      correct = g.length === want.length && g.every((v, i) => v === want[i]);
    } else {
      correct = typeof given === 'string' && q.answer.some((a) => norm(a) === norm(given));
    }
    const correctAnswer = q.type === 'text' ? q.answer[0] : q.answer;
    return { id: q.id, correct, given: given ?? null, correctAnswer, explanation: q.explanation };
  });
  const correctCount = results.filter((r) => r.correct).length;
  const score = Math.round((correctCount / quiz.questions.length) * 100);
  return { score, passed: score >= quiz.passScore, mistakes: quiz.questions.length - correctCount, results };
}

/** Parses an untrusted topology document; throws 422 with a readable reason. */
export function parseNetwork(raw: unknown): Network {
  const parsed = networkSchema.safeParse(raw);
  if (!parsed.success) throw unprocessable('The submitted topology is not valid', parsed.error.issues.slice(0, 5));
  const integrity = checkNetworkIntegrity(parsed.data);
  if (integrity) throw unprocessable(integrity);
  return parsed.data as Network;
}

export function gradeLab(lab: LabContent, raw: unknown, hintsUsed: number) {
  const net = parseNetwork(raw);
  if (!lab.allowTopologyChanges) {
    // Devices are fixed in this lab: same set of ids and kinds as the starting topology.
    const original = buildNetwork(lab.spec);
    const want = original.devices.map((d) => `${d.id}:${d.kind}`).sort().join(',');
    const got = net.devices.map((d) => `${d.id}:${d.kind}`).sort().join(',');
    if (want !== got) throw unprocessable('This lab does not allow adding or removing devices. Reset the lab and try again.');
  }
  const validation = validateLab(net, lab.tasks as LabTask[]);
  const hints = Math.max(0, Math.min(hintsUsed, lab.hints.length));
  const score = labScore(validation.passedChecks, validation.totalChecks, hints, validation.passed);
  return {
    score,
    passed: validation.passed,
    hintsUsed: hints,
    mistakes: validation.totalChecks - validation.passedChecks,
    validation,
  };
}
