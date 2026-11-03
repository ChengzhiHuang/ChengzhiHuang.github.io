const languages = { py: 'python', c: 'c', h: 'c', cpp: 'cpp', m: 'objective-c', mm: 'objective-c', json: 'json', plist: 'xml', txt: 'text', sh: 'bash' };

/** @param {string} filename */
export function attachmentLanguage(filename) {
  return languages[filename.split('.').pop()] || null;
}

/** @param {string} slug @param {string} filename */
export function attachmentHref(slug, filename) {
  if (filename.endsWith('.md')) return `/posts/${slug}/attachments/${filename.slice(0, -3)}/`;
  return attachmentLanguage(filename) ? `/posts/${slug}/attachments/${filename}/` : `/files/${slug}/${filename}`;
}

export const codeHighlightLimit = 256 * 1024;
