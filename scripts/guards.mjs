import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { builtinModules } from 'node:module';
import { assertGitBoundary, assertWorkflow } from './publication-policy.mjs';
import matter from 'gray-matter';
import { load } from 'cheerio';
import { unzipSync } from 'fflate';
import { attachmentHref, attachmentLanguage } from '../src/lib/attachments.mjs';
import { isExternalLink } from '../src/lib/links.mjs';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
// Author-approved exception for an unmodified, public Apple UIKitCore iOS 16.2
// binary. Only its public product-compatibility bundle IDs are exempt; changed
// bytes, credentials, personal paths and all other rules remain rejected.
const publicUIKitCore = '831c4ebb13a517de5771810fa00c82894df98549dde2406b8de9f4b01334a8ef';
const productBundleIds = /\bcom\.(?:zhiliaoapp|ss\.iphone|bytedance)\b/i;
const ignored = new Set(['node_modules', '.git', '.astro', '.harness', 'dist', 'test-results', 'playwright-report', '.DS_Store']);
export async function walk(root, base = root) {
  const files = [];
  for (const entry of await fs.readdir(base, { withFileTypes: true })) {
    if (base === root && ignored.has(entry.name)) continue;
    const target = path.join(base, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symbolic link is forbidden: ${path.relative(root, target)}`);
    if (entry.isDirectory()) files.push(...await walk(root, target));
    else if (entry.isFile()) files.push(target);
  }
  return files.sort();
}
export async function inside(root, target) {
  const realRoot = await fs.realpath(root), real = await fs.realpath(target);
  if (real !== realRoot && !real.startsWith(realRoot + path.sep)) throw new Error(`Path escapes checkout: ${target}`);
  return real;
}
export async function sourceDigest(root) {
  const files = await walk(root);
  return sha256((await Promise.all(files.map(async file => `${path.relative(root, file)}\0${sha256(await fs.readFile(file))}`))).join('\n'));
}
export function sensitiveText(text) {
  // Source-specific people/component lists belong to the private review tools.
  // The portable checkout keeps only generic patterns and approved file hashes.
  const patterns = [/(?:bytedance|bytetech|larkoffice|feishu)\.(?:com|net|info|cn)/i, /\/Users\/(?!example(?:\/|\b))[^\s/]+/i, /(?:ghp_|github_pat_|AKIA)[A-Za-z0-9_]{12,}/, /(?:\u539f\u59cb\u5bfc\u51fa|\u8131\u654f\u6620\u5c04|sources\/.*original\.md)/];
  patterns.push(/(?:disposable_login_token|access_token|auth_token|secret_key)\s*[=:]/i, productBundleIds, /(?<!System)\/Volumes\/(?!Example(?:\/|\b)|Foo(?:\\|\/|\b)|%s)[^\s/]+/);
  return patterns.filter(pattern => pattern.test(text)).map(pattern => pattern.source);
}
export function assertAssetBytes(name, bytes, depth = 0) {
  if (sensitiveText(name).length) throw new Error(`Sensitive asset name: ${name}`);
  if (/\.zip$/i.test(name)) {
    if (depth > 0) throw new Error('Nested archives require separate review');
    let total = 0;
    const entries = unzipSync(bytes, { filter: entry => {
      total += entry.originalSize;
      if (total > 300 * 1024 * 1024 || entry.originalSize > 100 * 1024 * 1024) throw new Error('Oversized archive');
      const parts = entry.name.split('/');
      if (entry.name.startsWith('/') || entry.name.includes('\\') || parts.some(p => ['..','.git','__MACOSX','xcuserdata','.DS_Store'].includes(p) || p.startsWith('._'))) throw new Error(`Private/unsafe archive entry: ${entry.name}`);
      return true;
    } });
    for (const [entry, data] of Object.entries(entries)) assertAssetBytes(entry, data, depth + 1);
  } else if (/\.png$/i.test(name)) {
    const buffer = Buffer.from(bytes);
    if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`Invalid PNG: ${name}`);
    for (let offset = 8; offset < buffer.length;) {
      if (offset + 12 > buffer.length) throw new Error('Truncated PNG');
      const size = buffer.readUInt32BE(offset), type = buffer.subarray(offset + 4, offset + 8).toString();
      if (['tEXt','zTXt','iTXt','eXIf'].includes(type)) throw new Error(`Image metadata forbidden: ${name}`);
      offset += size + 12;
      if (offset > buffer.length) throw new Error('Truncated PNG chunk');
    }
  } else if (!/\.(?:jpe?g|webp|gif|avif)$/i.test(name)) {
    const text = /\.(?:bin|dylib)$/i.test(name) ? (Buffer.from(bytes).toString('latin1').match(/[\x20-\x7e]{8,}/g) || []).join('\n') : Buffer.from(bytes).toString('utf8');
    const matches = sensitiveText(text).filter(rule => !(rule === productBundleIds.source && sha256(bytes) === publicUIKitCore));
    if (matches.length) throw new Error(`Sensitive attachment: ${name}`);
  }
}
export async function assertArchitecture(root) {
  const files = await walk(root);
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const packages = new Set(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }));
  for (const file of files) {
    const relative = path.relative(root, file).replaceAll(path.sep, '/');
    if (/^\.github\/workflows\//.test(relative)) await assertWorkflow(root, relative);
    if (/^(private|sources|drafts|review)\//.test(relative)) throw new Error(`Private material in checkout: ${relative}`);
    if (!/\.(?:[cm]?[jt]s|astro)$/.test(file) || relative.startsWith('tests/')) continue;
    const text = await fs.readFile(file, 'utf8');
    if (relative.startsWith('src/')) {
      if (/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/.test(text)) throw new Error(`Network access forbidden in source: ${relative}`);
      if (/\bprocess\.(?:env|cwd)|\/Volumes\/|\.\.\/private\//.test(text)) throw new Error(`Host dependency: ${relative}`);
      if (/\bimport\s*\(\s*[^'"`\s]/.test(text)) throw new Error(`Nonliteral dynamic import: ${relative}`);
    }
    for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)) {
      const spec = match[1];
      if (spec.startsWith('.')) {
        const resolved = path.resolve(path.dirname(file), spec.split('?')[0]);
        if (!resolved.startsWith(path.resolve(root) + path.sep)) throw new Error(`Import escapes checkout: ${relative}`);
        if (relative.startsWith('src/') && !resolved.startsWith(path.join(path.resolve(root), 'src') + path.sep)) throw new Error(`Source imports tooling: ${relative}`);
        if (relative.startsWith('src/lib/') && /\/(?:pages|layouts|components)\//.test(resolved)) throw new Error(`Model imports UI: ${relative}`);
        if (relative.startsWith('src/scripts/') && /(?:posts|content\.config)/.test(spec)) throw new Error(`Browser imports build content: ${relative}`);
      } else if (spec.startsWith('/') || spec.startsWith('file:') || /^https?:/.test(spec)) throw new Error(`External import: ${relative}`);
      else if (spec.startsWith('node:') || builtinModules.includes(spec)) { if (relative.startsWith('src/')) throw new Error(`Node API in source: ${relative}`); }
      else if (!spec.startsWith('astro:') && !packages.has(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0])) throw new Error(`Undeclared import ${spec}: ${relative}`);
    }
    if (relative.startsWith('src/')) for (const match of text.matchAll(/(?:glob|base)\s*(?:\(|:)\s*['"]([^'"]+)['"]/g)) {
      if (match[1].includes('..') || path.isAbsolute(match[1])) throw new Error(`Unsafe content path: ${relative}`);
    }
  }
  const scripts = Object.values(pkg.scripts || {}).join('\n');
  if (/\b(?:push|deploy|upload|publish|ngrok|cloudflared)\b|--host\s+(?:0\.0\.0\.0|::)/.test(scripts)) throw new Error('Outbound command in package scripts');
}
export async function assertLocalGit(root) {
  await assertGitBoundary(root);
}
export async function readArticles(root) {
  const dir = path.join(root, 'src/content/posts');
  const files = (await walk(dir)).filter(file => path.basename(file) === 'index.md');
  return Promise.all(files.map(async file => ({ file, ...matter(await fs.readFile(file, 'utf8')) })));
}
export async function articleHash(directory) {
  return sha256((await Promise.all((await walk(directory)).map(async file => `${path.relative(directory, file)}\0${sha256(await fs.readFile(file))}`))).join('\n'));
}
export async function assertArticles(root) {
  const articles = await readArticles(root); const ids = new Set();
  const validCategories = ['Objective-C 与内存管理', '编译与链接', '并发与调度', '性能与稳定性'];
  for (const article of articles) {
    const { data, content, file } = article;
    for (const key of ['title', 'description', 'date', 'dateBasis', 'category', 'tags', 'permalink', 'author']) if (!data[key]) throw new Error(`Missing ${key}: ${file}`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.permalink) || ids.has(data.permalink)) throw new Error(`Duplicate or invalid permalink: ${data.permalink}`);
    ids.add(data.permalink);
    if (path.basename(path.dirname(file)) !== data.permalink) throw new Error('Article directory must match permalink');
    if (data.author !== 'ChengzhiHuang' || !validCategories.includes(data.category) || !Array.isArray(data.tags) || !data.tags.length || !['published','modified','first-public-commit'].includes(data.dateBasis)) throw new Error(`Invalid metadata: ${file}`);
    if (typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date) || Number.isNaN(Date.parse(data.date)) || new Date(data.date).toISOString().slice(0,10) !== data.date) throw new Error(`Invalid date: ${file}`);
    if (sensitiveText(JSON.stringify(data) + content).length) throw new Error(`Sensitive content: ${data.permalink}`);
    if (/<(?:script|iframe|object|embed)\b|\son\w+\s*=/i.test(content)) throw new Error(`Active embedded content: ${data.permalink}`);
    for (const asset of await walk(path.dirname(file))) {
      if (asset !== file) assertAssetBytes(path.basename(asset), await fs.readFile(asset));
    }
    for (const match of content.matchAll(/(!?)\[[^\]]*\]\(([^\s]+?)(?:\s+"[^"]*")?\)/g)) {
      let href = match[2].replace(/^<|>$/g,'');
      if (/^https?:\/\//.test(href)) { if(match[1]) throw new Error(`Remote image: ${data.permalink}`); continue; }
      if (/^(?:mailto:|#)/.test(href)) continue;
      if (/^[a-z]+:/i.test(href)) throw new Error(`Unsafe link: ${href}`);
      if (href.startsWith('/')) continue; // Validated against rendered pages after build.
      href = decodeURIComponent(href.split('#')[0]);
      const target = path.resolve(path.dirname(file), href);
      await inside(path.dirname(file), target);
      if (!(await fs.stat(target)).isFile()) throw new Error(`Missing asset: ${href}`);
    }
  }
  const readers = new Set();
  for (const asset of await walk(path.join(root, 'src/content/posts'))) {
    const relative = path.relative(path.join(root, 'src/content/posts'), asset).split(path.sep);
    if (relative[1] !== 'attachments' || !(asset.endsWith('.md') || attachmentLanguage(asset))) continue;
    if (relative.length !== 3 || !ids.has(relative[0]) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(relative[2])) throw new Error('Text attachment must belong to an article');
    const href = attachmentHref(relative[0], relative[2]);
    if (readers.has(href)) throw new Error(`Duplicate attachment reader: ${href}`);
    readers.add(href);
    const bytes = await fs.readFile(asset);
    if (asset.endsWith('.md') && bytes.subarray(0, 3).toString('hex') !== 'efbbbf') throw new Error(`Markdown attachment needs UTF-8 BOM: ${relative.join('/')}`);
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (bytes.includes(0)) throw new Error(`Binary data in text attachment: ${relative.join('/')}`);
  }
  return articles;
}
export async function assertReview(root) {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'publications.json'), 'utf8'));
  const articles = await readArticles(root);
  if (!articles.length) throw new Error('No reviewed articles to package');
  if (manifest.schemaVersion !== 1 || manifest.articles.length !== articles.length) throw new Error('Review manifest does not cover every article');
  for (const article of articles) {
    const records = manifest.articles.filter(row => row.permalink === article.data.permalink);
    if (records.length !== 1) throw new Error(`Missing/duplicate review: ${article.data.permalink}`);
    const record = records[0];
    if (record.status !== 'approved' || record.reviewer !== 'ChengzhiHuang' || !record.reviewedAt || !record.imagesManuallyReviewed) throw new Error(`Human review pending: ${article.data.permalink}`);
    if (record.sha256 !== await articleHash(path.dirname(article.file))) throw new Error(`Content changed after review: ${article.data.permalink}`);
  }
}
export async function assertDocs(root) {
  const files = (await walk(root)).filter(file => file.endsWith('.md') && !file.includes('/src/content/'));
  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    for (const match of text.matchAll(/\[[^\]]+\]\(([^\s)]+)\)/g)) {
      if (/^(?:https?:|#)/.test(match[1])) continue;
      await inside(root, path.resolve(path.dirname(file), decodeURIComponent(match[1].split('#')[0])));
    }
  }
}
export async function assertArtifacts(root) {
  const dist = path.join(root, 'dist'), files = await walk(dist);
  const index = JSON.parse(await fs.readFile(path.join(dist, 'search.json'), 'utf8'));
  const source = await readArticles(root);
  const imageHashes = new Set();
  for (const article of source) for (const file of await walk(path.dirname(article.file))) {
    if (/\.(png|jpe?g|webp|gif|avif)$/i.test(file)) imageHashes.add(sha256(await fs.readFile(file)));
  }
  if (index.length !== source.length) throw new Error('Search index mismatch');
  const rss = await fs.readFile(path.join(dist, 'rss.xml'), 'utf8'), sitemap = await fs.readFile(path.join(dist, 'sitemap.xml'), 'utf8');
  for (const post of index) if (!rss.includes(post.href) || !sitemap.includes(post.href)) throw new Error(`Feed/sitemap missing ${post.href}`);
  for (const article of source) for (const asset of await walk(path.dirname(article.file))) {
    if (path.basename(path.dirname(asset)) !== 'attachments' || !(asset.endsWith('.md') || attachmentLanguage(asset))) continue;
    const href = attachmentHref(article.data.permalink, path.basename(asset));
    await fs.access(path.join(dist, href, 'index.html'));
    if (!sitemap.includes(href) || rss.includes(href) || index.some(post => post.href === href)) throw new Error(`Attachment indexing mismatch: ${href}`);
  }
  for (const file of files) {
    const relative = path.relative(dist, file);
    if (/\.map$|(?:^|\/)(?:original|private|review|sources)(?:[/.]|$)/i.test(relative) || sensitiveText(relative).length) throw new Error(`Private artifact: ${relative}`);
    if (relative.startsWith('_astro/') && /\.(png|jpe?g|webp|gif|avif)$/i.test(file)) {
      const bytes = await fs.readFile(file);
      if (!imageHashes.has(sha256(bytes))) throw new Error(`Unreviewed or transformed image: ${relative}`);
      assertAssetBytes(path.basename(file), bytes);
    }
    if (relative.startsWith('files/')) {
      const [folder, slug, name, extra] = relative.split('/');
      if (folder !== 'files' || extra || !source.some(p => p.data.permalink === slug)) throw new Error(`Unowned attachment: ${relative}`);
      const asset = path.join(root, 'src/content/posts', slug, 'attachments', name);
      await inside(path.join(root, 'src/content/posts', slug), asset);
      const bytes = await fs.readFile(file);
      if (sha256(bytes) !== sha256(await fs.readFile(asset))) throw new Error(`Attachment changed in build: ${relative}`);
      assertAssetBytes(name, bytes);
    }
    if (!/\.(?:html|json|xml|js|css|svg|txt)$/.test(file)) continue;
    const text = await fs.readFile(file, 'utf8');
    if (sensitiveText(text).length) throw new Error(`Sensitive build output: ${relative}`);
    if (!file.endsWith('.html')) continue;
    const $ = load(text);
    for (const el of $('a[href]').toArray()) {
      const anchor = $(el);
      if (!isExternalLink(anchor.attr('href'))) continue;
      const rel = new Set((anchor.attr('rel') || '').split(/\s+/));
      if (anchor.attr('target') !== '_blank' || !rel.has('noopener') || !rel.has('noreferrer')) throw new Error(`External link must open safely in a new tab: ${relative}`);
    }
    const ids = new Set();
    $('[id]').each((_, el) => { const id=$(el).attr('id'); if(ids.has(id)) throw new Error(`Duplicate HTML id ${id}: ${relative}`); ids.add(id); });
    for (const el of $('a[href],img[src],script[src],link[href]').toArray()) {
      let href = $(el).attr('href') || $(el).attr('src'); if(!href) continue;
      if (/^(?:https?:)?\/\//.test(href)) { if(el.tagName === 'img' || el.tagName === 'script' || (el.tagName === 'link' && $(el).attr('rel') === 'stylesheet')) throw new Error(`Remote runtime resource: ${href}`); continue; }
      if (href.startsWith('mailto:') || href.startsWith('data:')) continue;
      const [pathname, fragment] = href.split('#');
      let target = pathname ? path.resolve(pathname.startsWith('/') ? dist : path.dirname(file), '.' + (pathname.startsWith('/') ? pathname.split('?')[0] : '/' + pathname.split('?')[0])) : file;
      if (target !== dist && !target.startsWith(dist + path.sep)) throw new Error(`Artifact link escapes: ${href}`);
      if ((await fs.stat(target)).isDirectory()) target = path.join(target, 'index.html');
      await fs.access(target);
      if (fragment && target.endsWith('.html')) { const targetDoc=load(await fs.readFile(target,'utf8')); if(!targetDoc('[id]').toArray().some(node=>targetDoc(node).attr('id')===decodeURIComponent(fragment))) throw new Error(`Broken anchor ${href}: ${relative}`); }
    }
  }
}
