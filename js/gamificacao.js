'use strict';
// Gamificação: XP e nível a partir dos hábitos do check-in diário.
// Regra: um dia com todos os hábitos feitos vale 100 XP (cada hábito vale a sua fração);
// a cada 500 XP — 5 dias completos — sobe um nível. Tudo é calculado a partir do Diario/,
// que é a fonte da verdade; Caderno/progresso.md guarda um retrato legível do resultado.
App.gamificacao = (() => {
  const { el } = App;
  const XP_DIA = 100;
  const DIAS_POR_NIVEL = 5;
  const XP_NIVEL = XP_DIA * DIAS_POR_NIVEL;
  const ARQUIVO = 'Caderno/progresso.md';
  const eventos = [];
  let nivelVisto = null;
  let xpMostrado = null; // para a barra andar do valor anterior até o novo

  // tipo: 'tarefa_concluida' | 'nota_criada' | 'habito_marcado' | 'captura' | ...
  function registrarEvento(tipo, id, dados = {}) {
    const ev = { tipo, id, dados, em: new Date().toISOString() };
    eventos.push(ev);
    App.emit('evento', ev);
  }

  function xpDoDia(data) {
    const total = App.diario.habitos().length || 1;
    return Math.round(XP_DIA * Math.min(1, App.diario.feitos(data).length / total));
  }

  function progresso() {
    const hoje = App.hoje();
    const dias = App.store.listar({ pasta: 'Diario', tipo: 'diario' })
      .map(d => String(d.meta.data || d.nome.replace(/\.md$/, ''))).filter(d => d <= hoje);
    let xp = 0; let ativos = 0; let ultimo = null;
    for (const d of dias) { const x = xpDoDia(d); xp += x; if (x > 0) { ativos++; if (!ultimo || d > ultimo) ultimo = d; } }
    let seq = 0; let d = xpDoDia(hoje) > 0 ? hoje : App.somarDias(hoje, -1);
    while (xpDoDia(d) > 0) { seq++; d = App.somarDias(d, -1); }
    const nivel = 1 + Math.floor(xp / XP_NIVEL);
    const noNivel = xp % XP_NIVEL;
    return { xp, nivel, noNivel, xpNivel: XP_NIVEL, faltam: XP_NIVEL - noNivel, pct: Math.round((noNivel / XP_NIVEL) * 100),
      hoje: xpDoDia(hoje), porHabito: Math.round(XP_DIA / (App.diario.habitos().length || 1)), diasAtivos: ativos, sequencia: seq, ultimoDia: ultimo };
  }

  // Chamado depois de marcar/desmarcar um hábito: avisa a subida de nível e atualiza o retrato.
  async function aposHabito() {
    const p = progresso();
    if (nivelVisto != null && p.nivel > nivelVisto) {
      App.toast(`Subiu para o nível ${p.nivel}!`);
      App.emit('nivel', p);
    }
    nivelVisto = p.nivel;
    await App.store.alterar(ARQUIVO, doc => ({
      meta: { tipo: 'progresso', ...(doc?.meta || {}), xp_total: p.xp, nivel: p.nivel, xp_para_proximo: p.faltam,
        xp_por_area: { ...(doc?.meta.xp_por_area && typeof doc.meta.xp_por_area === 'object' && !Object.isFrozen(doc.meta.xp_por_area) ? doc.meta.xp_por_area : {}), habitos: p.xp },
        sequencia_dias: p.sequencia, ultimo_dia_ativo: p.ultimoDia },
      corpo: doc?.corpo || 'Progresso do Bit-life. Calculado a partir dos hábitos do Diario/: dia completo = 100 XP; 5 dias completos (500 XP) = 1 nível.\n',
    }), { inline: true }).catch(e => console.warn('progresso não gravado', e));
  }

  // Cartão com nível e barra de XP (Início e Hábitos).
  function cartao({ compacto = false } = {}) {
    const p = progresso();
    nivelVisto ??= p.nivel;
    const preenchimento = el('span', { style: `width:${p.pct}%` });
    if (xpMostrado != null && xpMostrado !== p.xp && p.pct > 0) {
      const antes = Math.floor(xpMostrado / XP_NIVEL) === p.nivel - 1 ? (xpMostrado % XP_NIVEL) / XP_NIVEL * 100 : 0;
      App.animacao.encher(preenchimento, antes / p.pct);
    }
    xpMostrado = p.xp;
    return el('div', { class: 'nivel' + (compacto ? ' compacto' : '') },
      el('div', { class: 'nivel-emblema', 'aria-hidden': 'true' }, el('span', { text: p.nivel })),
      el('div', { class: 'nivel-texto' },
        el('div', { class: 'linha-stat' }, el('strong', { text: `Nível ${p.nivel}` }), el('span', { class: 'dica', text: `${p.noNivel} / ${p.xpNivel} XP` })),
        el('div', { class: 'barra-progresso grande', role: 'img', 'aria-label': `${p.pct}% do nível ${p.nivel}; faltam ${p.faltam} XP` }, preenchimento),
        el('span', { class: 'dica', text: `Hoje: +${p.hoje} XP · cada hábito vale ${p.porHabito} XP · faltam ${p.faltam} XP${p.sequencia ? ` · ${p.sequencia} dia(s) seguidos` : ''}` })));
  }

  // Selo do cabeçalho.
  function desenharSelo() {
    const area = document.getElementById('nivel-topo');
    if (!area) return;
    if (!App.store.conectado()) { area.replaceChildren(); area.hidden = true; return; }
    const p = progresso();
    nivelVisto ??= p.nivel;
    area.hidden = false;
    area.setAttribute('aria-label', `Nível ${p.nivel}, ${p.noNivel} de ${p.xpNivel} XP. Abrir Hábitos`);
    area.title = `Nível ${p.nivel} · faltam ${p.faltam} XP`;
    area.replaceChildren(App.icone('estrela'), el('span', { text: `Nv ${p.nivel}` }),
      el('span', { class: 'mini-barra', 'aria-hidden': 'true' }, el('span', { style: `width:${p.pct}%` })));
  }
  App.on('dados', () => desenharSelo());

  return { registrarEvento, eventosDaSessao: () => eventos.slice(), progresso, aposHabito, cartao, desenharSelo, XP_DIA, DIAS_POR_NIVEL };
})();
