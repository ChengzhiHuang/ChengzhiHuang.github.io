import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { assertGitBoundary } from './publication-policy.mjs';
const root = process.cwd();
const run = args => { const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' }); if(result.status) throw new Error(result.stderr); return result.stdout.trim(); };
try { await fs.access('.git'); } catch { run(['init', '-b', 'main']); }
await fs.chmod('.githooks/pre-push', 0o755);
run(['config', '--local', 'core.hooksPath', '.githooks']);
run(['config', '--local', 'push.default', 'nothing']);
await assertGitBoundary(root);
console.log('Local hooks installed. Only verified main commits to the approved repository may be pushed.');
