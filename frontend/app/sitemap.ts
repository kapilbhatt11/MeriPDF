import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://www.meripdf.com';
  
  // Public static pages and PDF tools
  const routes = [
    '',
    '/pricing',
    '/privacy',
    '/signup',
    '/login',
    '/tools',
    '/compare-pdf',
    '/compress',
    '/crop-pdf',
    '/edit-pdf',
    '/excel-to-pdf',
    '/extract-pages',
    '/html-to-pdf',
    '/image-to-pdf',
    '/merge-pdf',
    '/organize-pdf',
    '/page-numbers',
    '/pdf-to-excel',
    '/pdf-to-jpg',
    '/pdf-to-pdfa',
    '/pdf-to-ppt',
    '/pdf-to-word',
    '/ppt-to-pdf',
    '/protect-pdf',
    '/redact-pdf',
    '/remove-pages',
    '/repair-pdf',
    '/rotate-pdf',
    '/scan-pdf',
    '/sign-pdf',
    '/split-pdf',
    '/unlock-pdf',
    '/watermark-pdf',
    '/word-to-pdf',
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: route === '' ? 1.0 : 0.8,
  }));
}
