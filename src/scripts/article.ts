const languageLabels: Record<string, string> = {
  asm: 'ARM64 / ASM',
  bash: 'Shell',
  c: 'C',
  cpp: 'C++',
  html: 'HTML',
  js: 'JavaScript',
  json: 'JSON',
  markdown: 'Markdown',
  md: 'Markdown',
  objc: 'Objective-C',
  'objective-c': 'Objective-C',
  'objective-cpp': 'Objective-C++',
  objcpp: 'Objective-C++',
  plaintext: 'Text',
  py: 'Python',
  python: 'Python',
  sh: 'Shell',
  shell: 'Shell',
  swift: 'Swift',
  text: 'Text',
  ts: 'TypeScript',
  xml: 'XML / Plist',
};

function formatCodeLang(pre: HTMLPreElement): string {
  const raw = (pre.dataset.language || '').trim().toLowerCase();
  const base = languageLabels[raw] || (raw ? raw.toUpperCase() : 'Code');
  return pre.dataset.annotated ? `${base} · 批注` : base;
}

document.querySelectorAll<HTMLPreElement>('.prose pre').forEach(pre => {
  pre.tabIndex = 0;
  pre.setAttribute('aria-label', '代码，可横向滚动');
  const wrap = document.createElement('div');
  wrap.className = 'code-block';
  pre.before(wrap);
  const toolbar = document.createElement('div');
  toolbar.className = 'code-toolbar';
  const lang = document.createElement('span');
  lang.className = 'code-lang';
  lang.textContent = formatCodeLang(pre);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'copy-code';
  button.textContent = '复制';
  button.setAttribute('aria-label', '复制代码');
  if (pre.dataset.annotated) button.title = '复制完整代码，包含划线部分，不含排版标记';
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(pre.querySelector('code')?.textContent || '');
      button.textContent = '已复制';
    } catch {
      button.textContent = '复制失败，请选择代码';
    }
    setTimeout(() => { button.textContent = '复制'; }, 2000);
  });
  toolbar.append(lang, button);
  wrap.append(toolbar, pre);
});

document.querySelectorAll<HTMLHeadingElement>('.prose :is(h2, h3, h4)[id]').forEach(heading => {
  const anchor = document.createElement('button');
  anchor.type = 'button';
  anchor.className = 'heading-anchor';
  anchor.setAttribute('aria-label', '复制本节链接');
  anchor.title = '复制本节链接';
  anchor.addEventListener('click', async () => {
    const hash = `#${encodeURIComponent(heading.id)}`;
    history.replaceState(null, '', hash);
    const url = new URL(hash, location.href).toString();
    try {
      await navigator.clipboard.writeText(url);
      anchor.dataset.copied = 'true';
      setTimeout(() => { delete anchor.dataset.copied; }, 1600);
    } catch {
      location.hash = hash;
    }
  });
  heading.append(anchor);
});

const prose = document.querySelector<HTMLElement>('.prose');
const progressBar = document.querySelector<HTMLElement>('[data-reading-progress]');
const toc = document.querySelector<HTMLElement>('.toc');
const quickActions = document.querySelector<HTMLElement>('[data-quick-actions]');
const tocOpenBtn = document.querySelector<HTMLButtonElement>('[data-toc-open]');
const scrollTopBtn = document.querySelector<HTMLButtonElement>('[data-scroll-top]');
const tocSheet = document.querySelector<HTMLElement>('[data-toc-sheet]');
const tocSheetList = document.querySelector<HTMLOListElement>('[data-toc-sheet-list]');

interface SectionEntry {
  id: string;
  heading: HTMLElement;
  tocLink: HTMLAnchorElement;
  sheetLink?: HTMLAnchorElement;
}

const sections: SectionEntry[] = [];
document.querySelectorAll<HTMLAnchorElement>('.toc ol a[href^="#"]').forEach(tocLink => {
  const rawHash = tocLink.getAttribute('href') || '';
  const id = decodeURIComponent(rawHash.slice(1));
  const heading = id ? document.getElementById(id) : null;
  if (!heading) return;
  let sheetLink: HTMLAnchorElement | undefined;
  if (tocSheetList) {
    const li = document.createElement('li');
    if (tocLink.parentElement?.classList.contains('nested')) li.className = 'nested';
    sheetLink = document.createElement('a');
    sheetLink.href = rawHash;
    sheetLink.textContent = tocLink.textContent;
    li.append(sheetLink);
    tocSheetList.append(li);
  }
  sections.push({ id, heading, tocLink, sheetLink });
});

function closeTocSheet(restoreFocus = false) {
  if (!tocSheet || tocSheet.hidden) return;
  tocSheet.hidden = true;
  tocOpenBtn?.setAttribute('aria-expanded', 'false');
  if (restoreFocus) tocOpenBtn?.focus();
}

