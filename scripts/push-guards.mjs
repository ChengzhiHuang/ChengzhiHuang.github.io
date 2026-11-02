import fs from 'node:fs/promises';
import path from 'node:path';
import { git, approvedRemote, branch, commitSha } from './publication-policy.mjs';
import { sourceDigest, assertReview, assertAssetBytes, sensitiveText, sha256, inside } from './guards.mjs';

export const packageSteps = ['boundary','runtime','committed-source','types','lint','unit','build','browser-fixture','browser','artifacts','review-hashes','unchanged-source','archive','final-source-digest'];
const zero = '0'.repeat(40);
export function assertCommittedSource(root) {
  const head = commitSha(root);
  if (!head || git(root, ['status','--porcelain=v1','--untracked-files=all'])) throw new Error('Commit all intended changes before packaging or pushing');
  return head;
}
export function assertPublicationPath(file) {
  const roots = new Set(['.gitignore','.node-version','.npmrc','.nvmrc','AGENTS.md','README.md','astro.config.mjs','eslint.config.mjs','package.json','package-lock.json','playwright.config.ts','publications.json','tsconfig.json']);
  const parts = file.split('/');
  if (parts.some(part => ['private','sources','drafts','review','original','node_modules','dist','.git','.astro','.harness','test-results','playwright-report','__MACOSX'].includes(part) || part === '.DS_Store' || part.startsWith('._') || part.startsWith('.env'))) throw new Error(`Private/unpublished path in Git history: ${file}`);
  if (parts.length === 1 ? !roots.has(file) : !['src','public','scripts','tests','docs','.githooks'].includes(parts[0]) && file !== '.github/workflows/pages.yml') throw new Error(`Unexpected publication path: ${file}`);
}
export async function auditGitHistory(root, head, base = zero, inspectBytes = () => {}) {
  if (!/^[a-f0-9]{40}$/.test(head) || !/^[a-f0-9]{40}$/.test(base)) throw new Error('Invalid commit identifier');
  if (base !== zero) git(root, ['merge-base','--is-ancestor',base,head]);
  const commits = git(root, ['rev-list','--reverse',head,...(base === zero ? [] : [`^${base}`])]).split('\n').filter(Boolean);
  const blobs = new Map(); let inspected = 0;
  for (const commit of commits) {
    const metadata = git(root, ['show','-s','--format=%B%n%an%n%ae%n%cn%n%ce',commit]);
    if (sensitiveText(metadata).length) throw new Error('Sensitive commit metadata');
    await inspectBytes('commit-metadata.txt',Buffer.from(metadata));
    const entries = [];
    for (const row of git(root, ['ls-tree','-rz','--full-tree',commit],true).toString('utf8').split('\0').filter(Boolean)) {
      const match = /^(\d+) (\w+) ([a-f0-9]+)\t(.+)$/s.exec(row);
      if (!match || match[2] !== 'blob' || !['100644','100755'].includes(match[1])) throw new Error('Symlink/submodule in outgoing history');
      const [, , , oid, file] = match; assertPublicationPath(file);
      if (Number(git(root, ['cat-file','-s',oid])) > 100 * 1024 * 1024) throw new Error(`GitHub file size exceeded: ${file}`);
      const key = `${oid}:${file}`; let digest = blobs.get(key);
      if (!digest) {
        const bytes = git(root, ['cat-file','blob',oid],true);
        assertAssetBytes(file,bytes); await inspectBytes(file,bytes);
        digest=sha256(bytes);blobs.set(key,digest);inspected++;
      }
      entries.push({file,oid,digest});
    }
    const publication = entries.find(entry => entry.file === 'publications.json');
    if (!publication) throw new Error('Missing review manifest in outgoing commit');
    const manifest = JSON.parse(git(root,['cat-file','blob',publication.oid]));
    const articles = entries.filter(entry => /^src\/content\/posts\/[^/]+\/index\.md$/.test(entry.file));
    if (manifest.schemaVersion !== 1 || manifest.articles?.length !== articles.length) throw new Error('History review manifest mismatch');
    for (const entry of articles) {
      const slug=entry.file.split('/')[3],prefix=`src/content/posts/${slug}/`;
      const records=manifest.articles.filter(record=>record.permalink===slug);
      if(records.length!==1)throw new Error('Missing/duplicate history approval');
      const record=records[0];
      const hash=sha256(entries.filter(item=>item.file.startsWith(prefix)).map(item=>`${item.file.slice(prefix.length)}\0${item.digest}`).sort().join('\n'));
      if(record.status!=='approved'||record.reviewer!=='ChengzhiHuang'||record.imagesManuallyReviewed!==true||!Number.isFinite(Date.parse(record.reviewedAt))||record.sha256!==hash)throw new Error(`Unreviewed content in outgoing commit: ${slug}`);
    }
  }
  return {commits:commits.length,objects:inspected};
}
export async function assertPackageEvidence(root, head) {
  const harness=path.join(root,'.harness');
  const latest=JSON.parse(await fs.readFile(path.join(harness,'latest.json'),'utf8'));
  const reportFile=await inside(harness,path.join(root,path.relative(root,latest.evidence),'report.json'));
  const report=JSON.parse(await fs.readFile(reportFile,'utf8'));
  if(latest.status!=='passed'||report.mode!=='package'||report.status!=='passed'||report.commitSha!==head||report.sourceDigest!==await sourceDigest(root))throw new Error('Missing or stale verified commit evidence');
  for(const name of packageSteps){const rows=report.steps.filter(step=>step.name===name);if(rows.length!==1||rows[0].status!=='passed'||rows[0].exitCode!==0)throw new Error(`Required check missing/failed: ${name}`);}
  if(report.steps.some(step=>step.status!=='passed'||step.exitCode!==0))throw new Error('Failed verification step');
  const directory=await inside(harness,path.join(root,report.package));
  await fs.access(path.join(directory,'static-site.tar.gz'));
  const manifest=JSON.parse(await fs.readFile(path.join(directory,'manifest.json'),'utf8'));
  if(manifest.commitSha!==head||manifest.sourceDigest!==report.sourceDigest)throw new Error('Stale package manifest');
  return report;
}
export async function assertPush(root, remoteName, remoteUrl, input) {
  if(remoteName!=='origin'||!approvedRemote(remoteUrl))throw new Error('Only the approved origin is permitted');
  const rows=input.trim().split('\n').filter(Boolean);
  if(rows.length!==1)throw new Error('Push exactly one main branch update');
  const [localRef,localSha,remoteRef,remoteSha,...extra]=rows[0].trim().split(/\s+/);
  if(extra.length||localRef!==branch||remoteRef!==branch||localSha===zero)throw new Error('Only a non-deleting main branch update is permitted');
  const head=assertCommittedSource(root);
  if(localSha!==head)throw new Error('Push must match the verified HEAD');
  if(remoteSha!==zero)git(root,['merge-base','--is-ancestor',remoteSha,localSha]);
  await assertReview(root);await assertPackageEvidence(root,head);
  return auditGitHistory(root,head,remoteSha);
}
