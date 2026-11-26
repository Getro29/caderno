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
      for (const f of filhos.flat()) {
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
      setTimeout(() => t.remove(), tipo === 'erro' ? 7000 : 3500);
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
