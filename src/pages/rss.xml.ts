import rss from '@astrojs/rss';
import { getIndex } from '../lib/posts';
export async function GET() {
  return rss({ title: 'ChengzhiHuang', description: 'iOS、运行时与性能分析的技术笔记', site: 'https://chengzhihuang.github.io', items: (await getIndex()).map(post => ({ title: post.title, description: post.description, pubDate: new Date(`${post.date}T00:00:00+08:00`), link: post.href, categories: [post.category, ...post.tags] })), customData: '<language>zh-CN</language>' });
}
