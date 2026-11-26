'use strict';
// Módulo Livros e Resenhas. A resenha é o corpo Markdown do arquivo.
App.livros = (() => {
  const { el } = App;
  const PASTA = 'Livros';
  const STATUS = { lendo: 'Lendo', 'quero-ler': 'Quero ler', lido: 'Lidos' };
  const estado = { aba: 'lendo', busca: '' };

  const todos = () => App.store.listar({ pasta: PASTA, tipo: 'livro' });
  const titulo = d => d.meta.titulo || d.nome;
  const estrelas = n => { const v = Math.max(0, Math.min(5, Math.round(Number(n) || 0))); return '★'.repeat(v) + '☆'.repeat(5 - v); };

  function editar(doc) {
    const m = doc ? doc.meta : { status: estado.aba };
    const f = {
      titulo: el('input', { type: 'text', value: m.titulo || (doc ? doc.nome : ''), required: true }),
      autor: el('input', { type: 'text', value: m.autor || '' }),
      status: el('select', {}, Object.entries({ 'quero-ler': 'Quero ler', lendo: 'Lendo', lido: 'Lido' })
        .map(([v, r]) => el('option', { value: v, selected: v === (m.status || 'quero-ler'), text: r }))),
      nota: el('select', {}, [0, 1, 2, 3, 4, 5].map(n => el('option', { value: n, selected: Number(m.nota || 0) === n, text: n ? estrelas(n) : 'Sem nota' }))),
      paginas: el('input', { type: 'number', min: 0, value: m.paginas ?? '' }),
      inicio: el('input', { type: 'date', value: m.inicio || '' }),
      fim: el('input', { type: 'date', value: m.fim || '' }),
      tags: el('input', { type: 'text', value: App.lista(m.tags).join(', '), placeholder: 'ex.: ficção, filosofia' }),
      resenha: el('textarea', { rows: 12, class: 'editor-md', value: doc ? doc.corpo : '' }),
    };
    const corpo = el('div', { class: 'grade-form' },
      App.campo('Título', f.titulo, { largo: true }),
      App.campo('Autor(a)', f.autor),
      App.campo('Status', f.status, { voz: false }),
      App.campo('Nota', f.nota, { voz: false }),
      App.campo('Páginas', f.paginas, { voz: false }),
      App.campo('Comecei em', f.inicio, { voz: false }),
      App.campo('Terminei em', f.fim, { voz: false }),
      App.campo('Tags', f.tags, { largo: true }),
      App.campo('Resenha (Markdown)', f.resenha, { largo: true }));

    const salvar = async () => {
      const t = f.titulo.value.trim();
      if (!t) { f.titulo.focus(); App.toast('Dê um título ao livro.', 'erro'); return; }
      const status = f.status.value;
      const meta = {
        ...(doc ? doc.meta : {}),
        tipo: 'livro', titulo: t, autor: f.autor.value.trim() || null, status,
        nota: Number(f.nota.value) || null, paginas: f.paginas.value ? Number(f.paginas.value) : null,
        inicio: f.inicio.value || (status === 'lendo' && !m.inicio ? App.hoje() : null),
        fim: f.fim.value || (status === 'lido' ? App.hoje() : null),
        tags: App.tagsDeTexto(f.tags.value),
      };
      const terminou = status === 'lido' && m.status !== 'lido';
      const primeiraResenha = !(doc?.corpo || '').trim() && f.resenha.value.trim();
      const ok = await App.tentar(async () => {
        const s = doc ? await App.store.gravar(doc.caminho, meta, f.resenha.value)
          : await App.store.criar(PASTA, t, meta, f.resenha.value);
        if (terminou) App.gamificacao.registrarEvento('livro_lido', s.caminho, { paginas: meta.paginas });
        if (primeiraResenha) App.gamificacao.registrarEvento('resenha_escrita', s.caminho);
        return s;
      }, 'Não foi possível salvar');
      if (ok) { estado.aba = status; dlg.close(); App.toast('Livro salvo.'); }
    };
    const excluir = async () => {
      if (!App.confirmar(`Mover "${titulo(doc)}" para a lixeira?`)) return;
      const ok = await App.tentar(() => App.store.moverParaLixeira(doc.caminho).then(() => true), 'Não foi possível excluir');
      if (ok) { dlg.close(); App.toast('Livro movido para .lixeira/'); }
    };
    const dlg = App.dialogo(doc ? 'Editar livro' : 'Novo livro', corpo, [
      doc ? el('button', { type: 'button', class: 'perigo', text: 'Excluir', onclick: excluir }) : null,
      el('span', { class: 'espaco' }),
      el('button', { type: 'button', class: 'secundario', text: 'Cancelar', onclick: () => dlg.close() }),
      el('button', { type: 'button', text: 'Salvar', onclick: salvar }),
    ]);
    dlg.classList.add('grande');
    f.titulo.focus();
  }

  function ver(doc) {
    const m = doc.meta;
    const resenha = App.markdown.render(el('div'), doc.corpo || '_Sem resenha ainda._');
    const dlg = App.dialogo(titulo(doc), el('article', { class: 'livro-detalhe' },
      el('p', { class: 'sobretitulo', text: m.autor || 'Autor desconhecido' }),
      el('p', { class: 'estrelas', 'aria-label': `Nota ${m.nota || 0} de 5`, text: estrelas(m.nota) }),
      el('div', { class: 'selos' },
        m.paginas ? el('span', { class: 'selo', text: `${m.paginas} páginas` }) : null,
        m.inicio ? el('span', { class: 'selo', text: 'Início ' + App.fmtData(m.inicio) }) : null,
        m.fim ? el('span', { class: 'selo', text: 'Fim ' + App.fmtData(m.fim) }) : null,
        App.lista(m.tags).map(t => el('span', { class: 'selo tag', text: '#' + t }))),
      el('h3', { text: 'Resenha' }), resenha), [
      App.voz.botaoLeitura(() => `${titulo(doc)}${m.autor ? ', de ' + m.autor : ''}. ${App.markdown.textoPuro(doc.corpo)}`),
      el('span', { class: 'espaco' }),
      el('button', { type: 'button', text: 'Editar', onclick: () => { dlg.close(); editar(doc); } }),
    ]);
  }

  function cartao(d) {
    const m = d.meta;
    return el('li', {},
      el('button', { type: 'button', class: 'livro', onclick: () => ver(d) },
        el('span', { class: 'capa', 'aria-hidden': 'true', text: titulo(d).slice(0, 1).toUpperCase() }),
        el('strong', { text: titulo(d) }),
        el('span', { class: 'autor', text: m.autor || '' }),
        m.status === 'lido' ? el('span', { class: 'estrelas', 'aria-label': `Nota ${m.nota || 0} de 5`, text: estrelas(m.nota) }) : null,
        m.status === 'lido' && !String(d.corpo || '').trim() ? el('span', { class: 'selo alerta', text: 'sem resenha' }) : null));
  }

  function render(container) {
    const todosDocs = todos();
    const grade = el('ul', { class: 'estante' });
    const desenhar = () => {
      const q = estado.busca.trim().toLowerCase();
      const docs = todosDocs.filter(d => (d.meta.status || 'quero-ler') === estado.aba)
        .filter(d => !q || [titulo(d), d.meta.autor, d.corpo, ...App.lista(d.meta.tags)].join(' ').toLowerCase().includes(q))
        .sort((a, b) => String(b.meta.fim || b.meta.inicio || '').localeCompare(String(a.meta.fim || a.meta.inicio || '')) || titulo(a).localeCompare(titulo(b), 'pt-BR'));
      grade.replaceChildren(...(docs.length ? docs.map(cartao) : [el('li', { class: 'vazio', text: 'Nenhum livro nesta estante.' })]));
    };
    desenhar();
    const anoAtual = String(new Date().getFullYear());
    const lidosAno = todosDocs.filter(d => d.meta.status === 'lido' && String(d.meta.fim || '').startsWith(anoAtual)).length;

    container.replaceChildren(
      el('header', { class: 'cabecalho-tela' },
        el('h1', { text: 'Livros' }),
        el('button', { type: 'button', text: '+ Novo livro', onclick: () => editar(null) })),
      el('p', { class: 'resumo', text: `${lidosAno} livro(s) lido(s) em ${anoAtual}.` }),
      el('div', { class: 'barra' },
        el('div', { class: 'alternador', role: 'group', 'aria-label': 'Estante' },
          Object.entries(STATUS).map(([v, r]) => el('button', {
            type: 'button', 'aria-pressed': String(estado.aba === v),
            text: `${r} (${todosDocs.filter(d => (d.meta.status || 'quero-ler') === v).length})`,
            onclick: () => { estado.aba = v; render(container); },
          }))),
        el('input', { type: 'search', placeholder: 'Buscar livros…', 'aria-label': 'Buscar livros', value: estado.busca,
          oninput: e => { estado.busca = e.target.value; desenhar(); } })),
      grade);
  }

  return { render, editar, todos };
})();
