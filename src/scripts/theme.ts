const button = document.querySelector<HTMLButtonElement>('#theme-toggle');
function updateLabel() { button?.setAttribute('aria-label', document.documentElement.dataset.theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'); }
updateLabel();
button?.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('theme', theme); } catch { /* Theme still works without storage. */ }
  updateLabel();
});
