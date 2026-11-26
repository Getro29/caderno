'use strict';
// Conversor Markdown mínimo e seguro: todo texto é escapado antes de virar HTML.
App.markdown = (() => {
  const esc = s => App.esc(s);

  function inline(texto) {
    const codigos = [];
    let s = esc(texto).replace(/`([^`]+)`/g, (_, c) => { codigos.push(c); return `\u0000${codigos.length - 1}\u0000`; });
    s = s
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, alvo, rot) => `<span class="wikilink" title="${alvo}">${rot || alvo}</span>`)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, rot, url) => {
        const u = url.replace(/&amp;/g, '&');
        return /^(https?:|mailto:)/i.test(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${rot}</a>` : rot;
      })
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
      .replace(/(^|[^\w])_([^_\s][^_]*)_(?!\w)/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(/==([^=]+)==/g, '<mark>$1</mark>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codigos[i]}</code>`);
  }

  function paraHTML(md) {
    const linhas = String(md || '').replace(/\r\n?/g, '\n').split('\n');
    const out = []; let i = 0;
    while (i < linhas.length) {
      const l = linhas[i];
      if (/^```/.test(l)) {
        const bloco = []; i++;
        while (i < linhas.length && !/^```/.test(linhas[i])) bloco.push(linhas[i++]);
        i++; out.push(`<pre><code>${esc(bloco.join('\n'))}</code></pre>`); continue;
      }
      let m;
      if ((m = l.match(/^(#{1,6})\s+(.*)$/))) { const n = Math.min(m[1].length + 1, 6); out.push(`<h${n}>${inline(m[2])}</h${n}>`); i++; continue; }
      if (/^(\s*[-*_]){3,}\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
      if (/^>\s?/.test(l)) {
        const q = [];
        while (i < linhas.length && /^>\s?/.test(linhas[i])) q.push(linhas[i++].replace(/^>\s?/, ''));
        out.push(`<blockquote>${paraHTML(q.join('\n'))}</blockquote>`); continue;
      }
      if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
        const ordenada = /^\s*\d+[.)]/.test(l);
        const itens = [];
        while (i < linhas.length && /^\s*([-*+]|\d+[.)])\s+/.test(linhas[i])) {
          let t = linhas[i++].replace(/^\s*([-*+]|\d+[.)])\s+/, '');
          const chk = t.match(/^\[( |x|X)\]\s+(.*)$/);
          if (chk) t = `<input type="checkbox" disabled${chk[1] !== ' ' ? ' checked' : ''}> ${inline(chk[2])}`;
          else t = inline(t);
          itens.push(`<li${chk ? ' class="check"' : ''}>${t}</li>`);
        }
        out.push(ordenada ? `<ol>${itens.join('')}</ol>` : `<ul>${itens.join('')}</ul>`); continue;
      }
      if (!l.trim()) { i++; continue; }
      const p = [];
      while (i < linhas.length && linhas[i].trim() && !/^(#{1,6}\s|```|>|\s*([-*+]|\d+[.)])\s+)/.test(linhas[i])) p.push(linhas[i++]);
      out.push(`<p>${p.map(inline).join('<br>')}</p>`);
    }
    return out.join('\n');
  }

  // Texto limpo para leitura em voz alta.
  function textoPuro(md) {
    return String(md || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/^#{1,6}\s+(.*)$/gm, '$1.')
      .replace(/^\s*([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/gm, '')
      .replace(/^>\s?/gm, '')
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, r) => r || a)
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_`~=]{1,3}/g, '')
      .replace(/\n{2,}/g, '\n').trim();
  }

  function render(alvo, md) {
    alvo.innerHTML = paraHTML(md); // seguro: paraHTML escapa todo o conteúdo
    alvo.classList.add('md');
    return alvo;
  }

  return { paraHTML, textoPuro, render };
})();
