'use strict';
// Cadernos de estudo (aba "Cadernos" da página Estudo): um caderno por tema, com texto em
// Markdown, links de vídeo e imagens. Cada caderno é Estudo/Cadernos/<slug>.md; as imagens ficam em
// Estudo/Cadernos/imagens/ e entram no corpo como ![[arquivo]] (como no Obsidian). Vídeo é uma
// linha "- [Título](endereço)" com link do YouTube ou Vimeo. O vídeo só é carregado da internet
// quando a pessoa clica em "Carregar vídeo aqui".
App.cadernos = (() => {
  const { el } = App;
  const PASTA = 'Estudo/Cadernos';
  const PASTA_IMG = 'Estudo/Cadernos/imagens';
  const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
  const IMG = /^\s*!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*$/;
  const LINK_SOZINHO = /^\s*(?:[-*]\s+)?\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)\s*$/;
  const estado = { tema: '', aberto: null, editando: false, rascunho: null }; // rascunho: texto em edição (sobrevive a um redesenho da tela)

  const todos = () => App.store.listar({ pasta: PASTA, tipo: 'caderno' })
    .sort((a, b) => String(b.meta.atualizado || '').localeCompare(String(a.meta.atualizado || '')));
  const titulo = d => d.meta.titulo || d.nome.replace(/\.md$/, '');
  const temaDe = d => String(d.meta.tema || 'Geral');
  const temas = () => [...new Set(todos().map(temaDe))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  // ---- vídeos ----
  function video(url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\.|^m\./, '');
      let id = null;
      if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
      else if (host.endsWith('youtube.com')) id = u.searchParams.get('v') || (u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)/) || [])[1];
      if (id && /^[\w-]{6,20}$/.test(id)) {
        const t = Number(String(u.searchParams.get('t') || '').replace(/s$/, '')) || 0;
        return { fonte: 'YouTube', embed: `https://www.youtube-nocookie.com/embed/${id}${t ? '?start=' + t : ''}` };
      }
      const v = host === 'vimeo.com' && u.pathname.match(/^\/(\d+)/);
      if (v) return { fonte: 'Vimeo', embed: `https://player.vimeo.com/video/${v[1]}` };
    } catch { /* não é endereço */ }
    return null;
  }
  const contar = corpo => {
    const linhas = String(corpo || '').split('\n');
    return { imagens: linhas.filter(l => IMG.test(l)).length, videos: linhas.filter(l => { const m = l.match(LINK_SOZINHO); return m && video(m[2]); }).length };
  };

  // ---- gravação ----
  const salvarCorpo = (doc, fn) => App.store.alterar(doc.caminho, atual => ({
    meta: { ...(atual || doc).meta, atualizado: App.hoje() }, corpo: fn(String((atual || doc).corpo || '')),
  }));
  const anexar = (doc, linha) => salvarCorpo(doc, c => `${c.replace(/\s+$/, '')}${c.trim() ? '\n\n' : ''}${linha}\n`);
  // Tira a primeira linha igual a esta (a imagem vai para a lixeira).
  async function removerLinha(doc, linha) {
    const img = linha.match(IMG);
    await salvarCorpo(doc, c => { const l = c.split('\n'); const i = l.indexOf(linha); if (i >= 0) l.splice(i, 1); return l.join('\n').replace(/\n{3,}/g, '\n\n'); });
    if (img) { const c = `${PASTA_IMG}/${img[1].trim()}`; if (await App.store.existe(c)) await App.store.moverParaLixeira(c, { avisar: false }); }
  }
  async function guardarImagem(doc, arquivo) {
    if (!/^image\//.test(arquivo.type)) throw new Error(`"${arquivo.name || 'arquivo'}" não é uma imagem`);
    const ext = EXT[arquivo.type] || (String(arquivo.name || '').match(/\.(\w{3,4})$/)?.[1] || 'png').toLowerCase();
    const caminho = await App.store.gravarBinario(PASTA_IMG, App.slug(titulo(doc)) + '-' + Date.now().toString(36), ext, arquivo);
    await anexar(doc, `![[${caminho.split('/').pop()}]]`);
  }

  // ---- diálogos ----
  function editarDados(doc) {
    const t = el('input', { type: 'text', value: doc ? titulo(doc) : '', required: true, placeholder: 'ex.: Revolução Francesa' });
    const tema = el('input', { type: 'text', value: doc ? temaDe(doc) : estado.tema || '', placeholder: 'ex.: História', list: 'temas-cadernos' });
    const salvar = async () => {
      const nome = t.value.trim();
      if (!nome) { t.focus(); return; }
      const meta = { titulo: nome, tema: tema.value.trim() || 'Geral' };
      const r = await App.tentar(async () => {
        if (doc) return App.store.alterar(doc.caminho, a => ({ meta: { ...(a || doc).meta, ...meta, atualizado: App.hoje() }, corpo: (a || doc).corpo }));
        return App.store.criar(PASTA, nome, { tipo: 'caderno', ...meta, criado: App.hoje(), atualizado: App.hoje(), tags: [] }, '');
      }, 'Não foi possível salvar o caderno');
      if (r) { dlg.close(); if (!doc) { estado.aberto = r.caminho; estado.editando = true; App.emit('dados'); } }
    };
    const dlg = App.dialogo(doc ? 'Editar caderno' : 'Novo caderno', el('div', { class: 'grade-form' },
      App.campo('Título', t), App.campo('Tema', tema),
      el('datalist', { id: 'temas-cadernos' }, temas().map(x => el('option', { value: x })))), [
      el('span', { class: 'espaco' }),
      el('button', { type: 'button', class: 'secundario', text: 'Cancelar', onclick: () => dlg.close() }),
      el('button', { type: 'button', text: doc ? 'Salvar' : 'Criar caderno', onclick: salvar }),
    ]);
    t.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); salvar(); } });
    t.focus();
  }

  function adicionarVideo(doc) {
    const url = el('input', { type: 'url', placeholder: 'https://www.youtube.com/watch?v=…', required: true });
    const t = el('input', { type: 'text', placeholder: 'ex.: Aula 3 — Iluminismo' });
    const ir = async () => {
      const u = url.value.trim();
      if (!/^https?:\/\/\S+$/.test(u)) { url.focus(); App.toast('Cole um endereço que comece com https://', 'erro'); return; }
      const nome = (t.value.trim() || (video(u) ? `Vídeo (${video(u).fonte})` : 'Link')).replace(/[[\]]/g, '');
      if (await App.tentar(async () => { await anexar(doc, `- [${nome}](${u})`); return true; }, 'Não foi possível anexar')) dlg.close();
    };
    const dlg = App.dialogo('Anexar vídeo', el('div', { class: 'grade-form' },
      App.campo('Endereço do vídeo', url, { largo: true, voz: false }),
      App.campo('Título', t, { largo: true }),
      el('p', { class: 'dica largo', text: 'YouTube e Vimeo aparecem como vídeo no caderno; outros endereços viram link. O vídeo só é carregado quando você clicar para assistir.' })), [
      el('span', { class: 'espaco' }),
      el('button', { type: 'button', class: 'secundario', text: 'Cancelar', onclick: () => dlg.close() }),
      el('button', { type: 'button', text: 'Anexar', onclick: ir }),
    ]);
    url.focus();
  }

  async function excluir(doc) {
    if (!App.confirmar(`Mover o caderno "${titulo(doc)}" e as imagens dele para a lixeira?`)) return;
    await App.tentar(async () => {
      for (const l of String(doc.corpo || '').split('\n')) {
        const m = l.match(IMG);
        if (m) { const c = `${PASTA_IMG}/${m[1].trim()}`; if (await App.store.existe(c)) await App.store.moverParaLixeira(c, { avisar: false }); }
      }
      await App.store.moverParaLixeira(doc.caminho);
      estado.aberto = null;
      App.toast('Caderno movido para a lixeira.');
    }, 'Não foi possível excluir');
  }

  // ---- visualização ----
  function blocoImagem(doc, linha, nome) {
    const caminho = `${PASTA_IMG}/${nome.trim()}`;
    const img = el('img', { alt: nome.replace(/\.\w+$/, '').replace(/[-_]/g, ' '), decoding: 'async', loading: 'lazy' });
    const fig = el('figure', { class: 'caderno-imagem' }, img,
      el('button', { type: 'button', class: 'icone remover-bloco', 'aria-label': 'Remover imagem', title: 'Remover imagem', onclick: () => App.tentar(() => removerLinha(doc, linha)) }, App.icone('lixeira')));
    App.store.urlArquivo(caminho).then(u => { img.src = u; }).catch(() => img.replaceWith(el('p', { class: 'aviso', text: `Imagem não encontrada: ${nome}` })));
    return fig;
  }
  function blocoVideo(doc, linha, nome, url, v) {
    const palco = el('div', { class: 'video-palco' },
      el('button', { type: 'button', class: 'video-carregar', onclick: () => {
        palco.replaceChildren(el('iframe', { src: v.embed, title: nome || 'Vídeo', allow: 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen', allowfullscreen: '', referrerpolicy: 'strict-origin-when-cross-origin', loading: 'lazy' }));
      } }, App.icone('play'), el('span', { text: 'Carregar vídeo aqui' })));
    return el('figure', { class: 'caderno-video' }, palco,
      el('figcaption', {},
        el('span', {}, el('strong', { text: nome || 'Vídeo' }), ' · ', el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: `abrir no ${v.fonte}` })),
        el('button', { type: 'button', class: 'icone remover-bloco', 'aria-label': `Remover vídeo ${nome}`, title: 'Remover vídeo', onclick: () => App.tentar(() => removerLinha(doc, linha)) }, App.icone('lixeira'))));
  }
  // Texto vira Markdown; linhas de imagem e de vídeo viram blocos próprios.
  function conteudo(doc) {
    const saida = []; let buffer = [];
    const despejar = () => { if (buffer.join('').trim()) saida.push(App.markdown.render(el('div'), buffer.join('\n'))); buffer = []; };
    for (const linha of String(doc.corpo || '').split('\n')) {
      const img = linha.match(IMG);
      const link = linha.match(LINK_SOZINHO);
      const v = link && video(link[2]);
      if (img) { despejar(); saida.push(blocoImagem(doc, linha, img[1])); } else if (v) { despejar(); saida.push(blocoVideo(doc, linha, link[1], link[2], v)); } else buffer.push(linha);
    }
    despejar();
    return saida.length ? saida : [el('p', { class: 'vazio', text: 'Caderno vazio. Escreva, anexe um vídeo ou cole uma imagem (Ctrl+V).' })];
  }

  function editor(doc) {
    const area = el('textarea', { rows: 16, class: 'caderno-texto', text: estado.rascunho ?? doc.corpo ?? '', oninput: e => { estado.rascunho = e.target.value; } });
    const fechar = () => { estado.editando = false; estado.rascunho = null; App.emit('dados'); };
    const salvar = async () => {
      if (await App.tentar(async () => { await salvarCorpo(doc, () => area.value.replace(/\s+$/, '') + '\n'); return true; }, 'Não foi possível salvar')) {
        fechar();
      }
    };
    return el('div', { class: 'caderno-editor' },
      App.campo('Texto do caderno (Markdown: # título, **negrito**, - lista)', area, { largo: true }),
      el('p', { class: 'dica', text: 'Linhas ![[imagem]] e - [título](link do vídeo) viram imagem e vídeo na visualização.' }),
      el('div', { class: 'acoes' },
        el('button', { type: 'button', class: 'secundario', text: 'Cancelar', onclick: fechar }),
        el('button', { type: 'button', text: 'Salvar texto', onclick: salvar })));
  }

  function aberto(doc, redesenhar) {
    const arquivo = el('input', { type: 'file', accept: 'image/*', multiple: true, class: 'sr', id: 'caderno-img',
      onchange: async e => {
        for (const f of e.target.files || []) await App.tentar(() => guardarImagem(doc, f), 'Não foi possível guardar a imagem');
        e.target.value = '';
      } });
    const raiz = el('article', { class: 'caderno-aberto', tabindex: '-1' },
      el('header', { class: 'caderno-cabecalho' },
        el('button', { type: 'button', class: 'secundario', onclick: () => { estado.aberto = null; estado.editando = false; estado.rascunho = null; redesenhar(); } }, App.icone('esquerda'), ' Cadernos'),
        el('div', { class: 'espaco' },
          el('p', { class: 'sobretitulo', text: temaDe(doc) }),
          el('h2', { class: 'caderno-titulo', text: titulo(doc) })),
        el('div', { class: 'acoes' },
          el('button', { type: 'button', class: 'secundario', onclick: () => { estado.editando = !estado.editando; estado.rascunho = null; redesenhar(); } }, App.icone('lapis'), estado.editando ? ' Ver caderno' : ' Escrever'),
          el('button', { type: 'button', class: 'secundario', onclick: () => adicionarVideo(doc) }, App.icone('play'), ' Vídeo'),
          arquivo, el('label', { for: 'caderno-img', class: 'botao secundario' }, App.icone('imagem'), ' Imagem'),
          el('button', { type: 'button', class: 'icone', 'aria-label': 'Renomear ou mudar o tema', title: 'Renomear ou mudar o tema', onclick: () => editarDados(doc) }, App.icone('ajustes')),
          el('button', { type: 'button', class: 'icone', 'aria-label': 'Excluir caderno', title: 'Excluir caderno', onclick: () => excluir(doc) }, App.icone('lixeira')))),
      estado.editando ? editor(doc) : el('div', { class: 'caderno-conteudo' }, conteudo(doc)));
    // Colar ou arrastar imagens direto no caderno.
    raiz.addEventListener('paste', e => {
      const imgs = [...(e.clipboardData?.files || [])].filter(f => /^image\//.test(f.type));
      if (!imgs.length) return;
      e.preventDefault(); imgs.forEach(f => App.tentar(() => guardarImagem(doc, f), 'Não foi possível guardar a imagem'));
    });
    raiz.addEventListener('dragover', e => { if ([...(e.dataTransfer?.items || [])].some(i => i.kind === 'file')) { e.preventDefault(); raiz.classList.add('arrastando'); } });
    raiz.addEventListener('dragleave', () => raiz.classList.remove('arrastando'));
    raiz.addEventListener('drop', e => {
      const imgs = [...(e.dataTransfer?.files || [])].filter(f => /^image\//.test(f.type));
      raiz.classList.remove('arrastando');
      if (!imgs.length) return;
      e.preventDefault(); imgs.forEach(f => App.tentar(() => guardarImagem(doc, f), 'Não foi possível guardar a imagem'));
    });
    return raiz;
  }

  function lista(redesenhar) {
    const docs = todos().filter(d => !estado.tema || temaDe(d) === estado.tema);
    const ts = temas();
    return el('div', { class: 'cadernos' },
      el('div', { class: 'barra' },
        ts.length > 1 ? el('div', { class: 'chips', role: 'group', 'aria-label': 'Temas' },
          ['', ...ts].map(t => el('button', { type: 'button', class: 'chip', 'aria-pressed': String(estado.tema === t), text: t || 'Todos',
            onclick: () => { estado.tema = t; redesenhar(); } }))) : el('span', { class: 'espaco' }),
        el('button', { type: 'button', onclick: () => editarDados(null) }, App.icone('mais'), ' Novo caderno')),
      docs.length ? el('ul', { class: 'grade-cadernos' }, docs.map(d => {
        const n = contar(d.corpo);
        return el('li', {}, el('button', { type: 'button', class: 'cartao-caderno', onclick: () => { estado.aberto = d.caminho; estado.editando = false; estado.rascunho = null; redesenhar(); } },
          el('span', { class: 'sobretitulo', text: temaDe(d) }),
          el('strong', { text: titulo(d) }),
          el('span', { class: 'dica', text: [n.videos ? `${n.videos} vídeo(s)` : '', n.imagens ? `${n.imagens} imagem(ns)` : '', d.meta.atualizado ? 'editado em ' + App.fmtData(d.meta.atualizado) : ''].filter(Boolean).join(' · ') || 'vazio' })));
      })) : el('p', { class: 'vazio', text: 'Nenhum caderno ainda. Crie um por tema: uma matéria, um curso, um assunto que você está aprendendo.' }));
  }

  // Desenha dentro da aba Cadernos de Estudo.
  function render(container) {
    const redesenhar = () => render(container);
    const doc = estado.aberto && App.store.obter(estado.aberto);
    if (estado.aberto && !doc) estado.aberto = null;
    container.replaceChildren(doc ? aberto(doc, redesenhar) : lista(redesenhar));
  }

  return { render, todos, video };
})();
