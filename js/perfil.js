'use strict';
// Perfil: foto, capa, nome, frase e "sobre mim" (Caderno/perfil.md + imagens em Caderno/imagens/),
// vitrine no estilo de perfil de jogo (nível, selos em destaque, números, favoritos) e o gráfico de
// equilíbrio (saúde, estudo, diversão, socialização) usado também no Início.
App.perfil = (() => {
  const { el } = App;
  const ARQUIVO = 'Caderno/perfil.md';
  const PASTA_IMG = 'Caderno/imagens';
  const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
  const DIAS = 30;

  const doc = () => App.store.obter(ARQUIVO);
  const dados = () => ({ nome: '', frase: '', foto: null, capa: null, ...(doc()?.meta || {}) });

  // ---------------- imagens ----------------
  function imagem(caminho, alt, classe) {
    if (!caminho) return null;
    const img = el('img', { class: classe, alt, decoding: 'async' });
    img.addEventListener('error', () => img.remove(), { once: true });
    App.store.urlArquivo(String(caminho)).then(u => { img.src = u; }).catch(() => img.remove());
    return img;
  }
  // Sem foto: círculo com a inicial do nome (ou um ícone).
  function avatar(classe = 'avatar') {
    const p = dados();
    const inicial = String(p.nome || '').trim().charAt(0).toUpperCase();
    const caixa = el('span', { class: classe + ' sem-foto', 'aria-hidden': 'true' }, inicial || App.icone('pessoa'));
    const img = imagem(p.foto, '', classe);
    if (!img) return caixa;
    img.addEventListener('error', () => img.replaceWith(caixa), { once: true });
    return img;
  }

  async function trocarImagem(campo, arquivo) {
    if (!/^image\//.test(arquivo.type)) throw new Error(`"${arquivo.name}" não é uma imagem`);
    const ext = EXT[arquivo.type] || (String(arquivo.name).match(/\.(\w{3,4})$/)?.[1] || 'jpg').toLowerCase();
    const caminho = await App.store.gravarBinario(PASTA_IMG, campo, ext, arquivo);
    const antiga = dados()[campo];
    await salvar({ [campo]: caminho });
    if (antiga && antiga !== caminho && await App.store.existe(antiga)) await App.store.moverParaLixeira(antiga, { avisar: false });
  }
  async function tirarImagem(campo) {
    const antiga = dados()[campo];
    await salvar({ [campo]: null });
    if (antiga && await App.store.existe(antiga)) await App.store.moverParaLixeira(antiga, { avisar: false });
  }

  function salvar(patch, corpo) {
    return App.store.alterar(ARQUIVO, d => ({
      meta: { tipo: 'perfil', nome: '', frase: '', foto: null, capa: null, ...(d?.meta || {}), ...patch, atualizado: App.hoje() },
      corpo: corpo ?? d?.corpo ?? '',
    }));
  }

  // ---------------- equilíbrio (gráfico de radar) ----------------
  // Cada eixo vai de 0 a 100% e olha os últimos 30 dias (a partir do primeiro check-in).
  const EXERCICIO = /exerc|treino|academia|corrida|caminhad|muscula|esporte|pedal|natac|yoga/;
  const DIETA = /dieta|alimenta|comer/;
  function diasDaJanela() {
    const hoje = App.hoje();
    const primeiro = App.store.listar({ pasta: 'Diario', tipo: 'diario' }).map(d => String(d.meta.data || d.nome)).sort()[0];
    if (!primeiro) return [];
    return Array.from({ length: DIAS }, (_, i) => App.somarDias(hoje, -i)).filter(d => d >= primeiro);
  }
  function equilibrio() {
    const dias = diasDaJanela();
    if (!dias.length) return null;
    const habitos = [...App.diario.habitos(), ...App.diario.metricas()];
    const exerc = habitos.filter(h => EXERCICIO.test(App.slug(h)));
    const dieta = habitos.filter(h => DIETA.test(App.slug(h)));
    const media = l => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0);
    const limitar = x => Math.max(0, Math.min(1, x));

    // Saúde: dormir 7 h ou mais, se exercitar e cuidar da alimentação (hábito ou registro na Dieta).
    const saude = media(dias.map(d => {
      const m = App.diario.meta(d);
      const sono = Number(m.sono_horas) >= 7 ? 1 : Number(m.sono_horas) >= 6 ? 0.5 : 0;
      const fezExerc = exerc.some(h => App.diario.fez(d, h)) ? 1 : 0;
      const comeu = dieta.some(h => App.diario.fez(d, h)) || App.store.obter(`Dieta/Registros/${d}.md`) ? 1 : 0;
      return (sono + fezExerc + comeu) / 3;
    }));
    // Estudo: minutos cronometrados por dia, com meta de 1 hora.
    const estudo = media(dias.map(d => limitar((Number(App.diario.meta(d).estudo_minutos) || 0) / 60)));
    // Diversão: livros, filmes, séries e animes terminados na janela (meta: 1 por semana),
    // e meio ponto para cada um em andamento.
    const ini = dias[dias.length - 1];
    const lazer = [...App.livros.todos(), ...App.entretenimento.todos()];
    const terminados = lazer.filter(x => (x.meta.status === 'lido' || x.meta.status === 'visto') && String(x.meta.fim || '') >= ini).length;
    const andamento = lazer.filter(x => x.meta.status === 'lendo' || x.meta.status === 'vendo').length;
    const diversao = limitar((terminados + andamento * 0.5) / Math.max(1, (dias.length / 7)));
    // Socialização: dias marcados como "Socializei", com meta de 3 por semana.
    const social = limitar(dias.filter(d => App.diario.socializou(d)).length / Math.max(1, (dias.length * 3) / 7));

    const pct = x => Math.round(x * 100);
    return {
      dias: dias.length,
      eixos: [
        { nome: 'Saúde', valor: pct(saude), como: 'sono de 7 h ou mais, exercício e alimentação em dia' },
        { nome: 'Estudo', valor: pct(estudo), como: 'minutos de estudo cronometrados (meta de 1 h por dia)' },
        { nome: 'Diversão', valor: pct(diversao), como: 'livros e filmes/séries terminados (meta de 1 por semana) e em andamento' },
        { nome: 'Socialização', valor: pct(social), como: 'dias com o hábito Socializar marcado (meta de 3 por semana)' },
      ],
    };
  }

  // Radar em SVG. O losango externo é 100%; anéis a cada 25%.
  function radar() {
    const r = equilibrio();
    if (!r) return el('p', { class: 'vazio', text: 'Faça o primeiro check-in em Hábitos para o gráfico aparecer.' });
    const NS = 'http://www.w3.org/2000/svg';
    const no = (tag, at = {}, ...filhos) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(at)) n.setAttribute(k, v); n.append(...filhos); return n; };
    const C = 150; const R = 92; const n = r.eixos.length;
    const ponto = (i, f) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [C + Math.cos(a) * R * f, C + Math.sin(a) * R * f]; };
    const poligono = f => r.eixos.map((_, i) => ponto(i, typeof f === 'function' ? f(i) : f).join(',')).join(' ');
    const descricao = `Equilíbrio dos últimos ${r.dias} dias: ` + r.eixos.map(e => `${e.nome} ${e.valor}%`).join(', ') + '.';
    const svg = no('svg', { viewBox: '-70 0 440 300', class: 'radar', role: 'img', 'aria-label': descricao });
    [0.25, 0.5, 0.75, 1].forEach(f => svg.append(no('polygon', { points: poligono(f), class: 'radar-anel' + (f === 1 ? ' externo' : '') })));
    r.eixos.forEach((_, i) => { const [x, y] = ponto(i, 1); svg.append(no('line', { x1: C, y1: C, x2: x, y2: y, class: 'radar-eixo' })); });
    const area = no('polygon', { points: poligono(i => Math.max(0.03, r.eixos[i].valor / 100)), class: 'radar-area' });
    svg.append(area);
    r.eixos.forEach((e, i) => {
      const [x, y] = ponto(i, Math.max(0.03, e.valor / 100));
      svg.append(no('circle', { cx: x, cy: y, r: 5, class: 'radar-ponto' }, no('title', {}, `${e.nome}: ${e.valor}% — ${e.como}`)));
      const [lx, ly] = ponto(i, 1.2);
      const ancora = Math.abs(lx - C) < 4 ? 'middle' : lx > C ? 'start' : 'end';
      const lado = ancora !== 'middle';
      svg.append(no('text', { x: lx, y: ly + (ly < C ? -4 : ly > C + 4 ? 14 : -4), 'text-anchor': ancora, class: 'radar-rotulo' },
        no('tspan', { class: 'radar-nome' }, e.nome),
        no('tspan', lado ? { x: lx, dy: 16, class: 'radar-valor' } : { dx: 6, class: 'radar-valor' }, `${e.valor}%`)));
    });
    // Animação: a área cresce do centro (só na primeira vez que aparece).
    if (!App.animacao.reduzido()) area.animate([{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
      { duration: 600, delay: 150, easing: 'cubic-bezier(.05, .7, .1, 1)', fill: 'backwards' });
    return el('figure', { class: 'radar-figura' }, svg,
      el('figcaption', {},
        el('ul', { class: 'radar-legenda' }, r.eixos.map(e => el('li', {}, el('strong', { text: `${e.nome} ${e.valor}%` }), ' · ', e.como))),
        el('p', { class: 'dica', text: `Últimos ${r.dias} dia(s). Não muda o XP: é só um retrato do seu equilíbrio.` })));
  }

  // ---------------- vitrine ----------------
  function numeros() {
    const livros = App.livros.todos(); const ent = App.entretenimento.todos();
    const p = App.gamificacao.progresso();
    const agora = new Date();
    const r = App.diario.resumoMes(agora.getFullYear(), agora.getMonth());
    return [
      { valor: p.diasAtivos, rotulo: 'dias com hábitos' },
      { valor: p.sequencia, rotulo: 'dias seguidos' },
      { valor: livros.filter(d => d.meta.status === 'lido').length, rotulo: 'livros lidos' },
      { valor: ent.filter(d => d.meta.status === 'visto').length, rotulo: 'filmes e séries vistos' },
      { valor: r.socialDias, rotulo: 'dias socializando no mês' },
      { valor: App.tarefas.todas().filter(d => d.meta.status === 'feita').length, rotulo: 'tarefas feitas' },
    ];
  }

  function favoritos() {
    const melhores = l => l.filter(d => Number(d.meta.nota) >= 5).sort((a, b) => Number(b.meta.nota) - Number(a.meta.nota) || String(b.meta.fim || '').localeCompare(String(a.meta.fim || '')));
    return [...melhores(App.livros.todos()), ...melhores(App.entretenimento.todos())].slice(0, 6);
  }

  // ---------------- edição ----------------
  function editar() {
    const p = dados();
    const nome = el('input', { type: 'text', value: p.nome || '', autocomplete: 'nickname' });
    const frase = el('input', { type: 'text', value: p.frase || '', placeholder: 'ex.: Um dia de cada vez' });
    const escolher = (campo, rotulo) => {
      const entrada = el('input', { type: 'file', accept: 'image/*', class: 'sr', id: 'perfil-' + campo,
        onchange: async e => {
          const f = e.target.files?.[0]; if (!f) return;
          if (await App.tentar(async () => { await trocarImagem(campo, f); return true; }, 'Não foi possível guardar a imagem')) App.toast(`${rotulo} atualizada.`);
        } });
      return el('div', { class: 'acoes' }, entrada,
        el('label', { for: 'perfil-' + campo, class: 'botao secundario' }, App.icone('imagem'), ` Escolher ${rotulo.toLowerCase()}`),
        dados()[campo] ? el('button', { type: 'button', class: 'secundario', text: `Tirar ${rotulo.toLowerCase()}`, onclick: async () => { if (await App.tentar(async () => { await tirarImagem(campo); return true; })) App.toast(`${rotulo} removida.`); } }) : null);
    };
    const dlg = App.dialogo('Editar perfil', el('div', { class: 'grade-form' },
      App.campo('Nome', nome, { voz: false }),
      App.campo('Frase do perfil', frase),
      el('div', { class: 'campo largo' }, el('span', { class: 'rotulo', text: 'Foto de perfil' }), escolher('foto', 'Foto')),
      el('div', { class: 'campo largo' }, el('span', { class: 'rotulo', text: 'Imagem de capa (fundo do perfil)' }), escolher('capa', 'Capa')),
      el('p', { class: 'dica largo', text: 'As imagens são copiadas para Caderno/imagens/ na sua pasta. Nada vai para a internet.' })), [
      el('span', { class: 'espaco' }),
      el('button', { type: 'button', class: 'secundario', text: 'Cancelar', onclick: () => dlg.close() }),
      el('button', { type: 'button', text: 'Salvar', onclick: async () => {
        const ok = await App.tentar(async () => { await salvar({ nome: nome.value.trim(), frase: frase.value.trim() }); return true; }, 'Não foi possível salvar o perfil');
        if (ok) { dlg.close(); App.toast('Perfil salvo.'); }
      } }),
    ]);
    nome.focus();
  }

  // ---------------- telas ----------------
  // Cartão de retrato do Início (foto grande, nome e nível).
  function retrato() {
    const p = dados();
    const n = App.gamificacao.progresso();
    return el('a', { class: 'retrato', href: '#/perfil', 'aria-label': `Abrir perfil${p.nome ? ' de ' + p.nome : ''}` },
      el('span', { class: 'retrato-nivel' }, App.icone('estrela'), `Nível ${n.nivel}`),
      p.foto ? avatar('retrato-foto') : el('span', { class: 'retrato-foto sem-foto' }, App.icone('pessoa'), el('span', { class: 'dica', text: 'Adicionar foto no perfil' })),
      el('span', { class: 'retrato-texto' }, el('strong', { text: p.nome || 'Seu perfil' }), p.frase ? el('span', { text: p.frase }) : null));
  }

  function render(container) {
    if (/^#\/perfil\/selos/.test(location.hash)) { App.selos.render(container); return; }
    const p = dados();
    const n = App.gamificacao.progresso();
    const todosSelos = App.selos.todos();
    const capa = imagem(p.capa, '', 'perfil-capa-img');
    const andamento = [...App.livros.todos().filter(d => d.meta.status === 'lendo'), ...App.entretenimento.todos().filter(d => d.meta.status === 'vendo')];
    const capinha = d => el('li', { class: 'vitrine-item' }, App.catalogo.capa(d.meta.capa, d.meta.titulo || d.nome, 'capa'),
      el('span', { class: 'dica', text: d.meta.titulo || d.nome }));

    container.replaceChildren(
      el('section', { class: 'perfil-capa' + (capa ? ' com-imagem' : ''), 'aria-label': 'Perfil' },
        capa,
        el('div', { class: 'perfil-identidade' },
          avatar('avatar avatar-grande'),
          el('div', { class: 'perfil-nome' },
            el('h1', { text: p.nome || 'Seu perfil' }),
            p.frase ? el('p', { text: p.frase }) : el('p', { class: 'dica', text: 'Clique em "Editar perfil" para pôr nome, frase, foto e capa.' })),
          el('div', { class: 'perfil-nivel' },
            el('span', { class: 'perfil-nivel-num' }, 'Nível ', el('strong', { text: n.nivel })),
            el('button', { type: 'button', class: 'secundario', onclick: editar }, App.icone('lapis'), ' Editar perfil')))),
      el('div', { class: 'perfil-colunas' },
        el('div', { class: 'perfil-principal' },
          el('section', { class: 'caixa', 'aria-labelledby': 'perfil-equilibrio' }, el('h2', { id: 'perfil-equilibrio', text: 'Equilíbrio' }), radar()),
          el('section', { class: 'caixa', 'aria-labelledby': 'perfil-destaques' },
            el('div', { class: 'caixa-cabecalho' }, el('h2', { id: 'perfil-destaques', text: 'Selos em destaque' }),
              el('div', { class: 'acoes' },
                el('button', { type: 'button', class: 'secundario', onclick: App.selos.escolherDestaque }, App.icone('estrela'), ' Escolher destaques'),
                el('a', { class: 'botao secundario', href: '#/perfil/selos', text: 'Todos os selos' }))),
            App.selos.vitrine()),
          el('section', { class: 'caixa', 'aria-labelledby': 'perfil-favoritos' }, el('h2', { id: 'perfil-favoritos', text: 'Favoritos' }),
            favoritos().length ? el('ul', { class: 'vitrine' }, favoritos().map(capinha)) : el('p', { class: 'vazio', text: 'Livros, filmes e séries com nota 5 aparecem aqui.' })),
          andamento.length ? el('section', { class: 'caixa', 'aria-labelledby': 'perfil-agora' }, el('h2', { id: 'perfil-agora', text: 'Agora' }),
            el('ul', { class: 'vitrine' }, andamento.slice(0, 6).map(capinha))) : null),
        el('aside', { class: 'perfil-lateral' },
          el('section', { class: 'caixa', 'aria-label': 'Nível e XP' }, App.gamificacao.cartao({ compacto: true })),
          el('section', { class: 'caixa', 'aria-labelledby': 'perfil-numeros' }, el('h2', { id: 'perfil-numeros', text: 'Números' }),
            el('dl', { class: 'perfil-numeros' }, numeros().map(x => el('div', {}, el('dt', { text: x.rotulo }), el('dd', { text: x.valor }))))),
          el('section', { class: 'caixa', 'aria-labelledby': 'perfil-selos' }, el('h2', { id: 'perfil-selos', text: 'Selos' }),
            el('p', { class: 'perfil-selos-conta' }, el('strong', { text: todosSelos.filter(x => x.ok).length }), ` de ${todosSelos.length} conquistados`),
            el('a', { class: 'botao secundario', href: '#/perfil/selos', text: 'Ver todos os selos' })))));
  }

  // Botão do cabeçalho (canto superior direito) com a foto.
  function desenharBotao() {
    const area = document.getElementById('perfil-topo');
    if (!area) return;
    if (!App.store.conectado()) { area.hidden = true; return; }
    area.hidden = false;
    const p = dados();
    area.setAttribute('aria-label', p.nome ? `Perfil de ${p.nome}` : 'Perfil');
    area.title = 'Perfil';
    area.toggleAttribute('aria-current', location.hash.startsWith('#/perfil'));
    area.replaceChildren(avatar('avatar avatar-topo'));
  }
  App.on('dados', () => desenharBotao());

  return { render, radar, equilibrio, retrato, avatar, editar, desenharBotao, salvar };
})();
