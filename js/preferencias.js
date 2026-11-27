'use strict';
// Preferências de interface (tema e voz de leitura) e informações da pasta conectada.
// Ficam no IndexedDB do navegador, nunca na pasta do usuário.
App.preferencias = (() => {
  const { el } = App;
  const raiz = document.documentElement;

  function aplicarTema(tema) {
    if (tema === 'claro') raiz.dataset.theme = 'light';
    else if (tema === 'escuro') raiz.dataset.theme = 'dark';
    else delete raiz.dataset.theme;
  }
  App.store.preferencia('tema').then(aplicarTema);

  function secaoTema(atual) {
    const opcoes = [['auto', 'Automático'], ['claro', 'Claro'], ['escuro', 'Escuro']];
    const grupo = el('div', { class: 'alternador', role: 'group', 'aria-label': 'Tema' });
    const desenhar = escolhido => grupo.replaceChildren(...opcoes.map(([v, r]) => el('button', {
      type: 'button', 'aria-pressed': String(escolhido === v), text: r,
      onclick: async () => { aplicarTema(v); desenhar(v); await App.store.preferencia('tema', v); },
    })));
    desenhar(atual || 'auto');
    return el('section', { class: 'pref-secao' }, el('h3', { text: 'Tema' }), grupo);
  }

  function secaoVoz() {
    if (!App.voz.temLeitura) return el('section', { class: 'pref-secao' }, el('h3', { text: 'Voz de leitura' }),
      el('p', { class: 'dica', text: 'Este navegador não tem leitura em voz alta.' }));
    const p = App.voz.prefs();
    const vozes = App.voz.vozesBR();
    const atual = App.voz.vozAtual();
    const escolha = el('select', {},
      el('option', { value: '', text: 'Automática (masculina, se houver)', selected: !p.voz }),
      vozes.map(v => el('option', { value: v.voiceURI, selected: p.voz === v.voiceURI, text: `${v.name}${App.voz.ehMasculina(v) ? ' · masculina' : ''}` })));
    const velocidade = el('input', { type: 'range', min: 0.6, max: 1.4, step: 0.05, value: p.velocidade });
    const tom = el('input', { type: 'range', min: 0.5, max: 1.5, step: 0.05, value: p.tom });
    const salvar = () => App.voz.configurar({ voz: escolha.value, velocidade: Number(velocidade.value), tom: Number(tom.value) });
    for (const c of [escolha, velocidade, tom]) c.addEventListener('change', salvar);
    const semMasculina = !vozes.some(App.voz.ehMasculina);
    return el('section', { class: 'pref-secao' },
      el('h3', { text: 'Voz de leitura' }),
      App.campo('Voz', escolha, { voz: false }),
      el('div', { class: 'grade-form' },
        App.campo('Velocidade', velocidade, { voz: false }),
        App.campo('Tom (mais baixo = mais grave)', tom, { voz: false })),
      el('div', { class: 'acoes' },
        el('button', { type: 'button', class: 'secundario', text: 'Testar voz', onclick: async () => {
          await salvar(); App.voz.ler('Boa noite. Este é o Bit-life, com o resumo do seu dia.');
        } }),
        el('button', { type: 'button', class: 'secundario', text: 'Voltar ao padrão', onclick: async () => {
          escolha.value = ''; velocidade.value = App.voz.PADRAO.velocidade; tom.value = App.voz.PADRAO.tom; await salvar();
        } })),
      el('p', { class: 'dica', text: atual ? `Usando agora: ${atual.name}.` : 'Nenhuma voz em português do Brasil instalada.' }),
      semMasculina ? el('p', { class: 'dica', text: 'Não há voz masculina em português neste computador; o tom grave aproxima. No Edge há vozes masculinas naturais (Antonio, Donato, Fabio…).' }) : null);
  }

  function secaoPasta() {
    if (!App.store.conectado()) return null;
    return el('section', { class: 'pref-secao' },
      el('h3', { text: 'Pasta dos seus arquivos' }),
      el('p', { text: App.store.nomePasta() }),
      el('div', { class: 'acoes' },
        el('button', { type: 'button', class: 'secundario', onclick: () => App.tentar(() => App.store.carregarTudo(), 'Não foi possível recarregar') },
          App.icone('recarregar'), ' Recarregar arquivos do disco'),
        el('button', { type: 'button', class: 'secundario', text: 'Trocar pasta', onclick: async () => { dlg?.close(); await App.escolherPasta(); } })));
  }

  let dlg = null;
  async function abrir() {
    const tema = await App.store.preferencia('tema');
    dlg = App.dialogo('Preferências', el('div', { class: 'preferencias' }, secaoTema(tema), secaoVoz(), secaoPasta()),
      [el('span', { class: 'espaco' }), el('button', { type: 'button', text: 'Fechar', onclick: () => dlg.close() })]);
  }

  return { abrir, aplicarTema };
})();
