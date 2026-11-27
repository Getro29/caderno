'use strict';
// Página Dieta: registro do dia (refeições com calorias e macros, água, peso), metas,
// progresso e receitas.
//   Dieta/metas.md                     metas diárias
//   Dieta/Registros/AAAA-MM-DD.md      um dia; totais no frontmatter, refeições numa tabela no corpo
//   Dieta/Receitas/<slug>.md           receitas; ingredientes e preparo no corpo
App.dieta = (() => {
  const { el } = App;
  const METAS = 'Dieta/metas.md';
  const REG = 'Dieta/Registros';
  const REC = 'Dieta/Receitas';
  const REFEICOES = ['Café da manhã', 'Almoço', 'Lanche', 'Jantar', 'Ceia', 'Outro'];
  const MACROS = [
    ['calorias', 'Calorias', 'kcal'], ['proteina_g', 'Proteína', 'g'],
    ['carboidrato_g', 'Carboidrato', 'g'], ['gordura_g', 'Gordura', 'g'],
  ];
  const CABECALHO = '| Refeição | Alimento | kcal | Proteína (g) | Carboidrato (g) | Gordura (g) |';
  const estado = { aba: 'hoje', data: App.hoje(), busca: '' };

  const num = v => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
  const arred = v => Math.round(v * 10) / 10;
  const metas = () => App.store.obter(METAS)?.meta || {};
  const caminhoDia = data => `${REG}/${data}.md`;
  const receitas = () => App.store.listar({ pasta: REC, tipo: 'receita' }).sort((a, b) => titulo(a).localeCompare(titulo(b), 'pt-BR'));
  const titulo = d => d.meta.titulo || d.nome;
  const salvarErro = p => App.tentar(() => p, 'Não foi possível salvar');

  // ---- registro do dia ----
  function lerDia(data, doc = App.store.obter(caminhoDia(data))) {
    const itens = []; const outras = [];
    for (const l of String(doc?.corpo || '').split('\n')) {
      const t = l.trim();
      if (t.startsWith('|') && !/^\|\s*-/.test(t) && !/^\|\s*Refeição\s*\|/i.test(t)) {
        const c = t.replace(/^\||\|$/g, '').split('|').map(x => x.trim());
        if (c.length >= 6) { itens.push({ refeicao: c[0], alimento: c[1], calorias: num(c[2]) || 0, proteina_g: num(c[3]) || 0, carboidrato_g: num(c[4]) || 0, gordura_g: num(c[5]) || 0 }); continue; }
      }
      if (/^\|/.test(t) || /^## Refeições\s*$/.test(t)) continue; // cabeçalho da tabela, refeito ao gravar
      outras.push(l);
    }
    return { doc, itens, outras };
  }
  const totais = itens => Object.fromEntries(MACROS.map(([k]) => [k, arred(itens.reduce((a, i) => a + (Number(i[k]) || 0), 0))]));

  // fn({ itens, outras, meta }) devolve { itens, extra }; roda sobre a versão mais recente do arquivo.
  function alterarDia(data, fn) {
    return App.store.alterar(caminhoDia(data), doc => {
      const { itens, outras } = lerDia(data, doc);
      const r = fn({ itens, outras, meta: doc?.meta || {} });
      return montarDia(data, doc, r.itens ?? itens, outras, r.extra || {});
    }, { inline: true });
  }
  function montarDia(data, doc, itens, outras, extra) {
    const limpo = s => String(s ?? '').replace(/\|/g, '/').trim();
    const tabela = itens.length ? ['## Refeições', '', CABECALHO, '|---|---|---|---|---|---|',
      ...itens.map(i => `| ${limpo(i.refeicao)} | ${limpo(i.alimento)} | ${arred(i.calorias)} | ${arred(i.proteina_g)} | ${arred(i.carboidrato_g)} | ${arred(i.gordura_g)} |`)].join('\n') : '';
    const corpo = [tabela, outras.join('\n').trim()].filter(Boolean).join('\n\n');
    const meta = { tipo: 'dieta_dia', data, peso_kg: null, agua_ml: null, ...(doc?.meta || {}), ...totais(itens), ...extra };
    return { meta, corpo };
  }

  async function adicionarItem(data, item) {
    const r = await salvarErro(alterarDia(data, ({ itens }) => ({ itens: [...itens, item] })));
    if (r) App.gamificacao.registrarEvento('refeicao_registrada', r.caminho);
    return r;
  }

  // ---- telas ----
  function barraMeta(rotulo, valor, meta, unidade) {
    const pct = meta ? Math.round((valor / meta) * 100) : null;
    return el('div', { class: 'meta-macro' + (pct > 110 ? ' passou' : '') },
      el('div', { class: 'linha-stat' }, el('strong', { text: rotulo }),
        el('span', { class: 'dica', text: meta ? `${valor} de ${meta} ${unidade} (${pct}%)` : `${valor} ${unidade} · sem meta` })),
      el('div', { class: 'barra-progresso', role: 'img', 'aria-label': `${rotulo}: ${meta ? pct + '% da meta' : valor + ' ' + unidade}` },
        el('span', { style: `width:${Math.min(100, pct ?? 0)}%` })));
  }

  function formularioItem(data, redesenhar, inicial = {}) {
    const f = {
      refeicao: el('select', {}, REFEICOES.map(r => el('option', { value: r, selected: r === (inicial.refeicao || sugerirRefeicao()), text: r }))),
      alimento: el('input', { type: 'text', value: inicial.alimento || '', placeholder: 'ex.: arroz, feijão e frango' }),
      ...Object.fromEntries(MACROS.map(([k]) => [k, el('input', { type: 'number', min: 0, step: 'any', inputmode: 'decimal', value: inicial[k] ?? '' })])),
    };
    const add = async () => {
      if (!f.alimento.value.trim()) { f.alimento.focus(); App.toast('Escreva o que comeu.', 'erro'); return; }
      const item = { refeicao: f.refeicao.value, alimento: f.alimento.value.trim(), ...Object.fromEntries(MACROS.map(([k]) => [k, num(f[k].value) || 0])) };
      if (await adicionarItem(data, item)) { redesenhar(); }
    };
    return el('div', { class: 'grade-form form-refeicao' },
      App.campo('Refeição', f.refeicao, { voz: false }),
      App.campo('Alimento', f.alimento),
      MACROS.map(([k, r, u]) => App.campo(`${r} (${u})`, f[k], { voz: false })),
      el('div', { class: 'acoes largo' }, el('span', { class: 'espaco' }), el('button', { type: 'button', text: 'Adicionar ao dia', onclick: add })));
  }
  function sugerirRefeicao() {
    const h = new Date().getHours();
    return h < 10 ? 'Café da manhã' : h < 15 ? 'Almoço' : h < 18 ? 'Lanche' : h < 22 ? 'Jantar' : 'Ceia';
  }

  function abaHoje(container) {
    const data = estado.data;
    const { doc, itens } = lerDia(data);
    const m = metas();
    const t = totais(itens);
    const redesenhar = () => render(container);
    const peso = el('input', { type: 'number', min: 0, step: 0.1, inputmode: 'decimal', value: doc?.meta.peso_kg ?? '',
      onchange: async e => { const v = num(e.target.value); await salvarErro(alterarDia(data, () => ({ extra: { peso_kg: v } }))); redesenhar(); } });
    const agua = Number(doc?.meta.agua_ml) || 0;
    const somarAgua = async ml => { await salvarErro(alterarDia(data, ({ meta }) => ({ extra: { agua_ml: Math.max(0, (Number(meta.agua_ml) || 0) + ml) } }))); redesenhar(); };
    const remover = async alvo => {
      await salvarErro(alterarDia(data, ({ itens: atuais }) => {
        const i = atuais.findIndex(x => x.alimento === alvo.alimento && x.refeicao === alvo.refeicao && x.calorias === alvo.calorias);
        return { itens: i < 0 ? atuais : atuais.filter((_, j) => j !== i) };
      }));
      redesenhar();
    };

    const grupos = REFEICOES.map(r => [r, itens.map((it, i) => ({ ...it, i })).filter(it => (REFEICOES.includes(it.refeicao) ? it.refeicao : 'Outro') === r)]).filter(([, l]) => l.length);
    return el('div', { class: 'dieta-hoje' },
      el('div', { class: 'barra' },
        el('button', { type: 'button', class: 'secundario', 'aria-label': 'Dia anterior', onclick: () => { estado.data = App.somarDias(data, -1); redesenhar(); } }, App.icone('esquerda')),
        el('input', { type: 'date', value: data, 'aria-label': 'Dia', onchange: e => { if (e.target.value) { estado.data = e.target.value; redesenhar(); } }, style: 'width:auto' }),
        el('button', { type: 'button', class: 'secundario', 'aria-label': 'Próximo dia', onclick: () => { estado.data = App.somarDias(data, 1); redesenhar(); } }, App.icone('direita')),
        data !== App.hoje() ? el('button', { type: 'button', class: 'secundario', text: 'Hoje', onclick: () => { estado.data = App.hoje(); redesenhar(); } }) : null),
      el('div', { class: 'duas-colunas-largas' },
        el('section', { class: 'caixa', 'aria-labelledby': 'titulo-macros' },
          el('h2', { id: 'titulo-macros', text: 'Calorias e macros' }),
          MACROS.map(([k, r, u]) => barraMeta(r, t[k], num(m[k]), u)),
          barraMeta('Água', agua, num(m.agua_ml), 'ml'),
          el('div', { class: 'acoes' },
            el('span', { class: 'dica', text: 'Água:' }),
            [250, 500].map(ml => el('button', { type: 'button', class: 'secundario pequeno', text: `+${ml} ml`, onclick: () => somarAgua(ml) })),
            el('button', { type: 'button', class: 'secundario pequeno', text: '−250 ml', onclick: () => somarAgua(-250) })),
          !Object.keys(m).some(k => num(m[k])) ? el('p', { class: 'aviso suave', text: 'Defina suas metas na aba Metas para ver o quanto falta.' }) : null),
        el('section', { class: 'caixa', 'aria-labelledby': 'titulo-peso' },
          el('h2', { id: 'titulo-peso', text: 'Peso' }),
          App.campo('Peso neste dia (kg)', peso, { voz: false }),
          resumoPeso())),
      el('section', { class: 'caixa', 'aria-labelledby': 'titulo-add' },
        el('h2', { id: 'titulo-add', text: 'Adicionar alimento' }),
        formularioItem(data, redesenhar),
        receitas().length ? el('p', { class: 'dica', text: 'Também dá para adicionar uma porção de receita pela aba Receitas.' }) : null),
      el('section', { class: 'caixa', 'aria-labelledby': 'titulo-refeicoes' },
        el('h2', { id: 'titulo-refeicoes', text: 'Refeições do dia' }),
        grupos.length ? grupos.map(([r, l]) => el('div', { class: 'grupo' },
          el('h3', { text: `${r} · ${arred(l.reduce((a, x) => a + x.calorias, 0))} kcal` }),
          el('ul', { class: 'lista-simples' }, l.map(it => el('li', {},
            el('span', {}, el('span', { text: it.alimento }), el('span', { class: 'dica', text: ` · P ${it.proteina_g} g · C ${it.carboidrato_g} g · G ${it.gordura_g} g` })),
            el('span', { class: 'acoes' }, el('strong', { text: `${it.calorias} kcal` }),
              el('button', { type: 'button', class: 'icone', 'aria-label': `Remover ${it.alimento}`, onclick: () => remover(it) }, App.icone('lixeira')))))))) :
          el('p', { class: 'vazio', text: 'Nada registrado neste dia.' })));
  }

  // Últimos pesos registrados (dias com peso_kg).
  function historico(dias = 90) {
    const inicio = App.somarDias(App.hoje(), -dias + 1);
    return App.store.listar({ pasta: REG, tipo: 'dieta_dia' }).map(d => d.meta)
      .filter(m => String(m.data) >= inicio && String(m.data) <= App.hoje()).sort((a, b) => String(a.data).localeCompare(String(b.data)));
  }
  function resumoPeso() {
    const pesos = historico(90).filter(m => num(m.peso_kg));
    if (!pesos.length) return el('p', { class: 'vazio', text: 'Registre o peso para acompanhar a evolução.' });
    const ultimo = pesos[pesos.length - 1];
    const ha30 = pesos.find(m => String(m.data) >= App.somarDias(App.hoje(), -30));
    const dif = ha30 && ha30 !== ultimo ? arred(ultimo.peso_kg - ha30.peso_kg) : null;
    const alvo = num(metas().peso_meta_kg);
    return el('div', {},
      el('p', { class: 'numero-grande' }, el('strong', { text: `${ultimo.peso_kg} kg` }), ` em ${App.fmtData(ultimo.data)}`),
      dif != null ? el('p', { class: 'dica', text: `${dif > 0 ? '+' : ''}${dif} kg nos últimos 30 dias.` }) : null,
      alvo ? el('p', { class: 'dica', text: `Meta: ${alvo} kg (faltam ${arred(Math.abs(ultimo.peso_kg - alvo))} kg).` }) : null);
  }

  // Resumo para o briefing do Início.
  function resumoDia(data) {
    const { doc, itens } = lerDia(data);
    if (!doc) return null;
    return { ...totais(itens), agua_ml: Number(doc.meta.agua_ml) || 0, peso_kg: num(doc.meta.peso_kg), refeicoes: itens.length, metas: metas() };
  }
  function pesoAtual() {
    const pesos = historico(365).filter(m => num(m.peso_kg));
    if (!pesos.length) return null;
    const ultimo = pesos[pesos.length - 1];
    const ha7 = pesos.filter(m => String(m.data) <= App.somarDias(ultimo.data, -7)).pop();
    return { peso: ultimo.peso_kg, data: ultimo.data, variacao7: ha7 ? arred(ultimo.peso_kg - ha7.peso_kg) : null };
  }

  function abaProgresso() {
    const dias = historico(90);
    const pesos = dias.filter(m => num(m.peso_kg)).map(m => ({ rotulo: App.fmtData(m.data).slice(0, 5), valor: Number(m.peso_kg) }));
    const comKcal = dias.filter(m => num(m.calorias));
    const ultimos7 = comKcal.filter(m => String(m.data) >= App.somarDias(App.hoje(), -6));
    const media = (l, k) => (l.length ? Math.round(l.reduce((a, m) => a + (Number(m[k]) || 0), 0) / l.length) : null);
    const m = metas();
    const naMeta = num(m.calorias) ? comKcal.filter(d => Math.abs(d.calorias - m.calorias) <= m.calorias * 0.1).length : null;
    return el('div', {},
      el('section', { class: 'caixa' },
        el('h2', { text: 'Peso nos últimos 90 dias' }),
        pesos.length ? App.grafico(pesos, { unidade: ' kg', meta: num(m.peso_meta_kg) ?? undefined,
          descricao: `Peso de ${pesos[0].valor} kg a ${pesos[pesos.length - 1].valor} kg em ${pesos.length} registros.` })
          : el('p', { class: 'vazio', text: 'Ainda não há pesos registrados.' })),
      el('section', { class: 'caixa' },
        el('h2', { text: 'Médias' }),
        el('div', { class: 'numeros-mes' },
          el('p', { class: 'numero-grande' }, el('strong', { text: media(ultimos7, 'calorias') ?? '—' }), ' kcal/dia nos últimos 7 dias'),
          el('p', { class: 'numero-grande' }, el('strong', { text: media(ultimos7, 'proteina_g') ?? '—' }), ' g de proteína/dia'),
          naMeta != null ? el('p', { class: 'numero-grande' }, el('strong', { text: `${naMeta}/${comKcal.length}` }), ' dias perto da meta de calorias (±10%)') : null)),
      comKcal.length ? el('section', { class: 'caixa' },
        el('h2', { text: 'Calorias por dia' }),
        App.grafico(comKcal.slice(-30).map(d => ({ rotulo: App.fmtData(d.data).slice(0, 5), valor: Number(d.calorias) })),
          { unidade: '', meta: num(m.calorias) ?? undefined, min: 0, descricao: `Calorias dos últimos ${Math.min(30, comKcal.length)} dias registrados.` })) : null);
  }

  function abaMetas(container) {
    const m = metas();
    const campos = [...MACROS, ['agua_ml', 'Água', 'ml'], ['peso_meta_kg', 'Peso desejado', 'kg']]
      .map(([k, r, u]) => [k, r, u, el('input', { type: 'number', min: 0, step: 'any', inputmode: 'decimal', value: m[k] ?? '' })]);
    const salvar = async () => {
      const doc = App.store.obter(METAS);
      const meta = { tipo: 'metas_dieta', ...(doc?.meta || {}), ...Object.fromEntries(campos.map(([k, , , i]) => [k, num(i.value)])) };
      if (await salvarErro(App.store.gravar(METAS, meta, doc?.corpo || 'Metas diárias usadas pela página Dieta do Bit-life.\n'))) App.toast('Metas salvas.');
    };
    return el('section', { class: 'caixa' },
      el('h2', { text: 'Metas diárias' }),
      el('div', { class: 'grade-form' }, campos.map(([, r, u, i]) => App.campo(`${r} (${u})`, i, { voz: false }))),
      el('div', { class: 'acoes' }, el('span', { class: 'espaco' }), el('button', { type: 'button', text: 'Salvar metas', onclick: salvar })));
  }

  // ---- receitas ----
  function editarReceita(doc) {
    const m = doc ? doc.meta : {};
    const f = {
      titulo: el('input', { type: 'text', value: m.titulo || '', required: true }),
      porcoes: el('input', { type: 'number', min: 1, value: m.porcoes ?? '' }),
      tempo: el('input', { type: 'number', min: 0, value: m.tempo_min ?? '' }),
      ...Object.fromEntries(MACROS.map(([k]) => [k, el('input', { type: 'number', min: 0, step: 'any', value: m[k] ?? '' })])),
      tags: el('input', { type: 'text', value: App.lista(m.tags).join(', '), placeholder: 'ex.: café da manhã, proteico' }),
      corpo: el('textarea', { rows: 12, class: 'editor-md', value: doc ? doc.corpo : '## Ingredientes\n\n- \n\n## Modo de preparo\n\n1. ' }),
    };
    const salvar = async () => {
      const t = f.titulo.value.trim();
      if (!t) { f.titulo.focus(); App.toast('Dê um nome à receita.', 'erro'); return; }
      const meta = { ...m, tipo: 'receita', titulo: t, porcoes: num(f.porcoes.value), tempo_min: num(f.tempo.value),
        ...Object.fromEntries(MACROS.map(([k]) => [k, num(f[k].value)])), tags: App.tagsDeTexto(f.tags.value), criado: m.criado || App.hoje() };
      const ok = await App.tentar(() => (doc ? App.store.gravar(doc.caminho, meta, f.corpo.value) : App.store.criar(REC, t, meta, f.corpo.value)), 'Não foi possível salvar');
      if (ok) { dlg.close(); App.toast('Receita salva.'); }
    };
    const excluir = async () => {
      if (!App.confirmar(`Mover "${titulo(doc)}" para a lixeira?`)) return;
      if (await App.tentar(() => App.store.moverParaLixeira(doc.caminho).then(() => true), 'Não foi possível excluir')) dlg.close();
    };
    const dlg = App.dialogo(doc ? 'Editar receita' : 'Nova receita', el('div', { class: 'grade-form' },
      App.campo('Nome', f.titulo, { largo: true }),
      App.campo('Rende (porções)', f.porcoes, { voz: false }),
      App.campo('Tempo (min)', f.tempo, { voz: false }),
      el('p', { class: 'dica largo', text: 'Valores nutricionais por porção:' }),
      MACROS.map(([k, r, u]) => App.campo(`${r} (${u})`, f[k], { voz: false })),
      App.campo('Tags', f.tags, { largo: true }),
      App.campo('Ingredientes e preparo (Markdown)', f.corpo, { largo: true })), [
      doc ? el('button', { type: 'button', class: 'perigo', text: 'Excluir', onclick: excluir }) : null,
      el('span', { class: 'espaco' }),
      el('button', { type: 'button', class: 'secundario', text: 'Cancelar', onclick: () => dlg.close() }),
      el('button', { type: 'button', text: 'Salvar', onclick: salvar }),
    ]);
    dlg.classList.add('grande');
    f.titulo.focus();
  }

  function verReceita(doc) {
    const m = doc.meta;
    const porcoes = el('input', { type: 'number', min: 0.25, step: 0.25, value: 1 });
    const refeicao = el('select', {}, REFEICOES.map(r => el('option', { value: r, selected: r === sugerirRefeicao(), text: r })));
    const adicionar = async () => {
      const q = num(porcoes.value) || 1;
      const item = { refeicao: refeicao.value, alimento: `${titulo(doc)}${q !== 1 ? ` (${q} porções)` : ''}`,
        ...Object.fromEntries(MACROS.map(([k]) => [k, arred((num(m[k]) || 0) * q)])) };
      if (await adicionarItem(App.hoje(), item)) { dlg.close(); App.toast('Adicionado às refeições de hoje.'); }
    };
    const dlg = App.dialogo(titulo(doc), el('article', {},
      el('div', { class: 'selos' },
        m.porcoes ? el('span', { class: 'selo', text: `Rende ${m.porcoes} porção(ões)` }) : null,
        m.tempo_min ? el('span', { class: 'selo', text: `${m.tempo_min} min` }) : null,
        MACROS.map(([k, r, u]) => (num(m[k]) != null ? el('span', { class: 'selo info', text: `${r}: ${m[k]} ${u}` }) : null)),
        App.lista(m.tags).map(t => el('span', { class: 'selo tag', text: '#' + t }))),
      App.markdown.render(el('div'), doc.corpo || ''),
      el('div', { class: 'grade-form caixa-suave' },
        App.campo('Porções comidas', porcoes, { voz: false }), App.campo('Refeição', refeicao, { voz: false }),
        el('div', { class: 'acoes alinhar-base' }, el('button', { type: 'button', text: 'Adicionar ao dia de hoje', onclick: adicionar })))), [
      App.voz.botaoLeitura(() => `${titulo(doc)}. ${App.markdown.textoPuro(doc.corpo)}`),
      el('span', { class: 'espaco' }),
      el('button', { type: 'button', class: 'secundario', text: 'Editar', onclick: () => { dlg.close(); editarReceita(doc); } }),
    ]);
    dlg.classList.add('grande');
  }

  function abaReceitas() {
    const lista = el('ul', { class: 'lista-receitas' });
    const desenhar = () => {
      const q = estado.busca.trim().toLowerCase();
      const docs = receitas().filter(d => !q || [titulo(d), d.corpo, ...App.lista(d.meta.tags)].join(' ').toLowerCase().includes(q));
      lista.replaceChildren(...(docs.length ? docs.map(d => el('li', {},
        el('button', { type: 'button', class: 'cartao-receita', onclick: () => verReceita(d) },
          el('strong', { text: titulo(d) }),
          el('span', { class: 'dica', text: [num(d.meta.calorias) != null ? `${d.meta.calorias} kcal/porção` : null, num(d.meta.proteina_g) != null ? `${d.meta.proteina_g} g proteína` : null, d.meta.tempo_min ? `${d.meta.tempo_min} min` : null].filter(Boolean).join(' · ') || 'Sem informações nutricionais' }),
          el('span', { class: 'selos' }, App.lista(d.meta.tags).map(t => el('span', { class: 'selo tag', text: '#' + t })))))) :
        [el('li', { class: 'vazio', text: 'Nenhuma receita ainda.' })]));
    };
    desenhar();
    return el('div', {},
      el('div', { class: 'barra' },
        el('input', { type: 'search', placeholder: 'Buscar receitas…', 'aria-label': 'Buscar receitas', value: estado.busca, oninput: e => { estado.busca = e.target.value; desenhar(); } }),
        el('button', { type: 'button', text: '+ Nova receita', onclick: () => editarReceita(null) })),
      lista);
  }

  function render(container) {
    const ABAS = { hoje: 'Hoje', progresso: 'Progresso', receitas: 'Receitas', metas: 'Metas' };
    const conteudo = { hoje: () => abaHoje(container), progresso: abaProgresso, receitas: abaReceitas, metas: () => abaMetas(container) }[estado.aba]();
    container.replaceChildren(
      el('header', { class: 'cabecalho-tela' }, el('h1', { text: 'Dieta' })),
      el('div', { class: 'alternador abas', role: 'group', 'aria-label': 'Seção da dieta' },
        Object.entries(ABAS).map(([v, r]) => el('button', { type: 'button', 'aria-pressed': String(estado.aba === v), text: r, onclick: () => { estado.aba = v; render(container); } }))),
      conteudo);
  }

  return { render, resumoDia, pesoAtual, metas };
})();
