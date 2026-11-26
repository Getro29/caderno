'use strict';
// Captura rápida: anotações soltas em Entrada/, para depois virar tarefa ou nota.
App.entrada = (() => {
  const { el } = App;
  const PASTA = 'Entrada';

  const todas = () => App.store.listar({ pasta: PASTA })
    .sort((a, b) => String(b.meta.criado || b.nome).localeCompare(String(a.meta.criado || a.nome)));

  async function capturar(texto) {
    const t = texto.trim();
    if (!t) return false;
    const agora = App.agoraISO();
    const meta = { tipo: 'entrada', criado: agora, tags: [] };
    const ok = await App.tentar(() => App.store.criar(PASTA, 'captura-' + agora.replace(/[-:T]/g, ''), meta, t), 'Não foi possível guardar');
    if (ok) { App.gamificacao.registrarEvento('captura', ok.caminho); App.toast('Guardado na Entrada.'); }
    return !!ok;
  }

  // Formulário reutilizado no painel e nesta tela.
  function formulario() {
    const texto = el('textarea', { rows: 3, placeholder: 'O que você precisa lembrar? Digite ou dite…' });
    const enviar = async () => { if (await capturar(texto.value)) { texto.value = ''; texto.focus(); } };
    texto.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviar(); } });
    return el('div', { class: 'captura' },
      App.campo('Captura rápida', texto, { largo: true }),
      el('div', { class: 'acoes' },
        el('span', { class: 'dica', text: 'Ctrl+Enter para guardar' }),
        el('button', { type: 'button', text: 'Guardar', onclick: enviar })));
  }

  const primeiraLinha = d => String(d.corpo || '').trim().split('\n')[0].replace(/^#+\s*/, '').slice(0, 100);
  const descartar = d => App.tentar(() => App.store.moverParaLixeira(d.caminho), 'Não foi possível arquivar');

  function item(d) {
    return el('li', { class: 'captura-item' },
      el('div', {},
        el('p', { class: 'captura-texto', text: d.corpo.trim() }),
        el('span', { class: 'dica', text: App.fmtData(d.meta.criado) })),
      el('div', { class: 'acoes' },
        el('button', { type: 'button', class: 'secundario', text: '→ Tarefa',
          onclick: () => App.tarefas.editar(null, { titulo: primeiraLinha(d), corpo: d.corpo.trim() }, () => descartar(d)) }),
        el('button', { type: 'button', class: 'secundario', text: '→ Nota',
          onclick: () => App.notas.editar(null, { titulo: primeiraLinha(d), corpo: d.corpo.trim() }, () => descartar(d)) }),
        el('button', { type: 'button', class: 'icone', 'aria-label': 'Descartar', title: 'Descartar (vai para .lixeira/)', text: '🗑',
          onclick: () => { if (App.confirmar('Mover esta captura para a lixeira?')) descartar(d); } })));
  }

  function render(container) {
    const docs = todas();
    container.replaceChildren(
      el('header', { class: 'cabecalho-tela' }, el('h1', { text: 'Entrada' })),
      el('p', { class: 'resumo', text: 'Jogue aqui o que vier à cabeça. Depois transforme em tarefa ou nota.' }),
      formulario(),
      docs.length ? el('ul', { class: 'lista-capturas' }, docs.map(item)) : el('p', { class: 'vazio', text: 'Entrada vazia. 🎉' }));
  }

  return { render, formulario, todas };
})();
