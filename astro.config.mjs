import { defineConfig } from 'astro/config';
import { assertArchitecture } from './scripts/guards.mjs';
import { localAttachments, remarkAttachments } from './scripts/assets.mjs';
import { unified } from '@astrojs/markdown-remark';
import { remarkTldr, annotatedCode, rehypeExternalLinks } from './scripts/markdown.mjs';
import rehypeRaw from 'rehype-raw';

export default defineConfig({
  site: 'https://chengzhihuang.github.io',
  output: 'static',
  trailingSlash: 'always',
  server: { host: '127.0.0.1', port: 4321 },
  devToolbar: { enabled: false },
  image: { service: { entrypoint: 'astro/assets/services/noop' } },
  integrations: [{ name: 'local-boundary', hooks: {
    'astro:config:setup': async () => { await assertArchitecture(process.cwd()); },
  } }, localAttachments()],
  markdown: { processor: unified({ remarkPlugins: [remarkAttachments, remarkTldr], rehypePlugins: [rehypeRaw, rehypeExternalLinks] }), shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' }, wrap: false, transformers: [annotatedCode()] } },
});
