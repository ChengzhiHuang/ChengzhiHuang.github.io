import { getCollection } from 'astro:content';
import { attachmentHref, attachmentLanguage } from './attachments.mjs';
const codeFiles = import.meta.glob<string>('/src/content/posts/*/attachments/*.{py,c,h,cpp,m,mm,json,plist,txt,sh}', { query: '?raw', import: 'default', eager: true });
export async function getPosts() {
  return (await getCollection('posts')).sort((a, b) => b.data.date.localeCompare(a.data.date) || a.data.permalink.localeCompare(b.data.permalink));
}
export function postHref(permalink: string) { return `/posts/${permalink}/`; }
export async function getIndex() {
  return (await getPosts()).map(({ data }) => ({ ...data, href: postHref(data.permalink) }));
}
export async function getAttachments() {
  const owners = new Map((await getPosts()).map(post => [post.data.permalink, post]));
  const markdown = (await getCollection('attachments')).map(entry => {
    const match = /^([a-z0-9-]+)\/attachments\/([a-zA-Z0-9._-]+)$/.exec(entry.id);
    const owner = match && owners.get(match[1]);
    if (!match || !owner) throw new Error(`Attachment has no owning article: ${entry.id}`);
    const name = match[2];
    return { kind: 'markdown' as const, entry, owner, name, filename: `${name}.md`, href: attachmentHref(owner.data.permalink, `${name}.md`), download: `/files/${owner.data.permalink}/${name}.md` };
  });
  const code = Object.entries(codeFiles).map(([file, text]) => {
    const match = /^\/src\/content\/posts\/([a-z0-9-]+)\/attachments\/([a-zA-Z0-9._-]+)$/.exec(file);
    const owner = match && owners.get(match[1]);
    if (!match || !owner) throw new Error(`Attachment has no owning article: ${file}`);
    const filename = match[2];
    return { kind: 'code' as const, owner, name: filename, filename, text, language: attachmentLanguage(filename)!, href: attachmentHref(owner.data.permalink, filename), download: `/files/${owner.data.permalink}/${filename}` };
  });
  return [...markdown, ...code];
}
