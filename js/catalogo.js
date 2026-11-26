'use strict';
// Catálogos públicos para capas e informações, e importação das exportações em CSV
// do Goodreads e do Letterboxd. Só faz chamadas de rede quando o usuário pede (botão).
//
// Goodreads e Letterboxd não oferecem acesso aberto a um site no navegador (o Goodreads
// encerrou a API em 2020; a do Letterboxd é fechada), então:
//   - as listas pessoais vêm das exportações CSV que os dois sites permitem baixar;
//   - capas e dados vêm de catálogos abertos: Google Books e Open Library (livros),
//     iTunes (filmes), TVmaze (séries) e Jikan/MyAnimeList (animes).
App.catalogo = (() => {
  const { el } = App;

  async function pegarJSON(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const r = await fetch(url, { signal: ctrl.signal, referrerPolicy: 'no-referrer', credentials: 'omit' });
      if (!r.ok) throw new Error(`o serviço respondeu ${r.status}`);
      return await r.json();
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('o serviço demorou demais para responder');
      if (e instanceof TypeError) throw new Error('sem conexão com o serviço (verifique a internet)');
      throw e;
    } finally { clearTimeout(t); }
  }

  const https = u => (u ? String(u).replace(/^http:\/\//, 'https://') : null);
  const ano = d => { const m = String(d || '').match(/\d{4}/); return m ? Number(m[0]) : null; };
  const resumir = (s, n = 600) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n - 1).replace(/\s\S*$/, '') + '…' : (t || null);
  };
  const semHTML = s => new DOMParser().parseFromString(String(s || ''), 'text/html').body.textContent || '';

  // ---- provedores: cada um devolve uma lista de resultados no mesmo formato ----
  async function googleBooks(q) {
    const j = await pegarJSON('https://www.googleapis.com/books/v1/volumes?maxResults=10&printType=books&q=' + encodeURIComponent(q));
    return (j.items || []).map(({ volumeInfo: v = {} }) => {
      const ids = v.industryIdentifiers || [];
      const isbn = (ids.find(i => i.type === 'ISBN_13') || ids.find(i => i.type === 'ISBN_10'))?.identifier || null;
      const img = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail;
      return {
        fonte: 'Google Books', titulo: [v.title, v.subtitle].filter(Boolean).join(': '),
        autor: (v.authors || []).join(', ') || null, ano: ano(v.publishedDate), paginas: v.pageCount || null,
        isbn, capa: img ? https(img).replace('&edge=curl', '') : null,
        sinopse: resumir(v.description), generos: v.categories || [], link: https(v.infoLink),
      };
    });
  }

  async function openLibrary(q) {
    const campos = 'key,title,author_name,first_publish_year,cover_i,number_of_pages_median,isbn,subject';
    const j = await pegarJSON(`https://openlibrary.org/search.json?limit=10&fields=${campos}&q=` + encodeURIComponent(q));
    return (j.docs || []).map(d => ({
      fonte: 'Open Library', titulo: d.title, autor: (d.author_name || []).join(', ') || null,
      ano: d.first_publish_year || null, paginas: d.number_of_pages_median || null,
      isbn: (d.isbn || [])[0] || null,
      capa: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null,
      sinopse: null, generos: (d.subject || []).slice(0, 3), link: d.key ? 'https://openlibrary.org' + d.key : null,
    }));
  }

  async function filmesItunes(q) {
    const j = await pegarJSON('https://itunes.apple.com/search?media=movie&entity=movie&limit=10&country=br&lang=pt_br&term=' + encodeURIComponent(q));
    return (j.results || []).map(r => ({
      fonte: 'iTunes', categoria: 'filme', titulo: r.trackName, autor: r.artistName || null, ano: ano(r.releaseDate),
      capa: r.artworkUrl100 ? r.artworkUrl100.replace(/\/\d+x\d+bb\./, '/600x900bb.') : null,
      sinopse: resumir(r.longDescription), generos: r.primaryGenreName ? [r.primaryGenreName] : [], link: r.trackViewUrl || null,
    }));
  }

  // Sugestões públicas do IMDb: filmes e séries do mundo todo, com pôster.
  async function imdb(q) {
    const termo = App.slug(q).replace(/-/g, '_') || 'x';
    const j = await pegarJSON(`https://v3.sg.media-imdb.com/suggestion/${termo[0]}/${encodeURIComponent(termo)}.json`);
    const tipos = { movie: 'filme', tvMovie: 'filme', short: 'filme', tvSeries: 'serie', tvMiniSeries: 'serie' };
    return (j.d || []).filter(d => tipos[d.qid] && d.l).map(d => ({
      fonte: 'IMDb', categoria: tipos[d.qid], titulo: d.l, autor: d.s || null, ano: d.y || null,
      capa: d.i?.imageUrl ? d.i.imageUrl.replace(/\._V1_.*\.(jpg|png)$/i, '._V1_SX600.$1') : null,
      sinopse: null, generos: [], link: d.id ? `https://www.imdb.com/title/${d.id}/` : null,
    }));
  }

  async function seriesTvmaze(q) {
    const j = await pegarJSON('https://api.tvmaze.com/search/shows?q=' + encodeURIComponent(q));
    return (j || []).map(({ show: s }) => ({
      fonte: 'TVmaze', categoria: s.type === 'Animation' && /japan/i.test(s.network?.country?.name || '') ? 'anime' : 'serie',
      titulo: s.name, autor: s.network?.name || s.webChannel?.name || null, ano: ano(s.premiered),
      capa: https(s.image?.original || s.image?.medium), sinopse: resumir(semHTML(s.summary)),
      generos: s.genres || [], link: s.url || null,
    }));
  }

  // AniList: o maior catálogo aberto de animes (GraphQL, sem chave).
  async function animesAnilist(q) {
    const consulta = `query ($q: String) { Page(perPage: 10) { media(search: $q, type: ANIME, sort: SEARCH_MATCH) {
      title { romaji english native } startDate { year } episodes format genres description(asHtml: false) siteUrl
      coverImage { extraLarge large } studios(isMain: true) { nodes { name } } } } }`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    let j;
    try {
      const r = await fetch('https://graphql.anilist.co', {
        method: 'POST', signal: ctrl.signal, referrerPolicy: 'no-referrer', credentials: 'omit',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: consulta, variables: { q } }),
      });
      if (!r.ok) throw new Error(`o serviço respondeu ${r.status}`);
      j = await r.json();
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('o serviço demorou demais para responder');
      if (e instanceof TypeError) throw new Error('sem conexão com o serviço');
      throw e;
    } finally { clearTimeout(t); }
    return (j.data?.Page?.media || []).map(a => ({
      fonte: 'AniList', categoria: 'anime', titulo: a.title?.romaji || a.title?.english, titulo_original: a.title?.native || null,
      autor: (a.studios?.nodes || []).map(s => s.name).join(', ') || null, ano: a.startDate?.year || null,
      episodios: a.episodes || null, capa: a.coverImage?.extraLarge || a.coverImage?.large || null,
      sinopse: resumir(semHTML(a.description)), generos: a.genres || [], link: a.siteUrl || null,
    }));
  }

  async function animesJikan(q) {
    const j = await pegarJSON('https://api.jikan.moe/v4/anime?limit=10&sfw=true&q=' + encodeURIComponent(q));
    return (j.data || []).map(a => ({
      fonte: 'MyAnimeList', categoria: 'anime', titulo: a.title, titulo_original: a.title_japanese || null,
      autor: (a.studios || []).map(s => s.name).join(', ') || null, ano: a.year || ano(a.aired?.from),
      episodios: a.episodes || null, capa: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || null,
      sinopse: resumir(a.synopsis), generos: (a.genres || []).map(g => g.name), link: a.url || null,
    }));
  }

  // Cada tipo consulta várias fontes ao mesmo tempo; se uma falhar, as outras seguram.
  const FONTES = {
    livro: [['Google Books', googleBooks], ['Open Library', openLibrary]],
    filme: [['IMDb', imdb], ['iTunes', filmesItunes]],
    serie: [['IMDb', imdb], ['TVmaze', seriesTvmaze]],
    anime: [['AniList', animesAnilist], ['MyAnimeList', animesJikan]],
  };
  FONTES.entretenimento = [['AniList', animesAnilist], ['IMDb', imdb], ['TVmaze', seriesTvmaze], ['MyAnimeList', animesJikan], ['iTunes', filmesItunes]];
  const NOMES = {
    livro: 'Google Books e Open Library', filme: 'IMDb e iTunes', serie: 'IMDb e TVmaze',
    anime: 'AniList e MyAnimeList', entretenimento: 'AniList, IMDb, TVmaze, MyAnimeList e iTunes',
  };

  const normal = t => App.slug(t).replace(/-/g, ' ');
  // Junta as fontes, tira repetidos e ordena: título mais parecido primeiro, depois a categoria
  // preferida, depois quem tem capa. Devolve também quais fontes falharam.
  async function buscarDetalhado(tipo, q, preferida) {
    const fontes = FONTES[tipo] || [];
    const res = await Promise.allSettled(fontes.map(([, f]) => f(q)));
    const falhas = fontes.filter((_, i) => res[i].status === 'rejected').map(([n], i) => n);
    res.forEach((r, i) => { if (r.status === 'rejected') console.warn('catálogo falhou:', fontes[i][0], r.reason); });
    const todos = res.flatMap((r, i) => (r.value || []).map((x, pos) => ({ ...x, ordem: pos * fontes.length + i })));
    if (!todos.length && falhas.length === fontes.length) throw res[0].reason;
    const alvo = normal(q);
    const nota = x => {
      const n = normal(x.titulo);
      const parecido = n === alvo ? 0 : n.startsWith(alvo) ? 1 : n.includes(alvo) ? 2 : 3;
      return parecido * 1000 + (preferida && x.categoria !== preferida ? 300 : 0) + (x.capa ? 0 : 100) + x.ordem;
    };
    const vistos = new Set();
    const resultados = todos.sort((a, b) => nota(a) - nota(b)).filter(x => {
      const k = [x.categoria || '', normal(x.titulo), x.ano || ''].join('|');
      if (vistos.has(k)) return false;
      vistos.add(k); return true;
    }).slice(0, 20);
    return { resultados, falhas };
  }
  const buscar = async (tipo, q, preferida) => (await buscarDetalhado(tipo, q, preferida)).resultados;

  // ---- capa: imagem com reserva (inicial do título) se não houver ou falhar ----
  function capa(url, titulo, classe = 'capa') {
    const reserva = () => el('span', { class: classe + ' sem-imagem', 'aria-hidden': 'true', text: String(titulo || '?').slice(0, 1).toUpperCase() });
    if (!url) return reserva();
    const img = el('img', { class: classe, src: url, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', decoding: 'async' });
    img.addEventListener('error', () => img.replaceWith(reserva()), { once: true });
    return img;
  }

  // ---- diálogo de busca ----
  const ROTULO_CATEGORIA = { filme: 'Filme', serie: 'Série', anime: 'Anime' };
  function dialogoBusca(tipo, termo, aoEscolher, preferida) {
    const q = el('input', { type: 'search', value: termo || '' });
    const lista = el('ul', { class: 'resultados', 'aria-live': 'polite' });
    const aviso = el('p', { class: 'dica', role: 'status' });
    const executar = async () => {
      const t = q.value.trim();
      if (!t) { q.focus(); return; }
      lista.replaceChildren(el('li', { class: 'vazio', text: 'Buscando…' }));
      try {
        const { resultados: rs, falhas } = await buscarDetalhado(tipo, t, preferida);
        aviso.textContent = falhas.length ? `Sem resposta de: ${falhas.join(', ')}. Os outros catálogos foram usados.` : '';
        lista.replaceChildren(...(rs.length ? rs.map(r => el('li', {},
          el('button', { type: 'button', class: 'resultado', onclick: () => { dlg.close(); aoEscolher(r); } },
            capa(r.capa, r.titulo, 'capa-mini'),
            el('span', { class: 'resultado-info' },
              el('strong', { text: r.titulo }),
              el('span', { class: 'dica', text: [ROTULO_CATEGORIA[r.categoria], r.autor, r.ano, r.fonte].filter(Boolean).join(' · ') }))))) :
          [el('li', { class: 'vazio', text: 'Nada encontrado. Tente outro nome (o título original costuma funcionar melhor).' })]));
      } catch (e) {
        aviso.textContent = '';
        lista.replaceChildren(el('li', { class: 'aviso', text: 'Nenhum catálogo respondeu (' + e.message + '). Verifique a internet ou tente de novo em alguns segundos.' }));
      }
    };
    q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); executar(); } });
    const dlg = App.dialogo('Buscar capa e informações', el('div', { class: 'busca-catalogo' },
      el('div', { class: 'campo-linha' }, el('div', { class: 'espaco' }, App.campo('Nome para buscar', q, { voz: false })),
        el('button', { type: 'button', class: 'alinhar-base', text: 'Buscar', onclick: executar })),
      el('p', { class: 'dica', text: `A busca envia apenas o texto digitado para ${NOMES[tipo]}. Escolha um resultado para preencher os campos vazios e a capa.` }),
      aviso,
      lista), [el('span', { class: 'espaco' }), el('button', { type: 'button', class: 'secundario', text: 'Fechar', onclick: () => dlg.close() })]);
    q.focus();
    if (q.value.trim()) executar();
    return dlg;
  }

  // Bloco do formulário: prévia da capa, endereço editável e botão de busca no catálogo.
  // Também serve para colar o endereço da imagem copiado do Goodreads ou do Letterboxd.
  function blocoCapa({ capa: inicial, titulo, tipo, termo, aoEscolher, preferida = () => null }) {
    const url = el('input', { type: 'url', value: inicial || '', placeholder: 'https://…' });
    const previa = el('div', { class: 'previa-capa' });
    const atualizar = () => previa.replaceChildren(capa(url.value.trim() || null, titulo(), 'capa'));
    url.addEventListener('change', atualizar);
    atualizar();
    const no = el('div', { class: 'bloco-capa largo' }, previa,
      el('div', { class: 'bloco-capa-campos' },
        App.campo('Endereço da imagem da capa', url, { voz: false }),
        el('div', { class: 'acoes' },
          el('button', { type: 'button', class: 'secundario', onclick: () => dialogoBusca(tipo(), termo(), r => {
            if (r.capa) url.value = r.capa;
            atualizar(); aoEscolher(r);
          }, preferida()) }, App.icone('buscar'), ' Buscar capa e informações'),
          el('button', { type: 'button', class: 'secundario', text: 'Remover capa', onclick: () => { url.value = ''; atualizar(); } })),
        el('p', { class: 'dica', text: 'Dica: no Goodreads ou no Letterboxd, clique com o botão direito na capa, escolha “Copiar endereço da imagem” e cole acima.' })));
    return { no, valor: () => url.value.trim() || null };
  }

  // Completa a capa (e dados vazios) de vários itens, um por vez, sem pressa com os serviços.
  async function completarCapas(docs, tipoDe, consulta, aplicar) {
    const faltando = docs.filter(d => !d.meta.capa);
    if (!faltando.length) { App.toast('Todos os itens já têm capa.'); return; }
    App.toast(`Procurando capas para ${faltando.length} item(ns)…`);
    let achou = 0;
    App.emLote = true;
    try {
      for (const d of faltando) {
        try {
          const rs = await buscar(tipoDe(d), consulta(d));
          const alvo = Number(d.meta.ano) || null;
          const r = rs.find(x => x.capa && (!alvo || x.ano === alvo)) || rs.find(x => x.capa);
          if (r) { await App.store.gravar(d.caminho, aplicar({ ...d.meta }, r), d.corpo); achou++; }
        } catch (e) { console.warn('capa não encontrada', d.caminho, e); }
        await new Promise(ok => setTimeout(ok, 400));
      }
    } finally { App.emLote = false; App.emit('dados'); }
    App.toast(`${achou} capa(s) encontrada(s) de ${faltando.length}.`);
  }

  // Preenche só o que está vazio; a capa é trocada porque o usuário escolheu o resultado.
  function mesclar(meta, r, mapa) {
    for (const [chave, origem] of Object.entries(mapa)) {
      const v = r[origem];
      const vazio = meta[chave] == null || meta[chave] === '' || (Array.isArray(meta[chave]) && !meta[chave].length);
      if (vazio && v != null && v !== '' && !(Array.isArray(v) && !v.length)) meta[chave] = v;
    }
    if (r.capa) meta.capa = r.capa;
    return meta;
  }

  // ---- CSV (RFC 4180) ----
  function lerCSV(texto) {
    const linhas = []; let linha = []; let campo = ''; let aspas = false;
    const t = String(texto).replace(/^﻿/, '');
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (aspas) {
        if (c === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else aspas = false; } else campo += c;
      } else if (c === '"') aspas = true;
      else if (c === ',') { linha.push(campo); campo = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && t[i + 1] === '\n') i++;
        linha.push(campo); campo = '';
        if (linha.some(x => x !== '')) linhas.push(linha);
        linha = [];
      } else campo += c;
    }
    linha.push(campo);
    if (linha.some(x => x !== '')) linhas.push(linha);
    const [cab = [], ...resto] = linhas;
    return resto.map(l => Object.fromEntries(cab.map((k, i) => [k.trim(), (l[i] ?? '').trim()])));
  }

  function escolherArquivos(aceita, multiplos) {
    return new Promise(ok => {
      const inp = el('input', { type: 'file', accept: aceita, multiple: multiplos, hidden: true });
      inp.addEventListener('change', () => { ok([...inp.files]); inp.remove(); });
      inp.addEventListener('cancel', () => { ok([]); inp.remove(); });
      document.body.append(inp);
      inp.click();
    });
  }

  // Cria itens novos e, nos que já existem, só completa campos vazios. Nunca apaga nada.
  // chaves(meta) devolve as formas de reconhecer o mesmo item (ex.: id do site, título+autor).
  async function importarItens(itens, { pasta, existentes, chaves, criarMeta, mapa, statusFinal }) {
    const porChave = new Map();
    const indexar = d => { for (const k of chaves(d.meta)) if (!porChave.has(k)) porChave.set(k, d); };
    existentes.forEach(indexar);
    let novos = 0; let completados = 0;
    App.emLote = true;
    try {
      for (const it of itens) {
        const atual = chaves(it.meta).map(k => porChave.get(k)).find(Boolean);
        if (!atual) {
          indexar(await App.store.criar(pasta, it.meta.titulo, criarMeta(it.meta), it.corpo || '')); novos++;
          continue;
        }
        if (atual.erro) continue;
        const meta = { ...atual.meta };
        let mudou = false;
        if (it.meta.status === statusFinal && meta.status !== statusFinal) { meta.status = statusFinal; mudou = true; }
        for (const k of mapa) {
          const vazio = meta[k] == null || meta[k] === '' || (Array.isArray(meta[k]) && !meta[k].length);
          const v = it.meta[k];
          if (vazio && v != null && v !== '' && !(Array.isArray(v) && !v.length)) { meta[k] = v; mudou = true; }
        }
        const corpo = String(atual.corpo || '').trim() ? atual.corpo : (it.corpo || atual.corpo);
        if (corpo !== atual.corpo) mudou = true;
        if (mudou) { await App.store.gravar(atual.caminho, meta, corpo); completados++; }
      }
    } finally { App.emLote = false; App.emit('dados'); }
    return { novos, completados, total: itens.length };
  }

  // ---- Goodreads: "My Books → Import and export → Export library" ----
  function deGoodreads(linhas) {
    const limpar = v => String(v || '').replace(/^="?|"$/g, '').trim();
    const data = v => (/^\d{4}\/\d{2}\/\d{2}$/.test(v || '') ? v.replace(/\//g, '-') : null);
    const prateleira = { read: 'lido', 'currently-reading': 'lendo', 'to-read': 'quero-ler' };
    return linhas.filter(l => l.Title).map(l => {
      const isbn = limpar(l.ISBN13) || limpar(l.ISBN) || null;
      const exclusiva = l['Exclusive Shelf'] || 'to-read';
      const resenha = String(l['My Review'] || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
      return {
        meta: {
          titulo: l.Title, autor: l.Author || null,
          status: prateleira[exclusiva] || 'quero-ler',
          nota: Number(l['My Rating']) || null,
          paginas: Number(l['Number of Pages']) || null,
          ano: Number(l['Original Publication Year']) || Number(l['Year Published']) || null,
          inicio: null, fim: data(l['Date Read']),
          isbn, goodreads_id: l['Book Id'] || null,
          capa: isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false` : null,
          tags: App.tagsDeTexto(l.Bookshelves || '').filter(t => !prateleira[t]),
        },
        corpo: resenha,
      };
    });
  }

  // ---- Letterboxd: "Settings → Data → Export your data" (descompacte o .zip) ----
  function deLetterboxd(arquivos) {
    const filmes = new Map();
    const chave = l => App.slug(l.Name) + '|' + (l.Year || '');
    for (const { nome, linhas } of arquivos) {
      const cab = Object.keys(linhas[0] || {});
      const watchlist = /watchlist/i.test(nome);
      for (const l of linhas) {
        if (!l.Name) continue;
        const k = chave(l);
        const f = filmes.get(k) || { meta: { titulo: l.Name, ano: Number(l.Year) || null, categoria: 'filme', status: 'quero-ver', tags: [] }, corpo: '' };
        if (!watchlist) f.meta.status = 'visto';
        if (l.Rating) f.meta.nota = Number(l.Rating) || f.meta.nota || null;
        // No diário e nas resenhas o endereço aponta para a entrada, não para o filme.
        const deDiario = cab.includes('Watched Date');
        const vistoEm = /^\d{4}-\d{2}-\d{2}$/.test(l['Watched Date'] || '') ? l['Watched Date']
          : (!watchlist && !deDiario && /^\d{4}-\d{2}-\d{2}$/.test(l.Date || '') ? l.Date : null);
        if (vistoEm && (!f.meta.fim || vistoEm > f.meta.fim)) f.meta.fim = vistoEm;
        const uri = l['Letterboxd URI'];
        if (uri && (!deDiario || !f.meta.letterboxd_uri)) f.meta.letterboxd_uri = uri;
        if (l.Tags) f.meta.tags = [...new Set([...f.meta.tags, ...App.tagsDeTexto(l.Tags)])];
        if (l.Review && !f.corpo) f.corpo = l.Review.trim();
        filmes.set(k, f);
      }
    }
    return [...filmes.values()];
  }

  async function importarGoodreads(existentes, criarMeta) {
    const [arq] = await escolherArquivos('.csv,text/csv', false);
    if (!arq) return null;
    const itens = deGoodreads(lerCSV(await arq.text()));
    if (!itens.length) throw new Error('não reconheci esse arquivo como uma exportação do Goodreads');
    return importarItens(itens, {
      pasta: 'Livros', existentes, criarMeta,
      chaves: m => [m.goodreads_id ? 'gr:' + m.goodreads_id : null, App.slug(m.titulo) + '|' + App.slug(m.autor)].filter(Boolean),
      mapa: ['autor', 'nota', 'paginas', 'ano', 'fim', 'isbn', 'goodreads_id', 'capa', 'tags'], statusFinal: 'lido',
    });
  }

  async function importarLetterboxd(existentes, criarMeta) {
    const arqs = await escolherArquivos('.csv,text/csv', true);
    if (!arqs.length) return null;
    const lidos = await Promise.all(arqs.map(async a => ({ nome: a.name, linhas: lerCSV(await a.text()) })));
    const itens = deLetterboxd(lidos.filter(a => a.linhas[0] && 'Name' in a.linhas[0]));
    if (!itens.length) throw new Error('não reconheci esses arquivos como exportação do Letterboxd (use watched.csv, ratings.csv, diary.csv, reviews.csv ou watchlist.csv)');
    return importarItens(itens, {
      pasta: 'Entretenimento', existentes, criarMeta,
      chaves: m => [m.letterboxd_uri ? 'lb:' + m.letterboxd_uri : null, App.slug(m.titulo) + '|' + (m.ano || '')].filter(Boolean),
      mapa: ['nota', 'fim', 'letterboxd_uri', 'tags'], statusFinal: 'visto',
    });
  }

  return {
    buscar, capa, dialogoBusca, blocoCapa, completarCapas, mesclar, lerCSV, deGoodreads, deLetterboxd,
    importarGoodreads, importarLetterboxd, fontes: FONTES,
  };
})();
