'use strict';
// Módulo Calendário: eventos do usuário (Calendario/*.md), feriados nacionais do Brasil e
// datas comemorativas (calculados aqui, sem internet) e os prazos das tarefas.
App.calendario = (() => {
  const { el } = App;
  const PASTA = 'Calendario';
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const REPETIR = { nao: 'Não repete', semanal: 'Toda semana', mensal: 'Todo mês', anual: 'Todo ano' };
  const hoje0 = new Date();
  const estado = { ano: hoje0.getFullYear(), mes: hoje0.getMonth(), dia: App.hoje(), comemorativas: true };

  // ---- datas do calendário brasileiro ----
  function pascoa(ano) { // algoritmo de Meeus/Jones/Butcher
    const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return App.dataISO(new Date(ano, mes - 1, dia));
  }
  function enesimoDomingo(ano, mes, n) {
    const primeiro = new Date(ano, mes - 1, 1).getDay();
    return App.dataISO(new Date(ano, mes - 1, 1 + ((7 - primeiro) % 7) + 7 * (n - 1)));
  }

  const cacheAno = new Map();
  // tipo: feriado (nacional) | facultativo (ponto facultativo) | comemorativa
  function datasDoAno(ano) {
    if (cacheAno.has(ano)) return cacheAno.get(ano);
    const p = pascoa(ano);
    const d = (mm, dd) => `${ano}-${mm}-${dd}`;
    const lista = [
      [d('01', '01'), 'Confraternização Universal', 'feriado'],
      [App.somarDias(p, -48), 'Carnaval', 'facultativo'],
      [App.somarDias(p, -47), 'Carnaval', 'facultativo'],
      [App.somarDias(p, -46), 'Quarta-feira de Cinzas', 'facultativo'],
      [App.somarDias(p, -2), 'Sexta-feira Santa', 'feriado'],
      [p, 'Páscoa', 'comemorativa'],
      [d('04', '21'), 'Tiradentes', 'feriado'],
      [d('05', '01'), 'Dia do Trabalho', 'feriado'],
      [App.somarDias(p, 60), 'Corpus Christi', 'facultativo'],
      [d('09', '07'), 'Independência do Brasil', 'feriado'],
      [d('10', '12'), 'Nossa Senhora Aparecida', 'feriado'],
      [d('11', '02'), 'Finados', 'feriado'],
      [d('11', '15'), 'Proclamação da República', 'feriado'],
      [d('12', '25'), 'Natal', 'feriado'],
      [d('03', '08'), 'Dia Internacional da Mulher', 'comemorativa'],
      [enesimoDomingo(ano, 5, 2), 'Dia das Mães', 'comemorativa'],
      [d('06', '12'), 'Dia dos Namorados', 'comemorativa'],
      [enesimoDomingo(ano, 8, 2), 'Dia dos Pais', 'comemorativa'],
      [d('10', '12'), 'Dia das Crianças', 'comemorativa'],
      [d('10', '15'), 'Dia do Professor', 'comemorativa'],
      [d('12', '24'), 'Véspera de Natal', 'comemorativa'],
      [d('12', '31'), 'Véspera de Ano-Novo', 'comemorativa'],
    ];
    // Consciência Negra é feriado nacional desde 2024 (Lei 14.759/2023).
    lista.push([d('11', '20'), 'Dia Nacional de Zumbi e da Consciência Negra', ano >= 2024 ? 'feriado' : 'comemorativa']);
    const mapa = new Map();
    for (const [data, nome, tipo] of lista) (mapa.get(data) || mapa.set(data, []).get(data)).push({ nome, tipo });
    cacheAno.set(ano, mapa);
    return mapa;
  }
  const datasDoDia = iso => (datasDoAno(Number(iso.slice(0, 4))).get(iso) || [])
    .filter(x => estado.comemorativas || x.tipo !== 'comemorativa');

  // ---- eventos do usuário ----
  const eventos = () => App.store.listar({ pasta: PASTA, tipo: 'evento' });
  const dataValida = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').slice(0, 10));
  const diaDaSemana = iso => { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d).getDay(); };

  function ocorre(ev, iso) {
    const base = String(ev.meta.data || '').slice(0, 10);
    if (!dataValida(base) || base > iso) return false;
    switch (ev.meta.repetir) {
      case 'semanal': return diaDaSemana(base) === diaDaSemana(iso);
      case 'mensal': return base.slice(8) === iso.slice(8);
      case 'anual': return base.slice(5) === iso.slice(5);
      default: return base === iso;
    }
  }
  const eventosDoDia = iso => eventos().filter(e => ocorre(e, iso))
    .sort((a, b) => String(a.meta.hora || '99').localeCompare(String(b.meta.hora || '99')));
  const prazosDoDia = iso => App.tarefas.todas().filter(t => t.meta.status !== 'feita' && String(t.meta.prazo || '').slice(0, 10) === iso);

  // Próximos dias com algo marcado (usado pelo Início).
  function proximos(dias = 7) {
    const out = [];
    for (let i = 0; i < dias; i++) {
      const iso = App.somarDias(App.hoje(), i);
      for (const f of datasDoDia(iso).filter(x => x.tipo !== 'comemorativa')) out.push({ data: iso, titulo: f.nome, tipo: f.tipo });
      for (const e of eventosDoDia(iso)) out.push({ data: iso, titulo: e.meta.titulo || e.nome, hora: e.meta.hora, tipo: 'evento', doc: e });
    }
    return out;
  }

  const ROTULO_TIPO = { feriado: 'Feriado nacional', facultativo: 'Ponto facultativo', comemorativa: 'Data comemorativa' };
  const fmtLongo = iso => {
    const [a, m, d] = iso.split('-').map(Number);
    return new Date(a, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };
  const maiuscula = t => t.charAt(0).toUpperCase() + t.slice(1);
  const horario = m => (m.hora ? m.hora + (m.hora_fim ? '–' + m.hora_fim : '') : 'Dia inteiro');

  // ---- edição ----
  function editar(doc, dataInicial) {
    const m = doc ? doc.meta : { data: dataInicial || estado.dia, repetir: 'nao' };
    const f = {
      titulo: el('input', { type: 'text', value: m.titulo || (doc ? doc.nome : ''), required: true }),
      data: el('input', { type: 'date', value: String(m.data || '').slice(0, 10), required: true }),
      hora: el('input', { type: 'time', value: m.hora || '' }),
      hora_fim: el('input', { type: 'time', value: m.hora_fim || '' }),
      repetir: el('select', {}, Object.entries(REPETIR).map(([v, r]) => el('option', { value: v, selected: v === (m.repetir || 'nao'), text: r }))),
      local: el('input', { type: 'text', value: m.local || '' }),
      tags: el('input', { type: 'text', value: App.lista(m.tags).join(', '), placeholder: 'ex.: aniversário, faculdade' }),
      descricao: el('textarea', { rows: 5, class: 'editor-md', value: doc ? doc.corpo : '' }),
    };
    const corpo = el('div', { class: 'grade-form' },
      App.campo('Título', f.titulo, { largo: true }),
      App.campo('Data', f.data, { voz: false }),
      App.campo('Começa às (vazio = dia inteiro)', f.hora, { voz: false }),
      App.campo('Termina às', f.hora_fim, { voz: false }),
      App.campo('Repetir', f.repetir, { voz: false }),
      App.campo('Local', f.local, { largo: true }),
      App.campo('Tags', f.tags, { largo: true }),
      App.campo('Descrição (Markdown)', f.descricao, { largo: true }));

    const salvar = async () => {
      const t = f.titulo.value.trim();
      if (!t) { f.titulo.focus(); App.toast('Dê um título ao evento.', 'erro'); return; }
      if (!f.data.value) { f.data.focus(); App.toast('Escolha a data.', 'erro'); return; }
      const meta = {
        ...(doc ? doc.meta : {}),
        tipo: 'evento', titulo: t, data: f.data.value, hora: f.hora.value || null, hora_fim: f.hora_fim.value || null,
        repetir: f.repetir.value, local: f.local.value.trim() || null, tags: App.tagsDeTexto(f.tags.value),
        criado: m.criado || App.hoje(),
      };
      const ok = await App.tentar(async () => {
        const s = doc ? await App.store.gravar(doc.caminho, meta, f.descricao.value)
          : await App.store.criar(PASTA, `${meta.data}-${t}`, meta, f.descricao.value);
        if (!doc) App.gamificacao.registrarEvento('evento_criado', s.caminho);
        return s;
      }, 'Não foi possível salvar');
      if (ok) {
        estado.dia = meta.data; estado.ano = Number(meta.data.slice(0, 4)); estado.mes = Number(meta.data.slice(5, 7)) - 1;
        dlg.close(); App.toast('Evento salvo.');
      }
    };
    const excluir = async () => {
      if (!App.confirmar(`Mover "${m.titulo}" para a lixeira?`)) return;
      const ok = await App.tentar(() => App.store.moverParaLixeira(doc.caminho).then(() => true), 'Não foi possível excluir');
      if (ok) { dlg.close(); App.toast('Evento movido para .lixeira/'); }
    };
    const dlg = App.dialogo(doc ? 'Editar evento' : 'Novo evento', corpo, [
      doc ? el('button', { type: 'button', class: 'perigo', text: 'Excluir', onclick: excluir }) : null,
      el('span', { class: 'espaco' }),
      el('button', { type: 'button', class: 'secundario', text: 'Cancelar', onclick: () => dlg.close() }),
      el('button', { type: 'button', text: 'Salvar', onclick: salvar }),
    ]);
    f.titulo.focus();
  }

  // ---- tela ----
  function painelDia(iso) {
    const datas = datasDoDia(iso);
    const evs = eventosDoDia(iso);
    const prazos = prazosDoDia(iso);
    const vazio = !datas.length && !evs.length && !prazos.length;
    return el('section', { class: 'painel-dia', 'aria-live': 'polite' },
      el('header', {},
        el('h2', { text: maiuscula(fmtLongo(iso)) }),
        el('button', { type: 'button', onclick: () => editar(null, iso) }, App.icone('mais'), ' Evento neste dia')),
      vazio ? el('p', { class: 'vazio', text: 'Nada marcado.' }) : null,
      el('ul', { class: 'lista-simples' },
        datas.map(x => el('li', {}, el('span', { text: x.nome }), el('span', { class: 'selo ' + (x.tipo === 'feriado' ? 'perigo' : x.tipo === 'facultativo' ? 'alerta' : 'tag'), text: ROTULO_TIPO[x.tipo] }))),
        evs.map(e => el('li', {},
          el('button', { type: 'button', class: 'link', text: e.meta.titulo || e.nome, onclick: () => editar(e) }),
          el('span', { class: 'dica', text: [horario(e.meta), e.meta.local, e.meta.repetir && e.meta.repetir !== 'nao' ? REPETIR[e.meta.repetir].toLowerCase() : null].filter(Boolean).join(' · ') }))),
        prazos.map(t => el('li', {},
          el('button', { type: 'button', class: 'link', text: t.meta.titulo || t.nome, onclick: () => App.tarefas.editar(t) }),
          el('span', { class: 'selo info', text: 'Prazo de tarefa' })))));
  }

  function grade(container) {
    const { ano, mes } = estado;
    const primeiro = new Date(ano, mes, 1);
    const inicio = App.somarDias(App.dataISO(primeiro), -primeiro.getDay());
    const hoje = App.hoje();
    const linhas = [];
    for (let s = 0; s < 6; s++) {
      const celulas = [];
      for (let d = 0; d < 7; d++) {
        const iso = App.somarDias(inicio, s * 7 + d);
        const fora = Number(iso.slice(5, 7)) - 1 !== mes;
        const datas = datasDoDia(iso);
        const evs = eventosDoDia(iso);
        const prazos = prazosDoDia(iso);
        const feriado = datas.find(x => x.tipo === 'feriado');
        const marcas = [
          ...datas.map(x => el('span', { class: 'marca-dia ' + x.tipo, text: x.nome })),
          ...evs.slice(0, 3).map(e => el('span', { class: 'marca-dia evento', text: (e.meta.hora ? e.meta.hora + ' ' : '') + (e.meta.titulo || e.nome) })),
          evs.length > 3 ? el('span', { class: 'marca-dia mais', text: `+${evs.length - 3}` }) : null,
          prazos.length ? el('span', { class: 'marca-dia prazo', text: prazos.length === 1 ? 'Prazo: ' + (prazos[0].meta.titulo || prazos[0].nome) : `${prazos.length} prazos` }) : null,
        ];
        const partes = [fmtLongo(iso), ...datas.map(x => x.nome), evs.length ? `${evs.length} evento(s)` : '', prazos.length ? `${prazos.length} prazo(s)` : ''].filter(Boolean);
        celulas.push(el('td', { class: [fora ? 'fora' : '', iso === hoje ? 'hoje' : '', feriado ? 'feriado' : '', iso === estado.dia ? 'selecionado' : ''].join(' ').trim() || null },
          el('button', {
            type: 'button', class: 'dia', 'data-dia': iso, 'aria-label': partes.join(', '),
            'aria-pressed': String(iso === estado.dia), tabindex: iso === estado.dia ? '0' : '-1',
            onclick: () => { estado.dia = iso; if (fora) { estado.ano = Number(iso.slice(0, 4)); estado.mes = Number(iso.slice(5, 7)) - 1; } render(container); focarDia(container); },
          }, el('span', { class: 'numero-dia', 'aria-hidden': 'true', text: Number(iso.slice(8)) }), el('span', { class: 'marcas', 'aria-hidden': 'true' }, marcas))));
      }
      linhas.push(el('tr', {}, celulas));
    }
    const tabela = el('table', { class: 'mes' },
      el('caption', { class: 'sr', text: `${MESES[mes]} de ${ano}` }),
      el('thead', {}, el('tr', {}, SEMANA.map(s => el('th', { scope: 'col', text: s })))),
      el('tbody', {}, linhas));
    // Setas do teclado movem o dia selecionado; Enter abre um evento novo nesse dia.
    tabela.addEventListener('keydown', e => {
      const passo = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      if (!passo) return;
      e.preventDefault();
      irPara(App.somarDias(estado.dia, passo), container);
    });
    return tabela;
  }

  function focarDia(container) { container.querySelector(`button.dia[data-dia="${estado.dia}"]`)?.focus(); }
  function irPara(iso, container) {
    estado.dia = iso; estado.ano = Number(iso.slice(0, 4)); estado.mes = Number(iso.slice(5, 7)) - 1;
    render(container); focarDia(container);
  }
  function mudarMes(delta, container) {
    const d = new Date(estado.ano, estado.mes + delta, 1);
    estado.ano = d.getFullYear(); estado.mes = d.getMonth();
    estado.dia = App.dataISO(d);
    render(container);
  }

  function feriadosDoAno() {
    const lista = [...datasDoAno(estado.ano).entries()].sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([iso, xs]) => xs.filter(x => x.tipo !== 'comemorativa').map(x => ({ iso, ...x })));
    return el('details', { class: 'feriados-ano' },
      el('summary', { text: `Feriados e pontos facultativos de ${estado.ano}` }),
      el('ul', { class: 'lista-simples' }, lista.map(x => el('li', {},
        el('span', { text: `${App.fmtData(x.iso).slice(0, 5)} · ${x.nome}` }),
        el('span', { class: 'selo ' + (x.tipo === 'feriado' ? 'perigo' : 'alerta'), text: ROTULO_TIPO[x.tipo] })))),
      el('p', { class: 'dica', text: 'Feriados estaduais e municipais variam por cidade: adicione-os como eventos que se repetem todo ano.' }));
  }

  function render(container) {
    const caixa = el('input', { type: 'checkbox', id: 'cal-comemorativas', checked: estado.comemorativas,
      onchange: e => { estado.comemorativas = e.target.checked; render(container); } });
    container.replaceChildren(
      el('header', { class: 'cabecalho-tela' },
        el('h1', { text: 'Calendário' }),
        el('button', { type: 'button', text: '+ Novo evento', onclick: () => editar(null) })),
      el('div', { class: 'barra' },
        el('button', { type: 'button', class: 'secundario', 'aria-label': 'Mês anterior', onclick: () => mudarMes(-1, container) }, App.icone('esquerda')),
        el('h2', { class: 'titulo-mes', 'aria-live': 'polite', text: `${maiuscula(MESES[estado.mes])} de ${estado.ano}` }),
        el('button', { type: 'button', class: 'secundario', 'aria-label': 'Próximo mês', onclick: () => mudarMes(1, container) }, App.icone('direita')),
        el('button', { type: 'button', class: 'secundario', text: 'Hoje', onclick: () => irPara(App.hoje(), container) }),
        el('span', { class: 'espaco' }),
        el('label', { class: 'opcao', for: 'cal-comemorativas' }, caixa, ' Mostrar datas comemorativas')),
      el('div', { class: 'legenda', 'aria-hidden': 'true' },
        el('span', { class: 'marca-dia feriado', text: 'Feriado' }), el('span', { class: 'marca-dia facultativo', text: 'Ponto facultativo' }),
        el('span', { class: 'marca-dia comemorativa', text: 'Comemorativa' }), el('span', { class: 'marca-dia evento', text: 'Seu evento' }),
        el('span', { class: 'marca-dia prazo', text: 'Prazo de tarefa' })),
      el('div', { class: 'calendario' }, el('div', { class: 'rolagem-mes' }, grade(container)), painelDia(estado.dia)),
      feriadosDoAno());
  }

  return { render, editar, eventos, proximos, datasDoAno, pascoa };
})();
