'use strict';
// Núcleo: cria window.App e utilitários compartilhados por todos os módulos.
window.App = (() => {
  const ouvintes = {};
  const ICONES = {
    fechar: 'M6 6l12 12|M18 6L6 18',
    mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z|M5 11a7 7 0 0 0 14 0|M12 18v3',
    som: 'M4 9v6h4l5 4V5L8 9H4z|M16 9a4 4 0 0 1 0 6|M18.5 6.5a8 8 0 0 1 0 11',
    parar: 'M7 7h10v10H7z',
    lixeira: 'M4 7h16|M9 7V4h6v3|M6 7l1 13h10l1-13',
    recarregar: 'M20 12a8 8 0 1 1-2.3-5.7|M20 4v5h-5',
    lapis: 'M4 20h4L19 9l-4-4L4 16v4z|M13 7l4 4',
    esquerda: 'M15 6l-6 6 6 6',
    direita: 'M9 6l6 6-6 6',
    relogio: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z|M12 7v5l3 2',
    buscar: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14z|M20 20l-4-4',
    imagem: 'M4 5h16v14H4z|M4 16l5-5 4 4 2-2 5 5|M15 9h.01',
    mais: 'M12 5v14|M5 12h14',
    cima: 'M6 15l6-6 6 6',
    baixo: 'M6 9l6 6 6-6',
    sino: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4l2-2z|M10 20a2 2 0 0 0 4 0',
    play: 'M8 5v14l11-7z',
    pausa: 'M8 5v14|M16 5v14',
    check: 'M5 12l5 5L20 7',
    compartilhar: 'M18 3a3 3 0 1 0 0 6a3 3 0 0 0 0-6z|M6 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z|M18 15a3 3 0 1 0 0 6a3 3 0 0 0 0-6z|M8.6 13.5l6.8 4|M15.4 6.5l-6.8 4',
    pessoa: 'M12 4a4 4 0 1 0 0 8a4 4 0 0 0 0-8z|M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6',
    trofeu: 'M8 4h8v5a4 4 0 0 1-8 0z|M8 6H5a3 3 0 0 0 3 4|M16 6h3a3 3 0 0 1-3 4|M12 13v4|M8 20h8|M10 17h4v3h-4z',
    haltere: 'M6 7v10|M9 7v10|M15 7v10|M18 7v10|M3 10v4|M21 10v4|M9 12h6',
    raio: 'M13 3L5 13h6l-1 8 8-10h-6z',
    estrela: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
    ajustes: 'M4 6h9|M17 6h3|M15 4v4|M4 12h3|M11 12h9|M9 10v4|M4 18h11|M19 18h1|M17 16v4',
    casa: 'M3 11l9-7 9 7|M5 10v10h14V10|M10 20v-6h4v6',
    tarefas: 'M4 4h16v16H4z|M8 12l3 3 5-6',
    agenda: 'M4 6h16v14H4z|M4 10h16|M8 3v5|M16 3v5',
    estudo: 'M2 9l10-5 10 5-10 5z|M6 11v5c3 3 9 3 12 0v-5',
    notas: 'M6 3h9l4 4v14H6z|M14 3v5h5|M9 13h7|M9 17h5',
    alvo: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z|M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8z',
    folha: 'M5 19c0-8 5-14 15-14 0 10-6 15-14 15|M5 19l8-8',
    carteira: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H3z|M3 7l12-4v4|M16 13h2',
    livro: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z|M4 21V5|M8 7h7',
    tela: 'M3 5h18v12H3z|M8 21h8|M12 17v4',
    paleta: 'M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-1-1-1.5-1-2.5s.9-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8z|M7.5 11h.01|M10 7.5h.01|M15 7.5h.01',
  };

  const App = {
    on(evento, fn) { (ouvintes[evento] ||= []).push(fn); },
    emit(evento, dados) {
      for (const fn of ouvintes[evento] || []) {
        try { fn(dados); } catch (e) { console.error(e); }
      }
    },

    esc(s) {
      return String(s ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
      ));
    },

    slug(texto) {
      const s = String(texto || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        .slice(0, 80).replace(/-+$/, '');
      return s || 'sem-titulo';
    },

    // ---- datas (sempre AAAA-MM-DD no horário local) ----
    dataISO(d = new Date()) {
      const z = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
    },
    hoje() { return App.dataISO(new Date()); },
    agoraISO() {
      const d = new Date();
      const z = n => String(n).padStart(2, '0');
      return `${App.dataISO(d)}T${z(d.getHours())}:${z(d.getMinutes())}`;
    },
    somarDias(iso, dias) {
      const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
      return App.dataISO(new Date(a, m - 1, d + dias));
    },
    diasAte(iso) {
      if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
      const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
      const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
      return Math.round((new Date(a, m - 1, d) - hoje) / 86400000);
    },
    fmtData(iso) {
      if (!iso) return '';
      const s = String(iso);
      const [a, m, d] = s.slice(0, 10).split('-');
      const hora = s.length > 10 ? ' ' + s.slice(11, 16) : '';
      return `${d}/${m}/${a}${hora}`;
    },
    descreverPrazo(iso) {
      const n = App.diasAte(iso);
      if (n === null) return '';
      if (n < -1) return `atrasada ${-n} dias`;
      if (n === -1) return 'venceu ontem';
      if (n === 0) return 'vence hoje';
      if (n === 1) return 'vence amanhã';
      if (n < 7) return `em ${n} dias`;
      return App.fmtData(iso);
    },

    // Estrelas de 0 a 5, aceitando meia estrela (notas do Letterboxd).
    estrelas(n) {
      const v = Math.max(0, Math.min(5, Math.round((Number(n) || 0) * 2) / 2));
      const cheias = Math.floor(v);
      return '★'.repeat(cheias) + (v % 1 ? '½' : '') + '☆'.repeat(5 - Math.ceil(v));
    },

    tagsDeTexto(texto) {
      return String(texto || '').split(/[,;]/).map(t => t.trim().replace(/^#/, '').replace(/\s+/g, '-'))
        .filter(Boolean);
    },
    lista(v) { return Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]); },

    // ---- criação de elementos sem innerHTML ----
    el(tag, attrs, ...filhos) {
      const no = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs || {})) {
        if (v == null || v === false) continue;
        if (k.startsWith('on') && typeof v === 'function') no.addEventListener(k.slice(2), v);
        else if (k === 'class') no.className = v;
        else if (k === 'text') no.textContent = v;
        else if (k === 'value') no.value = v;
        else if (k === 'checked') no.checked = !!v;
        else no.setAttribute(k, v === true ? '' : v);
      }
      for (const f of filhos.flat(Infinity)) {
        if (f == null || f === false) continue;
        no.append(f instanceof Node ? f : document.createTextNode(String(f)));
      }
      return no;
    },

    // Campo com rótulo e, se houver suporte, botão de ditado.
    campo(rotulo, entrada, opcoes = {}) {
      const id = entrada.id || ('c-' + Math.random().toString(36).slice(2, 9));
      entrada.id = id;
      const linha = App.el('div', { class: 'campo-linha' }, entrada);
      if (opcoes.voz !== false && App.voz) {
        const mic = App.voz.botaoDitado(entrada);
        if (mic) linha.append(mic);
      }
      return App.el('div', { class: 'campo' + (opcoes.largo ? ' largo' : '') },
        App.el('label', { for: id, text: rotulo }), linha);
    },

    toast(msg, tipo = 'info') {
      let area = document.getElementById('toasts');
      if (!area) {
        area = App.el('div', { id: 'toasts', 'aria-live': 'polite' });
        document.body.append(area);
      }
      const t = App.el('div', { class: 'toast ' + tipo, role: tipo === 'erro' ? 'alert' : 'status', text: msg });
      area.append(t);
      App.animacao?.aviso(t);
      setTimeout(() => (App.animacao ? App.animacao.sair(t) : t.remove()), tipo === 'erro' ? 7000 : 3500);
    },

    // Diálogo modal reutilizável. Retorna o <dialog>; corpo é um nó.
    dialogo(titulo, corpo, acoes) {
      const dlg = App.el('dialog', { class: 'dialogo', 'aria-label': titulo },
        App.el('form', { method: 'dialog', class: 'dialogo-form', onsubmit: e => e.preventDefault() },
          App.el('header', {}, App.el('h2', { text: titulo }),
            App.el('button', { type: 'button', class: 'icone', 'aria-label': 'Fechar', onclick: () => dlg.close() }, App.icone('fechar'))),
          App.el('div', { class: 'dialogo-corpo' }, corpo),
          App.el('footer', {}, acoes)));
      dlg.addEventListener('close', () => { App.voz?.pararTudo(); dlg.remove(); });
      document.body.append(dlg);
      dlg.showModal();
      App.animacao?.dialogo(dlg);
      return dlg;
    },

    // Ícones em SVG (traço), no lugar de emojis. Decorativos: o botão leva aria-label.
    icone(nome) {
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('class', 'ico'); svg.setAttribute('focusable', 'false');
      for (const d of (ICONES[nome] || '').split('|')) {
        const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); svg.append(p);
      }
      return svg;
    },

    // Gráfico de linha em SVG. pontos: [{ rotulo, valor }]. Acessível: descrição em aria-label.
    grafico(pontos, { descricao = '', unidade = '', min, max, meta } = {}) {
      const NS = 'http://www.w3.org/2000/svg';
      const L = 600, A = 200, M = { e: 44, d: 12, t: 12, b: 26 };
      const vals = pontos.map(p => p.valor);
      let lo = min ?? Math.min(...vals, meta ?? Infinity); let hi = max ?? Math.max(...vals, meta ?? -Infinity);
      if (lo === hi) { lo -= 1; hi += 1; }
      const folga = (hi - lo) * 0.08; if (min == null) lo -= folga; if (max == null) hi += folga;
      const x = i => M.e + (pontos.length < 2 ? (L - M.e - M.d) / 2 : (i * (L - M.e - M.d)) / (pontos.length - 1));
      const y = v => M.t + (1 - (v - lo) / (hi - lo)) * (A - M.t - M.b);
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', `0 0 ${L} ${A}`); svg.setAttribute('class', 'grafico');
      svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', descricao);
      const no = (tag, at, texto) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(at)) n.setAttribute(k, v); if (texto != null) n.textContent = texto; svg.append(n); return n; };
      const fmt = v => (Math.abs(hi - lo) < 10 ? v.toFixed(1) : Math.round(v)) + unidade;
      for (const v of [lo, (lo + hi) / 2, hi]) {
        no('line', { x1: M.e, x2: L - M.d, y1: y(v), y2: y(v), class: 'grafico-grade' });
        no('text', { x: M.e - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'grafico-texto' }, fmt(v));
      }
      if (meta != null) no('line', { x1: M.e, x2: L - M.d, y1: y(meta), y2: y(meta), class: 'grafico-meta' });
      if (pontos.length > 1) no('polyline', { points: pontos.map((p, i) => `${x(i)},${y(p.valor)}`).join(' '), class: 'grafico-linha' });
      pontos.forEach((p, i) => no('circle', { cx: x(i), cy: y(p.valor), r: 3.5, class: 'grafico-ponto' }).append(Object.assign(document.createElementNS(NS, 'title'), { textContent: `${p.rotulo}: ${fmt(p.valor)}` })));
      const passo = Math.max(1, Math.ceil(pontos.length / 6));
      pontos.forEach((p, i) => { if (i % passo === 0 || i === pontos.length - 1) no('text', { x: x(i), y: A - 6, 'text-anchor': 'middle', class: 'grafico-texto' }, p.rotulo); });
      return svg;
    },

    confirmar(msg) { return window.confirm(msg); },

    async tentar(fn, msgErro = 'Algo deu errado') {
      try { return await fn(); } catch (e) {
        console.error(e);
        App.toast(`${msgErro}: ${e.message || e}`, 'erro');
        return undefined;
      }
    },
  };

  return App;
})();
