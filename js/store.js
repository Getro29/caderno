'use strict';
// Único ponto de acesso aos arquivos. Interface genérica (listar, ler, gravar, criar, mover,
// moverParaLixeira) para que um adaptador futuro (ex.: sincronização no celular) a substitua.
App.store = (() => {
  const PASTAS = ['Entrada', 'Tarefas', 'Notas', 'Livros', 'Entretenimento', 'Calendario', 'Arte', 'Diario', 'Timebox', 'Dieta', 'Estudo', 'Caderno'];
  const cache = new Map(); // caminho -> doc
  let raiz = null;

  // ---- IndexedDB: guarda apenas o handle da pasta e preferências ----
  function db() {
    return new Promise((ok, falha) => {
      const req = indexedDB.open('caderno', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('config');
      req.onsuccess = () => ok(req.result);
      req.onerror = () => falha(req.error);
    });
  }
  async function cfg(chave, valor) {
    const base = await db();
    return new Promise((ok, falha) => {
      const tx = base.transaction('config', valor === undefined ? 'readonly' : 'readwrite');
      const os = tx.objectStore('config');
      const req = valor === undefined ? os.get(chave) : os.put(valor, chave);
      req.onsuccess = () => ok(req.result);
      req.onerror = () => falha(req.error);
    });
  }

  const suportado = () => typeof window.showDirectoryPicker === 'function';

  async function permitir(handle, pedir) {
    if (!handle.queryPermission) return true;
    const opts = { mode: 'readwrite' };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    return pedir && (await handle.requestPermission(opts)) === 'granted';
  }

  async function escolherPasta() {
    const h = await window.showDirectoryPicker({ id: 'caderno', mode: 'readwrite' });
    if (!(await permitir(h, true))) throw new Error('permissão negada');
    raiz = h;
    await cfg('pasta', h).catch(() => {});
    await carregarTudo();
  }
  async function pastaSalva() { try { return await cfg('pasta'); } catch { return null; } }
  async function reconectar(pedir = true) {
    const h = await pastaSalva();
    if (!h || !(await permitir(h, pedir))) return false;
    raiz = h; await carregarTudo(); return true;
  }
  const conectado = () => !!raiz;
  const nomePasta = () => raiz?.name || '';

  // ---- navegação ----
  const partes = caminho => caminho.split('/').filter(Boolean);
  async function dir(caminhoDir, criar = false) {
    let d = raiz;
    for (const p of partes(caminhoDir)) d = await d.getDirectoryHandle(p, { create: criar });
    return d;
  }
  function dividir(caminho) {
    const ps = partes(caminho);
    return { pasta: ps.slice(0, -1).join('/'), nome: ps[ps.length - 1] };
  }
  async function arquivo(caminho, criar = false) {
    const { pasta, nome } = dividir(caminho);
    return (await dir(pasta, criar)).getFileHandle(nome, { create: criar });
  }
  async function existe(caminho) {
    try { await arquivo(caminho); return true; } catch { return false; }
  }

  // ---- leitura ----
  async function ler(caminho) {
    const fh = await arquivo(caminho);
    const f = await fh.getFile();
    const texto = await f.text();
    const r = App.yaml.parse(texto);
    const doc = {
      caminho, nome: dividir(caminho).nome.replace(/\.md$/i, ''),
      meta: r.meta, corpo: r.corpo, brutos: r.brutos,
      erro: r.erro || null, modificado: f.lastModified,
    };
    cache.set(caminho, doc);
    return doc;
  }

  async function varrer(d, prefixo, falhas) {
    for await (const [nome, h] of d.entries()) {
      if (nome.startsWith('.')) continue;
      const c = prefixo ? `${prefixo}/${nome}` : nome;
      if (h.kind === 'directory') await varrer(h, c, falhas);
      else if (/\.md$/i.test(nome)) {
        try { await ler(c); } catch (e) { falhas.push(c); console.warn('falha ao ler', c, e); }
      }
    }
  }

  async function carregarTudo() {
    cache.clear();
    const falhas = [];
    for (const p of PASTAS) {
      try { await varrer(await dir(p), p, falhas); } catch (e) { if (e.name !== 'NotFoundError') throw e; }
    }
    const comErro = [...cache.values()].filter(d => d.erro);
    if (falhas.length || comErro.length) {
      App.toast(`${falhas.length + comErro.length} arquivo(s) não puderam ser lidos e não serão alterados.`, 'erro');
    }
    App.emit('dados');
  }

  // Lista do cache. filtro: prefixo de pasta e/ou tipo.
  function listar({ pasta = '', tipo } = {}) {
    return [...cache.values()].filter(d =>
      (!pasta || d.caminho.startsWith(pasta + '/')) && (!tipo || d.meta.tipo === tipo));
  }
  const obter = caminho => cache.get(caminho);

  // ---- escrita ----
  async function escrever(caminho, texto) {
    const fh = await arquivo(caminho, true);
    const w = await fh.createWritable();
    try { await w.write(texto); await w.close(); } catch (e) { await w.abort?.(); throw e; }
  }

  // Gravações no mesmo arquivo entram numa fila, para cliques rápidos não se atropelarem.
  // opcoes.inline: a tela que gravou já se atualizou sozinha; não redesenhar a página
  // (senão o campo em edição perderia o foco). Outros ouvintes (sino, contadores) ainda são avisados.
  const filas = new Map();
  function gravar(caminho, meta, corpo, opcoes = {}) {
    const anterior = filas.get(caminho) || Promise.resolve();
    const atual = anterior.catch(() => {}).then(() => gravarAgora(caminho, meta, corpo, opcoes));
    filas.set(caminho, atual);
    atual.finally(() => { if (filas.get(caminho) === atual) filas.delete(caminho); }).catch(() => {});
    return atual;
  }
  // Alteração calculada sobre a versão mais recente do arquivo, já dentro da fila:
  // fn(docAtual ou null) devolve { meta, corpo }. Evita que dois cliques seguidos se apaguem.
  function alterar(caminho, fn, opcoes = {}) {
    const anterior = filas.get(caminho) || Promise.resolve();
    const atual = anterior.catch(() => {}).then(() => {
      const { meta, corpo } = fn(cache.get(caminho) || null);
      return gravarAgora(caminho, meta, corpo, opcoes);
    });
    filas.set(caminho, atual);
    atual.finally(() => { if (filas.get(caminho) === atual) filas.delete(caminho); }).catch(() => {});
    return atual;
  }
  async function gravarAgora(caminho, meta, corpo, opcoes) {
    const antigo = cache.get(caminho);
    if (antigo?.erro) throw new Error('arquivo com formato não reconhecido; edite-o no Obsidian');
    if (antigo) {
      const atual = await (await arquivo(caminho)).getFile();
      if (atual.lastModified > antigo.modificado) {
        await ler(caminho); App.emit('dados');
        throw new Error('o arquivo foi alterado fora do Caderno; recarreguei a versão nova, refaça a edição');
      }
    }
    await escrever(caminho, App.yaml.serializar(meta, corpo, antigo?.brutos));
    const doc = await ler(caminho);
    App.emit('dados', opcoes.inline ? { inline: true } : undefined);
    return doc;
  }

  async function caminhoLivre(pasta, base) {
    let c = `${pasta}/${base}.md`; let n = 2;
    while (cache.has(c) || await existe(c)) c = `${pasta}/${base}-${n++}.md`;
    return c;
  }

  async function criar(pasta, base, meta, corpo) {
    const c = await caminhoLivre(pasta, App.slug(base));
    await escrever(c, App.yaml.serializar(meta, corpo));
    const doc = await ler(c);
    App.emit('dados');
    return doc;
  }

  async function remover(caminho) {
    const { pasta, nome } = dividir(caminho);
    await (await dir(pasta)).removeEntry(nome);
    cache.delete(caminho);
  }

  // Move para outra pasta: copia primeiro, só remove o original depois da cópia gravada.
  async function mover(caminho, novaPasta, meta, corpo) {
    const doc = cache.get(caminho);
    if (doc?.erro) throw new Error('arquivo com formato não reconhecido');
    const destino = await caminhoLivre(novaPasta, dividir(caminho).nome.replace(/\.md$/i, ''));
    await escrever(destino, App.yaml.serializar(meta, corpo, doc?.brutos));
    await remover(caminho);
    const novo = await ler(destino);
    App.emit('dados');
    return novo;
  }

  async function moverParaLixeira(caminho, { avisar = true } = {}) {
    const conteudo = await (await arquivo(caminho)).getFile();
    const carimbo = App.agoraISO().replace(/[-:T]/g, '');
    const destino = `.lixeira/${carimbo}-${caminho.replace(/\//g, '__')}`;
    await escrever(destino, conteudo);
    await remover(caminho);
    liberarUrl(caminho);
    if (avisar) App.emit('dados');
  }

  // ---- arquivos binários (imagens da galeria de Arte) ----
  const urls = new Map(); // caminho -> object URL
  function liberarUrl(caminho) {
    if (urls.has(caminho)) { URL.revokeObjectURL(urls.get(caminho)); urls.delete(caminho); }
  }
  async function gravarBinario(pasta, base, extensao, blob) {
    let c = `${pasta}/${base}.${extensao}`; let n = 2;
    while (await existe(c)) c = `${pasta}/${base}-${n++}.${extensao}`;
    await escrever(c, blob);
    return c;
  }
  async function urlArquivo(caminho) {
    if (!urls.has(caminho)) urls.set(caminho, URL.createObjectURL(await (await arquivo(caminho)).getFile()));
    return urls.get(caminho);
  }

  return {
    suportado, escolherPasta, pastaSalva, reconectar, conectado, nomePasta,
    carregarTudo, listar, obter, ler, gravar, alterar, criar, mover, moverParaLixeira,
    existe, gravarBinario, urlArquivo,
  };
})();
