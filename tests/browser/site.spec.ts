import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
test.beforeEach(async ({ context }) => { await context.route('**/*', route => { const url=new URL(route.request().url()); return url.hostname==='127.0.0.1' ? route.continue() : route.abort('blockedbyclient'); }); });
test('home, category, Chinese search, theme and keyboard',async ({page},info)=>{
 await page.goto('/');await expect(page).toHaveTitle(/ChengzhiHuang/);await expect(page.locator('h1')).toContainText('全部文章');await expect(page.locator('.intro')).toHaveCount(0);
 const posts=page.locator('[data-post]');expect(await posts.count()).toBeGreaterThan(0);
 await page.getByRole('searchbox').fill('不存在的文章');await expect(page.locator('[data-empty]')).toBeVisible();
 await page.getByRole('searchbox').fill('变量');expect(await page.locator('[data-post]:visible').count()).toBeGreaterThan(0);
 await page.getByRole('searchbox').fill('');await page.locator('#theme-toggle').click();const theme=await page.locator('html').getAttribute('data-theme');await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme',theme!);
 await page.screenshot({path:info.outputPath('home.png'),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.locator('.categories a').filter({hasText:'编译与链接'}).click();await expect(page.locator('h1')).toHaveText('编译与链接');await page.keyboard.press('Tab');await expect(page.locator(':focus')).toBeVisible();
});
test('the shared header opens the About page in place and the profile works in both themes', async ({ page }, info) => {
  await page.emulateMedia({ colorScheme: 'light' });
  const wordmark = page.locator('.wordmark');
  const nav = page.getByRole('navigation', { name: '主导航' });
  const about = nav.getByRole('link', { name: '关于', exact: true });
  const posts = nav.getByRole('link', { name: '文章', exact: true });

  await page.goto('/');
  await expect(wordmark.getByText('iOS Developer', { exact: true })).toBeVisible();
  await expect(about).toHaveAttribute('href', '/about/');
  await expect(posts).toHaveAttribute('aria-current', 'page');
  await posts.focus();
  await page.keyboard.press('Tab');
  await expect(about).toBeFocused();
  await expect(about).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/about\/$/);
  await expect(about).toHaveAttribute('aria-current', 'page');
  await expect(posts).not.toHaveAttribute('aria-current', 'page');

  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1 })).toHaveText('ChengzhiHuang');
  await expect(main.getByText('老黄 · iOS Developer', { exact: true })).toBeVisible();
  await expect(main).toContainText('老司机技术成员，周报轮值主编。目前就职于字节跳动，参与西瓜视频质量与稳定性工作。对 OOM/Watchdog 较为了解并长期投入。月球厨师；Amphibian 与 打越钢太郎 的粉丝。');
  const source = main.getByRole('link', { name: '老司机 iOS 周报原文 ↗', exact: true });
  await expect(source).toHaveAttribute('href', 'https://github.com/SwiftOldDriver/iOS-Weekly/blob/master/Contributors/README.md#%E8%80%81%E9%BB%84--chengzhihuang');
  await expect(source).toHaveAttribute('target', '_blank');
  await expect(source).toHaveAttribute('rel', /\bnoopener\b/);
  await expect(source).toHaveAttribute('rel', /\bnoreferrer\b/);

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({ path: info.outputPath('about-light.png'), fullPage: true });
  await page.getByRole('button', { name: '切换到深色模式' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: info.outputPath('about-dark.png'), fullPage: true });

  await page.goto('/posts/sample-compiler/');
  await expect(wordmark.getByText('iOS Developer', { exact: true })).toBeVisible();
  await about.click();
  await expect(page).toHaveURL(/\/about\/$/);
  await expect(about).toHaveAttribute('aria-current', 'page');

  if (info.project.name === 'mobile') {
    await page.setViewportSize({ width: 320, height: 844 });
    const brandBox = await wordmark.boundingBox();
    const navBox = await nav.boundingBox();
    expect(brandBox!.x + brandBox!.width).toBeLessThan(navBox!.x);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await page.screenshot({ path: info.outputPath('about-320.png'), fullPage: true });
  }
});
test('TLDR, inline emphasis, code annotations and merged rows render in both themes',async({page,context},info)=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);await page.goto('/posts/sample-compiler/');
 const tldr=page.locator('aside.tldr');await expect(tldr).toBeVisible();await expect(tldr.locator('ol ol li')).toHaveText('嵌套说明');await expect(tldr.locator('img')).toHaveCount(1);await expect(page.locator('.toc')).not.toContainText('TL;DR');
 await expect(page.locator('.prose code strong').filter({hasText:'Prepared'})).toHaveText('Prepared');await expect(page.locator('.prose strong code')).toHaveText('po [Example current]');
 const annotated=page.locator('pre[data-annotated]');await expect(annotated).toHaveCount(1);expect(await annotated.locator('del').allTextContents()).toEqual(expect.arrayContaining(['#el']));
 await annotated.locator('..').getByRole('button',{name:'复制代码'}).click();await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe('#if OLD\n#elif NEW\ncall(Token);');
 const ordinary=page.locator('pre').filter({hasText:'int **head'});await expect(ordinary).toContainText('value = ~~bits;');await expect(ordinary.locator('strong,del')).toHaveCount(0);
 const table=page.locator('.vm-region-table');await expect(table.locator('[colspan="6"]')).toHaveCount(2);await expect(table.locator('th[scope="col"]')).toHaveCount(6);
 const light=await tldr.evaluate(e=>getComputedStyle(e).backgroundColor);await page.locator('#theme-toggle').click();expect(await tldr.evaluate(e=>getComputedStyle(e).backgroundColor)).not.toBe(light);await page.locator('#theme-toggle').click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await tldr.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('tldr.png'),fullPage:false});
});
test('Markdown appendix reads as UTF-8, downloads unchanged and stays out of article feeds',async({page,request},info)=>{
 const route='/posts/sample-compiler/attachments/notes/';const raw='/files/sample-compiler/notes.md';
 await page.goto('/posts/sample-compiler/');await page.getByRole('link',{name:'中文附录',exact:true}).click();await expect(page).toHaveURL(new RegExp(route+'$'));await expect(page.locator('h1')).toHaveText('中文技术附录');await expect(page.locator('.toc')).toContainText('段信息');await expect(page.locator('.prose table')).toContainText('__TEXT');
 const downloadEvent=page.waitForEvent('download');await page.getByRole('link',{name:'下载 Markdown ↓'}).click();const download=await downloadEvent;const destination=info.outputPath('notes.md');await download.saveAs(destination);
 const response=await request.get(raw),bytes=await response.body();expect(bytes.subarray(0,3).toString('hex')).toBe('efbbbf');expect(await fs.readFile(destination)).toEqual(bytes);
 const index=await (await request.get('/search.json')).json();expect(index).toHaveLength(2);expect(await (await request.get('/rss.xml')).text()).not.toContain(route);expect(await (await request.get('/sitemap.xml')).text()).toContain(route);
 await page.goto(raw);expect(await page.evaluate(()=>document.characterSet)).toBe('UTF-8');await expect(page.locator('body')).toContainText('中文技术附录');
});
test('source readers display UTF-8, escape HTML, copy code and download exact original bytes',async({page,context,request})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 const route='/posts/sample-compiler/attachments/example.py/';
 const raw=await (await request.get('/files/sample-compiler/example.py')).body();
 await page.goto('/posts/sample-compiler/');await page.getByRole('link',{name:'中文源码',exact:true}).click();await expect(page).toHaveURL(new RegExp(route+'$'));
 expect(await page.evaluate(()=>document.characterSet)).toBe('UTF-8');await expect(page.locator('.prose pre')).toContainText('中文注释：保持原文件字节');await expect(page.locator('.prose script')).toHaveCount(0);
 await page.getByRole('button',{name:'复制代码'}).click();await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe(raw.toString('utf8'));
 const event=page.waitForEvent('download');await page.getByRole('link',{name:'下载原文件 ↓'}).click();const download=await event;expect(await fs.readFile((await download.path())!)).toEqual(raw);
 expect(await (await request.get('/rss.xml')).text()).not.toContain(route);expect(await (await request.get('/sitemap.xml')).text()).toContain(route);expect(await (await request.get('/search.json')).json()).toHaveLength(2);
 await page.getByRole('link',{name:'← 返回正文',exact:true}).click();await page.getByRole('link',{name:'大源码',exact:true}).click();expect((await page.locator('pre code').textContent())?.length).toBeGreaterThan(280000);await expect(page.locator('pre code span')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('external links open another tab and keep the article open; local navigation stays in place',async({page,context})=>{
 await page.goto('/posts/sample-compiler/');
 for(const name of ['GitHub ↗','公开参考','HTML 外链']){const link=page.getByRole('link',{name,exact:true});await expect(link).toHaveAttribute('target','_blank');await expect(link).toHaveAttribute('rel',/noopener/);await expect(link).toHaveAttribute('rel',/noreferrer/);}
 for(const name of ['本站绝对地址','本页锚点','邮件','中文源码'])await expect(page.getByRole('link',{name,exact:true})).not.toHaveAttribute('target','_blank');
 await context.route('https://example.com/reference',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Reference</title>Reference'}));
 const popupEvent=page.waitForEvent('popup');await page.getByRole('link',{name:'公开参考',exact:true}).click();const popup=await popupEvent;await popup.waitForLoadState();await expect(popup).toHaveTitle('Reference');await expect(page).toHaveURL(/\/posts\/sample-compiler\/$/);expect(await popup.evaluate(()=>window.opener)).toBeNull();await popup.close();
 await page.getByRole('link',{name:'本页锚点',exact:true}).click();expect(decodeURIComponent(new URL(page.url()).hash)).toBe('#原理');
});
test('row and column spans preserve a complete grid and scroll on narrow screens',async({page},info)=>{
 await page.goto('/posts/sample-compiler/');const table=page.locator('.qos-table');await expect(table.locator('[rowspan="2"]')).toHaveText('共同结果');await expect(table.locator('[colspan="2"]')).toHaveText('横向合并');await expect(table.locator('tbody tr')).toHaveCount(2);await expect(table.locator('tbody tr').last()).toContainText('结果 B');
 if(info.project.name==='mobile')expect(await table.evaluate(el=>{el.scrollLeft=100;return el.scrollLeft>0;})).toBe(true);
 await table.scrollIntoViewIfNeeded();await table.screenshot({path:info.outputPath('merged-table-light.png')});await page.locator('#theme-toggle').click();await table.screenshot({path:info.outputPath('merged-table-dark.png')});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('articles render, code copies, TOC scrolls, images zoom and Escape restores focus',async ({page,context},info)=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);await page.goto('/');await page.locator('.post-title').first().click();
 await expect(page.locator('.prose')).toBeVisible();await expect(page.locator('.toc')).toBeVisible();
 const copy=page.getByRole('button',{name:'复制代码'}).first();await copy.click();await expect(copy).toHaveText('已复制');expect((await page.evaluate(()=>navigator.clipboard.readText())).length).toBeGreaterThan(0);
 const pre=page.locator('.prose pre').first();await expect(pre).toHaveAttribute('tabindex','0');expect(await pre.evaluate(el=>getComputedStyle(el).overflowX)).toBe('auto');
 const image=page.locator('.image-trigger').first();await image.click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();await expect(image).toBeFocused();
 await page.locator('.toc a').first().click();expect(new URL(page.url()).hash).not.toBe('');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('article.png'),fullPage:false});
});
test('all generated pages and assets load; feeds share index',async ({page,request})=>{
 const index=await (await request.get('/search.json')).json() as {href:string;title:string}[];
 const rss=await (await request.get('/rss.xml')).text(),sitemap=await (await request.get('/sitemap.xml')).text();
 for(const post of index){expect(rss).toContain(post.href);expect(sitemap).toContain(post.href);const response=await page.goto(post.href);expect(response?.status()).toBe(200);await expect(page.locator('h1')).toHaveText(post.title);for(const img of await page.locator('.prose img').all()){await img.scrollIntoViewIfNeeded();await expect(img).toHaveJSProperty('complete',true);expect(await img.evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);}}
 await page.goto('/404.html');await expect(page.locator('h1')).toContainText('还没找到');
 const attachment=await request.get('/files/sample-compiler/example.c');expect(attachment.status()).toBe(200);expect(await attachment.text()).toBe('int answer = 42;\n');
});
