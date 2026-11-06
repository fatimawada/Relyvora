import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://relyvora.com';
  const lastModified = new Date();

  const routes = [
    '',
    '/problem',
    '/how-it-works',
    '/pricing',
    '/markets',
    '/faq',
    '/trust-and-safety',
    '/about',
    '/terms',
    '/privacy',
    '/disputes',
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified,
    changeFrequency: route === '' ? 'daily' : 'weekly',
    priority: route === '' ? 1.0 : 0.8,
  }));
}
