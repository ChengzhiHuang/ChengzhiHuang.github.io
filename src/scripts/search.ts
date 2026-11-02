import { matchesPost } from '../lib/model';
const input = document.querySelector<HTMLInputElement>('[data-search]');
const posts = [...document.querySelectorAll<HTMLElement>('[data-post]')];
function search() {
  let visible = 0;
  for (const post of posts) {
    const match = matchesPost({ title: post.dataset.title || '', tags: JSON.parse(post.dataset.tags || '[]'), category: post.dataset.category || '' }, input?.value || '');
    post.hidden = !match; if (match) visible++;
  }
  const count = document.querySelector('[data-count]'); if (count) count.textContent = String(visible);
  const status = document.querySelector('[data-search-status]'); if (status) status.textContent = `找到 ${visible} 篇文章`;
  const empty = document.querySelector<HTMLElement>('[data-empty]'); if (empty) empty.hidden = visible > 0;
}
if (input) { input.value = new URLSearchParams(location.search).get('q') || ''; input.addEventListener('input', search); search(); }
