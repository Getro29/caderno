'use strict';
// Módulo Tarefas e Prazos.
App.tarefas = (() => {
  const { el } = App;
  const PASTA = 'Tarefas';
  const STATUS = { 'a-fazer': 'A fazer', fazendo: 'Fazendo', feita: 'Feita' };
  const PRIORIDADE = { baixa: 'Baixa', media: 'Média', alta: 'Alta' };
  const estado = { visao: 'lista', filtro: 'abertas', busca: '' };

  const todas = () => App.store.listar({ pasta: PASTA, tipo: 'tarefa' });
  const titulo = d => d.meta.titulo || d.nome;

  function ordenar(a, b) {
    const pa = a.meta.prazo || '9999', pb = b.meta.prazo || '9999';
    if (pa !== pb) return pa < pb ? -1 : 1;
    const peso = { alta: 0, media: 1, baixa: 2 };
    return (peso[a.meta.prioridade] ?? 1) - (peso[b.meta.prioridade] ?? 1);
  }

  async function mudarStatus(doc, status) {
    const meta = { ...doc.meta, status };
    if (status === 'feita' && doc.meta.status !== 'feita') {
      meta.concluido = App.hoje();
      App.gamificacao.registrarEvento('tarefa_concluida', doc.caminho, {
        prioridade: meta.prioridade, no_prazo: !meta.prazo || App.diasAte(meta.prazo) >= 0,
      });
    } else if (status !== 'feita') meta.concluido = null;
    await App.tentar(() => App.store.gravar(doc.caminho, meta, doc.corpo), 'Não foi possível salvar');
  }

  function selo(texto, classe) { return el('span', { class: 'selo ' + (classe || ''), text: texto }); }

  function selosPrazo(doc) {
    const m = doc.meta; const out = [];
    if (m.prazo && m.status !== 'feita') {
      const n = App.diasAte(m.prazo);
      out.push(selo(App.descreverPrazo(m.prazo), n < 0 ? 'perigo' : n <= 1 ? 'alerta' : ''));
    }
    if (m.prioridade === 'alta') out.push(selo('Alta', 'perigo'));
    if (m.area) out.push(selo(m.area));
    for (const t of App.lista(m.tags)) out.push(selo('#' + t, 'tag'));
    return out;
  }

  function item(doc) {
    const feita = doc.meta.status === 'feita';
    const id = 'chk-' + App.slug(doc.caminho);
    return el('li', { class: 'tarefa' + (feita ? ' feita' : '') },
      el('input', { type: 'checkbox', id, checked: feita, onchange: e => mudarStatus(doc, e.target.checked ? 'feita' : 'a-fazer') }),
      el('div', { class: 'tarefa-info' },
        el('label', { for: id, class: 'tarefa-titulo', text: titulo(doc) }),
        el('div', { class: 'selos' }, doc.meta.status === 'fazendo' ? selo('Fazendo', 'info') : null, selosPrazo(doc))),
      el('button', { type: 'button', class: 'icone', 'aria-label': 'Editar ' + titulo(doc), onclick: () => editar(doc) }, App.icone('lapis')));
  }

  function grupos(docs) {
    const g = [['Atrasadas', []], ['Hoje', []], ['Próximos 7 dias', []], ['Depois', []], ['Sem prazo', []], ['Concluídas', []]];
    for (const d of docs) {
      if (d.meta.status === 'feita') { g[5][1].push(d); continue; }
      const n = App.diasAte(d.meta.prazo);
      g[n === null ? 4 : n < 0 ? 0 : n === 0 ? 1 : n <= 7 ? 2 : 3][1].push(d);
    }
    g[5][1].sort((a, b) => String(b.meta.concluido || '').localeCompare(String(a.meta.concluido || '')));
    return g.filter(([, l]) => l.length);
  }

  function filtrar() {
    const q = estado.busca.trim().toLowerCase();
    return todas().filter(d => {
      if (estado.filtro === 'abertas' && d.meta.status === 'feita') return false;
      if (estado.filtro === 'feitas' && d.meta.status !== 'feita') return false;
      if (!q) return true;
      return [titulo(d), d.corpo, d.meta.area, ...App.lista(d.meta.tags)].join(' ').toLowerCase().includes(q);
    }).sort(ordenar);
  }

  function vistaLista(docs) {
    if (!docs.length) return el('p', { class: 'vazio', text: 'Nenhuma tarefa por aqui.' });
    return el('div', {}, grupos(docs).map(([nome, l]) => el('section', { class: 'grupo' },
      el('h3', {}, nome, ' ', el('span', { class: 'contador', text: l.length })),
      el('ul', { class: 'lista-tarefas' }, l.map(item)))));
  }

  function vistaQuadro(docs) {
    const ordem = Object.keys(STATUS);
    return el('div', { class: 'quadro' }, ordem.map((s, i) => {
      const l = docs.filter(d => (d.meta.status || 'a-fazer') === s);
      return el('section', { class: 'coluna', 'aria-label': STATUS[s] },
        el('h3', {}, STATUS[s], ' ', el('span', { class: 'contador', text: l.length })),
        el('ul', {}, l.map(d => el('li', { class: 'cartao' },
          el('button', { type: 'button', class: 'cartao-titulo', text: titulo(d), onclick: () => editar(d) }),
          el('div', { class: 'selos' }, selosPrazo(d)),
          el('div', { class: 'cartao-acoes' },
            i > 0 ? el('button', { type: 'button', class: 'icone', 'aria-label': `Mover para ${STATUS[ordem[i - 1]]}`, onclick: () => mudarStatus(d, ordem[i - 1]) }, App.icone('esquerda')) : null,
            i < ordem.length - 1 ? el('button', { type: 'button', class: 'icone', 'aria-label': `Mover para ${STATUS[ordem[i + 1]]}`, onclick: () => mudarStatus(d, ordem[i + 1]) }, App.icone('direita')) : null)))));
    }));
  }

  function opcoes(mapa, atual) {
    return Object.entries(mapa).map(([v, r]) => el('option', { value: v, selected: v === atual, text: r }));
  }

  function editar(doc, inicial = {}, aoSalvar) {
    const m = doc ? doc.meta : { status: 'a-fazer', prioridade: 'media', ...inicial };
    const f = {
      titulo: el('input', { type: 'text', value: m.titulo || (doc ? doc.nome : ''), required: true }),
      descricao: el('textarea', { rows: 5, value: doc ? doc.corpo : (inicial.corpo || '') }),
      status: el('select', {}, opcoes(STATUS, m.status || 'a-fazer')),
      prioridade: el('select', {}, opcoes(PRIORIDADE, m.prioridade || 'media')),
      prazo: el('input', { type: 'date', value: m.prazo || '' }),
      area: el('input', { type: 'text', value: m.area || '', placeholder: 'ex.: faculdade, trabalho' }),
      tags: el('input', { type: 'text', value: App.lista(m.tags).join(', '), placeholder: 'separadas por vírgula' }),
    };
    const corpo = el('div', { class: 'grade-form' },
      App.campo('Título', f.titulo, { largo: true }),
      App.campo('Status', f.status, { voz: false }),
      App.campo('Prioridade', f.prioridade, { voz: false }),
      App.campo('Prazo', f.prazo, { voz: false }),
      App.campo('Área', f.area),
      App.campo('Tags', f.tags, { largo: true }),
      App.campo('Descrição (Markdown)', f.descricao, { largo: true }));

    const salvar = async () => {
      const t = f.titulo.value.trim();
      if (!t) { f.titulo.focus(); App.toast('Dê um título à tarefa.', 'erro'); return; }
      const meta = {
        ...(doc ? doc.meta : {}),
        tipo: 'tarefa', titulo: t, status: f.status.value, prioridade: f.prioridade.value,
        prazo: f.prazo.value || null, criado: m.criado || App.hoje(),
        concluido: m.concluido ?? null, area: f.area.value.trim() || null, tags: App.tagsDeTexto(f.tags.value),
      };
      const virouFeita = meta.status === 'feita' && m.status !== 'feita';
      if (virouFeita) meta.concluido = App.hoje();
      if (meta.status !== 'feita') meta.concluido = null;
      const ok = await App.tentar(async () => {
        const salvo = doc ? await App.store.gravar(doc.caminho, meta, f.descricao.value)
          : await App.store.criar(PASTA, t, meta, f.descricao.value);
        if (virouFeita) App.gamificacao.registrarEvento('tarefa_concluida', salvo.caminho, { prioridade: meta.prioridade });
        return salvo;
      }, 'Não foi possível salvar');
      if (ok) { dlg.close(); App.toast('Tarefa salva.'); aoSalvar?.(ok); }
    };
    const excluir = async () => {
      if (!App.confirmar(`Mover "${titulo(doc)}" para a lixeira?`)) return;
      const ok = await App.tentar(() => App.store.moverParaLixeira(doc.caminho).then(() => true), 'Não foi possível excluir');
      if (ok) { dlg.close(); App.toast('Tarefa movida para .lixeira/'); }
    };
    const dlg = App.dialogo(doc ? 'Editar tarefa' : 'Nova tarefa', corpo, [
      doc ? el('button', { type: 'button', class: 'perigo', text: 'Excluir', onclick: excluir }) : null,
      el('span', { class: 'espaco' }),
      el('button', { type: 'button', class: 'secundario', text: 'Cancelar', onclick: () => dlg.close() }),
      el('button', { type: 'button', text: 'Salvar', onclick: salvar }),
    ]);
    f.titulo.focus();
  }

  function render(container) {
    const docs = filtrar();
    const busca = el('input', {
      type: 'search', placeholder: 'Buscar tarefas…', 'aria-label': 'Buscar tarefas', value: estado.busca,
      oninput: e => { estado.busca = e.target.value; atualizar(); },
    });
    const filtro = el('select', { 'aria-label': 'Filtrar', onchange: e => { estado.filtro = e.target.value; atualizar(); } },
      opcoes({ abertas: 'Abertas', todas: 'Todas', feitas: 'Concluídas' }, estado.filtro));
    const visao = el('div', { class: 'alternador', role: 'group', 'aria-label': 'Visualização' },
      ['lista', 'quadro'].map(v => el('button', {
        type: 'button', 'aria-pressed': String(estado.visao === v), text: v === 'lista' ? 'Lista' : 'Quadro',
        onclick: () => { estado.visao = v; render(container); },
      })));
    const area = el('div', { class: 'conteudo-tarefas' });
    const atualizar = () => area.replaceChildren(estado.visao === 'lista' ? vistaLista(filtrar()) : vistaQuadro(filtrar()));

    container.replaceChildren(
      el('header', { class: 'cabecalho-tela' },
        el('h1', { text: 'Tarefas e prazos' }),
        el('button', { type: 'button', text: '+ Nova tarefa', onclick: () => editar(null) })),
      el('div', { class: 'tarefas-layout' },
        el('div', { class: 'tarefas-principal' },
          App.entrada.secao(),
          el('section', { 'aria-labelledby': 'titulo-tarefas' },
            el('h2', { id: 'titulo-tarefas', class: 'sr', text: 'Tarefas' }),
            el('div', { class: 'barra' }, busca, filtro, visao),
            area)),
        el('aside', { class: 'tarefas-lateral' }, App.timebox.componente('dia'))));
    area.append(estado.visao === 'lista' ? vistaLista(docs) : vistaQuadro(docs));
  }

  return { render, editar, todas, STATUS };
})();
