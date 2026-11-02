import { getCollection } from 'astro:content';
export async function getPosts() {
  return (await getCollection('posts')).sort((a, b) => b.data.date.localeCompare(a.data.date) || a.data.permalink.localeCompare(b.data.permalink));
}
export function postHref(permalink: string) { return `/posts/${permalink}/`; }
export async function getIndex() {
  return (await getPosts()).map(({ data }) => ({ ...data, href: postHref(data.permalink) }));
}
export async function getAttachments() {
  const owners = new Map((await getPosts()).map(post => [post.data.permalink, post]));
  return (await getCollection('attachments')).map(entry => {
    const match = /^([a-z0-9-]+)\/attachments\/([a-zA-Z0-9._-]+)$/.exec(entry.id);
    const owner = match && owners.get(match[1]);
    if (!match || !owner) throw new Error(`Attachment has no owning article: ${entry.id}`);
    const name = match[2];
    return { entry, owner, name, href: `/posts/${owner.data.permalink}/attachments/${name}/`, download: `/files/${owner.data.permalink}/${name}.md` };
  });
}
