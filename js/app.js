'use strict';
// Núcleo: cria window.App e utilitários compartilhados por todos os módulos.
window.App = (() => {
  const ouvintes = {};

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
            App.el('button', { type: 'button', class: 'icone', 'aria-label': 'Fechar', text: '✕', onclick: () => dlg.close() })),
          App.el('div', { class: 'dialogo-corpo' }, corpo),
          App.el('footer', {}, acoes)));
      dlg.addEventListener('close', () => { App.voz?.pararTudo(); dlg.remove(); });
      document.body.append(dlg);
      dlg.showModal();
      return dlg;
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
