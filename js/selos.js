'use strict';
// Selos: conquistas calculadas na hora a partir dos arquivos (nada de progresso é gravado).
// Grupos: desafios vencidos, livros lidos, filmes/séries/animes vistos, dias seguidos de cada
// hábito, estudo sem pausar o temporizador e alguns gerais. Página em #/perfil/selos.
// O usuário escolhe até 6 selos ganhos para o destaque do Perfil (campo selos_destaque de
// Caderno/perfil.md, lista de ids). Selos não dão XP.
App.selos = (() => {
  const { el } = App;
  const MAX_DESTAQUE = 6;
  const LIVROS = [[1, 'Primeiro livro'], [5, 'Leitor'], [10, 'Rato de biblioteca'], [25, 'Devorador de livros'], [50, 'Bibliotecário'], [100, 'Lenda das letras']];
  const FILMES = [[1, 'Primeira sessão'], [10, 'Pipoca'], [25, 'Cinéfilo'], [50, 'Crítico de cinema'], [100, 'Diretor'], [250, 'Lenda do cinema']];
  const SERIES = [[1, 'Primeira série'], [5, 'Maratonista'], [10, 'Viciado em séries'], [25, 'Mestre das séries'], [50, 'Lenda do streaming']];
  const ANIMES = [[1, 'Primeiro anime'], [5, 'Otaku'], [10, 'Senpai'], [25, 'Sensei'], [50, 'Lenda do anime']];
  const DIAS = [3, 7, 15, 30, 60, 100, 180, 365];
  const MINUTOS = [20, 40, 60, 80, 100, 120, 140, 160, 180];
  const NIVEIS = [5, 10, 25, 50];

  const iconeHabito = nome => {
    const s = App.slug(nome);
    if (/leitur|ler|livro/.test(s)) return 'livro';
    if (/dieta|alimenta|comer/.test(s)) return 'folha';
    if (/exerc|treino|academia|corrida|caminhad|muscula|esporte|pedal|natac|yoga/.test(s)) return 'haltere';
    if (/social|amig|familia/.test(s)) return 'pessoa';
    return 'check';
  };

  // ---------------- números ----------------
  const diarios = () => App.store.listar({ pasta: 'Diario', tipo: 'diario' });
  // Maior sequência de dias seguidos (de todos os tempos) com o hábito marcado.
  function maiorSequencia(nome) {
    const dias = [...new Set(diarios().map(d => String(d.meta.data || d.nome)).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && App.diario.fez(d, nome)))].sort();
    let melhor = 0; let atual = 0; let anterior = null;
    for (const d of dias) {
      atual = anterior && App.somarDias(anterior, 1) === d ? atual + 1 : 1;
      melhor = Math.max(melhor, atual); anterior = d;
    }
    return melhor;
  }
  const maiorEstudo = () => diarios().reduce((m, d) => Math.max(m, Number(d.meta.estudo_sem_parar_min) || 0), 0);

  // ---------------- catálogo ----------------
  const faixa = (prefixo, lista, atual, icone, desc) => lista.map(([meta, nome]) => ({ id: `${prefixo}-${meta}`, nome, desc: desc(meta), icone, meta, atual, ok: atual >= meta }));

  function grupos() {
    const lidos = App.livros.todos().filter(d => d.meta.status === 'lido').length;
    const vistos = cat => App.entretenimento.todos().filter(d => d.meta.status === 'visto' && (d.meta.categoria || 'filme') === cat).length;
    const p = App.gamificacao.progresso();
    const agora = new Date();
    const social = App.diario.resumoMes(agora.getFullYear(), agora.getMonth()).socialDias;
    const vencidos = App.desafios?.vencidos() || [];
    const estudo = maiorEstudo();

    const desafios = vencidos.length
      ? vencidos.map(doc => ({ id: `desafio-${doc.meta.codigo || App.slug(doc.nome)}`, nome: doc.meta.titulo || doc.nome, desc: 'venceu este desafio', icone: 'trofeu', meta: 1, atual: 1, ok: true, desafio: true }))
      : [{ id: 'desafio-primeiro', nome: 'Campeão', desc: 'vença um desafio com amigos', icone: 'trofeu', meta: 1, atual: 0, ok: false, desafio: true }];

    return [
      { id: 'desafios', titulo: 'Desafios vencidos', dica: 'Cada desafio vencido vira um selo com o nome dele.', selos: desafios },
      { id: 'livros', titulo: 'Livros lidos', selos: faixa('livros', LIVROS, lidos, 'livro', n => `ler ${n} livro${n > 1 ? 's' : ''}`) },
      { id: 'filmes', titulo: 'Filmes vistos', selos: faixa('filmes', FILMES, vistos('filme'), 'tela', n => `ver ${n} filme${n > 1 ? 's' : ''}`) },
      { id: 'series', titulo: 'Séries vistas', selos: faixa('series', SERIES, vistos('serie'), 'play', n => `terminar ${n} série${n > 1 ? 's' : ''}`) },
      { id: 'animes', titulo: 'Animes vistos', selos: faixa('animes', ANIMES, vistos('anime'), 'estrela', n => `terminar ${n} anime${n > 1 ? 's' : ''}`) },
      ...App.diario.habitos().map(h => {
        const k = App.diario.chave(h); const seq = maiorSequencia(h);
        return { id: `seq-${k}`, titulo: `${h}: dias seguidos`, selos: DIAS.map(n => ({ id: `seq-${k}-${n}`, nome: `${h}: ${n} dias`, desc: `${n} dias seguidos marcando ${h}`, icone: iconeHabito(h), meta: n, atual: seq, ok: seq >= n })) };
      }),
      { id: 'estudo', titulo: 'Estudo sem parar', dica: 'Conta o maior trecho do temporizador de Estudo sem apertar Pausar.',
        selos: MINUTOS.map(n => ({ id: `estudo-${n}`, nome: `${n} min sem parar`, desc: `estudar ${n} minutos sem pausar o temporizador`, icone: 'relogio', meta: n, atual: estudo, ok: estudo >= n })) },
      { id: 'gerais', titulo: 'Gerais', selos: [
        { id: 'primeiro-passo', nome: 'Primeiro passo', desc: 'fazer o primeiro check-in', icone: 'check', meta: 1, atual: p.diasAtivos, ok: p.diasAtivos >= 1 },
        ...NIVEIS.map(n => ({ id: `nivel-${n}`, nome: `Nível ${n}`, desc: `chegar ao nível ${n}`, icone: 'raio', meta: n, atual: p.nivel, ok: p.nivel >= n })),
        { id: 'enturmado', nome: 'Enturmado', desc: '8 dias socializando no mesmo mês', icone: 'pessoa', meta: 8, atual: social, ok: social >= 8 },
      ] },
    ];
  }
  const todos = () => grupos().flatMap(g => g.selos);
  const ganhos = () => todos().filter(s => s.ok);

  // ---------------- destaque do Perfil ----------------
  const escolhidos = () => App.lista(App.store.obter('Caderno/perfil.md')?.meta?.selos_destaque).map(String);
  // Selos escolhidos que ainda estão ganhos; sem escolha, os últimos ganhos de cada tipo.
  function destaque() {
    const ok = new Map(ganhos().map(s => [s.id, s]));
    const lista = escolhidos().map(id => ok.get(id)).filter(Boolean);
    if (lista.length || escolhidos().length) return { selos: lista.slice(0, MAX_DESTAQUE), automatico: false };
    const porGrupo = grupos().map(g => g.selos.filter(s => s.ok).pop()).filter(Boolean);
    return { selos: porGrupo.slice(0, MAX_DESTAQUE), automatico: true };
  }

  function escolherDestaque() {
    const lista = ganhos();
    const atuais = new Set(destaque().selos.map(s => s.id));
    const caixas = lista.map(s => ({ s, caixa: el('input', { type: 'checkbox', value: s.id, checked: atuais.has(s.id) }) }));
    const contador = el('p', { class: 'dica', 'aria-live': 'polite' });
    const atualizar = () => {
      const n = caixas.filter(c => c.caixa.checked).length;
      contador.textContent = `${n} de ${MAX_DESTAQUE} escolhidos.`;
      for (const c of caixas) c.caixa.disabled = !c.caixa.checked && n >= MAX_DESTAQUE;
    };
    caixas.forEach(c => c.caixa.addEventListener('change', atualizar));
    const salvar = async () => {
      const ids = caixas.filter(c => c.caixa.checked).map(c => c.s.id);
      const ok = await App.tentar(async () => { await App.perfil.salvar({ selos_destaque: ids }); return true; }, 'Não foi possível salvar os destaques');
      if (ok) { dlg.close(); App.toast('Destaques salvos.'); }
    };
    const dlg = App.dialogo('Selos em destaque', lista.length
      ? el('fieldset', { class: 'escolha-selos' }, el('legend', { text: `Escolha até ${MAX_DESTAQUE} selos para o seu perfil` }),
        el('div', { class: 'escolha-selos-grade' }, caixas.map(({ s, caixa }) => el('label', { class: 'escolha-selo' }, caixa, emblema(s, 'pequeno'), el('span', { text: s.nome })))),
        contador)
      : el('p', { class: 'vazio', text: 'Você ainda não ganhou nenhum selo. Veja em "Todos os selos" como ganhar.' }), [
      el('span', { class: 'espaco' }),
      el('button', { type: 'button', class: 'secundario', text: 'Cancelar', onclick: () => dlg.close() }),
      lista.length ? el('button', { type: 'button', text: 'Salvar', onclick: salvar }) : null,
    ]);
    atualizar();
  }

  // ---------------- desenho ----------------
  function emblema(s, tamanho = '') {
    return el('span', { class: `selo-emblema ${tamanho}${s.ok ? ' ganho' : ''}${s.desafio ? ' desafio' : ''}`, 'aria-hidden': 'true' },
      el('span', { class: 'selo-emblema-miolo' }, App.icone(s.icone)));
  }

  function cartao(s) {
    const pct = Math.max(0, Math.min(100, Math.round((Math.min(s.atual, s.meta) / s.meta) * 100)));
    return el('li', { class: 'selo-item' + (s.ok ? ' ganho' : '') },
      emblema(s),
      el('span', { class: 'selo-item-texto' },
        el('strong', { text: s.nome }),
        el('span', { class: 'sr', text: s.ok ? ' (conquistado)' : ' (ainda não)' }),
        el('span', { class: 'dica', text: s.desc }),
        s.ok ? el('span', { class: 'selo-ok', text: 'Conquistado' })
          : el('span', { class: 'selo-progresso' },
            el('span', { class: 'selo-progresso-barra', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(s.meta), 'aria-valuenow': String(Math.min(s.atual, s.meta)), 'aria-label': `Progresso de ${s.nome}` },
              el('span', { style: `width:${pct}%` })),
            el('span', { class: 'dica', text: `${Math.min(s.atual, s.meta)}/${s.meta}` }))));
  }

  // Faixa de destaque usada no Perfil.
  function vitrine() {
    const { selos, automatico } = destaque();
    return el('div', { class: 'selos-destaque' },
      selos.length ? el('ul', { class: 'selos-destaque-lista' }, selos.map(s => el('li', { title: `${s.nome}: ${s.desc}` }, emblema(s, 'grande'),
        el('strong', { text: s.nome }), el('span', { class: 'dica', text: s.desc }))))
        : el('p', { class: 'vazio', text: 'Nenhum selo ganho ainda. Veja como ganhar em "Todos os selos".' }),
      automatico && selos.length ? el('p', { class: 'dica', text: 'Mostrando os selos mais recentes. Clique em "Escolher destaques" para decidir quais aparecem.' }) : null);
  }

  function render(container) {
    const gs = grupos();
    const total = gs.reduce((a, g) => a + g.selos.length, 0);
    const feitos = gs.reduce((a, g) => a + g.selos.filter(s => s.ok).length, 0);
    container.replaceChildren(
      el('header', { class: 'cabecalho-tela' },
        el('div', {}, el('a', { class: 'voltar', href: '#/perfil' }, App.icone('esquerda'), ' Perfil'),
          el('h1', { text: 'Selos' }),
          el('p', { class: 'resumo', text: `${feitos} de ${total} conquistados. Selos não dão XP: são troféus da sua estante.` })),
        el('div', { class: 'acoes' }, el('button', { type: 'button', onclick: escolherDestaque }, App.icone('estrela'), ' Escolher destaques'))),
      ...gs.map(g => el('section', { class: 'caixa grupo-selos', 'aria-labelledby': 'selos-' + g.id },
        el('div', { class: 'caixa-cabecalho' }, el('h2', { id: 'selos-' + g.id, text: g.titulo }),
          el('span', { class: 'selo', text: `${g.selos.filter(s => s.ok).length}/${g.selos.length}` })),
        g.dica ? el('p', { class: 'dica', text: g.dica }) : null,
        el('ul', { class: 'selos-grade' }, g.selos.map(cartao)))));
  }

  return { grupos, todos, ganhos, destaque, escolherDestaque, vitrine, emblema, render, maiorSequencia, MAX_DESTAQUE };
})();
