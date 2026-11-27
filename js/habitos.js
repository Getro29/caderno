'use strict';
// Página Hábitos: check-in diário (hábitos, sono, humor), grade do mês e estatísticas.
// Os dados ficam no Diario/ (ver diario.js).
App.habitos = (() => {
  const { el } = App;
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const HUMOR = { 1: 'Muito ruim', 2: 'Ruim', 3: 'Normal', 4: 'Bom', 5: 'Muito bom' };
  const hoje0 = new Date();
  const estado = { data: App.hoje(), ano: hoje0.getFullYear(), mes: hoje0.getMonth() };

  const nomeMes = (ano, mes) => `${MESES[mes]} de ${ano}`;
  const fmtDia = iso => { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }); };
  const salvarErro = p => App.tentar(() => p, 'Não foi possível salvar');

  // Check-in de um dia. Também é usado no Início. aoMudar: redesenhar estatísticas.
  function checkin(data = App.hoje(), aoMudar) {
    const m = App.diario.meta(data);
    const habitos = App.diario.habitos();
    const lista = el('ul', { class: 'checkin-habitos' }, habitos.map(h => {
      const id = `hab-${data}-${App.slug(h)}`;
      return el('li', {},
        el('input', { type: 'checkbox', id, checked: App.diario.fez(data, h),
          onchange: async e => { await salvarErro(App.diario.alternar(data, h, e.target.checked)); aoMudar?.(); } }),
        el('label', { for: id, text: h }));
    }));
    const sono = el('input', { type: 'number', min: 0, max: 24, step: 0.5, value: m.sono_horas ?? '', inputmode: 'decimal',
      onchange: async e => { await salvarErro(App.diario.atualizar(data, { sono_horas: e.target.value === '' ? null : Number(e.target.value) })); aoMudar?.(); } });
    const humor = el('select', { onchange: async e => { await salvarErro(App.diario.atualizar(data, { humor: Number(e.target.value) || null })); aoMudar?.(); } },
      el('option', { value: '', text: '—' }), Object.entries(HUMOR).map(([v, r]) => el('option', { value: v, selected: Number(m.humor) === Number(v), text: `${v} · ${r}` })));
    return el('div', { class: 'checkin' },
      lista,
      el('div', { class: 'checkin-numeros' },
        App.campo('Horas de sono (noite anterior)', sono, { voz: false }),
        App.campo('Como foi o dia', humor, { voz: false })));
  }

  function grade(container) {
    const { ano, mes } = estado;
    const dias = App.diario.diasDoMes(ano, mes);
    const hoje = App.hoje();
    const habitos = App.diario.habitos();
    return el('div', { class: 'rolagem-mes' }, el('table', { class: 'grade-habitos' },
      el('caption', { class: 'sr', text: `Hábitos de ${nomeMes(ano, mes)}` }),
      el('thead', {}, el('tr', {}, el('th', { scope: 'col', text: 'Hábito' }), dias.map(d => el('th', { scope: 'col', class: d === hoje ? 'hoje' : null, text: Number(d.slice(8)) })))),
      el('tbody', {}, habitos.map(h => el('tr', {},
        el('th', { scope: 'row', text: h }),
        dias.map(d => {
          const feito = App.diario.fez(d, h);
          return el('td', {}, el('button', {
            type: 'button', class: 'celula-habito' + (feito ? ' feito' : ''), 'aria-pressed': String(feito), disabled: d > hoje,
            'aria-label': `${h}, dia ${Number(d.slice(8))}`,
            onclick: async () => { await salvarErro(App.diario.alternar(d, h, !feito)); render(container); },
          }));
        }))))));
  }

  function barra(pct, rotulo) {
    return el('div', { class: 'barra-progresso', role: 'img', 'aria-label': `${rotulo}: ${pct}%` },
      el('span', { style: `width:${Math.max(0, Math.min(100, pct))}%` }));
  }

  function estatisticas(r) {
    return el('div', { class: 'estatisticas' },
      el('div', { class: 'numeros-mes' },
        numero(`${r.geralPct}%`, 'dos hábitos cumpridos'),
        numero(r.sonoMedio ? `${r.sonoMedio.toFixed(1)} h` : '—', 'de sono em média'),
        numero(r.humorMedio ? r.humorMedio.toFixed(1) : '—', 'humor médio (1 a 5)'),
        numero(r.estudoMinutos ? `${Math.floor(r.estudoMinutos / 60)}h${String(r.estudoMinutos % 60).padStart(2, '0')}` : '—', 'de estudo cronometrado')),
      el('ul', { class: 'lista-habitos-stats' }, r.porHabito.map(h => el('li', {},
        el('div', { class: 'linha-stat' }, el('strong', { text: h.nome }),
          el('span', { class: 'dica', text: `${h.feitos}/${h.dias} dias · ${h.pct}%${h.sequencia ? ` · sequência de ${h.sequencia} dia(s)` : ''}` })),
        barra(h.pct, h.nome)))));
  }
  const numero = (valor, rotulo) => el('p', { class: 'numero-grande' }, el('strong', { text: valor }), ' ', rotulo);

  function gerenciar(container) {
    const novo = el('input', { type: 'text', placeholder: 'ex.: Meditação, Beber 2L de água' });
    const habitos = App.diario.habitos();
    const adicionar = async () => {
      const n = novo.value.trim();
      if (!n) { novo.focus(); return; }
      if (habitos.some(h => App.slug(h) === App.slug(n))) { App.toast('Esse hábito já existe.', 'erro'); return; }
      await salvarErro(App.diario.salvarHabitos([...habitos, n]));
    };
    novo.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } });
    return el('details', { class: 'caixa' },
      el('summary', { text: 'Editar lista de hábitos' }),
      el('ul', { class: 'lista-simples' }, habitos.map((h, i) => el('li', {},
        el('span', { text: h }),
        el('span', { class: 'acoes' },
          i > 0 ? el('button', { type: 'button', class: 'icone', 'aria-label': `Subir ${h}`, onclick: () => { const l = habitos.slice(); [l[i - 1], l[i]] = [l[i], l[i - 1]]; salvarErro(App.diario.salvarHabitos(l)); } }, App.icone('cima')) : null,
          el('button', { type: 'button', class: 'icone', 'aria-label': `Remover ${h}`, onclick: () => {
            if (App.confirmar(`Tirar "${h}" da lista? O histórico dos dias passados continua salvo.`)) salvarErro(App.diario.salvarHabitos(habitos.filter(x => x !== h)));
          } }, App.icone('lixeira')))))),
      el('div', { class: 'campo-linha' }, el('div', { class: 'espaco' }, App.campo('Novo hábito', novo, { voz: false })),
        el('button', { type: 'button', class: 'alinhar-base', text: 'Adicionar', onclick: adicionar })));
  }

  function render(container) {
    const { ano, mes } = estado;
    const resumo = App.diario.resumoMes(ano, mes);
    const anterior = new Date(ano, mes - 1, 1);
    const areaStats = el('div', {}, estatisticas(resumo));
    const areaGrade = el('div', {}, grade(container));
    const mudarMes = delta => { const d = new Date(estado.ano, estado.mes + delta, 1); estado.ano = d.getFullYear(); estado.mes = d.getMonth(); render(container); };
    const data = el('input', { type: 'date', value: estado.data, max: App.hoje(), 'aria-label': 'Dia do check-in',
      onchange: e => { if (e.target.value) { estado.data = e.target.value; render(container); } } });

    const areaNivel = el('section', { class: 'caixa', 'aria-label': 'Nível e XP' }, App.gamificacao.cartao(),
      el('p', { class: 'dica', text: 'Cada dia com todos os hábitos feitos vale 100 XP (cada hábito vale a sua parte). A cada 5 dias completos — 500 XP — você sobe um nível.' }));
    container.replaceChildren(
      el('header', { class: 'cabecalho-tela' }, el('h1', { text: 'Hábitos' })),
      el('p', { class: 'resumo', text: 'Marque todo dia. Isso soma XP, alimenta as estatísticas e o briefing do Início.' }),
      areaNivel,
      el('div', { class: 'duas-colunas-largas' },
        el('section', { class: 'caixa', 'aria-labelledby': 'titulo-checkin' },
          el('header', { class: 'caixa-cabecalho' },
            el('h2', { id: 'titulo-checkin', text: estado.data === App.hoje() ? 'Check-in de hoje' : 'Check-in de ' + fmtDia(estado.data) }),
            el('div', { class: 'acoes' },
              el('button', { type: 'button', class: 'icone', 'aria-label': 'Dia anterior', onclick: () => { estado.data = App.somarDias(estado.data, -1); render(container); } }, App.icone('esquerda')),
              data,
              estado.data < App.hoje() ? el('button', { type: 'button', class: 'icone', 'aria-label': 'Próximo dia', onclick: () => { estado.data = App.somarDias(estado.data, 1); render(container); } }, App.icone('direita')) : null)),
          checkin(estado.data, () => {
            areaNivel.firstChild.replaceWith(App.gamificacao.cartao());
            areaStats.replaceChildren(estatisticas(App.diario.resumoMes(estado.ano, estado.mes)));
            areaGrade.replaceChildren(grade(container));
          })),
        el('section', { class: 'caixa', 'aria-labelledby': 'titulo-stats' },
          el('header', { class: 'caixa-cabecalho' },
            el('h2', { id: 'titulo-stats', text: 'Estatísticas de ' + nomeMes(ano, mes) }),
            el('div', { class: 'acoes' },
              el('button', { type: 'button', class: 'icone', 'aria-label': 'Mês anterior', onclick: () => mudarMes(-1) }, App.icone('esquerda')),
              el('button', { type: 'button', class: 'icone', 'aria-label': 'Próximo mês', onclick: () => mudarMes(1) }, App.icone('direita')))),
          areaStats,
          el('p', { class: 'dica', text: `Mês anterior (${nomeMes(anterior.getFullYear(), anterior.getMonth())}): ${App.diario.resumoMes(anterior.getFullYear(), anterior.getMonth()).geralPct}% dos hábitos cumpridos.` }))),
      el('section', { class: 'caixa', 'aria-labelledby': 'titulo-grade' },
        el('h2', { id: 'titulo-grade', text: 'Mês em quadradinhos' }),
        el('p', { class: 'dica', text: 'Clique num quadrado para marcar ou desmarcar um dia que passou.' }),
        areaGrade),
      gerenciar(container));
  }

  return { render, checkin, HUMOR };
})();
