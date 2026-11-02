export const categories = ['Objective-C 与内存管理', '编译与链接', '并发与调度', '性能与稳定性'] as const;
export const categoryKeys = ['objective-c', 'compiler', 'concurrency', 'performance'] as const;
export const categoryHref = (category: string) => `/category/${categoryKeys[categories.indexOf(category as typeof categories[number])]}/`;
export interface SearchEntry { title: string; tags: string[]; category: string; }
export function matchesPost(post: SearchEntry, query: string, category = '') {
  const terms = query.normalize('NFKC').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const text = [post.title, ...post.tags].join(' ').normalize('NFKC').toLocaleLowerCase();
  return (!category || post.category === category) && terms.every(term => text.includes(term));
}
export const formatDate = (date: string) => date.replaceAll('-', '.');
