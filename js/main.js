'use strict';
// Inicialização, tela de boas-vindas e roteamento por hash.
(() => {
  const { el } = App;
  // titulo: nome completo (aba do navegador); curto: o que aparece no cabeçalho.
  const ROTAS = {
    inicio: { titulo: 'Início', curto: 'Início', icone: 'casa', modulo: () => App.painel },
    tarefas: { titulo: 'Tarefas', curto: 'Tarefas', icone: 'tarefas', modulo: () => App.tarefas },
    calendario: { titulo: 'Calendário', curto: 'Agenda', icone: 'agenda', modulo: () => App.calendario },
    estudo: { titulo: 'Estudo', curto: 'Estudo', icone: 'estudo', modulo: () => App.estudo },
    notas: { titulo: 'Notas', curto: 'Notas', icone: 'notas', modulo: () => App.notas },
    habitos: { titulo: 'Hábitos', curto: 'Hábitos', icone: 'alvo', modulo: () => App.habitos },
    dieta: { titulo: 'Dieta', curto: 'Dieta', icone: 'folha', modulo: () => App.dieta },
    financas: { titulo: 'Finanças', curto: 'Finanças', icone: 'carteira', modulo: () => App.financeiro },
    leitura: { titulo: 'Leitura', curto: 'Livros', icone: 'livro', modulo: () => App.livros },
    entretenimento: { titulo: 'Entretenimento', curto: 'Filmes', icone: 'tela', modulo: () => App.entretenimento },
    arte: { titulo: 'Arte', curto: 'Arte', icone: 'paleta', modulo: () => App.arte },
  };
  const APELIDOS = { livros: 'leitura', entrada: 'tarefas', financeiro: 'financas' }; // endereços antigos continuam funcionando
  const principal = document.getElementById('principal');
  const nav = document.getElementById('nav');
  const infoPasta = document.getElementById('info-pasta');

  const rotaAtual = () => { const h = location.hash.replace(/^#\/?/, ''); const r = APELIDOS[h] || h; return ROTAS[r] ? r : 'inicio'; };

  function desenharNav() {
    const atual = rotaAtual();
    nav.replaceChildren(...Object.entries(ROTAS).map(([id, r]) => el('a', {
      href: '#/' + id, 'aria-current': id === atual ? 'page' : null, title: r.titulo,
    }, App.icone(r.icone), el('span', { text: r.curto }))));
  }

  function renderizar() {
    desenharNav();
    if (!App.store.conectado()) return;
    const r = ROTAS[rotaAtual()];
    document.title = `${r.titulo} · Bit-life`;
    r.modulo().render(principal);
    App.notificacoes.desenhar();
    App.gamificacao.desenharSelo();
  }

  async function escolher() {
    try { await App.store.escolherPasta(); App.toast('Pasta conectada.'); }
    catch (e) { if (e.name !== 'AbortError') App.toast('Não foi possível abrir a pasta: ' + e.message, 'erro'); }
  }

  App.escolherPasta = escolher;

  async function boasVindas() {
    if (!App.store.suportado()) {
      principal.replaceChildren(el('section', { class: 'boas-vindas' },
        el('h1', { text: 'Navegador não suportado' }),
        el('p', { text: 'O Bit-life grava seus arquivos direto numa pasta do computador, e isso só funciona no Google Chrome ou no Microsoft Edge (no computador).' }),
        el('p', { text: 'Abra este endereço num desses navegadores para continuar.' })));
      return;
    }
    const salva = await App.store.pastaSalva();
    principal.replaceChildren(el('section', { class: 'boas-vindas' },
      el('h1', { text: 'Bem-vindo ao Bit-life' }),
      el('p', { text: 'Suas tarefas, estudos, hábitos, dieta, finanças, notas, leituras, filmes, eventos e referências de arte ficam como arquivos .md numa pasta do seu computador — nada vai para a internet. Pode ser o seu vault do Obsidian.' }),
      el('p', { text: 'A pasta é onde o Bit-life salva o que você digita aqui. Sugestão: crie uma pasta vazia, por exemplo Documentos/Bit-life, e escolha ela.' }),
      el('div', { class: 'acoes' },
        salva ? el('button', { type: 'button', text: `Reabrir “${salva.name}”`, onclick: async () => {
          if (!(await App.tentar(() => App.store.reconectar(true), 'Não foi possível reabrir'))) App.toast('Permissão não concedida.', 'erro');
        } }) : null,
        el('button', { type: 'button', class: salva ? 'secundario' : '', text: salva ? 'Escolher outra pasta' : 'Escolher pasta', onclick: escolher })),
      el('p', { class: 'dica', text: 'O navegador vai pedir permissão para ler e editar a pasta. Serão criadas subpastas (Tarefas, Notas, Diario, Dieta, Financeiro, Estudo, Livros, Calendario, Arte…) conforme você usar.' })));
  }

  App.on('dados', info => {
    if (App.emLote) return; // importações em lote redesenham uma vez só, no fim
    if (info?.inline) return; // a própria tela já se atualizou
    // Não redesenha a tela por baixo de um diálogo aberto com edição em andamento.
    if (document.querySelector('dialog[open]')) { App.pendenteRender = true; return; }
    renderizar();
  });
  document.addEventListener('close', () => {
    if (App.pendenteRender && !document.querySelector('dialog[open]')) { App.pendenteRender = false; renderizar(); }
  }, true);
  window.addEventListener('hashchange', () => { renderizar(); principal.focus(); });

  infoPasta.replaceChildren(el('button', { type: 'button', class: 'icone', title: 'Preferências', 'aria-label': 'Preferências (tema, voz e pasta)',
    onclick: () => App.preferencias.abrir() }, App.icone('ajustes')));

  (async () => {
    desenharNav();
    // Tenta reconectar sem pedir nada; se o navegador exigir clique, mostra a tela de boas-vindas.
    const ok = App.store.suportado() && await App.store.reconectar(false).catch(() => false);
    if (!ok) boasVindas();
  })();
})();
