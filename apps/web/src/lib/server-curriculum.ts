import 'server-only';

export interface PublicModule {
  slug: string;
  title: string;
  summary: string;
  level: number;
  estMinutes: number;
  lessons: number;
  labs: number;
  quizzes: number;
  prerequisites: string[];
  activities: { slug: string; title: string; type: string; estMinutes: number }[];
}
export interface PublicTrack {
  slug: string;
  title: string;
  description: string;
  modules: PublicModule[];
}

interface ApiTrack {
  slug: string;
  title: string;
  description: string;
  modules: { slug: string; title: string; summary: string; level: number; estMinutes: number; prerequisites: { title: string }[]; activities: { slug: string; title: string; type: string; estMinutes: number }[] }[];
}

/** Server-side fetch of the public curriculum (ISR, 5 min). Returns [] if the API is unreachable. */
export async function loadPublicCurriculum(): Promise<PublicTrack[]> {
  const base = process.env.API_URL ?? 'http://127.0.0.1:4000';
  try {
    const res = await fetch(`${base}/api/v1/curriculum`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const json = (await res.json()) as { tracks: ApiTrack[] };
    return json.tracks.map((t) => ({
      slug: t.slug,
      title: t.title,
      description: t.description,
      modules: t.modules.map((m) => ({
        slug: m.slug,
        title: m.title,
        summary: m.summary,
        level: m.level,
        estMinutes: m.estMinutes,
        lessons: m.activities.filter((a) => a.type === 'LESSON').length,
        quizzes: m.activities.filter((a) => a.type === 'QUIZ').length,
        labs: m.activities.filter((a) => ['LAB', 'CHALLENGE', 'PROJECT'].includes(a.type)).length,
        prerequisites: m.prerequisites.map((p) => p.title),
        activities: m.activities.map((a) => ({ slug: a.slug, title: a.title, type: a.type, estMinutes: a.estMinutes })),
      })),
    }));
  } catch {
    return [];
  }
}
