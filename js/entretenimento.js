'use strict';
// Módulo Entretenimento: filmes, séries e animes, no mesmo estilo da Leitura.
// Arquivos em Entretenimento/ com tipo: entretenimento e categoria: filme | serie | anime.
App.entretenimento = (() => {
  const { el } = App;
  const PASTA = 'Entretenimento';
  const STATUS = { vendo: 'Assistindo', 'quero-ver': 'Quero ver', visto: 'Vistos' };
  const STATUS_FORM = { 'quero-ver': 'Quero ver', vendo: 'Assistindo', visto: 'Visto' };
  const CATEGORIAS = { filme: 'Filme', serie: 'Série', anime: 'Anime' };
  const PLURAL = { '': 'Tudo', filme: 'Filmes', serie: 'Séries', anime: 'Animes' };
  const estado = { aba: 'vendo', categoria: '', busca: '' };

  const todos = () => App.store.listar({ pasta: PASTA, tipo: 'entretenimento' });
  const titulo = d => d.meta.titulo || d.nome;
  const categoria = m => (CATEGORIAS[m.categoria] ? m.categoria : 'filme');
  const numero = v => (v === '' || v == null ? null : Number(v) || null);

  const metaBase = m => ({
    tipo: 'entretenimento', titulo: m.titulo, categoria: m.categoria || 'filme', ano: m.ano ?? null,
    status: m.status || 'quero-ver', nota: m.nota ?? null, inicio: null, fim: m.fim ?? null, tags: m.tags || [], ...m,
  });

  function linkExterno(m) {
    if (m.letterboxd_uri) return { href: m.letterboxd_uri, texto: 'Ver no Letterboxd' };
    if (categoria(m) === 'filme') return { href: `https://letterboxd.com/search/films/${encodeURIComponent(m.titulo || '')}/`, texto: 'Procurar no Letterboxd' };
    if (m.link) return { href: m.link, texto: categoria(m) === 'anime' ? 'Ver no MyAnimeList' : 'Ver no TVmaze' };
    return null;
  }

  function editar(doc, predefinido = {}) {
    const m = doc ? doc.meta : { status: estado.aba, categoria: estado.categoria || 'filme', ...predefinido };
    const extras = {};
    const f = {
      titulo: el('input', { type: 'text', value: m.titulo || (doc ? doc.nome : ''), required: true }),
      categoria: el('select', {}, Object.entries(CATEGORIAS).map(([v, r]) => el('option', { value: v, selected: v === categoria(m), text: r }))),
      status: el('select', {}, Object.entries(STATUS_FORM).map(([v, r]) => el('option', { value: v, selected: v === (m.status || 'quero-ver'), text: r }))),
      nota: el('select', {}, [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map(n => el('option', {
        value: n, selected: Math.round(Number(m.nota || 0) * 2) / 2 === n, text: n ? App.estrelas(n) : 'Sem nota' }))),
      criador: el('input', { type: 'text', value: m.criador || '', placeholder: 'direção, estúdio ou canal' }),
      ano: el('input', { type: 'number', min: 1880, max: 3000, value: m.ano ?? '' }),
      temporadas: el('input', { type: 'number', min: 0, value: m.temporadas ?? '' }),
      episodios: el('input', { type: 'number', min: 0, value: m.episodios ?? '' }),
      inicio: el('input', { type: 'date', value: m.inicio || '' }),
      fim: el('input', { type: 'date', value: m.fim || '' }),
      tags: el('input', { type: 'text', value: App.lista(m.tags).join(', '), placeholder: 'ex.: ficção científica, com amigos' }),
      resenha: el('textarea', { rows: 10, class: 'editor-md', value: doc ? doc.corpo : '' }),
    };
    const preencher = (campo, v) => { if (v != null && v !== '' && !f[campo].value) f[campo].value = v; };
    const capa = App.catalogo.blocoCapa({
      capa: m.capa, titulo: () => f.titulo.value, tipo: () => 'entretenimento',
      preferida: () => f.categoria.value, termo: () => f.titulo.value,
      aoEscolher: r => {
        if (CATEGORIAS[r.categoria]) { f.categoria.value = r.categoria; serial(); }
        preencher('titulo', r.titulo); preencher('criador', r.autor); preencher('ano', r.ano); preencher('episodios', r.episodios);
        if (r.sinopse && !m.sinopse) extras.sinopse = r.sinopse;
        if (r.generos?.length && !App.lista(m.generos).length) extras.generos = r.generos;
        if (r.link && !m.link) extras.link = r.link;
        if (r.titulo_original && !m.titulo_original) extras.titulo_original = r.titulo_original;
        App.toast('Informações preenchidas. Confira e salve.');
      },
    });
    const serial = () => { const s = f.categoria.value !== 'filme'; for (const c of [f.temporadas, f.episodios]) c.closest('.campo').hidden = !s; };
    f.categoria.addEventListener('change', serial);

    const corpo = el('div', { class: 'grade-form' },
      capa.no,
      App.campo('Título', f.titulo, { largo: true }),
      App.campo('Categoria', f.categoria, { voz: false }),
      App.campo('Status', f.status, { voz: false }),
      App.campo('Nota', f.nota, { voz: false }),
      App.campo('Direção / estúdio', f.criador),
      App.campo('Ano', f.ano, { voz: false }),
      App.campo('Temporadas', f.temporadas, { voz: false }),
      App.campo('Episódios', f.episodios, { voz: false }),
      App.campo('Comecei em', f.inicio, { voz: false }),
      App.campo('Terminei em', f.fim, { voz: false }),
      App.campo('Tags', f.tags, { largo: true }),
      App.campo('Resenha (Markdown)', f.resenha, { largo: true }));
    serial();

    const salvar = async () => {
      const t = f.titulo.value.trim();
      if (!t) { f.titulo.focus(); App.toast('Dê um título.', 'erro'); return; }
      const status = f.status.value;
      const ehSerial = f.categoria.value !== 'filme';
      const meta = {
        ...(doc ? doc.meta : {}),
        tipo: 'entretenimento', titulo: t, categoria: f.categoria.value, status,
        nota: Number(f.nota.value) || null, criador: f.criador.value.trim() || null, ano: numero(f.ano.value),
        temporadas: ehSerial ? numero(f.temporadas.value) : (m.temporadas ?? undefined),
        episodios: ehSerial ? numero(f.episodios.value) : (m.episodios ?? undefined),
        inicio: f.inicio.value || (status === 'vendo' && !m.inicio ? App.hoje() : null),
        fim: f.fim.value || (status === 'visto' ? App.hoje() : null),
        capa: capa.valor(), tags: App.tagsDeTexto(f.tags.value), ...extras,
      };
      const terminou = status === 'visto' && m.status !== 'visto';
      const ok = await App.tentar(async () => {
        const s = doc ? await App.store.gravar(doc.caminho, meta, f.resenha.value)
          : await App.store.criar(PASTA, t, meta, f.resenha.value);
        if (terminou) App.gamificacao.registrarEvento('obra_vista', s.caminho, { categoria: meta.categoria });
        return s;
      }, 'Não foi possível salvar');
      if (ok) { estado.aba = status; dlg.close(); App.toast('Salvo.'); }
    };
    const excluir = async () => {
      if (!App.confirmar(`Mover "${titulo(doc)}" para a lixeira?`)) return;
      const ok = await App.tentar(() => App.store.moverParaLixeira(doc.caminho).then(() => true), 'Não foi possível excluir');
      if (ok) { dlg.close(); App.toast('Movido para .lixeira/'); }
    };
    const dlg = App.dialogo(doc ? 'Editar' : 'Novo filme, série ou anime', corpo, [
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
    const link = linkExterno(m);
    const resenha = App.markdown.render(el('div'), doc.corpo || '_Sem resenha ainda._');
    const dlg = App.dialogo(titulo(doc), el('article', { class: 'detalhe-obra' },
      App.catalogo.capa(m.capa, titulo(doc), 'capa capa-grande'),
      el('div', { class: 'detalhe-texto' },
        el('p', { class: 'sobretitulo', text: [CATEGORIAS[categoria(m)], m.criador, m.ano].filter(Boolean).join(' · ') }),
        m.titulo_original ? el('p', { class: 'dica', text: m.titulo_original }) : null,
        el('p', { class: 'estrelas', 'aria-label': `Nota ${m.nota || 0} de 5`, text: App.estrelas(m.nota) }),
        el('div', { class: 'selos' },
          m.temporadas ? el('span', { class: 'selo', text: `${m.temporadas} temporada(s)` }) : null,
          m.episodios ? el('span', { class: 'selo', text: `${m.episodios} episódio(s)` }) : null,
          m.fim ? el('span', { class: 'selo', text: 'Visto em ' + App.fmtData(m.fim) }) : null,
          App.lista(m.generos).map(g => el('span', { class: 'selo info', text: g })),
          App.lista(m.tags).map(t => el('span', { class: 'selo tag', text: '#' + t }))),
        m.sinopse ? el('p', { class: 'sinopse', text: m.sinopse }) : null,
        link ? el('p', {}, el('a', { href: link.href, target: '_blank', rel: 'noopener noreferrer', text: link.texto })) : null,
        el('h3', { text: 'Resenha' }), resenha)), [
      App.voz.botaoLeitura(() => `${titulo(doc)}. ${App.markdown.textoPuro(doc.corpo)}`),
      App.compartilhar.botao('tela', doc),
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
        el('span', { class: 'autor', text: [CATEGORIAS[categoria(m)], m.ano].filter(Boolean).join(' · ') }),
        m.status === 'visto' && m.nota ? el('span', { class: 'estrelas', 'aria-label': `Nota ${m.nota} de 5`, text: App.estrelas(m.nota) }) : null));
  }

  async function importar() {
    const r = await App.tentar(() => App.catalogo.importarLetterboxd(todos(), metaBase), 'Não foi possível importar');
    if (r) App.toast(`Letterboxd: ${r.novos} filme(s) novo(s), ${r.completados} atualizado(s), de ${r.total}.`);
  }

  function ajudaImportar() {
    const dlg = App.dialogo('Trazer filmes do Letterboxd', el('div', { class: 'md' },
      el('p', { text: 'O Letterboxd não deixa outros sites lerem sua conta diretamente, mas permite baixar seus dados:' }),
      el('ol', {},
        el('li', {}, 'No Letterboxd, abra ', el('a', { href: 'https://letterboxd.com/settings/data/', target: '_blank', rel: 'noopener noreferrer', text: 'Settings → Data' }), ' e clique em “Export your data”.'),
        el('li', { text: 'Descompacte o arquivo .zip baixado (clique com o botão direito → Extrair tudo).' }),
        el('li', { text: 'Volte aqui, clique em “Escolher arquivos” e selecione watched.csv, ratings.csv, reviews.csv e watchlist.csv (pode selecionar vários de uma vez).' })),
      el('p', { text: 'Filmes novos são criados; nos que já existem, só os campos vazios são preenchidos. Nada é apagado.' }),
      el('p', { class: 'dica', text: 'O Letterboxd só tem filmes. Séries e animes você adiciona aqui mesmo, com a busca de capas. Depois de importar, use “Completar capas”.' })), [
      el('span', { class: 'espaco' }),
      el('button', { type: 'button', class: 'secundario', text: 'Cancelar', onclick: () => dlg.close() }),
      el('button', { type: 'button', text: 'Escolher arquivos', onclick: () => { dlg.close(); importar(); } }),
    ]);
  }

  const completarCapas = () => App.catalogo.completarCapas(
    todos().filter(d => !estado.categoria || categoria(d.meta) === estado.categoria),
    d => categoria(d.meta), d => titulo(d),
    (meta, r) => App.catalogo.mesclar(meta, r, { criador: 'autor', ano: 'ano', episodios: 'episodios', sinopse: 'sinopse', generos: 'generos', link: 'link' }));

  function render(container) {
    const todosDocs = todos();
    const daCategoria = todosDocs.filter(d => !estado.categoria || categoria(d.meta) === estado.categoria);
    const grade = el('ul', { class: 'estante' });
    const desenhar = () => {
      const q = estado.busca.trim().toLowerCase();
      const docs = daCategoria.filter(d => (d.meta.status || 'quero-ver') === estado.aba)
        .filter(d => !q || [titulo(d), d.meta.criador, d.meta.titulo_original, d.corpo, ...App.lista(d.meta.tags)].join(' ').toLowerCase().includes(q))
        .sort((a, b) => String(b.meta.fim || b.meta.inicio || '').localeCompare(String(a.meta.fim || a.meta.inicio || '')) || titulo(a).localeCompare(titulo(b), 'pt-BR'));
      grade.replaceChildren(...(docs.length ? docs.map(cartao) : [el('li', { class: 'vazio', text: 'Nada nesta lista.' })]));
    };
    desenhar();
    const anoAtual = String(new Date().getFullYear());
    const vistosAno = c => todosDocs.filter(d => d.meta.status === 'visto' && categoria(d.meta) === c && String(d.meta.fim || '').startsWith(anoAtual)).length;

    container.replaceChildren(
      el('header', { class: 'cabecalho-tela' },
        el('h1', { text: 'Entretenimento' }),
        el('div', { class: 'acoes' },
          el('button', { type: 'button', class: 'secundario', text: 'Importar do Letterboxd', onclick: ajudaImportar }),
          el('button', { type: 'button', class: 'secundario', text: 'Completar capas', onclick: completarCapas }),
          el('button', { type: 'button', text: '+ Adicionar', onclick: () => editar(null) }))),
      el('p', { class: 'resumo', text: `Em ${anoAtual}: ${vistosAno('filme')} filme(s), ${vistosAno('serie')} série(s) e ${vistosAno('anime')} anime(s) vistos.` }),
      el('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrar por categoria' },
        Object.entries(PLURAL).map(([v, r]) => el('button', {
          type: 'button', class: 'chip', 'aria-pressed': String(estado.categoria === v),
          text: `${r} (${todosDocs.filter(d => !v || categoria(d.meta) === v).length})`,
          onclick: () => { estado.categoria = v; render(container); },
        }))),
      el('div', { class: 'barra' },
        el('div', { class: 'alternador', role: 'group', 'aria-label': 'Lista' },
          Object.entries(STATUS).map(([v, r]) => el('button', {
            type: 'button', 'aria-pressed': String(estado.aba === v),
            text: `${r} (${daCategoria.filter(d => (d.meta.status || 'quero-ver') === v).length})`,
            onclick: () => { estado.aba = v; render(container); },
          }))),
        el('input', { type: 'search', placeholder: 'Buscar…', 'aria-label': 'Buscar filmes, séries e animes', value: estado.busca,
          oninput: e => { estado.busca = e.target.value; desenhar(); } })),
      grade);
  }

  return { render, editar, todos };
})();
