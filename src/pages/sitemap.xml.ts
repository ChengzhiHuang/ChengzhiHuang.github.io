import { getIndex, getAttachments } from '../lib/posts';
import { categoryKeys } from '../lib/model';
export async function GET() {
  const paths = ['/', '/about/', ...categoryKeys.map(key => `/category/${key}/`), ...(await getIndex()).map(post => post.href), ...(await getAttachments()).map(attachment => attachment.href)];
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path => `<url><loc>https://chengzhihuang.github.io${path}</loc></url>`).join('')}</urlset>`, { headers: { 'Content-Type': 'application/xml' } });
}
