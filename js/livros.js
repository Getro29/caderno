'use strict';
// Módulo Leitura (livros e resenhas). A resenha é o corpo Markdown do arquivo.
// Os arquivos continuam em Livros/ com tipo: livro.
App.livros = (() => {
  const { el } = App;
  const PASTA = 'Livros';
  const STATUS = { lendo: 'Lendo', 'quero-ler': 'Quero ler', lido: 'Lidos' };
  const estado = { aba: 'lendo', busca: '' };

  const todos = () => App.store.listar({ pasta: PASTA, tipo: 'livro' });
  const titulo = d => d.meta.titulo || d.nome;
  const estrelas = App.estrelas;
  const numero = v => (v === '' || v == null ? null : Number(v) || null);

  const metaBase = m => ({
    tipo: 'livro', titulo: m.titulo, autor: m.autor ?? null, status: m.status || 'quero-ler',
    nota: m.nota ?? null, paginas: m.paginas ?? null, inicio: m.inicio ?? null, fim: m.fim ?? null,
    tags: m.tags || [], ...m,
  });

  function linkGoodreads(m) {
    if (m.goodreads_id) return `https://www.goodreads.com/book/show/${encodeURIComponent(m.goodreads_id)}`;
    if (m.isbn) return `https://www.goodreads.com/search?q=${encodeURIComponent(m.isbn)}`;
    return `https://www.goodreads.com/search?q=${encodeURIComponent([m.titulo, m.autor].filter(Boolean).join(' '))}`;
  }

  function editar(doc) {
    const m = doc ? doc.meta : { status: estado.aba };
    const extras = {}; // dados vindos do catálogo que não têm campo no formulário
    const f = {
      titulo: el('input', { type: 'text', value: m.titulo || (doc ? doc.nome : ''), required: true }),
      autor: el('input', { type: 'text', value: m.autor || '' }),
      status: el('select', {}, Object.entries({ 'quero-ler': 'Quero ler', lendo: 'Lendo', lido: 'Lido' })
        .map(([v, r]) => el('option', { value: v, selected: v === (m.status || 'quero-ler'), text: r }))),
      nota: el('select', {}, [0, 1, 2, 3, 4, 5].map(n => el('option', { value: n, selected: Math.round(Number(m.nota || 0)) === n, text: n ? estrelas(n) : 'Sem nota' }))),
      paginas: el('input', { type: 'number', min: 0, value: m.paginas ?? '' }),
      ano: el('input', { type: 'number', min: 0, max: 3000, value: m.ano ?? '' }),
      isbn: el('input', { type: 'text', value: m.isbn || '', inputmode: 'numeric' }),
      inicio: el('input', { type: 'date', value: m.inicio || '' }),
      fim: el('input', { type: 'date', value: m.fim || '' }),
      tags: el('input', { type: 'text', value: App.lista(m.tags).join(', '), placeholder: 'ex.: ficção, filosofia' }),
      resenha: el('textarea', { rows: 12, class: 'editor-md', value: doc ? doc.corpo : '' }),
    };
    const preencher = (campo, v) => { if (v != null && v !== '' && !f[campo].value) f[campo].value = v; };
    const capa = App.catalogo.blocoCapa({
      capa: m.capa, titulo: () => f.titulo.value, tipo: () => 'livro',
      termo: () => [f.titulo.value, f.autor.value].filter(Boolean).join(' '),
      aoEscolher: r => {
        preencher('titulo', r.titulo); preencher('autor', r.autor); preencher('paginas', r.paginas);
        preencher('ano', r.ano); preencher('isbn', r.isbn);
        if (r.sinopse && !m.sinopse) extras.sinopse = r.sinopse;
        if (r.generos?.length && !App.lista(m.generos).length) extras.generos = r.generos;
        App.toast('Informações preenchidas. Confira e salve.');
      },
    });
    const corpo = el('div', { class: 'grade-form' },
      capa.no,
      App.campo('Título', f.titulo, { largo: true }),
      App.campo('Autor(a)', f.autor),
      App.campo('Status', f.status, { voz: false }),
      App.campo('Nota', f.nota, { voz: false }),
      App.campo('Páginas', f.paginas, { voz: false }),
      App.campo('Ano de publicação', f.ano, { voz: false }),
      App.campo('ISBN', f.isbn, { voz: false }),
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
        nota: Number(f.nota.value) || null, paginas: numero(f.paginas.value),
        inicio: f.inicio.value || (status === 'lendo' && !m.inicio ? App.hoje() : null),
        fim: f.fim.value || (status === 'lido' ? App.hoje() : null),
        tags: App.tagsDeTexto(f.tags.value),
        ano: numero(f.ano.value), isbn: f.isbn.value.replace(/[^\dXx]/g, '') || null, capa: capa.valor(),
        ...extras,
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
    const dlg = App.dialogo(titulo(doc), el('article', { class: 'detalhe-obra' },
      App.catalogo.capa(m.capa, titulo(doc), 'capa capa-grande'),
      el('div', { class: 'detalhe-texto' },
        el('p', { class: 'sobretitulo', text: [m.autor || 'Autor desconhecido', m.ano].filter(Boolean).join(' · ') }),
        el('p', { class: 'estrelas', 'aria-label': `Nota ${m.nota || 0} de 5`, text: estrelas(m.nota) }),
        el('div', { class: 'selos' },
          m.paginas ? el('span', { class: 'selo', text: `${m.paginas} páginas` }) : null,
          m.inicio ? el('span', { class: 'selo', text: 'Início ' + App.fmtData(m.inicio) }) : null,
          m.fim ? el('span', { class: 'selo', text: 'Fim ' + App.fmtData(m.fim) }) : null,
          App.lista(m.generos).map(g => el('span', { class: 'selo info', text: g })),
          App.lista(m.tags).map(t => el('span', { class: 'selo tag', text: '#' + t }))),
        m.sinopse ? el('p', { class: 'sinopse', text: m.sinopse }) : null,
        el('p', {}, el('a', { href: linkGoodreads(m), target: '_blank', rel: 'noopener noreferrer', text: 'Ver no Goodreads' })),
        el('h3', { text: 'Resenha' }), resenha)), [
      App.voz.botaoLeitura(() => `${titulo(doc)}${m.autor ? ', de ' + m.autor : ''}. ${App.markdown.textoPuro(doc.corpo)}`),
      el('span', { class: 'espaco' }),
      el('button', { type: 'button', text: 'Editar', onclick: () => { dlg.close(); editar(doc); } }),
    ]);
    dlg.classList.add('grande');
  }

  function cartao(d) {
    const m = d.meta;
    return el('li', {},
      el('button', { type: 'button', class: 'obra', onclick: () => ver(d) },
        App.catalogo.capa(m.capa, titulo(d)),
        el('strong', { text: titulo(d) }),
        el('span', { class: 'autor', text: m.autor || '' }),
        m.status === 'lido' ? el('span', { class: 'estrelas', 'aria-label': `Nota ${m.nota || 0} de 5`, text: estrelas(m.nota) }) : null,
        m.status === 'lido' && !String(d.corpo || '').trim() ? el('span', { class: 'selo alerta', text: 'sem resenha' }) : null));
  }

  async function importar() {
    const r = await App.tentar(() => App.catalogo.importarGoodreads(todos(), metaBase), 'Não foi possível importar');
    if (r) App.toast(`Goodreads: ${r.novos} livro(s) novo(s), ${r.completados} atualizado(s), de ${r.total}.`);
  }

  function ajudaImportar() {
    const dlg = App.dialogo('Trazer livros do Goodreads', el('div', { class: 'md' },
      el('p', { text: 'O Goodreads não deixa outros sites lerem sua conta diretamente, mas permite baixar sua lista inteira num arquivo:' }),
      el('ol', {},
        el('li', {}, 'Entre no Goodreads e abra ', el('a', { href: 'https://www.goodreads.com/review/import', target: '_blank', rel: 'noopener noreferrer', text: 'Import and export' }), '.'),
        el('li', { text: 'Clique em “Export Library” e baixe o arquivo .csv quando ficar pronto.' }),
        el('li', { text: 'Volte aqui, clique em “Escolher arquivo” e selecione esse .csv.' })),
      el('p', { text: 'Livros novos são criados; nos que já existem, só os campos vazios são preenchidos. Nada é apagado. Pode repetir sempre que quiser atualizar.' }),
      el('p', { class: 'dica', text: 'As capas vêm do Open Library pelo ISBN. Para os que ficarem sem capa, use “Completar capas”.' })), [
      el('span', { class: 'espaco' }),
      el('button', { type: 'button', class: 'secundario', text: 'Cancelar', onclick: () => dlg.close() }),
      el('button', { type: 'button', text: 'Escolher arquivo', onclick: () => { dlg.close(); importar(); } }),
    ]);
  }

  const completarCapas = () => App.catalogo.completarCapas(todos(), () => 'livro',
    d => [titulo(d), d.meta.autor].filter(Boolean).join(' '),
    (meta, r) => App.catalogo.mesclar(meta, r, { autor: 'autor', paginas: 'paginas', ano: 'ano', isbn: 'isbn', sinopse: 'sinopse', generos: 'generos' }));

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
        el('h1', { text: 'Leitura' }),
        el('div', { class: 'acoes' },
          el('button', { type: 'button', class: 'secundario', text: 'Importar do Goodreads', onclick: ajudaImportar }),
          el('button', { type: 'button', class: 'secundario', text: 'Completar capas', onclick: completarCapas }),
          el('button', { type: 'button', text: '+ Novo livro', onclick: () => editar(null) }))),
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
