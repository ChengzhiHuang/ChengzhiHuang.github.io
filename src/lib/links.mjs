export const siteOrigin = 'https://chengzhihuang.github.io';

/** @param {string} href */
export function isExternalLink(href) {
  try {
    const url = new URL(href, siteOrigin);
    return ['http:', 'https:'].includes(url.protocol) && url.origin !== siteOrigin;
  } catch { return false; }
}
