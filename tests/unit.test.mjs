import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertArticles, assertArchitecture, assertReview, articleHash, sensitiveText, assertArtifacts, assertAssetBytes } from '../scripts/guards.mjs';
import { zipSync, strToU8 } from 'fflate';
import { matchesPost } from '../src/lib/model.ts';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import { load } from 'cheerio';
import { remarkTldr, annotatedCode, rehypeExternalLinks } from '../scripts/markdown.mjs';
import rehypeRaw from 'rehype-raw';
import { remarkAttachments } from '../scripts/assets.mjs';
import { pagesWorkflow, approvedRemote } from '../scripts/publication-policy.mjs';
import { git, commitSha } from '../scripts/publication-policy.mjs';
import { assertPush, auditGitHistory, packageSteps } from '../scripts/push-guards.mjs';
import { sourceDigest } from '../scripts/guards.mjs';

const fixture = (id='sample') => `---\ntitle: "测试文章"\ndescription: "用于检验内容约束的合成文章。"\ndate: "2024-01-02"\ndateBasis: published\ncategory: "编译与链接"\ntags: ["编译", "LLVM"]\npermalink: ${id}\nauthor: ChengzhiHuang\n---\n## 示例\n\n正文。\n`;
async function temp(t) {const root=await fs.mkdtemp(path.join(os.tmpdir(),'blog-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'src/content/posts/sample'),{recursive:true});await fs.writeFile(path.join(root,'src/content/posts/sample/index.md'),fixture());await fs.writeFile(path.join(root,'package.json'),JSON.stringify({scripts:{},dependencies:{}}));return root;}
test('search supports Chinese, case folding, full-width and multiple terms',()=>{
 const post={title:'LLVM 编译与链接',tags:['Objective-C','编译'],category:'编译与链接'};
 assert.equal(matchesPost(post,'ＬＬＶＭ 编译'),true);assert.equal(matchesPost(post,'objective-c'),true);assert.equal(matchesPost(post,'不存在'),false);assert.equal(matchesPost(post,'','并发与调度'),false);
});
test('valid article passes',async t=>{assert.equal((await assertArticles(await temp(t))).length,1);});
test('duplicate permalink fails',async t=>{const root=await temp(t);await fs.mkdir(path.join(root,'src/content/posts/other'));await fs.writeFile(path.join(root,'src/content/posts/other/index.md'),fixture());await assert.rejects(()=>assertArticles(root),/Duplicate|directory/);});
test('missing image fails',async t=>{const root=await temp(t);await fs.appendFile(path.join(root,'src/content/posts/sample/index.md'),'\n![示意图](missing.png)');await assert.rejects(()=>assertArticles(root),/ENOENT/);});
test('remote image fails',async t=>{const root=await temp(t);await fs.appendFile(path.join(root,'src/content/posts/sample/index.md'),'\n![示意图](https://example.com/image.png)');await assert.rejects(()=>assertArticles(root),/Remote image/);});
test('private marker is caught without storing real sensitive fixtures',()=>{assert.ok(sensitiveText(['','Users','someone','project.m'].join('/')).length);assert.ok(sensitiveText('https://'+'byte'+'tech.info/articles/000').length);});
test('asset traversal and symlink fail',async t=>{const root=await temp(t);await fs.writeFile(path.join(root,'outside.png'),'synthetic');await fs.appendFile(path.join(root,'src/content/posts/sample/index.md'),'\n![图](../../../outside.png)');await assert.rejects(()=>assertArticles(root));await fs.symlink(path.join(root,'outside.png'),path.join(root,'src/content/posts/sample/leak.png'));await assert.rejects(()=>assertArchitecture(root),/Symbolic link/);});
test('browser Node import and outside import fail',async t=>{const root=await temp(t);await fs.mkdir(path.join(root,'src/scripts'));const file=path.join(root,'src/scripts/browser.ts');await fs.writeFile(file,"import fs from 'node:fs';");await assert.rejects(()=>assertArchitecture(root),/Node API/);await fs.writeFile(file,"import x from '../../../outside.ts';");await assert.rejects(()=>assertArchitecture(root),/escapes/);});
test('only the reviewed Pages workflow is allowed and Harness cannot transmit',async t=>{const root=await temp(t);await fs.mkdir(path.join(root,'.github/workflows'),{recursive:true});await fs.writeFile(path.join(root,'.github/workflows/site.yml'),'synthetic');await assert.rejects(()=>assertArchitecture(root),/Unapproved workflow/);await fs.rm(path.join(root,'.github/workflows/site.yml'));const workflow=path.join(root,'.github/workflows/pages.yml');await fs.writeFile(workflow,pagesWorkflow);await assertArchitecture(root);await fs.appendFile(workflow,'# unreviewed change');await assert.rejects(()=>assertArchitecture(root),/Unapproved workflow/);await fs.rm(path.join(root,'.github'),{recursive:true});await fs.writeFile(path.join(root,'package.json'),JSON.stringify({scripts:{release:'git push'}}));await assert.rejects(()=>assertArchitecture(root),/Outbound/);});
test('publication remote accepts only the exact approved SSH or HTTPS repository',()=>{
 assert.equal(approvedRemote('git@github.com:ChengzhiHuang/ChengzhiHuang.github.io.git'),true);
 assert.equal(approvedRemote('https://github.com/ChengzhiHuang/ChengzhiHuang.github.io'),true);
 for(const url of ['git@github.com:someone/ChengzhiHuang.github.io.git','https://github.com.evil.test/ChengzhiHuang/ChengzhiHuang.github.io','https://token@github.com/ChengzhiHuang/ChengzhiHuang.github.io','https://github.com/ChengzhiHuang/ChengzhiHuang.github.io/extra'])assert.equal(approvedRemote(url),false);
});
test('approval binds text and every asset; pending approval fails',async t=>{
 const root=await temp(t),dir=path.join(root,'src/content/posts/sample');await fs.writeFile(path.join(dir,'diagram.png'),'synthetic');
 const record={permalink:'sample',status:'pending',reviewer:'ChengzhiHuang',reviewedAt:'2024-01-02',imagesManuallyReviewed:true,sha256:await articleHash(dir)};
 const write=()=>fs.writeFile(path.join(root,'publications.json'),JSON.stringify({schemaVersion:1,articles:[record]}));await write();await assert.rejects(()=>assertReview(root),/pending/);
 record.status='approved';await write();await assertReview(root);await fs.appendFile(path.join(dir,'diagram.png'),'changed');await assert.rejects(()=>assertReview(root),/changed/);
 record.sha256=await articleHash(dir);await write();await assertReview(root);await fs.appendFile(path.join(dir,'index.md'),'\n正文变更。');await assert.rejects(()=>assertReview(root),/changed/);
});
test('attachments reject nested Git history, traversal and private text',()=>{
 assert.throws(()=>assertAssetBytes('demo.zip',zipSync({'demo/.git/config':strToU8('synthetic')})),/unsafe archive/);
 assert.throws(()=>assertAssetBytes('demo.zip',zipSync({'../escape.txt':strToU8('synthetic')})),/unsafe archive/);
 assert.throws(()=>assertAssetBytes('demo.zip',zipSync({'demo/sample.c':strToU8(['','Users','person','source.c'].join('/'))})),/Sensitive attachment/);
 assert.doesNotThrow(()=>assertAssetBytes('demo.zip',zipSync({'demo/sample.c':strToU8('int answer = 42;')})));
});
test('source metadata cannot hide in PNG text chunks',()=>{
 const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.from([0,0,0,0]),Buffer.from('tEXt'),Buffer.alloc(4)]);
 assert.throws(()=>assertAssetBytes('diagram.png',png),/metadata forbidden/);
});
test('production artifact broken link fails',async t=>{
 const root=await temp(t);await fs.mkdir(path.join(root,'dist'));await fs.writeFile(path.join(root,'dist/search.json'),'[{}]');await fs.writeFile(path.join(root,'dist/rss.xml'),'undefined');await fs.writeFile(path.join(root,'dist/sitemap.xml'),'undefined');await fs.writeFile(path.join(root,'dist/index.html'),'<a href="/missing/">bad</a>');await assert.rejects(()=>assertArtifacts(root),/ENOENT/);
});

const presentation = () => createMarkdownProcessor({remarkPlugins:[remarkTldr,remarkAttachments],rehypePlugins:[rehypeRaw,rehypeExternalLinks],shikiConfig:{themes:{light:'github-light',dark:'github-dark'},transformers:[annotatedCode()]}});
test('TLDR preserves nested lists and images without adding a TOC heading',async()=>{
 const renderer=await presentation();const result=await renderer.render('> [!TLDR]\n>\n> 1. 概要\n>    1. 细节\n>\n> ![示意图](./diagram.png)\n\n## 正文\n');const $=load(result.code);
 assert.equal($('aside.tldr').length,1);assert.equal($('.tldr-label').text(),'TL;DR');assert.equal($('.tldr ol ol li').text(),'细节');assert.equal($('.tldr img').length,1);assert.deepEqual(result.metadata.headings.map(h=>h.text),['正文']);
});
test('annotated code renders partial bold/deletion while retaining all copied text',async()=>{
 const renderer=await presentation();const code='~~#if OLD~~\n~~#el~~if NEW\nint **pointer;\ncall(**Token**);\n/******** plain comment ********/';
 const result=await renderer.render('```cpp annotated\n'+code+'\n```');const $=load(result.code);
 assert.equal($('pre').attr('data-annotated'),'true');assert.equal($('del').text(),'#if OLD#el');assert.equal($('strong').text(),'Token');
 assert.equal($('pre code').text(),'#if OLD\n#elif NEW\nint **pointer;\ncall(Token);\n/******** plain comment ********/');
});
test('ordinary code preserves pointers, operators and literal formatting characters',async()=>{
 const renderer=await presentation();const code='int **head, **tail;\nvalue = ~~bits;\n/* keep *name* and **literal** */\n~~old~~';const $=load((await renderer.render('```cpp\n'+code+'\n```')).code);
 assert.equal($('pre code').text(),code);assert.equal($('pre del, pre strong').length,0);assert.equal($('pre').attr('data-annotated'),undefined);
});
test('inline code emphasis and merged cells remain semantic HTML',async()=>{
 const renderer=await presentation();const result=await renderer.render('<code>Loader::<strong>Prepared</strong>::fix</code>\n\n直接 **`po [Example current]`** 查看。\n\n<table><thead><tr><th colspan="6">说明</th></tr></thead><tbody><tr><td colspan="6">GAP</td></tr></tbody></table>');const $=load(result.code);
 assert.equal($('code').first().text(),'Loader::Prepared::fix');assert.equal($('code strong').text(),'Prepared');assert.equal($('strong code').text(),'po [Example current]');assert.equal($('[colspan="6"]').length,2);
});
test('text attachments use readers while binary downloads and existing Markdown routes stay stable',async()=>{
 const renderer=await presentation();const result=await renderer.render('[附录](./attachments/notes.md) [源码](./attachments/example.c) [压缩包](./attachments/demo.zip)',{fileURL:new URL('file:///example/src/content/posts/sample/index.md')});const $=load(result.code);
 assert.equal($('a').eq(0).attr('href'),'/posts/sample/attachments/notes/');assert.equal($('a').eq(1).attr('href'),'/posts/sample/attachments/example.c/');assert.equal($('a').eq(2).attr('href'),'/files/sample/demo.zip');
});
test('external Markdown, reference, autolink and raw HTML links open a new tab without changing local or code links',async()=>{
 const renderer=await presentation();const $=load((await renderer.render('[外链](https://example.com) [引用][ref] <https://example.org>\n\n[ref]: https://example.net\n\n<a href="//example.com" rel="nofollow">HTML</a>\n\n[本站](https://chengzhihuang.github.io/posts/sample/) [本页](#section) [相对](/about/) [邮件](mailto:reader@example.com)\n\n```html\n<a href="https://example.com">literal</a>\n```')).code);
 for(const el of $('a').toArray().slice(0,4)){assert.equal($(el).attr('target'),'_blank');assert.match($(el).attr('rel'),/noopener/);assert.match($(el).attr('rel'),/noreferrer/);}
 assert.match($('a').eq(3).attr('rel'),/nofollow/);
 for(const el of $('a').toArray().slice(4))assert.equal($(el).attr('target'),undefined);
 assert.equal($('pre a').length,0);assert.equal($('pre code').text(),'<a href="https://example.com">literal</a>');
});
test('source attachments reject invalid UTF-8, binary payloads and colliding reader routes',async t=>{
 const root=await temp(t),directory=path.join(root,'src/content/posts/sample/attachments');await fs.mkdir(directory);const file=path.join(directory,'example.py');
 await fs.writeFile(file,'#!/usr/bin/env python3\n# 中文注释\n');await assertArticles(root);
 await fs.writeFile(file,Buffer.from([255]));await assert.rejects(()=>assertArticles(root),/encoded data/);
 await fs.writeFile(file,'a\0b');await assert.rejects(()=>assertArticles(root),/Binary data/);
 await fs.writeFile(file,'# 中文');await fs.writeFile(file+'.md','\uFEFF# 碰撞');await assert.rejects(()=>assertArticles(root),/Duplicate attachment reader/);
});
test('Markdown attachments require an owner and valid BOM-encoded UTF-8',async t=>{
 const root=await temp(t),directory=path.join(root,'src/content/posts/sample/attachments');await fs.mkdir(directory);const file=path.join(directory,'notes.md');
 await fs.writeFile(file,'# 中文');await assert.rejects(()=>assertArticles(root),/UTF-8 BOM/);
 await fs.writeFile(file,'\uFEFF# 中文');await assertArticles(root);
 await fs.writeFile(file,Buffer.from([239,187,191,255]));await assert.rejects(()=>assertArticles(root),/encoded data/);
 await fs.rm(file);const orphan=path.join(root,'src/content/posts/orphan/attachments');await fs.mkdir(orphan,{recursive:true});await fs.writeFile(path.join(orphan,'notes.md'),'\uFEFF# 中文');await assert.rejects(()=>assertArticles(root),/belong to an article/);
});

const allowedOrigin='git@github.com:ChengzhiHuang/ChengzhiHuang.github.io.git',zero='0'.repeat(40);
async function committedFixture(t){
 const root=await temp(t);await fs.writeFile(path.join(root,'.gitignore'),'.harness/\n');
 await fs.writeFile(path.join(root,'README.md'),'Synthetic publication fixture.\n');
 const record={permalink:'sample',status:'approved',reviewer:'ChengzhiHuang',reviewedAt:'2024-01-02T00:00:00Z',imagesManuallyReviewed:true,sha256:await articleHash(path.join(root,'src/content/posts/sample'))};
 await fs.writeFile(path.join(root,'publications.json'),JSON.stringify({schemaVersion:1,articles:[record]}));
 git(root,['init','-b','main']);git(root,['config','user.name','Example']);git(root,['config','user.email','example@example.test']);git(root,['config','core.hooksPath','.githooks']);
 git(root,['add','.']);git(root,['commit','-m','Synthetic reviewed content']);return root;
}
async function evidenceFixture(root){
 const head=commitSha(root),digest=await sourceDigest(root),evidence=path.join(root,'.harness/runs/synthetic'),packageDir=path.join(root,'.harness/packages/synthetic');
 await fs.mkdir(evidence,{recursive:true});await fs.mkdir(packageDir,{recursive:true});
 const report={mode:'package',status:'passed',commitSha:head,sourceDigest:digest,package:'.harness/packages/synthetic',steps:packageSteps.map(name=>({name,status:'passed',exitCode:0}))};
 await fs.writeFile(path.join(evidence,'report.json'),JSON.stringify(report));await fs.writeFile(path.join(root,'.harness/latest.json'),JSON.stringify({evidence,status:'passed'}));
 await fs.writeFile(path.join(packageDir,'manifest.json'),JSON.stringify({commitSha:head,sourceDigest:digest}));await fs.writeFile(path.join(packageDir,'static-site.tar.gz'),'synthetic archive');return {head,report,evidence};
}
const updateLine=(head,base=zero)=>`refs/heads/main ${head} refs/heads/main ${base}\n`;
test('reviewed clean main with complete matching evidence passes the push gate',async t=>{
 const root=await committedFixture(t),{head}=await evidenceFixture(root);
 assert.equal((await assertPush(root,'origin',allowedOrigin,updateLine(head))).commits,1);
 await assert.rejects(()=>assertPush(root,'origin','git@github.com:other/blog.git',updateLine(head)),/approved origin/);
 await assert.rejects(()=>assertPush(root,'origin',allowedOrigin,updateLine(zero)),/non-deleting/);
 await assert.rejects(()=>assertPush(root,'origin',allowedOrigin,updateLine(head).replaceAll('refs/heads/main','refs/heads/other')),/main branch/);
 await assert.rejects(()=>assertPush(root,'origin',allowedOrigin,updateLine(head)+updateLine(head)),/exactly one/);
});
test('missing, skipped and stale verification cannot authorize a push',async t=>{
 const root=await committedFixture(t),head=commitSha(root);await assert.rejects(()=>assertPush(root,'origin',allowedOrigin,updateLine(head)),/ENOENT/);
 let proof=await evidenceFixture(root);proof.report.steps.find(step=>step.name==='browser').status='skipped';await fs.writeFile(path.join(proof.evidence,'report.json'),JSON.stringify(proof.report));await assert.rejects(()=>assertPush(root,'origin',allowedOrigin,updateLine(head)),/missing\/failed/);
 proof=await evidenceFixture(root);proof.report.commitSha=zero;await fs.writeFile(path.join(proof.evidence,'report.json'),JSON.stringify(proof.report));await assert.rejects(()=>assertPush(root,'origin',allowedOrigin,updateLine(head)),/stale/);
 await evidenceFixture(root);await fs.appendFile(path.join(root,'README.md'),'Engineering change.');await assert.rejects(()=>assertPush(root,'origin',allowedOrigin,updateLine(head)),/Commit all/);
 git(root,['add','README.md']);git(root,['commit','-m','New unverified commit']);await assert.rejects(()=>assertPush(root,'origin',allowedOrigin,updateLine(commitSha(root))),/stale/);
});
test('pending or changed content cannot be pushed with refreshed engineering evidence',async t=>{
 const root=await committedFixture(t);await fs.appendFile(path.join(root,'src/content/posts/sample/index.md'),'\nChanged content.');git(root,['add','.']);git(root,['commit','-m','Unreviewed content change']);let proof=await evidenceFixture(root);await assert.rejects(()=>assertPush(root,'origin',allowedOrigin,updateLine(proof.head)),/changed after review/);
 const file=path.join(root,'publications.json'),manifest=JSON.parse(await fs.readFile(file,'utf8'));manifest.articles[0].status='pending';await fs.writeFile(file,JSON.stringify(manifest));git(root,['add','.']);git(root,['commit','-m','Pending review']);proof=await evidenceFixture(root);await assert.rejects(()=>assertPush(root,'origin',allowedOrigin,updateLine(proof.head)),/pending/);
});
test('private and ignored files in intermediate commits remain blocked after deletion',async t=>{
 for(const file of ['private/note.txt','.harness/hidden.txt']){
  const root=await committedFixture(t);await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),'Synthetic private placeholder');git(root,['add','-f',file]);git(root,['commit','-m','Intermediate file']);git(root,['rm',file]);git(root,['commit','-m','Remove intermediate file']);await assert.rejects(()=>auditGitHistory(root,commitSha(root)),/Private\/unpublished/);
 }
});
test('unreviewed intermediate article version remains blocked after restoration',async t=>{
 const root=await committedFixture(t),file=path.join(root,'src/content/posts/sample/index.md'),original=await fs.readFile(file);await fs.appendFile(file,'Unreviewed intermediate version');git(root,['add','.']);git(root,['commit','-m','Intermediate content']);await fs.writeFile(file,original);git(root,['add','.']);git(root,['commit','-m','Restore reviewed content']);await assert.rejects(()=>auditGitHistory(root,commitSha(root)),/Unreviewed content/);
});
test('non-fast-forward main update is blocked',async t=>{
 const root=await committedFixture(t);git(root,['checkout','-b','diverged']);await fs.appendFile(path.join(root,'README.md'),'Different future.');git(root,['add','.']);git(root,['commit','-m','Diverged commit']);const remote=commitSha(root);git(root,['checkout','main']);const proof=await evidenceFixture(root);await assert.rejects(()=>assertPush(root,'origin',allowedOrigin,updateLine(proof.head,remote)),/merge-base/);
});
