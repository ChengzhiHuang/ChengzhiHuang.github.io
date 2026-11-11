export const categories = ['Objective-C 与内存管理', '编译与链接', '并发与调度', '性能与稳定性'] as const;
export const categoryKeys = ['objective-c', 'compiler', 'concurrency', 'performance'] as const;
export const categoryHref = (category: string) => `/category/${categoryKeys[categories.indexOf(category as typeof categories[number])]}/`;

export interface SearchEntry {
  title: string;
  tags: string[];
  category: string;
  description?: string;
  headings?: string[];
}

export function matchesPost(post: SearchEntry, query: string, category = '') {
  const terms = query.normalize('NFKC').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const text = [post.title, ...post.tags, post.description || '', ...(post.headings || [])]
    .join(' ')
    .normalize('NFKC')
    .toLocaleLowerCase();
  return (!category || post.category === category) && terms.every(term => text.includes(term));
}

export const formatDate = (date: string) => date.replaceAll('-', '.');

function cleanHeading(raw: string): string {
  return raw
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/(\*\*|~~|`)/g, '')
    .replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractHeadingTexts(markdown: string): string[] {
  const seen = new Set<string>();
  let fence: string | null = null;
  for (const rawLine of markdown.split('\n')) {
    const stripped = rawLine.replace(/^\s*>\s?/, '');
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(stripped);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1];
      else if (fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    const headingMatch = /^#{1,4}\s+(.+?)\s*$/.exec(stripped);
    if (!headingMatch) continue;
    const text = cleanHeading(headingMatch[1]);
    if (text) seen.add(text);
  }
  return [...seen];
}

export function estimateReadingMinutes(markdown: string): number {
  let fence: string | null = null;
  let codeLines = 0;
  let images = 0;
  const proseLines: string[] = [];
  for (const rawLine of markdown.split('\n')) {
    const stripped = rawLine.replace(/^\s*>\s?/, '');
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(stripped);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1];
      else if (fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) {
      if (stripped.trim()) codeLines++;
      continue;
    }
    images += (stripped.match(/!\[[^\]]*\]\(/g) || []).length;
    proseLines.push(stripped);
  }
  const prose = proseLines.join('\n').replace(/<[^>]+>/g, ' ');
  const cjk = (prose.match(/[\p{Script=Han}]/gu) || []).length;
  const words = (prose.match(/[A-Za-z0-9_]+/g) || []).length;
  const codeMinutes = Math.min(codeLines, 320) / 28 + Math.max(0, codeLines - 320) / 80;
  const minutes = cjk / 380 + words / 220 + codeMinutes + images * 0.12;
  return Math.max(1, Math.round(minutes));
}
