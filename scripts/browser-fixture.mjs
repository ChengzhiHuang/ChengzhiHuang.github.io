import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { walk } from './guards.mjs';
const root=process.cwd(),target=path.join(root,'.harness/browser-site');
await fs.rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:200});await fs.mkdir(target,{recursive:true});
for(const file of await walk(root)){
 const relative=path.relative(root,file);if(relative.startsWith('src/content/posts/'))continue;
 const dest=path.join(target,relative);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.copyFile(file,dest);
}
// Copy dependencies, never use a symlink back to the source checkout.
await fs.cp(path.join(root,'node_modules'),path.join(target,'node_modules'),{recursive:true,verbatimSymlinks:true});
for(const [id,title,category,tags] of [['sample-variables','变量的生命周期','Objective-C 与内存管理',['内存','变量']],['sample-compiler','编译与链接笔记','编译与链接',['LLVM','编译']]]){
 const dir=path.join(target,'src/content/posts',id);await fs.mkdir(dir,{recursive:true});
 await fs.writeFile(path.join(dir,'index.md'),`---\ntitle: "${title}"\ndescription: "合成测试素材，用于验证阅读交互。"\ndate: "2024-01-02"\ndateBasis: published\ncategory: "${category}"\ntags: ${JSON.stringify(tags)}\npermalink: ${id}\nauthor: ChengzhiHuang\n---\n## 原理\n\n仅用于测试的文字。\n\n\`\`\`cpp\nint value = 42; // ${'long_code_'.repeat(24)}\n\`\`\`\n\n![合成示意图](./diagram.png)\n\n## 结论\n\n变量与代码。\n`);
 // A synthetic 1x1 PNG, no imported media.
 await fs.writeFile(path.join(dir,'diagram.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64'));
 await fs.mkdir(path.join(dir,'attachments'));
 await fs.writeFile(path.join(dir,'attachments/example.c'),'int answer = 42;\n');
 await fs.appendFile(path.join(dir,'index.md'),'\n[示例源码](./attachments/example.c)\n');
  if (id === 'sample-compiler') {
    const file=path.join(dir,'index.md');
    const summary='> [!TLDR]\n>\n> 1. 编译概要\n>    1. 嵌套说明\n>\n> ![摘要示意图](./diagram.png)\n\n';
    await fs.writeFile(file,(await fs.readFile(file,'utf8')).replace('## 原理',summary+'## 原理'));
    const examples=[
      '## 排版示例','',
      '<code>Loader::<strong>Prepared</strong>::fix</code>','',
      '直接 **`po [Example current]`** 查看。','',
      '```cpp annotated','~~#if OLD~~','~~#el~~if NEW','call(**Token**);','```','',
      '```cpp','int **head, **tail;','value = ~~bits;','/* **literal** and *name* */','```','',
      '<table class="vm-region-table"><thead><tr><th colspan="6">示例内存区域</th></tr><tr><th scope="col">类型</th><th scope="col">地址</th><th scope="col">大小</th><th scope="col">权限</th><th scope="col">共享</th><th scope="col">备注</th></tr></thead><tbody><tr><td>Stack</td><td>1000–2000</td><td>示例</td><td>rw</td><td>private</td><td>合成数据</td></tr><tr><td colspan="6">GAP</td></tr></tbody></table>','',
      '[中文附录](./attachments/notes.md)','',
      '[中文源码](./attachments/example.py) [大源码](./attachments/large.c)','',
      '[公开参考](https://example.com/reference) [本站绝对地址](https://chengzhihuang.github.io/about/) [本页锚点](#原理) [邮件](mailto:reader@example.com)','',
      '<a href="//example.org/html" rel="nofollow">HTML 外链</a>','',
      '<table class="qos-table"><thead><tr><th scope="col">场景</th><th scope="col">队列 A</th><th scope="col">队列 B</th><th scope="col">队列 C</th></tr></thead><tbody><tr><th scope="row">场景一</th><td rowspan="2">共同结果</td><td colspan="2">横向合并</td></tr><tr><th scope="row">场景二</th><td>结果 B</td><td>结果 C</td></tr></tbody></table>','',
      '## 延伸说明','',
      ...Array.from({ length: 14 }, (_, idx) => `补充段落 ${idx + 1}：用于验证长文滚动与从附录返回正文时的原阅读位置恢复。`),
    ].join('\n');
    await fs.appendFile(file,examples);
    await fs.writeFile(path.join(dir,'attachments/notes.md'),'\uFEFF# 中文技术附录\n\n## 段信息\n\n|段|变化|\n|---|---|\n|__TEXT|增长|\n\n```cpp\nint appendix = 42;\n```\n\n## 符号归因\n\n附录补充说明。\n');
    await fs.writeFile(path.join(dir,'attachments/example.py'),'#!/usr/bin/env python3\n# 中文注释：保持原文件字节\nprint("<script>只显示文本</script>")\n');
    await fs.writeFile(path.join(dir,'attachments/large.c'),'/* 大源码完整保留 */\n'+'int value;\n'.repeat(28000));
  }
}
const result=spawnSync(process.execPath,['node_modules/astro/bin/astro.mjs','build'],{cwd:target,env:{...process.env,ASTRO_TELEMETRY_DISABLED:'1'},stdio:'inherit'});
process.exitCode=result.status??1;
