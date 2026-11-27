'use strict';
// Início: briefing do dia (gerado a partir do check-in, dieta, estudo, tarefas e calendário),
// check-in rápido, capas do que está lendo/assistindo e resumo do mês.
App.painel = (() => {
  const { el } = App;
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  function cartao(titulo, link, conteudo, classe = '') {
    return el('section', { class: 'cartao-painel ' + classe },
      el('header', {}, el('h2', { text: titulo }), link ? el('a', { href: link, text: 'Ver tudo' }) : null),
      conteudo);
  }
  const lista = (itens, vazio) => (itens.length ? el('ul', { class: 'lista-simples' }, itens) : el('p', { class: 'vazio', text: vazio }));
  const horas = min => (min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${min} min`);
  const juntar = l => (l.length <= 1 ? l.join('') : `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}`);

  // ---------------- briefing ----------------
  function briefing() {
    const hoje = App.hoje(); const ontem = App.somarDias(hoje, -1);
    const frases = [];

    // Calendário
    const ano = Number(hoje.slice(0, 4));
    const datas = (App.calendario.datasDoAno(ano).get(hoje) || []).filter(x => x.tipo !== 'comemorativa');
    const agenda = App.calendario.proximos(1);
    const evs = agenda.filter(a => a.tipo === 'evento');
    const jogos = agenda.filter(a => a.tipo === 'esporte');
    const avisos = agenda.filter(a => a.tipo === 'vestibular');
    const cal = [];
    if (datas.length) cal.push(`Hoje é ${datas.map(d => d.nome).join(' / ')} (${datas[0].tipo === 'feriado' ? 'feriado nacional' : 'ponto facultativo'}).`);
    if (evs.length) cal.push(`Na agenda: ${juntar(evs.map(e => (e.hora ? `${e.titulo} às ${e.hora}` : e.titulo)))}.`);
    if (jogos.length) cal.push(`Para assistir: ${juntar(jogos.slice(0, 4).map(j => `${j.titulo.replace(/^Futebol · /, '')}${j.hora ? ' às ' + j.hora : ''}`))}${jogos.length > 4 ? ` e mais ${jogos.length - 4}` : ''}.`);
    if (avisos.length) cal.push(avisos.map(a => a.titulo).join(' '));
    if (cal.length) frases.push({ tema: 'Hoje', texto: cal.join(' ') });

    // Tarefas e timeboxing
    const abertas = App.tarefas.todas().filter(d => d.meta.status !== 'feita' && d.meta.prazo);
    const venceHoje = abertas.filter(d => App.diasAte(d.meta.prazo) === 0);
    const atrasadas = abertas.filter(d => App.diasAte(d.meta.prazo) < 0);
    const amanha = abertas.filter(d => App.diasAte(d.meta.prazo) === 1);
    const tar = [];
    if (venceHoje.length) tar.push(`${venceHoje.length} tarefa(s) vencem hoje: ${juntar(venceHoje.slice(0, 3).map(d => d.meta.titulo || d.nome))}.`);
    if (atrasadas.length) tar.push(`${atrasadas.length} estão atrasadas — vale resolver ou mudar o prazo.`);
    if (amanha.length) tar.push(`Amanhã vencem ${amanha.length}.`);
    if (!tar.length) tar.push('Nenhum prazo apertado hoje.');
    const prox = App.timebox.proximo('dia');
    const tb = App.timebox.resumo('dia');
    if (prox) tar.push(`Próximo bloco do seu dia: ${prox.texto} às ${prox.hora}.`);
    else if (!tb.total) tar.push('Seu timeboxing de hoje está vazio: que tal dividir o dia em Tarefas?');
    const capturas = App.entrada.todas().length;
    const revisar = App.notas.paraRevisar().length;
    if (capturas) tar.push(`Há ${capturas} anotação(ões) na Entrada para organizar.`);
    if (revisar) tar.push(`${revisar} nota(s) de estudo pedem revisão hoje.`);
    frases.push({ tema: 'Tarefas', texto: tar.join(' ') });

    // Hábitos de ontem, sono e humor
    const habitos = App.diario.habitos();
    const mOntem = App.diario.meta(ontem);
    const hab = [];
    if (App.diario.obter(ontem)) {
      const feitos = habitos.filter(h => App.diario.fez(ontem, h));
      const faltou = habitos.filter(h => !App.diario.fez(ontem, h));
      hab.push(`Ontem você cumpriu ${feitos.length} de ${habitos.length} hábitos${faltou.length && faltou.length < habitos.length ? ` (faltou ${juntar(faltou)})` : ''}.`);
      if (Number(mOntem.sono_horas)) {
        const s = Number(mOntem.sono_horas);
        hab.push(`Dormiu ${String(s).replace('.', ',')} h${s < 6 ? ': pouco — tente desacelerar mais cedo hoje' : s >= 7 ? ', ótimo' : ''}.`);
      }
    } else hab.push('Você não fez o check-in de ontem. Dá para marcar agora na página Hábitos.');
    const seqs = habitos.map(h => ({ h, n: App.diario.sequencia(h) }));
    const melhor = seqs.filter(s => s.n >= 3).sort((a, b) => b.n - a.n)[0];
    if (melhor) hab.push(`Sequência de ${melhor.n} dias com ${melhor.h} — não quebre hoje!`);
    const esquecido = habitos.map(h => {
      let n = 0; let d = ontem;
      while (n < 30 && !App.diario.fez(d, h) && App.diario.obter(d)) { n++; d = App.somarDias(d, -1); }
      return { h, n };
    }).filter(x => x.n >= 3).sort((a, b) => b.n - a.n)[0];
    if (esquecido) hab.push(`Faz ${esquecido.n} dias sem ${esquecido.h}. Que tal retomar hoje?`);
    const humores = Array.from({ length: 7 }, (_, i) => Number(App.diario.meta(App.somarDias(hoje, -1 - i)).humor)).filter(Boolean);
    if (humores.length >= 3) {
      const media = humores.reduce((a, b) => a + b, 0) / humores.length;
      hab.push(`Seu humor médio na semana foi ${media.toFixed(1).replace('.', ',')} de 5${media < 2.5 ? '; cuide de você, talvez seja hora de pegar mais leve' : ''}.`);
    }
    frases.push({ tema: 'Hábitos', texto: hab.join(' ') });

    // Dieta
    const d = App.dieta.resumoDia(ontem);
    const peso = App.dieta.pesoAtual();
    const die = [];
    if (d && d.refeicoes) {
      const meta = Number(d.metas.calorias);
      die.push(`Ontem: ${Math.round(d.calorias)} kcal${meta ? ` (meta ${meta}, ${Math.round((d.calorias / meta) * 100)}%)` : ''} e ${Math.round(d.proteina_g)} g de proteína${Number(d.metas.proteina_g) ? ` de ${d.metas.proteina_g} g` : ''}.`);
      if (Number(d.metas.agua_ml) && d.agua_ml < d.metas.agua_ml * 0.8) die.push(`Bebeu ${d.agua_ml} ml de água, abaixo da meta.`);
    }
    if (peso) die.push(`Peso mais recente: ${String(peso.peso).replace('.', ',')} kg${peso.variacao7 != null ? ` (${peso.variacao7 > 0 ? '+' : ''}${String(peso.variacao7).replace('.', ',')} kg em 7 dias)` : ''}.`);
    if (die.length) frases.push({ tema: 'Dieta', texto: die.join(' ') });

    // Finanças
    const fin = App.financeiro.resumo();
    if (fin.temDados) {
      const brl = App.financeiro.brl;
      const contas = fin.proximos.filter(i => i.data <= App.somarDias(hoje, 3));
      const f = [`Caixa total: ${brl(fin.saldoGeral)}.`];
      const atrasadas = contas.filter(i => i.data < hoje);
      const proximas = contas.filter(i => i.data >= hoje);
      if (atrasadas.length) f.push(`${atrasadas.length} gasto(s) planejado(s) passaram da data sem ser marcados.`);
      if (proximas.length) f.push(`Até ${App.fmtData(App.somarDias(hoje, 3)).slice(0, 5)}: ${juntar(proximas.slice(0, 3).map(i => `${i.descricao} (${brl(i.valor)})`))}.`);
      frases.push({ tema: 'Finanças', texto: f.join(' ') });
    }

    // Estudo
    const est = [];
    const minOntem = Number(mOntem.estudo_minutos) || 0;
    const semana = Array.from({ length: 7 }, (_, i) => Number(App.diario.meta(App.somarDias(hoje, -i)).estudo_minutos) || 0).reduce((a, b) => a + b, 0);
    if (minOntem) est.push(`Ontem você estudou ${horas(minOntem)}.`);
    if (semana) est.push(`Na semana, ${horas(semana)} cronometradas.`);
    const pend = App.estudo.pendentesDe(ontem);
    if (pend.length) est.push(`Ficaram ${pend.length} item(ns) de estudo pendentes de ontem.`);
    const sim = App.estudo.ultimoSimulado();
    if (sim) est.push(`Último simulado (${App.fmtData(sim.meta.data)}): ${sim.meta.percentual}% de acerto.`);
    if (est.length) frases.push({ tema: 'Estudo', texto: est.join(' ') });

    // Mês
    const agora = new Date();
    const r = App.diario.resumoMes(agora.getFullYear(), agora.getMonth());
    const mes = [`Em ${MESES[agora.getMonth()]}, ${r.geralPct}% dos hábitos cumpridos até agora.`];
    if (agora.getDate() <= 3) {
      const a = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
      const ra = App.diario.resumoMes(a.getFullYear(), a.getMonth());
      const top = ra.porHabito.slice().sort((x, y) => y.pct - x.pct)[0];
      mes.push(`Fechamento de ${MESES[a.getMonth()]}: ${ra.geralPct}% dos hábitos${top ? `, destaque para ${top.nome} (${top.pct}%)` : ''}${ra.estudoMinutos ? ` e ${horas(ra.estudoMinutos)} de estudo` : ''}.`);
    }
    frases.push({ tema: 'Mês', texto: mes.join(' ') });
    return frases;
  }

  // ---------------- carrossel de capas ----------------
  function carrossel(itens, vazio) {
    if (!itens.length) return el('p', { class: 'vazio', text: vazio });
    let i = 0; let timer = null; let pausado = false;
    const palco = el('div', { class: 'carrossel-palco', 'aria-live': 'polite' });
    const mostrar = () => {
      const it = itens[i];
      palco.replaceChildren(el('button', { type: 'button', class: 'carrossel-item', onclick: it.abrir },
        App.catalogo.capa(it.capa, it.titulo, 'capa carrossel-capa'),
        el('span', { class: 'carrossel-texto' }, el('strong', { text: it.titulo }), el('span', { class: 'dica', text: it.sub || '' }),
          itens.length > 1 ? el('span', { class: 'dica', text: `${i + 1} de ${itens.length}` }) : null)));
    };
    const ir = passo => { i = (i + passo + itens.length) % itens.length; mostrar(); };
    const raiz = el('div', { class: 'carrossel', role: 'group', 'aria-roledescription': 'carrossel' },
      palco,
      itens.length > 1 ? el('div', { class: 'carrossel-controles' },
        el('button', { type: 'button', class: 'icone', 'aria-label': 'Anterior', onclick: () => ir(-1) }, App.icone('esquerda')),
        el('button', { type: 'button', class: 'icone', 'aria-label': 'Próximo', onclick: () => ir(1) }, App.icone('direita'))) : null);
    mostrar();
    // Passa sozinho a cada 4 s, menos se a pessoa prefere menos movimento ou está com o mouse/foco nele.
    const semMovimento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (itens.length > 1 && !semMovimento) {
      palco.setAttribute('aria-live', 'off');
      const parar = () => { pausado = true; }; const seguir = () => { pausado = false; };
      raiz.addEventListener('mouseenter', parar); raiz.addEventListener('mouseleave', seguir);
      raiz.addEventListener('focusin', parar); raiz.addEventListener('focusout', seguir);
      timer = setInterval(() => { if (!raiz.isConnected) { clearInterval(timer); return; } if (!pausado && !document.hidden) ir(1); }, 4000);
    }
    return raiz;
  }

  // Próximos compromissos: prazos de tarefas e agenda, juntos e em ordem.
  function proximos() {
    const tarefas = App.tarefas.todas().filter(d => d.meta.status !== 'feita' && d.meta.prazo && App.diasAte(d.meta.prazo) <= 3)
      .map(d => ({ data: String(d.meta.prazo).slice(0, 10), hora: '', titulo: d.meta.titulo || d.nome, abrir: () => App.tarefas.editar(d), tipo: 'tarefa' }));
    const agenda = App.calendario.proximos(3).filter(x => x.tipo !== 'comemorativa')
      .map(x => ({ data: x.data, hora: x.hora || '', titulo: x.titulo, abrir: x.doc ? () => App.calendario.editar(x.doc) : null, tipo: x.tipo }));
    return [...tarefas, ...agenda].sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
  }
  const quando = (iso, hora) => {
    const n = App.diasAte(iso);
    const dia = n < 0 ? 'atrasada' : n === 0 ? 'hoje' : n === 1 ? 'amanhã' : App.fmtData(iso).slice(0, 5);
    return dia + (hora ? ' ' + hora : '');
  };

  function render(container) {
    const hora = new Date().getHours();
    const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
    const frases = briefing();
    const CAT = { filme: 'Filme', serie: 'Série', anime: 'Anime' };
    const emAndamento = [
      ...App.livros.todos().filter(d => d.meta.status === 'lendo').map(d => ({ capa: d.meta.capa, titulo: d.meta.titulo || d.nome, sub: `Lendo · ${d.meta.autor || ''}`.replace(/ · $/, ''), abrir: () => { location.hash = '#/leitura'; } })),
      ...App.entretenimento.todos().filter(d => d.meta.status === 'vendo').map(d => ({ capa: d.meta.capa, titulo: d.meta.titulo || d.nome, sub: `Assistindo · ${CAT[d.meta.categoria] || ''}`.replace(/ · $/, ''), abrir: () => { location.hash = '#/entretenimento'; } })),
    ];
    const lista = proximos().slice(0, 7);
    const fin = App.financeiro.resumo();
    const brl = App.financeiro.brl;
    const areaNivel = el('div', {}, App.gamificacao.cartao());

    container.replaceChildren(
      el('header', { class: 'inicio-topo' },
        el('div', {},
          el('p', { class: 'sobretitulo', text: new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) }),
          el('h1', { text: saudacao + '!' })),
        areaNivel),
      el('section', { class: 'briefing', 'aria-labelledby': 'titulo-briefing' },
        el('header', {}, el('h2', { id: 'titulo-briefing', text: 'Briefing do dia' }),
          App.voz.botaoLeitura(() => `${saudacao}! ${frases.map(f => f.texto).join(' ')}`)),
        el('dl', {}, frases.map(f => el('div', { class: 'briefing-item' }, el('dt', { text: f.tema }), el('dd', { text: f.texto }))))),
      el('div', { class: 'grade-painel' },
        cartao('Check-in de hoje', '#/habitos', App.habitos.checkin(App.hoje(), () => areaNivel.replaceChildren(App.gamificacao.cartao())), 'cartao-checkin'),
        cartao('Próximos dias', '#/calendario', lista.length ? el('ul', { class: 'lista-simples' }, lista.map(x => el('li', {},
          x.abrir ? el('button', { type: 'button', class: 'link', text: x.titulo, onclick: x.abrir }) : el('span', { text: x.titulo }),
          el('span', { class: 'selo ' + (x.tipo === 'tarefa' ? (App.diasAte(x.data) <= 0 ? 'perigo' : 'alerta') : x.tipo === 'feriado' ? 'perigo' : 'info'), text: quando(x.data, x.hora) })))) :
          el('p', { class: 'vazio', text: 'Nada nos próximos 3 dias.' })),
        cartao('Em andamento', null, carrossel(emAndamento, 'Nenhum livro ou série em andamento.')),
        cartao('Finanças', '#/financas', fin.temDados ? el('div', { class: 'mini-financas' },
          el('p', { class: 'numero-grande' }, el('strong', { class: fin.saldoGeral < 0 ? 'negativo' : '', text: brl(fin.saldoGeral) }), ' em caixa'),
          el('p', { class: 'dica', text: `Este mês: +${brl(fin.entradas)} · −${brl(fin.saidas)}` }),
          fin.proximos.length ? el('ul', { class: 'lista-simples' }, fin.proximos.slice(0, 3).map(i => el('li', {},
            el('span', { text: i.descricao }), el('span', { class: 'selo ' + (i.data < App.hoje() ? 'perigo' : 'info'), text: `${brl(i.valor)} · ${quando(i.data)}` })))) : null)
          : el('p', { class: 'vazio', text: 'Comece anotando o que entra e sai na página Finanças.' }))));
  }

  return { render, briefing };
})();