tocOpenBtn?.addEventListener('click', () => {
  if (!tocSheet) return;
  const nextOpen = tocSheet.hidden;
  tocSheet.hidden = !nextOpen;
  tocOpenBtn.setAttribute('aria-expanded', String(nextOpen));
  if (nextOpen) {
    tocSheet.querySelector<HTMLElement>('.is-active')?.scrollIntoView({ block: 'nearest' });
    tocSheet.querySelector<HTMLButtonElement>('.toc-sheet-close')?.focus();
  }
});

tocSheet?.querySelectorAll<HTMLElement>('[data-toc-close]').forEach(el => {
  el.addEventListener('click', () => closeTocSheet(true));
});
tocSheetList?.addEventListener('click', event => {
  if ((event.target as HTMLElement | null)?.closest('a')) closeTocSheet(false);
});

scrollTopBtn?.addEventListener('click', () => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
});

let activeSectionId = '';
let framePending = false;

function syncReadingState() {
  framePending = false;
  if (prose && progressBar) {
    const rect = prose.getBoundingClientRect();
    const span = Math.max(1, prose.offsetHeight - window.innerHeight * 0.6);
    const ratio = prose.offsetHeight <= window.innerHeight * 0.8
      ? (window.scrollY > 30 ? 1 : 0)
      : Math.min(1, Math.max(0, -rect.top / span));
    progressBar.style.transform = `scaleX(${ratio.toFixed(4)})`;
  }

  const narrow = window.innerWidth <= 1050;
  if (!narrow && tocSheet && !tocSheet.hidden) closeTocSheet(false);
  if (tocOpenBtn) tocOpenBtn.hidden = !(narrow && sections.length > 0);
  if (quickActions) {
    const passedToc = toc ? toc.getBoundingClientRect().bottom < 0 : window.scrollY > 420;
    quickActions.hidden = narrow ? !passedToc : window.scrollY < 560;
  }

  if (!sections.length) return;
  const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 24;
  let current = sections[0];
  if (atBottom) {
    current = sections[sections.length - 1];
  } else {
    for (const entry of sections) {
      if (entry.heading.getBoundingClientRect().top <= 120) current = entry;
      else break;
    }
  }
  if (current.id === activeSectionId) return;
  activeSectionId = current.id;
  for (const entry of sections) {
    const active = entry.id === activeSectionId;
    entry.tocLink.classList.toggle('is-active', active);
    if (active) entry.tocLink.setAttribute('aria-current', 'location');
    else entry.tocLink.removeAttribute('aria-current');
    if (entry.sheetLink) {
      entry.sheetLink.classList.toggle('is-active', active);
      if (active) entry.sheetLink.setAttribute('aria-current', 'location');
      else entry.sheetLink.removeAttribute('aria-current');
    }
  }
  if (toc && getComputedStyle(toc).position === 'sticky') {
    const linkTop = current.tocLink.offsetTop;
    const viewTop = toc.scrollTop;
    const viewBottom = viewTop + toc.clientHeight;
    if (linkTop < viewTop + 28 || linkTop > viewBottom - 44) {
      toc.scrollTo({ top: Math.max(0, linkTop - toc.clientHeight / 2), behavior: 'auto' });
    }
  }
}

function requestReadingSync() {
  if (framePending) return;
  framePending = true;
  requestAnimationFrame(syncReadingState);
}

window.addEventListener('scroll', requestReadingSync, { passive: true });
window.addEventListener('resize', requestReadingSync);
syncReadingState();

const dialog = document.querySelector<HTMLDialogElement>('#image-viewer');
const zoomBtn = dialog?.querySelector<HTMLButtonElement>('[data-image-zoom]');
const closeBtn = dialog?.querySelector<HTMLButtonElement>('.image-close');
const stage = dialog?.querySelector<HTMLElement>('[data-image-stage]');
const fullImg = dialog?.querySelector<HTMLImageElement>('img');
const caption = dialog?.querySelector<HTMLParagraphElement>('[data-image-caption]');
let lastFocus: HTMLElement | null = null;

function setImageZoom(zoomed: boolean) {
  if (!dialog || !zoomBtn) return;
  dialog.dataset.zoomed = zoomed ? 'true' : 'false';
  zoomBtn.setAttribute('aria-pressed', String(zoomed));
  zoomBtn.textContent = zoomed ? '适应窗口' : '1:1 原始尺寸';
  if (!zoomed && stage) stage.scrollTo(0, 0);
}

function isPlaceholderAlt(alt: string): boolean {
  const trimmed = alt.trim();
  return !trimmed || /^(?:技术示意图|合成示意图|示意图)(?:\s|$)/.test(trimmed);
}

document.querySelectorAll<HTMLImageElement>('.prose img').forEach(img => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'image-trigger';
  button.setAttribute('aria-label', `放大图片：${img.alt || '技术示意图'}`);
  img.before(button);
  button.append(img);
  button.addEventListener('click', () => {
    if (!dialog || !fullImg) return;
    setImageZoom(false);
    fullImg.src = img.currentSrc || img.src;
    fullImg.alt = img.alt;
    if (caption) {
      if (isPlaceholderAlt(img.alt)) {
        caption.textContent = '';
        caption.hidden = true;
      } else {
        caption.textContent = img.alt;
        caption.hidden = false;
      }
    }
    lastFocus = button;
    dialog.showModal();
  });
});

