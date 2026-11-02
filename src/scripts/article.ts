document.querySelectorAll<HTMLPreElement>('.prose pre').forEach(pre => {
  pre.tabIndex = 0; pre.setAttribute('aria-label', '代码，可横向滚动');
  const wrap = document.createElement('div'); wrap.className = 'code-block'; pre.before(wrap); wrap.append(pre);
  const button = document.createElement('button'); button.className = 'copy-code'; button.textContent = '复制'; button.setAttribute('aria-label', '复制代码'); wrap.append(button);
  if (pre.dataset.annotated) button.title = '复制完整代码，包含划线部分，不含排版标记';
  button.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(pre.querySelector('code')?.textContent || ''); button.textContent = '已复制'; }
    catch { button.textContent = '复制失败，请选择代码'; }
    setTimeout(() => { button.textContent = '复制'; }, 2000);
  });
});
const dialog = document.querySelector<HTMLDialogElement>('#image-viewer');
let lastFocus: HTMLElement | null = null;
document.querySelectorAll<HTMLImageElement>('.prose img').forEach(img => {
  const button = document.createElement('button'); button.className = 'image-trigger'; button.setAttribute('aria-label', `放大图片：${img.alt || '技术示意图'}`); img.before(button); button.append(img);
  button.addEventListener('click', () => {
    if (!dialog) return; const full = dialog.querySelector('img'); if (full) { full.src = img.currentSrc || img.src; full.alt = img.alt; }
    const caption = dialog.querySelector('p'); if (caption) caption.textContent = img.alt;
    lastFocus = button; dialog.showModal();
  });
});
dialog?.querySelector('button')?.addEventListener('click', () => dialog.close());
dialog?.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
dialog?.addEventListener('close', () => lastFocus?.focus());
