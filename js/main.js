'use strict';
// Inicialização, tela de boas-vindas e roteamento por hash.
(() => {
  const { el } = App;
  const ROTAS = {
    inicio: { titulo: 'Início', modulo: () => App.painel },
    entrada: { titulo: 'Entrada', modulo: () => App.entrada },
    tarefas: { titulo: 'Tarefas', modulo: () => App.tarefas },
    calendario: { titulo: 'Calendário', modulo: () => App.calendario },
    notas: { titulo: 'Notas', modulo: () => App.notas },
    leitura: { titulo: 'Leitura', modulo: () => App.livros },
    entretenimento: { titulo: 'Entretenimento', modulo: () => App.entretenimento },
    arte: { titulo: 'Arte', modulo: () => App.arte },
  };
  const APELIDOS = { livros: 'leitura' }; // endereços antigos continuam funcionando
  const principal = document.getElementById('principal');
  const nav = document.getElementById('nav');
  const infoPasta = document.getElementById('info-pasta');

  const rotaAtual = () => { const h = location.hash.replace(/^#\/?/, ''); const r = APELIDOS[h] || h; return ROTAS[r] ? r : 'inicio'; };

  function desenharNav() {
    const atual = rotaAtual();
    nav.replaceChildren(...Object.entries(ROTAS).map(([id, r]) => el('a', {
      href: '#/' + id, 'aria-current': id === atual ? 'page' : null,
      text: r.titulo,
    })));
  }

  function renderizar() {
    desenharNav();
    if (!App.store.conectado()) return;
    const r = ROTAS[rotaAtual()];
    document.title = `${r.titulo} · Caderno`;
    r.modulo().render(principal);
    infoPasta.replaceChildren(
      el('span', { title: 'Pasta conectada', text: 'Pasta: ' + App.store.nomePasta() }),
      el('button', { type: 'button', class: 'icone', title: 'Recarregar arquivos do disco', 'aria-label': 'Recarregar arquivos do disco',
        onclick: () => App.tentar(() => App.store.carregarTudo(), 'Não foi possível recarregar') }, App.icone('recarregar')),
      el('button', { type: 'button', class: 'secundario pequeno', text: 'Trocar pasta', onclick: escolher }));
  }

  async function escolher() {
    try { await App.store.escolherPasta(); App.toast('Pasta conectada.'); }
    catch (e) { if (e.name !== 'AbortError') App.toast('Não foi possível abrir a pasta: ' + e.message, 'erro'); }
  }

  async function boasVindas() {
    infoPasta.replaceChildren();
    if (!App.store.suportado()) {
      principal.replaceChildren(el('section', { class: 'boas-vindas' },
        el('h1', { text: 'Navegador não suportado' }),
        el('p', { text: 'O Caderno grava seus arquivos direto numa pasta do computador, e isso só funciona no Google Chrome ou no Microsoft Edge (no computador).' }),
        el('p', { text: 'Abra este endereço num desses navegadores para continuar.' })));
      return;
    }
    const salva = await App.store.pastaSalva();
    principal.replaceChildren(el('section', { class: 'boas-vindas' },
      el('h1', { text: 'Bem-vindo ao Caderno' }),
      el('p', { text: 'Suas tarefas, notas, leituras, filmes, eventos e referências de arte ficam como arquivos .md numa pasta do seu computador — nada vai para a internet. Pode ser o seu vault do Obsidian.' }),
      el('div', { class: 'acoes' },
        salva ? el('button', { type: 'button', text: `Reabrir “${salva.name}”`, onclick: async () => {
          if (!(await App.tentar(() => App.store.reconectar(true), 'Não foi possível reabrir'))) App.toast('Permissão não concedida.', 'erro');
        } }) : null,
        el('button', { type: 'button', class: salva ? 'secundario' : '', text: salva ? 'Escolher outra pasta' : 'Escolher pasta', onclick: escolher })),
      el('p', { class: 'dica', text: 'O navegador vai pedir permissão para ler e editar a pasta. Serão criadas subpastas (Tarefas, Notas, Livros, Entretenimento, Calendario, Arte…) conforme você usar.' })));
  }

  App.on('dados', () => {
    if (App.emLote) return; // importações em lote redesenham uma vez só, no fim
    // Não redesenha a tela por baixo de um diálogo aberto com edição em andamento.
    if (document.querySelector('dialog[open]')) { App.pendenteRender = true; return; }
    renderizar();
  });
  document.addEventListener('close', () => {
    if (App.pendenteRender && !document.querySelector('dialog[open]')) { App.pendenteRender = false; renderizar(); }
  }, true);
  window.addEventListener('hashchange', () => { renderizar(); principal.focus(); });

  (async () => {
    desenharNav();
    // Tenta reconectar sem pedir nada; se o navegador exigir clique, mostra a tela de boas-vindas.
    const ok = App.store.suportado() && await App.store.reconectar(false).catch(() => false);
    if (!ok) boasVindas();
  })();
})();
