'use strict';
// Desafios entre amigos, sem servidor. Dois tipos:
//   - corrida: todos leem o mesmo livro (ou veem a mesma série/anime); vence quem termina em menos dias;
//   - lista:   uma lista de filmes; vence quem vê mais filmes da lista até o prazo.
// Cada desafio é um arquivo Desafios/<slug>.md. O placar viaja dentro de um link
// (#/desafio?d=...): quem recebe entra no desafio ou atualiza o próprio placar. Regra do usuário:
// o link leva título, autor, ano, capa, prazo, a lista de filmes e, de cada participante, nome,
// datas de início/fim e quantos filmes viu. Nada mais da pasta. Vencer dá selo, não dá XP.
App.desafios = (() => {
  const { el } = App;
  const PASTA = 'Desafios';
  const MAX_LISTA = 40;
  const MAX_PARTICIPANTES = 30;
  const CAT = { livro: 'livro', serie: 'série', anime: 'anime', filme: 'filmes' };
  const CABECALHO = '| Participante | Começou | Terminou | Dias | Vistos | Último visto | Código |';
  const ID = /^p-[a-z0-9]{1,16}$/;
  const C = () => App.compartilhar;

  const data = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : null);
  const maior = (a, b) => (!a ? b : !b ? a : a > b ? a : b);
  const paraData = s => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); };
  // Começou e terminou no mesmo dia = 1 dia.
  const diasEntre = (a, b) => Math.round((paraData(b) - paraData(a)) / 86400000) + 1;
  const sorteio = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  const chave = t => App.slug(t);
  const nomeObra = d => d.meta.titulo || d.nome;
  const nomePerfil = () => C().limitar(App.store.obter('Caderno/perfil.md')?.meta?.nome, 40).replace(/\|/g, '/');
  const todos = () => App.store.listar({ pasta: PASTA, tipo: 'desafio' });
  const tituloPadrao = (modo, obra) => (modo === 'lista' ? 'Quem vê mais filmes da lista?' : `Quem termina ${obra} primeiro?`);
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  // ---------------- corpo do arquivo ----------------
  // ## Lista  → "- Título (ano)"      ## Placar → tabela, uma linha por participante.
  // Linhas fora desse formato (edições no Obsidian) são mantidas.
  function linha(r) {
    const comecou = data(r.comecou); const terminou = data(r.terminou);
    const ok = !!(comecou && terminou && terminou >= comecou);
    return {
      id: ID.test(String(r.id)) ? String(r.id) : null,
      nome: C().limitar(r.nome, 40).replace(/\|/g, '/') || 'Sem nome',
      comecou, terminou: ok ? terminou : null, dias: ok ? diasEntre(comecou, terminou) : null,
      vistos: Math.max(0, Math.min(999, Math.floor(Number(r.vistos)) || 0)), ultimo: data(r.ultimo),
    };
  }
  const instantaneo = p => linha(p); // tira campos só de tela (eu, obra, contados)

  function lerCorpo(corpo) {
    const lista = []; const participantes = []; const outras = [];
    let secao = '';
    for (const l of String(corpo || '').split('\n')) {
      const t = l.trim();
      if (/^## Lista\s*$/i.test(t)) { secao = 'lista'; continue; }
      if (/^## Placar\s*$/i.test(t)) { secao = 'placar'; continue; }
      if (/^#{1,6}\s/.test(t)) secao = '';
      if (secao && !t) continue;
      if (secao === 'lista') {
        const m = t.match(/^[-*]\s+(?:\[[ xX]\]\s+)?(.+?)(?:\s+\((\d{4})\))?$/);
        if (m) { lista.push({ titulo: m[1].trim(), ano: m[2] || null }); continue; }
      }
      if (secao === 'placar' && t.startsWith('|')) {
        const c = t.replace(/^\||\|$/g, '').split('|').map(x => x.trim());
        if (c.length >= 7 && ID.test(c[6])) {
          participantes.push(linha({ id: c[6], nome: c[0], comecou: c[1], terminou: c[2], vistos: c[4], ultimo: c[5] }));
          continue;
        }
        if (/^\|\s*:?-|^\|\s*Participante\s*\|/i.test(t)) continue; // cabeçalho, refeito ao gravar
      }
      outras.push(l);
    }
    return { lista, participantes, outras };
  }

  function montarCorpo(lista, participantes, outras = []) {
    const limpo = s => String(s ?? '').replace(/\|/g, '/');
    const partes = [];
    if (lista.length) partes.push(['## Lista', '', ...lista.map(f => `- ${limpo(f.titulo)}${f.ano ? ` (${f.ano})` : ''}`)].join('\n'));
    if (participantes.length) {
      partes.push(['## Placar', '', CABECALHO, '|---|---|---|---:|---:|---|---|',
        ...participantes.map(p => `| ${limpo(p.nome)} | ${p.comecou || ''} | ${p.terminou || ''} | ${p.dias ?? ''} | ${p.vistos || ''} | ${p.ultimo || ''} | ${p.id} |`)].join('\n'));
    }
    const resto = outras.join('\n').trim();
    if (resto) partes.push(resto);
    return partes.join('\n\n') + '\n';
  }

  function info(doc) {
    const m = doc.meta || {};
    const { lista, participantes, outras } = lerCorpo(doc.corpo);
    return { doc, m, modo: m.modo === 'lista' ? 'lista' : 'corrida', lista, outros: participantes.filter(p => p.id !== m.eu), outras };
  }

  // ---------------- o meu resultado (calculado dos meus livros/filmes) ----------------
  const pastaDe = cat => (cat === 'livro' ? 'Livros' : 'Entretenimento');
  function obraMinha(m) {
    const doc = m.arquivo ? App.store.obter(String(m.arquivo)) : null;
    if (doc && !doc.erro && (doc.meta.tipo === 'livro') === (m.categoria === 'livro')) return doc;
    const k = chave(m.obra);
    const lista = m.categoria === 'livro' ? App.livros.todos() : App.entretenimento.todos().filter(d => d.meta.categoria === m.categoria);
    return lista.find(d => chave(nomeObra(d)) === k) || null;
  }

  function euLinha(d) {
    const { m, modo, lista } = d;
    const entrei = data(m.entrei) || data(m.inicio) || App.hoje();
    const prazo = data(m.prazo);
    const base = { id: ID.test(String(m.eu)) ? m.eu : 'p-eu', nome: nomePerfil() || 'Você', eu: true, vistos: 0, ultimo: null, terminou: null, dias: null };
    if (modo === 'corrida') {
      const obra = obraMinha(m); const om = obra?.meta || {};
      const comecou = maior(entrei, data(om.inicio));
      const fim = data(om.fim);
      const acabou = (om.status === 'lido' || om.status === 'visto') && fim;
      const vale = acabou && fim >= comecou && (!prazo || fim <= prazo);
      return { ...base, comecou, obra, terminou: vale ? fim : null, dias: vale ? diasEntre(comecou, fim) : null,
        antes: !!(acabou && fim < comecou), atrasado: !!(acabou && prazo && fim > prazo) };
    }
    const meus = new Map(App.entretenimento.todos().map(x => [chave(nomeObra(x)), x]));
    const vistos = lista.map(f => meus.get(chave(f.titulo)))
      .filter(x => x && x.meta.status === 'visto' && data(x.meta.fim) && x.meta.fim >= entrei && (!prazo || x.meta.fim <= prazo));
    return { ...base, comecou: entrei, vistos: vistos.length, ultimo: vistos.map(x => x.meta.fim).sort().pop() || null,
      contados: new Set(vistos.map(x => chave(nomeObra(x)))) };
  }

  // ---------------- placar ----------------
  // Corrida: menos dias vence (empate divide a posição). Lista: mais filmes vence; empate, quem chegou antes.
  function classificar(linhas, modo, prazo) {
    const lista = modo === 'lista';
    const conta = p => (lista ? p.vistos > 0 : !!p.terminou && (!prazo || p.terminou <= prazo));
    const ordem = linhas.slice().sort((a, b) => {
      if (conta(a) !== conta(b)) return conta(a) ? -1 : 1;
      if (!conta(a)) return a.nome.localeCompare(b.nome, 'pt-BR');
      return lista ? (b.vistos - a.vistos) || String(a.ultimo || '9').localeCompare(String(b.ultimo || '9'))
        : (a.dias - b.dias) || a.terminou.localeCompare(b.terminou);
    });
    let pos = 0; let anterior = null;
    return ordem.map((p, i) => {
      if (!conta(p)) return { ...p, pos: null };
      const k = lista ? `${p.vistos}|${p.ultimo}` : String(p.dias);
      if (k !== anterior) { pos = i + 1; anterior = k; }
      return { ...p, pos };
    });
  }
  const placar = d => classificar([euLinha(d), ...d.outros], d.modo, data(d.m.prazo));

  // Acaba no prazo ou quando todo mundo do placar (pelo menos 2) terminou tudo.
  function encerrado(d, linhas) {
    const prazo = data(d.m.prazo);
    if (prazo && App.hoje() > prazo) return true;
    if (linhas.length < 2) return false;
    return d.modo === 'lista' ? d.lista.length > 0 && linhas.every(p => p.vistos >= d.lista.length) : linhas.every(p => p.terminou);
  }
  const venci = (d, linhas) => linhas.length >= 2 && encerrado(d, linhas) && linhas.find(p => p.eu)?.pos === 1;
  // Usado pelo selo "Campeão" do Perfil.
  const vitorias = () => todos().filter(doc => { const d = info(doc); return venci(d, placar(d)); }).length;

  // ---------------- link ----------------
  function pacote(d) {
    const m = d.m;
    const linhas = [euLinha(d), ...d.outros].slice(0, MAX_PARTICIPANTES);
    return {
      v: 1, t: 'desafio', cod: m.codigo, titulo: m.titulo, modo: d.modo, cat: m.categoria, obra: m.obra || null, autor: m.autor || null,
      ano: m.ano || null, capa: C().urlSegura(m.capa) || null, inicio: m.inicio, prazo: m.prazo, criador: m.criador || null,
      lista: d.lista.slice(0, MAX_LISTA).map(f => [f.titulo, f.ano]),
      p: linhas.map(p => [p.id, p.nome, p.comecou, p.terminou, p.vistos, p.ultimo]),
    };
  }
  const link = doc => `${location.origin}${location.pathname}#/desafio?d=${C().codificar(pacote(info(doc)))}`;

  function lerPacote() {
    const bruto = new URLSearchParams(location.hash.split('?')[1] || '').get('d');
    if (!bruto || bruto.length > 16000) return null;
    try {
      const c = C().decodificar(bruto);
      if (!c || c.v !== 1 || c.t !== 'desafio' || !/^d-[a-z0-9]{4,16}$/.test(String(c.cod))) return null;
      // Só campos conhecidos, limpos de novo: o link pode ter sido editado à mão.
      const L = (t, n) => C().limitar(t, n).replace(/\|/g, '/');
      const modo = c.modo === 'lista' ? 'lista' : 'corrida';
      const obra = modo === 'corrida' ? L(c.obra) : null;
      const lista = modo === 'lista' ? (Array.isArray(c.lista) ? c.lista : []).slice(0, MAX_LISTA)
        .map(f => ({ titulo: L(Array.isArray(f) ? f[0] : ''), ano: /^\d{4}$/.test(String(Array.isArray(f) ? f[1] : '')) ? String(f[1]) : null }))
        .filter(f => f.titulo) : [];
      if (modo === 'corrida' ? !obra : !lista.length) return null;
      const participantes = (Array.isArray(c.p) ? c.p : []).slice(0, MAX_PARTICIPANTES).filter(Array.isArray)
        .map(x => linha({ id: x[0], nome: x[1], comecou: x[2], terminou: x[3], vistos: x[4], ultimo: x[5] })).filter(x => x.id);
      return {
        codigo: String(c.cod), modo, obra, lista, participantes,
        titulo: L(c.titulo) || tituloPadrao(modo, obra),
        categoria: modo === 'lista' ? 'filme' : (['livro', 'serie', 'anime'].includes(c.cat) ? c.cat : 'livro'),
        autor: L(c.autor, 80) || null, ano: /^\d{4}$/.test(String(c.ano)) ? Number(c.ano) : null,
        capa: C().urlSegura(c.capa) || null, inicio: data(c.inicio) || App.hoje(), prazo: data(c.prazo), criador: L(c.criador, 40) || null,
      };
    } catch { return null; }
  }

  function frase(d) {
    const eu = euLinha(d);
    const quem = nomePerfil() || 'Alguém';
    const meu = d.modo === 'lista' ? ` Já vi ${eu.vistos} de ${d.lista.length}.` : eu.terminou ? ` Terminei em ${plural(eu.dias, 'dia', 'dias')}.` : '';
    return `${quem} te chamou para um desafio no Bit-life: ${d.m.titulo}.${meu} Veja o placar e entre também.`;
  }

  async function compartilhar(doc) {
    if (!nomePerfil()) {
      App.toast('Ponha seu nome no Perfil antes: é ele que aparece no placar dos amigos.', 'erro');
      App.perfil.editar();
      return;
    }
    const d = info(doc);
    const envio = C().enviar(link(doc), frase(d), 'Quem abrir vê o desafio e o placar (nomes, datas e quantos filmes cada um viu). Nada mais da sua pasta vai junto.');
    sincronizarMinhaLinha(d);
    await envio;
  }

  // ---------------- entrar / atualizar ----------------
  // Corrida: o livro/série vai para "lendo"/"assistindo" com a data de hoje (ou é criado).
  async function prepararObra(p, entrei) {
    const livro = p.categoria === 'livro';
    const andamento = livro ? 'lendo' : 'vendo';
    const existente = obraMinha({ obra: p.obra, categoria: p.categoria });
    if (!existente) {
      const meta = livro
        ? { tipo: 'livro', titulo: p.obra, autor: p.autor, status: andamento, nota: null, paginas: null, inicio: entrei, fim: null, tags: [], ano: p.ano, capa: p.capa }
        : { tipo: 'entretenimento', titulo: p.obra, categoria: p.categoria, status: andamento, nota: null, criador: p.autor, ano: p.ano,
          temporadas: null, episodios: null, inicio: entrei, fim: null, capa: p.capa, tags: [] };
      return App.store.criar(pastaDe(p.categoria), p.obra, meta, '');
    }
    const s = existente.meta.status;
    if (s === 'quero-ler' || s === 'quero-ver') {
      return App.store.gravar(existente.caminho, { ...existente.meta, status: andamento, inicio: entrei, capa: existente.meta.capa || p.capa }, existente.corpo);
    }
    if (s === 'lido' || s === 'visto') {
      App.toast(`Você já terminou "${nomeObra(existente)}" antes. Se for recomeçar, marque como ${livro ? 'Lendo' : 'Assistindo'} e, ao terminar, ponha a nova data em "Terminei em".`);
    }
    return existente;
  }

  // Lista: filmes que eu ainda não tenho entram em "Quero ver".
  async function prepararLista(lista) {
    const tenho = new Set(App.entretenimento.todos().map(x => chave(nomeObra(x))));
    const faltam = lista.filter(f => { const k = chave(f.titulo); if (tenho.has(k)) return false; tenho.add(k); return true; });
    if (!faltam.length) return;
    App.emLote = true;
    try {
      for (const f of faltam) {
        await App.store.criar('Entretenimento', f.titulo, { tipo: 'entretenimento', titulo: f.titulo, categoria: 'filme', status: 'quero-ver',
          nota: null, criador: null, ano: f.ano ? Number(f.ano) : null, inicio: null, fim: null, capa: null, tags: [] }, '');
      }
    } finally { App.emLote = false; App.emit('dados'); }
  }

  function metaDesafio(p, extra) {
    return {
      tipo: 'desafio', titulo: p.titulo, modo: p.modo, categoria: p.categoria, obra: p.obra || null, autor: p.autor || null,
      ano: p.ano ?? null, capa: p.capa || null, inicio: p.inicio, prazo: p.prazo, criador: p.criador || null, codigo: p.codigo,
      eu: 'p-' + sorteio(), entrei: maior(App.hoje(), p.inicio), arquivo: null, criado: App.hoje(), tags: [], ...extra,
    };
  }

  async function entrar(p) {
    const meta = metaDesafio(p);
    if (p.modo === 'corrida') meta.arquivo = (await prepararObra(p, meta.entrei))?.caminho || null;
    else await prepararLista(p.lista);
    const eu = linha({ id: meta.eu, nome: nomePerfil() || 'Você', comecou: meta.entrei });
    return App.store.criar(PASTA, meta.titulo, meta, montarCorpo(p.lista, [eu, ...p.participantes.filter(x => x.id !== meta.eu)]));
  }

  // Junta o placar recebido ao meu. Do mesmo participante, fica o resultado mais avançado.
  const melhor = (novo, velho, modo) => (modo === 'lista' ? novo.vistos >= velho.vistos : !!novo.terminou || !velho.terminou);
  function atualizar(doc, p) {
    return App.store.alterar(doc.caminho, atual => {
      if (!atual) throw new Error('desafio não encontrado');
      const d = info(atual);
      const por = new Map(d.outros.map(x => [x.id, x]));
      for (const x of p.participantes) {
        if (x.id === d.m.eu) continue;
        const velho = por.get(x.id);
        if (!velho || melhor(x, velho, d.modo)) por.set(x.id, x);
      }
      return { meta: atual.meta, corpo: montarCorpo(d.lista, [instantaneo(euLinha(d)), ...por.values()], d.outras) };
    });
  }

  // ---------------- criar ----------------
  function novo() {
    const livros = App.livros.todos().filter(d => d.meta.status !== 'lido');
    const ent = App.entretenimento.todos().filter(d => d.meta.status !== 'visto');
    const series = ent.filter(d => d.meta.categoria === 'serie' || d.meta.categoria === 'anime');
    const filmes = ent.filter(d => (d.meta.categoria || 'filme') === 'filme');
    const ordenar = l => l.slice().sort((a, b) => nomeObra(a).localeCompare(nomeObra(b), 'pt-BR'));
    const opcao = d => el('option', { value: d.caminho, text: nomeObra(d) + (d.meta.status === 'lendo' || d.meta.status === 'vendo' ? ' (em andamento)' : '') });

    const modo = el('select', {},
      el('option', { value: 'corrida', text: 'Corrida: quem termina primeiro (livro, série ou anime)' }),
      el('option', { value: 'lista', text: 'Lista de filmes: quem vê mais até o prazo' }));
    const obra = el('select', {}, el('option', { value: '', text: 'Escolha…' }),
      livros.length ? el('optgroup', { label: 'Livros' }, ordenar(livros).map(opcao)) : null,
      series.length ? el('optgroup', { label: 'Séries e animes' }, ordenar(series).map(opcao)) : null);
    const marcas = ordenar(filmes).map(d => ({ d, caixa: el('input', { type: 'checkbox', value: d.caminho }) }));
    const extras = el('textarea', { rows: 4, placeholder: 'Um filme por linha. Ex.: Alien (1979)' });
    const prazo = el('input', { type: 'date', value: App.somarDias(App.hoje(), 30), min: App.hoje() });
    const titulo = el('input', { type: 'text', placeholder: 'Vazio = nome automático' });

    const campoObra = App.campo('O que todos vão ler ou assistir', obra, { voz: false, largo: true });
    const campoFilmes = el('fieldset', { class: 'campo largo desafio-filmes' },
      el('legend', { text: 'Filmes que você ainda não viu' }),
      marcas.length ? el('div', { class: 'desafio-opcoes' }, marcas.map(({ d, caixa }) => el('label', {}, caixa, ' ', nomeObra(d), d.meta.ano ? ` (${d.meta.ano})` : '')))
        : el('p', { class: 'vazio', text: 'Nenhum filme em "Quero ver". Escreva os filmes abaixo.' }));
    const campoExtras = App.campo('Outros filmes', extras, { largo: true });
    const aviso = el('p', { class: 'dica largo' });
    const trocar = () => {
      const l = modo.value === 'lista';
      campoObra.hidden = l; campoFilmes.hidden = !l; campoExtras.hidden = !l;
      aviso.textContent = l ? 'Vence quem vir mais filmes da lista entre hoje e o prazo. Só contam filmes marcados como Visto com a data em que você viu.'
        : !livros.length && !series.length ? 'Adicione primeiro o livro (em Livros) ou a série/anime (em Filmes) em "Quero ler" ou "Quero ver".'
          : 'Vence quem terminar em menos dias, contando do dia em que entrou no desafio (ou começou, se for depois) até a data em "Terminei em".';
    };
    modo.addEventListener('change', trocar);

    const salvar = async () => {
      const hoje = App.hoje();
      if (!prazo.value || prazo.value < hoje) { App.toast('Escolha um prazo de hoje em diante.', 'erro'); prazo.focus(); return; }
      const base = { inicio: hoje, prazo: prazo.value, criador: nomePerfil() || null, codigo: 'd-' + sorteio() };
      let p; let doc = null;
      if (modo.value === 'corrida') {
        doc = App.store.obter(obra.value);
        if (!doc) { App.toast('Escolha o livro, a série ou o anime.', 'erro'); obra.focus(); return; }
        const m = doc.meta;
        p = { ...base, modo: 'corrida', categoria: m.tipo === 'livro' ? 'livro' : m.categoria, obra: nomeObra(doc), autor: m.autor || m.criador || null,
          ano: m.ano ?? null, capa: C().urlSegura(m.capa) || null, lista: [] };
      } else {
        const vistos = new Set();
        const lista = [
          ...marcas.filter(x => x.caixa.checked).map(({ d }) => ({ titulo: nomeObra(d).replace(/\|/g, '/'), ano: /^\d{4}$/.test(String(d.meta.ano)) ? String(d.meta.ano) : null })),
          ...extras.value.split('\n').map(l => l.trim().match(/^(.+?)(?:\s*\((\d{4})\))?$/)).filter(Boolean)
            .map(m => ({ titulo: C().limitar(m[1]).replace(/\|/g, '/'), ano: m[2] || null })),
        ].filter(f => f.titulo && !vistos.has(chave(f.titulo)) && vistos.add(chave(f.titulo)));
        if (!lista.length) { App.toast('Escolha ou escreva pelo menos um filme.', 'erro'); return; }
        if (lista.length > MAX_LISTA) { App.toast(`No máximo ${MAX_LISTA} filmes por desafio.`, 'erro'); return; }
        p = { ...base, modo: 'lista', categoria: 'filme', obra: null, autor: null, ano: null, capa: null, lista };
      }
      p.titulo = titulo.value.trim().replace(/\|/g, '/') || tituloPadrao(p.modo, p.obra);
      const criado = await App.tentar(async () => {
        const meta = metaDesafio(p, { entrei: hoje, arquivo: doc ? doc.caminho : null });
        if (doc && (doc.meta.status === 'quero-ler' || doc.meta.status === 'quero-ver')) await prepararObra(p, hoje);
        if (p.modo === 'lista') await prepararLista(p.lista);
        const eu = linha({ id: meta.eu, nome: nomePerfil() || 'Você', comecou: hoje });
        return App.store.criar(PASTA, p.titulo, meta, montarCorpo(p.lista, [eu]));
      }, 'Não foi possível criar o desafio');
      if (!criado) return;
      dlg.close();
      App.toast('Desafio criado. Agora mande o link para os amigos.');
      if (nomePerfil()) compartilhar(criado);
    };

    const dlg = App.dialogo('Novo desafio', el('div', { class: 'grade-form' },
      App.campo('Tipo de desafio', modo, { voz: false, largo: true }),
      campoObra, campoFilmes, campoExtras,
      App.campo('Prazo', prazo, { voz: false }),
      App.campo('Nome do desafio', titulo),
      aviso), [
      el('span', { class: 'espaco' }),
      el('button', { type: 'button', class: 'secundario', text: 'Cancelar', onclick: () => dlg.close() }),
      el('button', { type: 'button', text: 'Criar desafio', onclick: salvar }),
    ]);
    trocar();
    modo.focus();
  }

  function colar() {
    const campo = el('input', { type: 'url', placeholder: 'https://…#/desafio?d=…' });
    const abrir = () => {
      const m = campo.value.match(/#\/desafio\?d=([A-Za-z0-9_-]+)/);
      if (!m) { App.toast('Esse não parece um link de desafio do Bit-life.', 'erro'); campo.focus(); return; }
      dlg.close();
      location.hash = '#/desafio?d=' + m[1];
    };
    campo.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); abrir(); } });
    const dlg = App.dialogo('Abrir link de desafio', el('div', {},
      App.campo('Link que você recebeu', campo, { voz: false, largo: true }),
      el('p', { class: 'dica', text: 'Também funciona abrir o link direto no navegador.' })), [
      el('span', { class: 'espaco' }),
      el('button', { type: 'button', class: 'secundario', text: 'Cancelar', onclick: () => dlg.close() }),
      el('button', { type: 'button', text: 'Abrir', onclick: abrir }),
    ]);
    campo.focus();
  }

  // ---------------- telas ----------------
  function tabela(linhas, modo, total) {
    const th = t => el('th', { scope: 'col', text: t });
    const lista = modo === 'lista';
    return el('div', { class: 'placar-rolagem' }, el('table', { class: 'tabela placar' },
      el('caption', { class: 'sr', text: 'Placar' }),
      el('thead', {}, el('tr', {}, th('Posição'), th('Quem'), lista ? [th('Vistos'), th('Último em')] : [th('Começou'), th('Terminou'), th('Dias')])),
      el('tbody', {}, linhas.map(p => el('tr', { class: p.eu ? 'eu' : null },
        el('td', { class: 'placar-pos', text: p.pos ? `${p.pos}º` : '–' }),
        el('td', {}, p.nome, p.eu ? el('span', { class: 'selo info', text: 'você' }) : null),
        lista ? [el('td', { text: `${p.vistos} de ${total}` }), el('td', { text: p.ultimo ? App.fmtData(p.ultimo) : '–' })]
          : [el('td', { text: p.comecou ? App.fmtData(p.comecou) : '–' }), el('td', { text: p.terminou ? App.fmtData(p.terminou) : 'ainda não' }),
            el('td', { text: p.dias ? plural(p.dias, 'dia', 'dias') : '–' })])))));
  }

  function situacao(d, linhas, fim) {
    if (fim) {
      const v = linhas.filter(p => p.pos === 1);
      if (linhas.length < 2) return 'Encerrado. Ninguém mais entrou no placar.';
      return v.length ? `Encerrado. ${v.length > 1 ? 'Empate' : 'Venceu'}: ${v.map(p => (p.eu ? 'você' : p.nome)).join(', ')}.` : 'Encerrado sem vencedor.';
    }
    const prazo = data(d.m.prazo);
    const falta = prazo ? App.diasAte(prazo) : null;
    if (falta === 0) return 'Termina hoje.';
    return falta != null ? `Termina em ${plural(falta, 'dia', 'dias')} (${App.fmtData(prazo)}).` : 'Sem prazo.';
  }

  function minhaSituacao(d, eu) {
    if (d.modo === 'lista') return `Você viu ${eu.vistos} de ${plural(d.lista.length, 'filme', 'filmes')} da lista.`;
    if (eu.terminou) return `Você terminou em ${plural(eu.dias, 'dia', 'dias')}.`;
    if (eu.antes) return 'Você terminou antes de entrar no desafio: isso não conta.';
    if (eu.atrasado) return 'Você terminou depois do prazo: isso não conta.';
    if (!eu.obra) return `Não achei "${d.m.obra}" na sua ${d.m.categoria === 'livro' ? 'Leitura' : 'lista de Filmes'}.`;
    return `Você está desde ${App.fmtData(eu.comecou)}. Ao terminar, marque como ${d.m.categoria === 'livro' ? 'Lido' : 'Visto'}.`;
  }

  function cartao(d) {
    const { m, modo, linhas, fim } = d;
    const eu = linhas.find(p => p.eu);
    const ganhei = venci(d, linhas);
    const excluir = async () => {
      if (!App.confirmar(`Mover o desafio "${m.titulo || d.doc.nome}" para a lixeira? Seus livros e filmes continuam onde estão.`)) return;
      if (await App.tentar(() => App.store.moverParaLixeira(d.doc.caminho).then(() => true), 'Não foi possível excluir')) App.toast('Desafio movido para .lixeira/');
    };
    return el('li', { class: 'caixa desafio' + (fim ? ' encerrado' : '') },
      el('div', { class: 'desafio-topo' },
        modo === 'corrida' ? App.catalogo.capa(m.capa || eu.obra?.meta?.capa, m.obra, 'capa desafio-capa')
          : el('span', { class: 'desafio-icone', 'aria-hidden': 'true' }, App.icone('tela')),
        el('div', { class: 'desafio-texto' },
          el('p', { class: 'sobretitulo', text: modo === 'lista' ? `Lista de filmes · ${plural(d.lista.length, 'filme', 'filmes')}` : `Corrida · ${CAT[m.categoria] || 'livro'}` }),
          el('h2', {}, m.titulo || d.doc.nome, ganhei ? el('span', { class: 'selo campeao' }, App.icone('trofeu'), ' Campeão') : null),
          modo === 'corrida' ? el('p', { class: 'dica', text: [m.obra, m.autor].filter(Boolean).join(' · ') }) : null,
          el('p', { text: situacao(d, linhas, fim) }),
          el('p', { class: 'desafio-eu', text: minhaSituacao(d, eu) }))),
      tabela(linhas, modo, d.lista.length),
      modo === 'lista' ? el('details', {}, el('summary', { text: 'Ver a lista' }),
        el('ul', { class: 'desafio-lista' }, d.lista.map(f => {
          const ok = eu.contados?.has(chave(f.titulo));
          return el('li', { class: ok ? 'ok' : null }, ok ? App.icone('check') : null, `${f.titulo}${f.ano ? ` (${f.ano})` : ''}`, ok ? el('span', { class: 'sr', text: ' (visto)' }) : null);
        }))) : null,
      el('div', { class: 'acoes' },
        el('button', { type: 'button', onclick: () => compartilhar(d.doc) }, App.icone('compartilhar'), ' Mandar link do placar'),
        el('span', { class: 'espaco' }),
        el('button', { type: 'button', class: 'secundario', onclick: excluir, 'aria-label': `Excluir desafio ${m.titulo || d.doc.nome}` }, App.icone('lixeira'), ' Excluir')));
  }

  // Mantém a minha linha do placar no arquivo igual ao que a tela calcula (legível no Obsidian).
  // Só grava quando mudou, e sem redesenhar a tela.
  function sincronizarMinhaLinha(d) {
    const resumo = p => p && [p.nome, p.comecou, p.terminou, p.vistos, p.ultimo].join('|');
    const gravada = lerCorpo(d.doc.corpo).participantes.find(p => p.id === d.m.eu);
    if (!ID.test(String(d.m.eu)) || resumo(gravada) === resumo(instantaneo(euLinha(d)))) return;
    App.store.alterar(d.doc.caminho, atual => {
      if (!atual) throw new Error('desafio não encontrado');
      const x = info(atual);
      return { meta: atual.meta, corpo: montarCorpo(x.lista, [instantaneo(euLinha(x)), ...x.outros], x.outras) };
    }, { inline: true }).catch(e => console.error(e));
  }

  function render(container) {
    const docs = todos().map(info).map(d => { const linhas = placar(d); return { ...d, linhas, fim: encerrado(d, linhas) }; });
    docs.forEach(sincronizarMinhaLinha);
    const andamento = docs.filter(d => !d.fim).sort((a, b) => String(a.m.prazo || '9').localeCompare(String(b.m.prazo || '9')));
    const encerrados = docs.filter(d => d.fim).sort((a, b) => String(b.m.prazo || '').localeCompare(String(a.m.prazo || '')));
    const v = vitorias();
    // replaceChildren(null) escreveria "null" na tela: os opcionais são filtrados.
    container.replaceChildren(...[
      el('header', { class: 'cabecalho-tela' },
        el('div', {}, el('h1', { text: 'Desafios' }),
          el('p', { class: 'resumo', text: v ? `${plural(v, 'desafio vencido', 'desafios vencidos')}.` : 'Compita com amigos: quem lê ou assiste mais rápido.' })),
        el('div', { class: 'acoes' },
          el('button', { type: 'button', class: 'secundario', onclick: colar }, 'Colar link recebido'),
          el('button', { type: 'button', text: '+ Novo desafio', onclick: novo }))),
      el('details', { class: 'caixa-suave desafio-ajuda' },
        el('summary', { text: 'Como funciona' }),
        el('ul', {},
          el('li', { text: 'Corrida: todos leem o mesmo livro (ou veem a mesma série ou anime). Vence quem terminar em menos dias, contados de quando entrou no desafio até a data em "Terminei em".' }),
          el('li', { text: 'Lista de filmes: vence quem vir mais filmes da lista até o prazo. Empate: ganha quem chegou lá primeiro.' }),
          el('li', { text: 'Não existe servidor: o placar anda por link. Crie o desafio e mande o link; quem abrir entra com um clique. Quando avançar, clique em "Mandar link do placar" e mande de volta.' }),
          el('li', { text: 'O link leva só o desafio e, de cada um, nome, datas e quantos filmes viu. Vencer dá o selo Campeão no Perfil (não dá XP).' }))),
      andamento.length ? el('section', { 'aria-labelledby': 'desafios-andamento' }, el('h2', { id: 'desafios-andamento', class: 'titulo-secao', text: 'Em andamento' }),
        el('ul', { class: 'desafios' }, andamento.map(cartao))) : null,
      encerrados.length ? el('section', { 'aria-labelledby': 'desafios-encerrados' }, el('h2', { id: 'desafios-encerrados', class: 'titulo-secao', text: 'Encerrados' }),
        el('ul', { class: 'desafios' }, encerrados.map(cartao))) : null,
      docs.length ? null : el('p', { class: 'vazio', text: 'Nenhum desafio ainda. Crie um e mande o link para os amigos.' })].filter(Boolean));
  }

  // Página de quem recebe o link (abre mesmo sem pasta).
  function renderConvite(container) {
    const p = lerPacote();
    if (!p) {
      container.replaceChildren(el('section', { class: 'boas-vindas' }, el('h1', { text: 'Link inválido' }),
        el('p', { text: 'Este link de desafio está incompleto ou foi alterado.' })));
      return;
    }
    document.title = `${p.titulo} · Bit-life`;
    const conectado = App.store.conectado();
    const meu = conectado ? todos().find(x => x.meta.codigo === p.codigo) : null;
    const linhas = meu ? placar(info(meu)) : classificar(p.participantes, p.modo, p.prazo);
    const ir = () => { location.hash = '#/desafios'; };
    const conectar = async () => {
      const salva = await App.store.pastaSalva();
      if (salva) { if (!(await App.tentar(() => App.store.reconectar(true), 'Não foi possível abrir a pasta'))) App.toast('Permissão não concedida.', 'erro'); }
      else await App.escolherPasta();
    };
    const acao = !App.store.suportado()
      ? el('p', { class: 'dica', text: 'Para entrar no desafio, abra este link no Google Chrome ou no Microsoft Edge, no computador.' })
      : !conectado
        ? el('div', {}, el('div', { class: 'acoes' }, el('button', { type: 'button', text: 'Abrir minha pasta do Bit-life', onclick: conectar })),
          el('p', { class: 'dica', text: 'Primeira vez? Crie uma pasta vazia (por exemplo Documentos/Bit-life) e escolha ela. Depois é só entrar no desafio.' }))
        : el('div', { class: 'acoes' }, meu
          ? el('button', { type: 'button', text: 'Atualizar o placar', onclick: async () => {
            if (await App.tentar(() => atualizar(meu, p).then(() => true), 'Não foi possível atualizar o placar')) { App.toast('Placar atualizado.'); ir(); }
          } })
          : el('button', { type: 'button', text: 'Entrar no desafio', onclick: async () => {
            if (await App.tentar(() => entrar(p).then(() => true), 'Não foi possível entrar no desafio')) {
              App.toast(p.modo === 'lista' ? 'Você entrou. Os filmes da lista estão em Filmes → Quero ver.' : 'Você entrou. Quando terminar, marque como terminado e mande o link do placar.');
              ir();
            }
          } }),
        meu ? el('a', { class: 'botao secundario', href: '#/desafios', text: 'Ver meus desafios' }) : null);

    const capa = p.modo === 'corrida' ? App.catalogo.capa(p.capa, p.obra, 'capa capa-grande')
      : el('div', { class: 'compartilhado-nivel', 'aria-hidden': 'true' }, el('span', { text: p.lista.length }));
    container.replaceChildren(...[
      el('article', { class: 'compartilhado' }, capa,
        el('div', { class: 'compartilhado-texto' },
          el('p', { class: 'sobretitulo', text: p.modo === 'lista' ? 'Desafio · lista de filmes' : `Desafio · corrida de ${p.categoria === 'livro' ? 'leitura' : CAT[p.categoria]}` }),
          el('h1', { text: p.titulo }),
          p.modo === 'corrida' ? el('p', { class: 'dica', text: [p.obra, p.autor, p.ano].filter(Boolean).join(' · ') }) : null,
          el('p', { text: p.modo === 'lista' ? `Vence quem vir mais dos ${plural(p.lista.length, 'filme', 'filmes')} até ${p.prazo ? App.fmtData(p.prazo) : 'o fim'}.`
            : `Vence quem terminar em menos dias${p.prazo ? `, até ${App.fmtData(p.prazo)}` : ''}.` }),
          p.criador ? el('p', { class: 'compartilhado-quem', text: `Desafio criado por ${p.criador}.` }) : null,
          meu ? el('p', { class: 'selo info', text: 'Você já está neste desafio.' }) : null,
          acao)),
      el('section', { class: 'caixa', 'aria-labelledby': 'convite-placar' }, el('h2', { id: 'convite-placar', text: 'Placar' }),
        linhas.length ? tabela(linhas, p.modo, p.lista.length) : el('p', { class: 'vazio', text: 'Ninguém no placar ainda.' }),
        p.modo === 'lista' ? el('details', {}, el('summary', { text: 'Ver a lista' }),
          el('ul', { class: 'desafio-lista' }, p.lista.map(f => el('li', { text: `${f.titulo}${f.ano ? ` (${f.ano})` : ''}` })))) : null),
      conectado ? null : el('section', { class: 'caixa convite' },
        el('h2', { text: 'O que é o Bit-life' }),
        el('p', { text: 'Um organizador de tarefas, estudo, hábitos, leitura, filmes e finanças. Tudo fica numa pasta do seu computador: sem conta, sem cadastro e sem mandar seus dados para a internet.' }))].filter(Boolean));
  }

  return { render, renderConvite, todos, vitorias, link, novo, lerCorpo, montarCorpo, classificar };
})();
