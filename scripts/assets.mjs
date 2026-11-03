import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inside, walk } from './guards.mjs';
import { attachmentHref } from '../src/lib/attachments.mjs';

// Markdown attachments stay alongside their article. The build copies only this
// explicit subtree; raw exports or adjacent workspace files are never considered.
export function remarkAttachments() {
  return (tree, file) => {
    if (!file.path) return;
    const article = path.basename(path.dirname(file.path)) === 'attachments' ? path.dirname(path.dirname(file.path)) : path.dirname(file.path);
    const slug = path.basename(article);
    function visit(node) {
      if (node.type === 'link' && node.url?.startsWith('./attachments/')) {
        const name = decodeURIComponent(node.url.slice('./attachments/'.length));
        if (!/^[a-zA-Z0-9._-]+$/.test(name) || name === '..') throw new Error('Invalid attachment name');
        node.url = attachmentHref(slug, name);
      }
      for (const child of node.children || []) visit(child);
    }
    visit(tree);
  };
}
export function localAttachments() {
  let root;
  const route = async url => {
    const match = /^\/files\/([a-z0-9-]+)\/([a-zA-Z0-9._-]+)$/.exec(url);
    if (!match || match[2] === '..') return null;
    const base = path.join(root, 'src/content/posts', match[1], 'attachments');
    return inside(base, path.join(base, match[2]));
  };
  return { name: 'local-article-attachments', hooks: {
    'astro:config:done': ({ config }) => { root = fileURLToPath(config.root); },
    'astro:server:setup': ({ server }) => {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/files/')) return next();
        try {
          const target = await route(req.url.split('?')[0]);
          if (!target) return next();
          res.setHeader('Content-Type', target.endsWith('.md') ? 'text/markdown; charset=utf-8' : 'application/octet-stream');
          if (!target.endsWith('.md')) res.setHeader('Content-Disposition', `attachment; filename="${path.basename(target)}"`);
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.end(await fs.readFile(target));
        } catch { res.statusCode = 404; res.end('Not found'); }
      });
    },
    'astro:build:done': async ({ dir }) => {
      const posts = path.join(root, 'src/content/posts');
      for (const file of await walk(posts)) {
        const relative = path.relative(posts, file).split(path.sep);
        if (relative.length !== 3 || relative[1] !== 'attachments') continue;
        await inside(posts, file);
        const target = path.join(fileURLToPath(dir), 'files', relative[0], relative[2]);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(file, target);
      }
    },
  } };
}
