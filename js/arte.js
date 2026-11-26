'use strict';
// Módulo Arte: galeria de referências (imagens, quadros). A imagem fica em Arte/imagens/ e
// cada referência tem um Arte/<slug>.md com os dados; o corpo começa com ![[imagem]] para
// aparecer no Obsidian, seguido das anotações do usuário.
App.arte = (() => {
  const { el } = App;
  const PASTA = 'Arte';
  const PASTA_IMG = 'Arte/imagens';
  const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/svg+xml': 'svg', 'image/bmp': 'bmp' };
  const estado = { colecao: '', busca: '' };

  const todas = () => App.store.listar({ pasta: PASTA, tipo: 'arte' })
    .sort((a, b) => String(b.meta.criado || '').localeCompare(String(a.meta.criado || '')) || titulo(a).localeCompare(titulo(b), 'pt-BR'));
  const titulo = d => d.meta.titulo || d.nome;
  const colecoes = () => {
    const c = new Map();
    for (const d of todas()) if (d.meta.colecao) c.set(d.meta.colecao, (c.get(d.meta.colecao) || 0) + 1);
    return [...c.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
  };

  // ---- corpo: ![[arquivo]] + anotações ----
  const nomeArquivo = caminho => String(caminho || '').split('/').pop();
  const embed = meta => (meta.imagem ? `![[${nomeArquivo(meta.imagem)}]]` : meta.imagem_url ? `![](${meta.imagem_url})` : '');
  function separarCorpo(doc) {
    const c = String(doc?.corpo || '');
    const e = doc ? embed(doc.meta) : '';
    return e && c.trimStart().startsWith(e) ? c.trimStart().slice(e.length).replace(/^\s*\n/, '') : c;
  }
  const montarCorpo = (meta, notas) => [embed(meta), String(notas || '').trim()].filter(Boolean).join('\n\n');

  // ---- imagem ----
  async function srcDe(meta) {
    if (meta.imagem) { try { return await App.store.urlArquivo(meta.imagem); } catch { return null; } }
    return meta.imagem_url || null;
  }
  function imagem(meta, rotulo, classe = 'arte-img') {
    const img = el('img', { class: classe, alt: rotulo || '', decoding: 'async', referrerpolicy: 'no-referrer' });
    const falhou = () => img.replaceWith(el('span', { class: classe + ' sem-imagem', role: 'img', 'aria-label': (rotulo || '') + ' (imagem não encontrada)', text: 'Imagem não encontrada' }));
    img.addEventListener('error', falhou, { once: true });
    srcDe(meta).then(src => (src ? (img.src = src) : falhou()));
    return img;
  }

  async function guardarImagem(blob, base) {
    const ext = EXT[blob.type] || (String(blob.name || '').match(/\.(\w{3,4})$/)?.[1] || 'jpg').toLowerCase();
    return App.store.gravarBinario(PASTA_IMG, App.slug(base), ext, blob);
  }
  const semExtensao = nome => String(nome || '').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();

  async function criarDeArquivo(arquivo, extra = {}) {
    if (!/^image\//.test(arquivo.type)) throw new Error(`"${arquivo.name}" não é uma imagem`);
    const t = extra.titulo || semExtensao(arquivo.name) || 'referencia';
    const caminhoImg = await guardarImagem(arquivo, t);
    const meta = {
      tipo: 'arte', titulo: t, artista: null, ano: null, colecao: estado.colecao || null,
      imagem: caminhoImg, fonte: null, criado: App.hoje(), tags: [], ...extra,
    };
    const doc = await App.store.criar(PASTA, t, meta, montarCorpo(meta, ''));
    App.gamificacao.registrarEvento('arte_adicionada', doc.caminho);
    return doc;
  }

  async function adicionarArquivos(arquivos) {
    const imgs = [...arquivos].filter(a => /^image\//.test(a.type));
    if (!imgs.length) { App.toast('Nenhuma imagem encontrada para adicionar.', 'erro'); return; }
    let ultimo = null; let n = 0;
    App.emLote = true;
    try {
      for (const a of imgs) {
        try { ultimo = await criarDeArquivo(a); n++; } catch (e) { App.toast(`Não foi possível adicionar ${a.name}: ${e.message}`, 'erro'); }
      }
    } finally { App.emLote = false; App.emit('dados'); }
    if (n === 1 && ultimo) editar(App.store.obter(ultimo.caminho) || ultimo);
    else if (n) App.toast(`${n} imagens adicionadas à galeria.`);
  }

  // Tenta baixar a imagem para a pasta; se o site não permitir, guarda só o endereço.
  async function adicionarDeEndereco(url, extra) {
    let blob = null;
    try {
      const r = await fetch(url, { referrerPolicy: 'no-referrer', credentials: 'omit' });
      if (r.ok) { const b = await r.blob(); if (/^image\//.test(b.type)) blob = b; }
    } catch { /* o site bloqueou a cópia: fica só o link */ }
    if (blob) return criarDeArquivo(new File([blob], (extra.titulo || 'referencia') + '.' + (EXT[blob.type] || 'jpg'), { type: blob.type }), extra);
    const meta = { tipo: 'arte', titulo: extra.titulo || 'Referência', artista: null, ano: null, colecao: estado.colecao || null,
      imagem_url: url, fonte: url, criado: App.hoje(), tags: [], ...extra };
    App.toast('O site não deixou copiar a imagem; guardei o endereço (ela precisa de internet para aparecer).');
    return App.store.criar(PASTA, meta.titulo, meta, montarCorpo(meta, ''));
  }

  function escolherImagens() {
    const inp = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    inp.addEventListener('change', () => { adicionarArquivos(inp.files); inp.remove(); });
    inp.addEventListener('cancel', () => inp.remove());
    document.body.append(inp);
    inp.click();
  }

  function dialogoEndereco() {
    const url = el('input', { type: 'url', placeholder: 'https://…/imagem.jpg', required: true });
    const t = el('input', { type: 'text' });
    const ir = async () => {
      const u = url.value.trim();
      if (!/^https?:\/\//.test(u)) { url.focus(); App.toast('Cole um endereço que comece com https://', 'erro'); return; }
      const doc = await App.tentar(() => adicionarDeEndereco(u, { titulo: t.value.trim() || 'Referência' }), 'Não foi possível adicionar');
      if (doc) { dlg.close(); App.toast('Referência adicionada.'); }
    };
    const dlg = App.dialogo('Adicionar imagem da internet', el('div', { class: 'grade-form' },
      App.campo('Endereço da imagem', url, { largo: true, voz: false }),
      App.campo('Título', t, { largo: true }),
      el('p', { class: 'dica largo', text: 'No navegador, clique com o botão direito na imagem e escolha “Copiar endereço da imagem”. Se o site permitir, a imagem é copiada para a sua pasta.' })), [
      el('span', { class: 'espaco' }),
      el('button', { type: 'button', class: 'secundario', text: 'Cancelar', onclick: () => dlg.close() }),
      el('button', { type: 'button', text: 'Adicionar', onclick: ir }),
    ]);
    url.focus();
  }

  // ---- edição e visualização ----
  function editar(doc) {
    const m = doc.meta;
    const f = {
      titulo: el('input', { type: 'text', value: titulo(doc), required: true }),
      artista: el('input', { type: 'text', value: m.artista || '' }),
      ano: el('input', { type: 'text', value: m.ano ?? '', placeholder: 'ex.: 1889' }),
      colecao: el('input', { type: 'text', value: m.colecao || '', list: 'arte-colecoes', placeholder: 'ex.: paletas, retratos' }),
      fonte: el('input', { type: 'url', value: m.fonte || '', placeholder: 'https://…' }),
      tags: el('input', { type: 'text', value: App.lista(m.tags).join(', ') }),
      notas: el('textarea', { rows: 6, class: 'editor-md', value: separarCorpo(doc) }),
    };
    const sugestoes = el('datalist', { id: 'arte-colecoes' }, colecoes().map(([c]) => el('option', { value: c })));
    const corpo = el('div', { class: 'grade-form' },
      el('div', { class: 'previa-arte largo' }, imagem(m, titulo(doc))),
      App.campo('Título', f.titulo, { largo: true }),
      App.campo('Artista', f.artista),
      App.campo('Ano', f.ano, { voz: false }),
      App.campo('Coleção', f.colecao), sugestoes,
      App.campo('Fonte (link)', f.fonte, { voz: false }),
      App.campo('Tags', f.tags, { largo: true }),
      App.campo('Anotações (Markdown)', f.notas, { largo: true }));
    const salvar = async () => {
      const t = f.titulo.value.trim();
      if (!t) { f.titulo.focus(); App.toast('Dê um título.', 'erro'); return; }
      const meta = { ...m, titulo: t, artista: f.artista.value.trim() || null, ano: f.ano.value.trim() || null,
        colecao: f.colecao.value.trim() || null, fonte: f.fonte.value.trim() || null, tags: App.tagsDeTexto(f.tags.value) };
      const ok = await App.tentar(() => App.store.gravar(doc.caminho, meta, montarCorpo(meta, f.notas.value)), 'Não foi possível salvar');
      if (ok) { dlg.close(); App.toast('Referência salva.'); }
    };
    const dlg = App.dialogo('Editar referência', corpo, [
      el('button', { type: 'button', class: 'perigo', text: 'Excluir', onclick: () => excluir(doc, dlg) }),
      el('span', { class: 'espaco' }),
      el('button', { type: 'button', class: 'secundario', text: 'Cancelar', onclick: () => dlg.close() }),
      el('button', { type: 'button', text: 'Salvar', onclick: salvar }),
    ]);
    dlg.classList.add('grande');
    f.titulo.focus();
  }

  async function excluir(doc, dlg) {
    if (!App.confirmar(`Mover "${titulo(doc)}" e a imagem para a lixeira?`)) return;
    const ok = await App.tentar(async () => {
      if (doc.meta.imagem && await App.store.existe(doc.meta.imagem)) await App.store.moverParaLixeira(doc.meta.imagem, { avisar: false });
      await App.store.moverParaLixeira(doc.caminho);
      return true;
    }, 'Não foi possível excluir');
    if (ok) { dlg.close(); App.toast('Movido para .lixeira/'); }
  }

  function ver(lista, i) {
    const doc = lista[i];
    const m = doc.meta;
    const notas = separarCorpo(doc);
    const navegar = passo => { dlg.close(); ver(lista, (i + passo + lista.length) % lista.length); };
    const dlg = App.dialogo(titulo(doc), el('figure', { class: 'ver-arte' },
      imagem(m, titulo(doc), 'arte-grande'),
      el('figcaption', {},
        el('p', { class: 'sobretitulo', text: [m.artista, m.ano, m.colecao].filter(Boolean).join(' · ') || 'Sem artista' }),
        el('div', { class: 'selos' }, App.lista(m.tags).map(t => el('span', { class: 'selo tag', text: '#' + t }))),
        m.fonte ? el('p', {}, el('a', { href: m.fonte, target: '_blank', rel: 'noopener noreferrer', text: 'Abrir fonte' })) : null,
        notas.trim() ? App.markdown.render(el('div'), notas) : null)), [
      lista.length > 1 ? el('button', { type: 'button', class: 'secundario', 'aria-label': 'Anterior', onclick: () => navegar(-1) }, App.icone('esquerda')) : null,
      lista.length > 1 ? el('button', { type: 'button', class: 'secundario', 'aria-label': 'Próxima', onclick: () => navegar(1) }, App.icone('direita')) : null,
      el('span', { class: 'espaco' }),
      el('button', { type: 'button', text: 'Editar', onclick: () => { dlg.close(); editar(doc); } }),
    ]);
    dlg.classList.add('grande');
    dlg.addEventListener('keydown', e => {
      if (e.target.closest('input, textarea')) return;
      if (e.key === 'ArrowLeft' && lista.length > 1) navegar(-1);
      if (e.key === 'ArrowRight' && lista.length > 1) navegar(1);
    });
  }

  // Colar uma imagem (Ctrl+V) na tela da galeria.
  document.addEventListener('paste', e => {
    if (!/^#\/arte/.test(location.hash) || document.querySelector('dialog[open]') || !App.store.conectado()) return;
    const arquivos = [...(e.clipboardData?.files || [])].filter(f => /^image\//.test(f.type));
    if (!arquivos.length) return;
    e.preventDefault();
    adicionarArquivos(arquivos.map((f, i) => (f.name && f.name !== 'image.png' ? f
      : new File([f], `colado-${App.agoraISO().replace(/[-:T]/g, '')}${i ? '-' + i : ''}.${EXT[f.type] || 'png'}`, { type: f.type }))));
  });

  function render(container) {
    const docs = todas();
    const filtradas = () => { const q = estado.busca.trim().toLowerCase(); return docs.filter(d => !estado.colecao || d.meta.colecao === estado.colecao)
      .filter(d => !q || [titulo(d), d.meta.artista, d.meta.colecao, d.corpo, ...App.lista(d.meta.tags)].join(' ').toLowerCase().includes(q)); };
    const galeria = el('ul', { class: 'galeria' });
    const desenhar = () => {
      const lista = filtradas();
      galeria.replaceChildren(...(lista.length ? lista.map((d, i) => el('li', {},
        el('button', { type: 'button', class: 'peca', 'aria-label': [titulo(d), d.meta.artista].filter(Boolean).join(', de '), onclick: () => ver(lista, i) },
          imagem(d.meta, ''),
          el('span', { class: 'peca-legenda', 'aria-hidden': 'true' }, el('strong', { text: titulo(d) }), d.meta.artista ? el('span', { text: d.meta.artista }) : null))))
        : [el('li', { class: 'vazio', text: docs.length ? 'Nenhuma referência encontrada.' : 'Galeria vazia. Adicione imagens, arraste arquivos para cá ou cole com Ctrl+V.' })]));
    };
    desenhar();

    const area = el('div', { class: 'area-soltar' }, galeria);
    area.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); area.classList.add('arrastando'); } });
    area.addEventListener('dragleave', e => { if (!area.contains(e.relatedTarget)) area.classList.remove('arrastando'); });
    area.addEventListener('drop', e => { e.preventDefault(); area.classList.remove('arrastando'); adicionarArquivos(e.dataTransfer.files); });

    container.replaceChildren(
      el('header', { class: 'cabecalho-tela' },
        el('h1', { text: 'Arte' }),
        el('div', { class: 'acoes' },
          el('button', { type: 'button', class: 'secundario', text: 'Imagem da internet', onclick: dialogoEndereco }),
          el('button', { type: 'button', onclick: escolherImagens }, App.icone('imagem'), ' Adicionar imagens'))),
      el('p', { class: 'resumo', text: 'Referências visuais: quadros, fotos, paletas. Arraste imagens para cá ou cole com Ctrl+V. Elas ficam salvas em Arte/imagens na sua pasta.' }),
      el('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrar por coleção' },
        [['', docs.length], ...colecoes()].map(([c, n]) => el('button', {
          type: 'button', class: 'chip', 'aria-pressed': String(estado.colecao === c), text: `${c || 'Todas'} (${n})`,
          onclick: () => { estado.colecao = c; render(container); },
        }))),
      el('div', { class: 'barra' },
        el('input', { type: 'search', placeholder: 'Buscar por título, artista, tag…', 'aria-label': 'Buscar na galeria', value: estado.busca,
          oninput: e => { estado.busca = e.target.value; desenhar(); } })),
      area);
  }

  return { render, todas };
})();
