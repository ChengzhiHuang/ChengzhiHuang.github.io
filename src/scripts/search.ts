import { matchesPost } from '../lib/model';
const input = document.querySelector<HTMLInputElement>('[data-search]');
const kbd = document.querySelector<HTMLElement>('[data-search-kbd]');
const posts = [...document.querySelectorAll<HTMLElement>('[data-post]')];

function syncUrl(query: string) {
  const url = new URL(location.href);
  if (query.trim()) url.searchParams.set('q', query.trim());
  else url.searchParams.delete('q');
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function search() {
  const query = input?.value || '';
  if (kbd) kbd.hidden = Boolean(query) || document.activeElement === input;
  let visible = 0;
  for (const post of posts) {
    const match = matchesPost(
      {
        title: post.dataset.title || '',
        description: post.dataset.description || '',
        tags: JSON.parse(post.dataset.tags || '[]'),
        headings: JSON.parse(post.dataset.headings || '[]'),
        category: post.dataset.category || '',
      },
      query,
    );
    post.hidden = !match;
    if (match) visible++;
  }
  const count = document.querySelector('[data-count]');
  if (count) count.textContent = String(visible);
  const status = document.querySelector('[data-search-status]');
  if (status) status.textContent = `找到 ${visible} 篇文章`;
  const empty = document.querySelector<HTMLElement>('[data-empty]');
  if (empty) empty.hidden = visible > 0;
}

if (input) {
  input.value = new URLSearchParams(location.search).get('q') || '';
  input.addEventListener('input', () => {
    syncUrl(input.value);
    search();
  });
  input.addEventListener('focus', () => { if (kbd) kbd.hidden = true; });
  input.addEventListener('blur', () => { if (kbd) kbd.hidden = Boolean(input.value); });
  search();

  document.querySelectorAll<HTMLAnchorElement>('[data-tag]').forEach(tagLink => {
    tagLink.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const tag = tagLink.dataset.tag || '';
      input.value = input.value.trim() === tag ? '' : tag;
      syncUrl(input.value);
      search();
    });
  });

  document.addEventListener('keydown', event => {
    const target = event.target as HTMLElement | null;
    const editable = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
    if (event.key === '/' && !editable && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      input.focus();
      input.select();
    } else if (event.key === 'Escape' && document.activeElement === input) {
      if (input.value) {
        input.value = '';
        syncUrl('');
        search();
      } else {
        input.blur();
      }
    }
  });
}