zoomBtn?.addEventListener('click', () => {
  setImageZoom(dialog?.dataset.zoomed !== 'true');
});
fullImg?.addEventListener('click', () => {
  setImageZoom(dialog?.dataset.zoomed !== 'true');
});
closeBtn?.addEventListener('click', () => dialog?.close());
dialog?.addEventListener('click', event => {
  if (event.target === dialog || event.target === stage) dialog.close();
});
dialog?.addEventListener('close', () => {
  setImageZoom(false);
  lastFocus?.focus();
});

const RETURN_STATE_KEY = 'techpost:return-pos';
const RETURN_ACTIVE_KEY = 'techpost:return-active';

interface ReturnPosition {
  articlePath: string;
  attachmentPath: string;
  occurrence: number;
  viewportTop: number;
  scrollY: number;
}

function normalizePath(pathname: string): string {
  return pathname.endsWith('/') ? pathname : `${pathname}/`;
}

function isPlainLeftClick(event: MouseEvent, anchor: HTMLAnchorElement): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    (!anchor.target || anchor.target === '_self') &&
    !anchor.hasAttribute('download')
  );
}

const attachmentLinks = [...document.querySelectorAll<HTMLAnchorElement>('.prose a[href*="/attachments/"]')];
attachmentLinks.forEach(link => {
  link.addEventListener('click', event => {
    if (!isPlainLeftClick(event, link)) return;
    const targetUrl = new URL(link.href, location.origin);
    if (targetUrl.origin !== location.origin) return;
    const attachmentPath = normalizePath(targetUrl.pathname);
    const sameTarget = attachmentLinks.filter(candidate => normalizePath(new URL(candidate.href, location.origin).pathname) === attachmentPath);
    const payload: ReturnPosition = {
      articlePath: normalizePath(location.pathname),
      attachmentPath,
      occurrence: Math.max(0, sameTarget.indexOf(link)),
      viewportTop: Math.round(link.getBoundingClientRect().top),
      scrollY: Math.round(window.scrollY),
    };
    try {
      sessionStorage.setItem(RETURN_STATE_KEY, JSON.stringify(payload));
      sessionStorage.removeItem(RETURN_ACTIVE_KEY);
    } catch { /* Session storage may be unavailable in restricted contexts. */ }
  });
});

document.querySelectorAll<HTMLAnchorElement>('[data-return-article]').forEach(backLink => {
  backLink.addEventListener('click', event => {
    if (!isPlainLeftClick(event, backLink)) return;
    try {
      const dest = normalizePath(new URL(backLink.href, location.origin).pathname);
      sessionStorage.setItem(RETURN_ACTIVE_KEY, dest);
    } catch { /* Fallback to normal link navigation. */ }
  });
});

try {
  const currentPath = normalizePath(location.pathname);
  const pendingArticle = sessionStorage.getItem(RETURN_ACTIVE_KEY);
  if (pendingArticle === currentPath) {
    sessionStorage.removeItem(RETURN_ACTIVE_KEY);
    const rawSaved = sessionStorage.getItem(RETURN_STATE_KEY);
    sessionStorage.removeItem(RETURN_STATE_KEY);
    if (rawSaved && !location.hash) {
      const saved = JSON.parse(rawSaved) as ReturnPosition;
      if (saved.articlePath === currentPath) {
        const candidates = attachmentLinks.filter(candidate => normalizePath(new URL(candidate.href, location.origin).pathname) === saved.attachmentPath);
        const matchedLink = candidates[saved.occurrence] || candidates[0];
        const html = document.documentElement;
        const prevBehavior = html.style.scrollBehavior;
        html.style.scrollBehavior = 'auto';
        const computeTargetY = () => matchedLink
          ? Math.max(0, Math.round(window.scrollY + matchedLink.getBoundingClientRect().top - saved.viewportTop))
          : Math.max(0, Math.round(saved.scrollY));
        window.scrollTo(0, computeTargetY());
        if (matchedLink) {
          matchedLink.classList.add('is-returned-link');
          setTimeout(() => matchedLink.classList.remove('is-returned-link'), 1800);
        }
        requestAnimationFrame(() => {
          if (matchedLink) {
            const drift = matchedLink.getBoundingClientRect().top - saved.viewportTop;
            if (Math.abs(drift) > 2) window.scrollTo(0, Math.max(0, Math.round(window.scrollY + drift)));
          }
          html.style.scrollBehavior = prevBehavior;
          syncReadingState();
        });
      }
    }
  }
} catch { /* Ignore storage errors and keep top-of-page default. */ }

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && tocSheet && !tocSheet.hidden) {
    event.preventDefault();
    closeTocSheet(true);
  }
});
