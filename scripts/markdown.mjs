// Explicit presentation markers only; ordinary code is never interpreted as prose.
export function remarkTldr() {
  return tree => {
    function visit(node) {
      const first = node.children?.[0];
      if (node.type === 'blockquote' && first?.type === 'paragraph' && first.children?.length === 1 && first.children[0].value?.trim() === '[!TLDR]') {
        node.data = { hName: 'aside', hProperties: { className: ['tldr'], ariaLabel: 'TL;DR' } };
        node.children[0] = { type: 'paragraph', data: { hProperties: { className: ['tldr-label'] } }, children: [{ type: 'text', value: 'TL;DR' }] };
      }
      for (const child of node.children || []) visit(child);
    }
    visit(tree);
  };
}

export function parseAnnotations(source) {
  const lines = [];
  const code = source.split('\n').map(line => {
    const ranges = []; let plain = '', offset = 0;
    // Keep runs of comment stars, unmatched markers and escaped markers literal.
    const pattern = /((?<![\\*])\*\*(?!\*)|(?<![\\~])~~(?!~))([^\n]+?)(?<![\\*~])\1(?![*~])/g;
    for (const match of line.matchAll(pattern)) {
      plain += line.slice(offset, match.index);
      const start = plain.length; plain += match[2];
      ranges.push({ start, end: plain.length, tag: match[1] === '**' ? 'strong' : 'del' });
      offset = match.index + match[0].length;
    }
    plain += line.slice(offset); lines.push(ranges); return plain;
  }).join('\n');
  return { code, lines };
}

export function annotatedCode() {
  return {
    name: 'explicit-code-annotations',
    preprocess(code, options) {
      if (!/(?:^|\s)annotated(?:\s|$)/.test(options.meta?.__raw || '')) return;
      const parsed = parseAnnotations(code); this.meta.blogAnnotations = parsed.lines; return parsed.code;
    },
    pre(node) {
      if (this.meta.blogAnnotations) node.properties.dataAnnotated = 'true';
    },
    line(node, lineNumber) {
      const ranges = this.meta.blogAnnotations?.[lineNumber - 1];
      if (!ranges?.length) return;
      let position = 0;
      function decorate(parent) {
        parent.children = parent.children.flatMap(child => {
          if (child.type !== 'text') { if (child.children) decorate(child); return [child]; }
          const start = position, end = start + child.value.length; position = end;
          const cuts = [...new Set([start, end, ...ranges.flatMap(r => [r.start, r.end]).filter(p => p > start && p < end)])].sort((a,b) => a-b);
          return cuts.slice(0, -1).map((left, i) => {
            const right = cuts[i + 1]; let result = { type: 'text', value: child.value.slice(left - start, right - start) };
            for (const range of ranges) if (left >= range.start && right <= range.end) result = { type: 'element', tagName: range.tag, properties: {}, children: [result] };
            return result;
          });
        });
      }
      decorate(node);
    },
  };
}
