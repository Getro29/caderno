'use strict';
// Página Finanças: o que entra e sai do caixa e os gastos planejados por data.
//   Financeiro/AAAA-MM.md   um mês; totais no frontmatter, lançamentos numa tabela no corpo.
// Situação "feito" = já aconteceu (conta no saldo); "previsto" = planejado para a data.
App.financeiro = (() => {
  const { el } = App;
  const PASTA = 'Financeiro';
  const CABECALHO = '| Data | Tipo | Descrição | Categoria | Valor (R$) | Situação |';
  const CATEGORIAS = {
    saida: ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Assinaturas', 'Contas da casa', 'Compras', 'Dívidas', 'Outros'],
    entrada: ['Salário', 'Freelance', 'Vendas', 'Presente', 'Rendimentos', 'Outros'],
  };
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const estado = { mes: App.hoje().slice(0, 7) };

  const caminho = mes => `${PASTA}/${mes}.md`;
  const centavos = v => Math.round(v * 100) / 100;
  const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const nomeMes = mes => { const [a, m] = mes.split('-').map(Number); return `${MESES[m - 1]} de ${a}`; };
  const somarMeses = (mes, n) => { const [a, m] = mes.split('-').map(Number); const d = new Date(a, m - 1 + n, 1); return App.dataISO(d).slice(0, 7); };
  const salvarErro = p => App.tentar(() => p, 'Não foi possível salvar');

  // Aceita "1234.56", "1.234,56", "R$ 50" e "-20".
  function valorDeTexto(s) {
    let t = String(s ?? '').replace(/[R$\s]/g, '');
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    const n = Number(t);
    return t === '' || isNaN(n) ? null : n;
  }
  const normalizarTipo = t => (/^entr/i.test(String(t).normalize('NFD').replace(/[̀-ͯ]/g, '')) ? 'entrada' : 'saida');
  const normalizarSituacao = s => (/^prev|^plan/i.test(String(s)) ? 'previsto' : 'feito');

  // ---- arquivo do mês ----
  function lerMes(doc) {
    const itens = []; const outras = [];
    for (const l of String(doc?.corpo || '').split('\n')) {
      const t = l.trim();
      if (t.startsWith('|') && !/^\|\s*-/.test(t) && !/^\|\s*Data\s*\|/i.test(t)) {
        const c = t.replace(/^\||\|$/g, '').split('|').map(x => x.trim());
        const valor = valorDeTexto(c[4]);
        if (c.length >= 6 && /^\d{4}-\d{2}-\d{2}$/.test(c[0]) && valor != null) {
          itens.push({ data: c[0], tipo: normalizarTipo(c[1]), descricao: c[2], categoria: c[3], valor: Math.abs(valor), situacao: normalizarSituacao(c[5]) });
          continue;
        }
      }
      if (/^\|/.test(t) || /^## Lançamentos\s*$/.test(t)) continue; // cabeçalho da tabela, refeito ao gravar
      outras.push(l);
    }
    return { itens, outras };
  }

  function totais(itens) {
    const soma = (tipo, sit) => centavos(itens.filter(i => i.tipo === tipo && i.situacao === sit).reduce((a, i) => a + i.valor, 0));
    const entradas = soma('entrada', 'feito'); const saidas = soma('saida', 'feito');
    return { entradas, saidas, saldo: centavos(entradas - saidas), previsto_entradas: soma('entrada', 'previsto'), previsto_saidas: soma('saida', 'previsto') };
  }

  function montarMes(mes, doc, itens, outras) {
    const limpo = s => String(s ?? '').replace(/\|/g, '/').trim();
    const ordenados = itens.slice().sort((a, b) => a.data.localeCompare(b.data));
    const tabela = ordenados.length ? ['## Lançamentos', '', CABECALHO, '|---|---|---|---|---:|---|',
      ...ordenados.map(i => `| ${i.data} | ${i.tipo} | ${limpo(i.descricao)} | ${limpo(i.categoria)} | ${i.valor.toFixed(2)} | ${i.situacao} |`)].join('\n') : '';
    const corpo = [tabela, outras.join('\n').trim()].filter(Boolean).join('\n\n');
    return { meta: { tipo: 'financeiro_mes', mes, ...(doc?.meta || {}), ...totais(itens) }, corpo };
  }

  function alterarMes(mes, fn) {
    return App.store.alterar(caminho(mes), doc => {
      const { itens, outras } = lerMes(doc);
      return montarMes(mes, doc, fn(itens), outras);
    }, { inline: true });
  }

  const igual = (a, b) => a.data === b.data && a.tipo === b.tipo && a.descricao === b.descricao && a.valor === b.valor && a.situacao === b.situacao;
  const semUm = (itens, alvo) => { const i = itens.findIndex(x => igual(x, alvo)); return i < 0 ? itens : itens.filter((_, j) => j !== i); };

  // Mesma data em meses seguintes (dia 31 vira o último dia do mês).
  function dataMaisMeses(iso, n) {
    const [a, m, d] = iso.split('-').map(Number);
    const ultimo = new Date(a, m - 1 + n + 1, 0).getDate();
    return App.dataISO(new Date(a, m - 1 + n, Math.min(d, ultimo)));
  }

  async function adicionar(item, repetir = 1) {
    for (let i = 0; i < repetir; i++) {
      const data = dataMaisMeses(item.data, i);
      const novo = { ...item, data, situacao: i > 0 ? 'previsto' : item.situacao };
      await alterarMes(data.slice(0, 7), itens => [...itens, novo]);
    }
    App.gamificacao.registrarEvento('lancamento_financeiro', caminho(item.data.slice(0, 7)), { tipo: item.tipo });
  }
  const remover = alvo => alterarMes(alvo.data.slice(0, 7), itens => semUm(itens, alvo));
  const marcarFeito = alvo => alterarMes(alvo.data.slice(0, 7), itens => semUm(itens, alvo).concat({ ...alvo, situacao: 'feito' }));
  async function substituir(antigo, novo) {
    if (antigo.data.slice(0, 7) === novo.data.slice(0, 7)) return alterarMes(novo.data.slice(0, 7), itens => semUm(itens, antigo).concat(novo));
    await alterarMes(novo.data.slice(0, 7), itens => [...itens, novo]);
    return remover(antigo);
  }

  // ---- consultas (também usadas no Início, no briefing e no sino) ----
  const meses = () => App.store.listar({ pasta: PASTA, tipo: 'financeiro_mes' });
  const todos = () => meses().flatMap(d => lerMes(d).itens);
  const doMes = mes => lerMes(App.store.obter(caminho(mes))).itens;
  const saldoGeral = () => centavos(todos().filter(i => i.situacao === 'feito').reduce((a, i) => a + (i.tipo === 'entrada' ? i.valor : -i.valor), 0));
  // Planejados a partir de hoje (e os atrasados, que ficaram sem marcar).
  const planejados = () => todos().filter(i => i.situacao === 'previsto').sort((a, b) => a.data.localeCompare(b.data));
  function resumo() {
    const mes = App.hoje().slice(0, 7);
    const t = totais(doMes(mes));
    const prox = planejados().filter(i => i.tipo === 'saida');
    return { ...t, saldoGeral: saldoGeral(), proximos: prox, temDados: meses().length > 0 };
  }

  // ---- telas ----
  function formulario(inicial, aoSalvar) {
    const i = inicial || {};
    const tipo = el('select', {}, el('option', { value: 'saida', text: 'Saída (gasto)', selected: i.tipo !== 'entrada' }), el('option', { value: 'entrada', text: 'Entrada (recebi)', selected: i.tipo === 'entrada' }));
    const descricao = el('input', { type: 'text', value: i.descricao || '', placeholder: 'ex.: Aluguel, Mercado, Salário' });
    const valor = el('input', { type: 'text', inputmode: 'decimal', value: i.valor != null ? String(i.valor).replace('.', ',') : '', placeholder: '0,00' });
    const data = el('input', { type: 'date', value: i.data || App.hoje() });
    const lista = el('datalist', { id: 'cats-' + Math.random().toString(36).slice(2, 7) });
    const categoria = el('input', { type: 'text', value: i.categoria || '', list: lista.id, placeholder: 'ex.: Moradia' });
    const preencherCategorias = () => {
      const usadas = todos().filter(x => x.tipo === tipo.value).map(x => x.categoria).filter(Boolean);
      lista.replaceChildren(...[...new Set([...CATEGORIAS[tipo.value], ...usadas])].map(c => el('option', { value: c })));
    };
    tipo.addEventListener('change', preencherCategorias); preencherCategorias();
    const previsto = el('input', { type: 'checkbox', id: 'fin-prev-' + lista.id, checked: i.situacao ? i.situacao === 'previsto' : false });
    data.addEventListener('change', () => { if (!inicial) previsto.checked = data.value > App.hoje(); });
    const repetir = el('select', {}, [[1, 'Não repetir'], [3, 'Todo mês, por 3 meses'], [6, 'Todo mês, por 6 meses'], [12, 'Todo mês, por 12 meses']]
      .map(([v, r]) => el('option', { value: v, text: r })));

    const salvar = async () => {
      const v = valorDeTexto(valor.value);
      if (!descricao.value.trim()) { descricao.focus(); App.toast('Escreva o que é o lançamento.', 'erro'); return; }
      if (!v) { valor.focus(); App.toast('Digite um valor maior que zero.', 'erro'); return; }
      if (!data.value) { data.focus(); return; }
      const item = { data: data.value, tipo: tipo.value, descricao: descricao.value.trim(), categoria: categoria.value.trim() || 'Outros',
        valor: centavos(Math.abs(v)), situacao: previsto.checked ? 'previsto' : 'feito' };
      await aoSalvar(item, Number(repetir.value) || 1);
    };
    return {
      salvar,
      no: el('div', { class: 'grade-form form-financeiro' },
        App.campo('Tipo', tipo, { voz: false }),
        App.campo('Descrição', descricao),
        App.campo('Valor (R$)', valor, { voz: false }),
        App.campo('Data', data, { voz: false }),
        el('div', {}, App.campo('Categoria', categoria, { voz: false }), lista),
        inicial ? null : App.campo('Repetir', repetir, { voz: false }),
        el('div', { class: 'opcao largo' }, previsto, el('label', { for: previsto.id, text: 'Ainda vai acontecer (planejado para essa data)' }))),
    };
  }

  function editar(item) {
    const f = formulario(item, async novo => {
      if (await salvarErro(substituir(item, novo))) { dlg.close(); App.toast('Lançamento atualizado.'); }
    });
    const dlg = App.dialogo('Editar lançamento', f.no, [
      el('button', { type: 'button', class: 'perigo', text: 'Excluir', onclick: async () => {
        if (App.confirmar(`Excluir "${item.descricao}" (${brl(item.valor)})?`) && await salvarErro(remover(item))) dlg.close();
      } }),
      el('span', { class: 'espaco' }),
      el('button', { type: 'button', class: 'secundario', text: 'Cancelar', onclick: () => dlg.close() }),
      el('button', { type: 'button', text: 'Salvar', onclick: f.salvar }),
    ]);
  }

  const numero = (rotulo, valor, classe = '') => el('div', { class: 'kpi ' + classe }, el('span', { class: 'kpi-rotulo', text: rotulo }), el('strong', { class: 'kpi-valor', text: valor }));

  function linhaItem(item, redesenhar) {
    const n = App.diasAte(item.data);
    const atrasado = item.situacao === 'previsto' && n < 0;
    return el('li', { class: 'lancamento ' + item.tipo + (item.situacao === 'previsto' ? ' previsto' : '') },
      el('span', { class: 'lancamento-data', text: App.fmtData(item.data).slice(0, 5) }),
      el('span', { class: 'lancamento-info' },
        el('button', { type: 'button', class: 'link', text: item.descricao, onclick: () => editar(item) }),
        el('span', { class: 'selos' },
          el('span', { class: 'selo', text: item.categoria }),
          item.situacao === 'previsto' ? el('span', { class: 'selo ' + (atrasado ? 'perigo' : 'info'), text: atrasado ? 'atrasado' : n === 0 ? 'planejado · hoje' : 'planejado' }) : null)),
      el('strong', { class: 'lancamento-valor', text: (item.tipo === 'entrada' ? '+ ' : '− ') + brl(item.valor) }),
      el('span', { class: 'acoes' },
        item.situacao === 'previsto' ? el('button', { type: 'button', class: 'icone', title: 'Marcar como feito', 'aria-label': `Marcar ${item.descricao} como feito`,
          onclick: async () => { if (await salvarErro(marcarFeito(item))) redesenhar(); } }, App.icone('check')) : null,
        el('button', { type: 'button', class: 'icone', title: 'Excluir', 'aria-label': `Excluir ${item.descricao}`,
          onclick: async () => { if (App.confirmar(`Excluir "${item.descricao}" (${brl(item.valor)})?`) && await salvarErro(remover(item))) redesenhar(); } }, App.icone('lixeira'))));
  }

  function porCategoria(itens) {
    const gastos = itens.filter(i => i.tipo === 'saida');
    if (!gastos.length) return el('p', { class: 'vazio', text: 'Nenhum gasto neste mês.' });
    const mapa = new Map();
    for (const g of gastos) mapa.set(g.categoria, (mapa.get(g.categoria) || 0) + g.valor);
    const total = gastos.reduce((a, g) => a + g.valor, 0);
    return el('ul', { class: 'lista-habitos-stats' }, [...mapa].sort((a, b) => b[1] - a[1]).map(([c, v]) => {
      const pct = Math.round((v / total) * 100);
      return el('li', {},
        el('div', { class: 'linha-stat' }, el('strong', { text: c }), el('span', { class: 'dica', text: `${brl(v)} · ${pct}%` })),
        el('div', { class: 'barra-progresso', role: 'img', 'aria-label': `${c}: ${pct}% dos gastos` }, el('span', { style: `width:${pct}%` })));
    }));
  }

  function render(container) {
    const redesenhar = () => render(container);
    const mes = estado.mes;
    const itens = doMes(mes).sort((a, b) => a.data.localeCompare(b.data));
    const t = totais(itens);
    const geral = saldoGeral();
    const projetado = centavos(t.saldo + t.previsto_entradas - t.previsto_saidas);
    const hoje = App.hoje();
    const proximos = planejados().filter(i => i.data <= App.somarDias(hoje, 45));
    const f = formulario(null, async (item, repetir) => {
      const ok = await App.tentar(() => adicionar(item, repetir).then(() => true), 'Não foi possível salvar');
      if (ok) { App.toast(repetir > 1 ? `Lançado e planejado para os próximos ${repetir - 1} mês(es).` : 'Lançamento salvo.'); redesenhar(); }
    });

    container.replaceChildren(
      el('header', { class: 'cabecalho-tela' },
        el('div', {}, el('h1', { text: 'Finanças' }),
          el('p', { class: 'resumo', text: 'Anote o que entra e o que sai do caixa e planeje os gastos que vêm pela frente.' })),
        el('div', { class: 'acoes' },
          el('button', { type: 'button', class: 'icone', 'aria-label': 'Mês anterior', onclick: () => { estado.mes = somarMeses(mes, -1); redesenhar(); } }, App.icone('esquerda')),
          el('strong', { class: 'titulo-mes', text: nomeMes(mes) }),
          el('button', { type: 'button', class: 'icone', 'aria-label': 'Próximo mês', onclick: () => { estado.mes = somarMeses(mes, 1); redesenhar(); } }, App.icone('direita')),
          mes !== hoje.slice(0, 7) ? el('button', { type: 'button', class: 'secundario pequeno', text: 'Este mês', onclick: () => { estado.mes = hoje.slice(0, 7); redesenhar(); } }) : null)),
      el('section', { class: 'kpis', 'aria-label': 'Resumo do mês' },
        numero('Entrou no mês', brl(t.entradas), 'positivo'),
        numero('Saiu no mês', brl(t.saidas), 'negativo'),
        numero('Saldo do mês', brl(t.saldo), t.saldo < 0 ? 'negativo' : ''),
        numero('Saldo previsto no fim do mês', brl(projetado), projetado < 0 ? 'negativo' : ''),
        numero('Caixa total (tudo já feito)', brl(geral), geral < 0 ? 'negativo' : 'destaque')),
      el('div', { class: 'duas-colunas-largas' },
        el('section', { class: 'caixa', 'aria-labelledby': 'titulo-novo-lanc' },
          el('h2', { id: 'titulo-novo-lanc', text: 'Novo lançamento' }),
          f.no,
          el('div', { class: 'acoes' }, el('span', { class: 'espaco' }), el('button', { type: 'button', text: 'Adicionar', onclick: f.salvar }))),
        el('section', { class: 'caixa', 'aria-labelledby': 'titulo-planejados' },
          el('h2', { id: 'titulo-planejados', text: 'Planejados (próximos 45 dias)' }),
          proximos.length ? el('ul', { class: 'lista-lancamentos' }, proximos.slice(0, 12).map(i => linhaItem(i, redesenhar)))
            : el('p', { class: 'vazio', text: 'Nada planejado. Ao lançar com data futura, marque "Ainda vai acontecer".' }),
          proximos.length ? el('p', { class: 'dica', text: `Saídas planejadas: ${brl(proximos.filter(i => i.tipo === 'saida').reduce((a, i) => a + i.valor, 0))} · Entradas planejadas: ${brl(proximos.filter(i => i.tipo === 'entrada').reduce((a, i) => a + i.valor, 0))}` }) : null)),
      el('div', { class: 'duas-colunas-largas' },
        el('section', { class: 'caixa', 'aria-labelledby': 'titulo-lancamentos' },
          el('h2', { id: 'titulo-lancamentos', text: `Lançamentos de ${nomeMes(mes)}` }),
          itens.length ? el('ul', { class: 'lista-lancamentos' }, itens.map(i => linhaItem(i, redesenhar)))
            : el('p', { class: 'vazio', text: 'Nenhum lançamento neste mês.' })),
        el('section', { class: 'caixa', 'aria-labelledby': 'titulo-categorias' },
          el('h2', { id: 'titulo-categorias', text: 'Para onde foi o dinheiro' }),
          porCategoria(itens))));
  }

  return { render, resumo, planejados, brl, doMes, totais };
})();
