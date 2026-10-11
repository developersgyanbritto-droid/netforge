import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return ['', '/curriculum', '/about', '/register'].map((p) => ({ url: `${site}${p}`, changeFrequency: 'weekly', priority: p === '' ? 1 : 0.7 }));
}
