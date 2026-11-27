'use strict';
// Sino do cabeçalho: tarefas atrasadas ou que vencem hoje e compromissos do dia (eventos,
// jogos, avisos de vestibular). Também mostra o temporizador de estudo quando está ligado.
App.notificacoes = (() => {
  const { el } = App;
  const area = document.getElementById('avisos-topo');
  let aberto = false;

  function itens() {
    const hoje = App.hoje();
    const tarefas = App.tarefas.todas().filter(d => d.meta.status !== 'feita' && d.meta.prazo && App.diasAte(d.meta.prazo) <= 1)
      .sort((a, b) => String(a.meta.prazo).localeCompare(String(b.meta.prazo)));
    const agenda = App.calendario.proximos(1).filter(a => a.data === hoje)
      .sort((a, b) => String(a.hora || '').localeCompare(String(b.hora || '')));
    const urgentes = tarefas.filter(d => App.diasAte(d.meta.prazo) <= 0);
    const contas = App.financeiro.planejados().filter(i => i.tipo === 'saida' && i.data <= hoje);
    return { urgentes, amanha: tarefas.filter(d => App.diasAte(d.meta.prazo) === 1), agenda, contas, total: urgentes.length + agenda.length + contas.length };
  }

  function painel(i) {
    const grupo = (titulo, lis) => (lis.length ? [el('h3', { text: titulo }), el('ul', { class: 'lista-simples' }, lis)] : []);
    const tarefa = d => el('li', {},
      el('button', { type: 'button', class: 'link', text: d.meta.titulo || d.nome, onclick: () => { fechar(); App.tarefas.editar(d); } }),
      el('span', { class: 'selo ' + (App.diasAte(d.meta.prazo) < 0 ? 'perigo' : 'alerta'), text: App.descreverPrazo(d.meta.prazo) }));
    return el('div', { class: 'painel-avisos', id: 'painel-avisos', role: 'region', 'aria-label': 'Avisos de hoje' },
      i.total || i.amanha.length ? [
        ...grupo('Tarefas', i.urgentes.map(tarefa)),
        ...grupo('Hoje no calendário', i.agenda.map(a => el('li', {},
          a.doc ? el('button', { type: 'button', class: 'link', text: a.titulo, onclick: () => { fechar(); App.calendario.editar(a.doc); } }) : el('span', { text: a.titulo }),
          el('span', { class: 'dica', text: a.hora || 'dia inteiro' })))),
        ...grupo('Contas para pagar', i.contas.map(c => el('li', {},
          el('a', { href: '#/financas', onclick: fechar, text: c.descricao }),
          el('span', { class: 'selo ' + (c.data < App.hoje() ? 'perigo' : 'alerta'), text: `${App.financeiro.brl(c.valor)} · ${c.data < App.hoje() ? 'atrasada' : 'hoje'}` })))),
        ...grupo('Vencem amanhã', i.amanha.map(tarefa)),
      ] : el('p', { class: 'vazio', text: 'Nada urgente hoje.' }),
      el('div', { class: 'acoes' }, el('a', { href: '#/calendario', onclick: fechar, text: 'Abrir calendário' }), el('a', { href: '#/tarefas', onclick: fechar, text: 'Abrir tarefas' })));
  }

  function fechar() { if (aberto) { aberto = false; desenhar(); area.querySelector('.sino')?.focus(); } }

  function desenhar() {
    if (!area) return;
    if (!App.store.conectado()) { area.replaceChildren(); return; }
    const i = itens();
    const t = App.estudo.estadoTemporizador();
    const sino = el('button', {
      type: 'button', class: 'icone sino' + (i.total ? ' com-aviso' : ''), 'aria-expanded': String(aberto), 'aria-controls': 'painel-avisos',
      'aria-label': i.total ? `Avisos: ${i.total} para hoje` : 'Avisos: nada para hoje',
      onclick: () => { aberto = !aberto; desenhar(); if (aberto) area.querySelector('.painel-avisos button, .painel-avisos a')?.focus(); },
    }, App.icone('sino'), i.total ? el('span', { class: 'contador-sino', 'aria-hidden': 'true', text: i.total > 9 ? '9+' : i.total }) : null);
    area.replaceChildren(...[
      t.ativo ? el('a', { href: '#/estudo', class: 'selo-tempo' + (t.rodando ? '' : ' pausado'), title: t.rotulo || 'Temporizador de estudo',
        'aria-label': `Temporizador: ${t.texto}${t.rodando ? '' : ', pausado'}` }, el('span', { 'data-cronometro': '', text: t.texto })) : null,
      el('div', { class: 'sino-envoltorio' }, sino, aberto ? painel(i) : null)].filter(Boolean));
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape' && aberto) fechar(); });
  // composedPath é fixado no início do clique: funciona mesmo se o botão clicado for redesenhado.
  document.addEventListener('click', e => { if (aberto && area && !e.composedPath().includes(area)) { aberto = false; desenhar(); } });
  App.on('dados', () => desenhar());
  let tempoAtivo = false;
  App.on('cronometro', c => { if (c.ativo !== tempoAtivo) { tempoAtivo = c.ativo; desenhar(); } });
  setInterval(desenhar, 60000); // virada do dia e horários
  window.addEventListener('hashchange', () => { if (aberto) { aberto = false; desenhar(); } });

  return { desenhar, itens };
})();
