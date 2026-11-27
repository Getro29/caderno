'use strict';
// Módulo Notas de Estudo: notas por matéria, editor Markdown com pré-visualização e revisão espaçada.
App.notas = (() => {
  const { el } = App;
  const PASTA = 'Notas';
  const INTERVALOS = [1, 3, 7, 14, 30, 60, 120]; // dias até a próxima revisão
  const estado = { materia: '', busca: '', selecionada: null };

  const todas = () => App.store.listar({ pasta: PASTA }).filter(d => !d.meta.tipo || d.meta.tipo === 'nota');
  const titulo = d => d.meta.titulo || d.nome;
  const materiaDe = d => d.meta.materia || d.caminho.split('/').slice(1, -1).join('/') || 'Geral';

  function materias() {
    const cont = {};
    for (const d of todas()) cont[materiaDe(d)] = (cont[materiaDe(d)] || 0) + 1;
    return Object.entries(cont).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  }

  function pastaDaMateria(materia) {
    const nome = String(materia || 'Geral').replace(/[\\/:*?"<>|]/g, '-').trim() || 'Geral';
    return `${PASTA}/${nome}`;
  }

  const paraRevisar = () => todas().filter(d => d.meta.revisar_em && App.diasAte(d.meta.revisar_em) <= 0);

  async function marcarRevisada(doc) {
    const n = Number(doc.meta.revisoes) || 0;
    const meta = { ...doc.meta, revisoes: n + 1, revisar_em: App.somarDias(App.hoje(), INTERVALOS[Math.min(n + 1, INTERVALOS.length - 1)]) };
    const ok = await App.tentar(() => App.store.gravar(doc.caminho, meta, doc.corpo), 'Não foi possível salvar');
    if (ok) {
      App.gamificacao.registrarEvento('nota_revisada', doc.caminho, { revisoes: n + 1 });
      App.toast(`Revisada! Próxima revisão em ${App.fmtData(meta.revisar_em)}.`);
    }
  }

  function editar(doc, inicial = {}, aoSalvar) {
    const m = doc ? doc.meta : inicial;
    const lista = el('datalist', { id: 'lista-materias' }, materias().map(([n]) => el('option', { value: n })));
    const f = {
      titulo: el('input', { type: 'text', value: m.titulo || (doc ? doc.nome : ''), required: true }),
      materia: el('input', { type: 'text', list: 'lista-materias', value: doc ? materiaDe(doc) : (inicial.materia || estado.materia || ''), placeholder: 'ex.: Cálculo' }),
      tags: el('input', { type: 'text', value: App.lista(m.tags).join(', '), placeholder: 'separadas por vírgula' }),
      revisar: el('input', { type: 'date', value: m.revisar_em || (doc ? '' : App.somarDias(App.hoje(), 1)) }),
      corpo: el('textarea', { rows: 16, class: 'editor-md', value: doc ? doc.corpo : (inicial.corpo || '') }),
    };
    const previa = el('div', { class: 'previa md', hidden: true, 'aria-live': 'polite' });
    const botaoPrevia = el('button', {
      type: 'button', class: 'secundario', 'aria-pressed': 'false', text: 'Pré-visualizar',
      onclick: () => {
        const mostrar = previa.hidden;
        if (mostrar) App.markdown.render(previa, f.corpo.value);
        previa.hidden = !mostrar; f.corpo.closest('.campo').hidden = mostrar;
        botaoPrevia.setAttribute('aria-pressed', String(mostrar));
        botaoPrevia.textContent = mostrar ? 'Editar texto' : 'Pré-visualizar';
      },
    });
    const corpo = el('div', { class: 'grade-form' }, lista,
      App.campo('Título', f.titulo, { largo: true }),
      App.campo('Matéria', f.materia),
      App.campo('Revisar em', f.revisar, { voz: false }),
      App.campo('Tags', f.tags, { largo: true }),
      el('div', { class: 'largo barra-editor' }, botaoPrevia,
        el('span', { class: 'dica', text: 'Markdown: # título, **negrito**, - lista, - [ ] tarefa, [[link para nota]]' })),
      App.campo('Conteúdo', f.corpo, { largo: true }),
      el('div', { class: 'largo' }, previa));

    const salvar = async () => {
      const t = f.titulo.value.trim();
      if (!t) { f.titulo.focus(); App.toast('Dê um título à nota.', 'erro'); return; }
      const materia = f.materia.value.trim() || 'Geral';
      const meta = {
        ...(doc ? doc.meta : {}),
        tipo: 'nota', titulo: t, materia, criado: m.criado || App.hoje(), atualizado: App.hoje(),
        revisar_em: f.revisar.value || null, tags: App.tagsDeTexto(f.tags.value),
      };
      const pasta = pastaDaMateria(materia);
      const ok = await App.tentar(async () => {
        if (!doc) {
          const novo = await App.store.criar(pasta, t, meta, f.corpo.value);
          App.gamificacao.registrarEvento('nota_criada', novo.caminho, { materia });
          return novo;
        }
        const pastaAtual = doc.caminho.split('/').slice(0, -1).join('/');
        return pastaAtual === pasta ? App.store.gravar(doc.caminho, meta, f.corpo.value)
          : App.store.mover(doc.caminho, pasta, meta, f.corpo.value);
      }, 'Não foi possível salvar');
      if (ok) { estado.selecionada = ok.caminho; dlg.close(); App.toast('Nota salva.'); aoSalvar?.(ok); }
    };
    const excluir = async () => {
      if (!App.confirmar(`Mover "${titulo(doc)}" para a lixeira?`)) return;
      const ok = await App.tentar(() => App.store.moverParaLixeira(doc.caminho).then(() => true), 'Não foi possível excluir');
      if (ok) { estado.selecionada = null; dlg.close(); App.toast('Nota movida para .lixeira/'); }
    };
    const dlg = App.dialogo(doc ? 'Editar nota' : 'Nova nota', corpo, [
      doc ? el('button', { type: 'button', class: 'perigo', text: 'Excluir', onclick: excluir }) : null,
      el('span', { class: 'espaco' }),
      el('button', { type: 'button', class: 'secundario', text: 'Cancelar', onclick: () => dlg.close() }),
      el('button', { type: 'button', text: 'Salvar', onclick: salvar }),
    ]);
    dlg.classList.add('grande');
    f.titulo.focus();
  }

  function visualizar(doc) {
    if (!doc) return el('div', { class: 'nota-vazia' }, el('p', { text: 'Escolha uma nota na lista ou crie uma nova.' }));
    const m = doc.meta;
    const revisar = m.revisar_em ? App.diasAte(m.revisar_em) : null;
    const conteudo = App.markdown.render(el('div'), doc.corpo);
    return el('article', { class: 'nota' },
      el('header', {},
        el('p', { class: 'sobretitulo', text: materiaDe(doc) }),
        el('h2', { text: titulo(doc) }),
        el('div', { class: 'selos' },
          m.atualizado ? el('span', { class: 'selo', text: 'Atualizada ' + App.fmtData(m.atualizado) }) : null,
          revisar !== null ? el('span', { class: 'selo ' + (revisar <= 0 ? 'alerta' : ''), text: revisar <= 0 ? 'Revisar hoje' : 'Revisar ' + App.fmtData(m.revisar_em) }) : null,
          App.lista(m.tags).map(t => el('span', { class: 'selo tag', text: '#' + t }))),
        el('div', { class: 'acoes' },
          el('button', { type: 'button', text: 'Editar', onclick: () => editar(doc) }),
          App.voz.botaoLeitura(() => `${titulo(doc)}. ${App.markdown.textoPuro(doc.corpo)}`),
          el('button', { type: 'button', class: 'secundario', text: 'Marquei como revisada', onclick: () => marcarRevisada(doc) }))),
      doc.erro ? el('p', { class: 'aviso', text: 'Este arquivo tem um cabeçalho YAML que o Bit-life não entende; ele só pode ser editado no Obsidian.' }) : null,
      conteudo);
  }

  // embutido: desenhada dentro da aba Notas de Estudo (título vira h2).
  function render(container, opcoes = {}) {
    const filtradas = () => {
      const q = estado.busca.trim().toLowerCase();
      return todas()
        .filter(d => !estado.materia || materiaDe(d) === estado.materia)
        .filter(d => !q || [titulo(d), d.corpo, ...App.lista(d.meta.tags)].join(' ').toLowerCase().includes(q))
        .sort((a, b) => String(b.meta.atualizado || '').localeCompare(String(a.meta.atualizado || ''))
          || titulo(a).localeCompare(titulo(b), 'pt-BR'));
    };

    const lista = el('ul', { class: 'lista-notas' });
    const painel = el('div', { class: 'painel-nota' });
    const desenharLista = () => {
      const docs = filtradas();
      lista.replaceChildren(...(docs.length ? docs.map(d => el('li', {},
        el('button', {
          type: 'button', class: 'item-nota', 'aria-current': d.caminho === estado.selecionada ? 'true' : null,
          onclick: () => { estado.selecionada = d.caminho; desenharLista(); painel.replaceChildren(visualizar(d)); },
        }, el('strong', { text: titulo(d) }), el('span', { text: materiaDe(d) }))))
        : [el('li', { class: 'vazio', text: 'Nenhuma nota.' })]));
    };
    desenharLista();
    painel.append(visualizar(estado.selecionada && App.store.obter(estado.selecionada)));

    const chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Matérias' },
      [['', todas().length], ...materias()].map(([n, c]) => el('button', {
        type: 'button', class: 'chip', 'aria-pressed': String(estado.materia === n), text: `${n || 'Todas'} (${c})`,
        onclick: () => { estado.materia = n; render(container, opcoes); },
      })));
    const rev = paraRevisar().length;

    container.replaceChildren(
      el('header', { class: 'cabecalho-tela' },
        el(opcoes.embutido ? 'h2' : 'h1', { text: 'Notas de estudo' }),
        el('button', { type: 'button', text: '+ Nova nota', onclick: () => editar(null) })),
      rev ? el('p', { class: 'aviso suave', text: `${rev} nota(s) para revisar hoje.` }) : '',
      chips,
      el('div', { class: 'duas-colunas' },
        el('div', { class: 'coluna-lista' },
          el('input', {
            type: 'search', placeholder: 'Buscar notas…', 'aria-label': 'Buscar notas', value: estado.busca,
            oninput: e => { estado.busca = e.target.value; desenharLista(); },
          }),
          lista),
        painel));
  }

  return { render, editar, todas, paraRevisar, materiaDe };
})();
