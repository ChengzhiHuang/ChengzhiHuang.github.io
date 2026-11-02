import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const repository = 'ChengzhiHuang/ChengzhiHuang.github.io';
export const branch = 'refs/heads/main';
export function approvedRemote(url) {
  return /^(?:git@github\.com:|https:\/\/github\.com\/)ChengzhiHuang\/ChengzhiHuang\.github\.io(?:\.git)?$/i.test(url);
}
export function git(root, args, binary = false) {
  const result = spawnSync('git', args, { cwd: root, encoding: binary ? undefined : 'utf8', maxBuffer: 110 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`Git ${args[0]} failed: ${result.error?.message || result.stderr.toString().trim()}`);
  return binary ? result.stdout : result.stdout.trim();
}
export function commitSha(root) {
  const result = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}
export async function assertGitBoundary(root) {
  if (await fs.realpath(git(root, ['rev-parse', '--show-toplevel'])) !== await fs.realpath(root)) throw new Error('Initialize this checkout with npm run setup:local');
  const remotes = git(root, ['remote']).split('\n').filter(Boolean);
  if (remotes.some(name => name !== 'origin')) throw new Error('Only the approved origin is permitted');
  for (const remote of remotes) for (const mode of [[], ['--push']]) {
    const urls = git(root, ['remote', 'get-url', '--all', ...mode, remote]).split('\n');
    if (urls.length !== 1 || !approvedRemote(urls[0])) throw new Error('Unapproved Git remote');
  }
  if (git(root, ['config', '--local', '--get', 'core.hooksPath']) !== '.githooks') throw new Error('pre-push hook is not installed');
  const hook = spawnSync(path.join(root, '.githooks/pre-push'), [], { cwd: root, encoding: 'utf8', input: '' });
  if (hook.status !== 1 || !hook.stderr.includes('Push blocked')) throw new Error('pre-push default rejection check failed');
}

// The only permitted workflow. Keep this reviewed template and the YAML identical.
export const pagesWorkflow = `name: Verify and deploy Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
concurrency:
  group: github-pages
  cancel-in-progress: false
env:
  ASTRO_TELEMETRY_DISABLED: '1'
jobs:
  build:
    if: github.repository == '${repository}' && github.ref == '${branch}'
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    permissions:
      contents: read
      pages: read
    steps:
      - uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6
        with:
          node-version: '22.23.2'
          cache: npm
      - run: npm install --global npm@10.9.8
      - run: npm ci --ignore-scripts
      - run: npm run setup:local
      - run: npx --no-install playwright install --with-deps chromium
      - run: npm run harness:package
      - uses: actions/configure-pages@983d7736d9b0ae728b81ab479565c72886d7745b # v5
      - uses: actions/upload-pages-artifact@7b1f4a764d45c48632c6b24a0339c27f5614fb0b # v4
        with:
          path: dist
          retention-days: 1
  deploy:
    needs: build
    if: github.repository == '${repository}' && github.ref == '${branch}'
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy verified site
        id: deployment
        uses: actions/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e # v4
`;
export async function assertWorkflow(root, relative) {
  if (relative !== '.github/workflows/pages.yml' || await fs.readFile(path.join(root, relative), 'utf8') !== pagesWorkflow) throw new Error(`Unapproved workflow: ${relative}`);
}
