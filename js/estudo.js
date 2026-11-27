'use strict';
// Página Estudo: temporizador (duração ou "até tal hora", com pausa), checklist do dia,
// timeboxing dos estudos e simulados com cálculo de acerto.
//   Estudo/Dias/AAAA-MM-DD.md     checklist do dia ("- [ ] item" no corpo)
//   Estudo/Simulados/<slug>.md    um simulado por arquivo
// O tempo concluído no temporizador soma em estudo_minutos do Diario/ (usado nas estatísticas).
App.estudo = (() => {
  const { el } = App;
  const DIAS = 'Estudo/Dias';
  const SIM = 'Estudo/Simulados';
  const ITEM = /^- \[( |x|X)\] (.*)$/;
  const estado = { aba: 'hoje' };

  // ---------------- temporizador ----------------
  // Estado de interface (não é dado do usuário): fica no sessionStorage para sobreviver a um F5.
  const CHAVE = 'caderno-temporizador';
  let tempo = carregar() || { total: 25 * 60000, acumulado: 0, inicio: null, rotulo: '', ativo: false };
  function carregar() { try { return JSON.parse(sessionStorage.getItem(CHAVE)); } catch { return null; } }
  function guardar() { try { sessionStorage.setItem(CHAVE, JSON.stringify(tempo)); } catch { /* sem armazenamento: segue em memória */ } }
  const decorrido = () => tempo.acumulado + (tempo.inicio ? Date.now() - tempo.inicio : 0);
  const restante = () => Math.max(0, tempo.total - decorrido());
  const rodando = () => !!tempo.inicio;
  const fmt = ms => {
    const s = Math.ceil(ms / 1000); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const ss = s % 60;
    const z = n => String(n).padStart(2, '0');
    return h ? `${h}:${z(m)}:${z(ss)}` : `${z(m)}:${z(ss)}`;
  };

  function iniciar(totalMs, rotulo) {
    tempo = { total: totalMs, acumulado: 0, inicio: Date.now(), rotulo, ativo: true };
    guardar(); tick();
  }
  function pausar() { if (!rodando()) return; tempo.acumulado = decorrido(); tempo.inicio = null; guardar(); tick(); }
  function continuar() { if (rodando() || !tempo.ativo) return; tempo.inicio = Date.now(); guardar(); tick(); }
  function zerar() { tempo = { ...tempo, acumulado: 0, inicio: null, ativo: false }; guardar(); tick(); }
  async function concluir(automatico = false) {
    const min = Math.round(decorrido() / 60000);
    tempo = { ...tempo, acumulado: 0, inicio: null, ativo: false }; guardar();
    if (min > 0) {
      await App.tentar(() => App.diario.somarEstudo(App.hoje(), min), 'Não foi possível registrar o tempo');
      App.gamificacao.registrarEvento('estudo_concluido', App.diario.caminho(App.hoje()), { minutos: min });
    }
    App.toast(automatico ? `Tempo esgotado${tempo.rotulo ? ': ' + tempo.rotulo : ''}! ${min} min registrados.` : `${min} min de estudo registrados.`);
    tick();
  }

  function bip() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.35, 0.7].forEach(t => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.frequency.value = 880; g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.3);
        o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.32);
      });
    } catch { /* sem áudio */ }
  }

  // Atualiza todos os mostradores (página Estudo e selo do cabeçalho) a cada segundo.
  function tick() {
    if (tempo.ativo && rodando() && restante() <= 0) { tempo.acumulado = tempo.total; tempo.inicio = null; bip(); concluir(true); return; }
    const texto = fmt(tempo.ativo ? restante() : tempo.total);
    for (const n of document.querySelectorAll('[data-cronometro]')) n.textContent = texto;
    for (const b of document.querySelectorAll('[data-cronometro-barra]')) b.style.width = `${tempo.ativo ? Math.min(100, (decorrido() / tempo.total) * 100) : 0}%`;
    App.emit('cronometro', { ativo: tempo.ativo, rodando: rodando(), texto, rotulo: tempo.rotulo });
  }
  setInterval(() => { if (tempo.ativo) tick(); }, 1000);

  function painelTemporizador(redesenhar) {
    const rotulo = el('input', { type: 'text', value: tempo.rotulo || '', placeholder: 'ex.: Matemática — funções' });
    const modo = el('select', {}, el('option', { value: 'duracao', text: 'Por quanto tempo' }), el('option', { value: 'ate', text: 'Até um horário' }));
    const horas = el('input', { type: 'number', min: 0, max: 23, value: Math.floor(tempo.total / 3600000) });
    const minutos = el('input', { type: 'number', min: 0, max: 59, value: Math.floor((tempo.total % 3600000) / 60000) });
    const ate = el('input', { type: 'time' });
    const camposDuracao = el('div', { class: 'grade-form' }, App.campo('Horas', horas, { voz: false }), App.campo('Minutos', minutos, { voz: false }));
    const camposAte = el('div', { class: 'grade-form', hidden: true }, App.campo('Estudar até as', ate, { voz: false }));
    modo.addEventListener('change', () => { camposDuracao.hidden = modo.value !== 'duracao'; camposAte.hidden = modo.value !== 'ate'; });
    const rapidos = [25, 50, 90].map(m => el('button', { type: 'button', class: 'secundario pequeno', text: `${m} min`,
      onclick: () => { horas.value = Math.floor(m / 60); minutos.value = m % 60; modo.value = 'duracao'; modo.dispatchEvent(new Event('change')); } }));

    const comecar = () => {
      let ms;
      if (modo.value === 'ate') {
        if (!ate.value) { ate.focus(); App.toast('Escolha o horário final.', 'erro'); return; }
        const [h, m] = ate.value.split(':').map(Number);
        const alvo = new Date(); alvo.setHours(h, m, 0, 0);
        if (alvo <= new Date()) alvo.setDate(alvo.getDate() + 1);
        ms = alvo - new Date();
      } else ms = ((Number(horas.value) || 0) * 60 + (Number(minutos.value) || 0)) * 60000;
      if (ms < 60000) { App.toast('Escolha pelo menos 1 minuto.', 'erro'); return; }
      iniciar(ms, rotulo.value.trim()); redesenhar();
    };

    const mostrador = el('p', { class: 'cronometro', 'data-cronometro': '', role: 'timer', 'aria-live': 'off', text: fmt(tempo.ativo ? restante() : tempo.total) });
    const progresso = el('div', { class: 'barra-progresso grande' }, el('span', { 'data-cronometro-barra': '', style: `width:${tempo.ativo ? Math.min(100, (decorrido() / tempo.total) * 100) : 0}%` }));
    const controles = tempo.ativo ? el('div', { class: 'acoes' },
      rodando() ? el('button', { type: 'button', onclick: () => { pausar(); redesenhar(); } }, App.icone('pausa'), ' Pausar')
        : el('button', { type: 'button', onclick: () => { continuar(); redesenhar(); } }, App.icone('play'), ' Continuar'),
      el('button', { type: 'button', class: 'secundario', text: 'Concluir e registrar', onclick: async () => { await concluir(); redesenhar(); } }),
      el('button', { type: 'button', class: 'secundario', text: 'Zerar', onclick: () => { if (App.confirmar('Zerar o temporizador sem registrar o tempo?')) { zerar(); redesenhar(); } } }))
      : el('div', { class: 'acoes' }, el('button', { type: 'button', onclick: comecar }, App.icone('play'), ' Começar'));
    const hoje = Number(App.diario.meta(App.hoje()).estudo_minutos) || 0;

    return el('section', { class: 'caixa temporizador', 'aria-labelledby': 'titulo-temp' },
      el('h2', { id: 'titulo-temp', text: 'Temporizador' }),
      tempo.ativo ? el('p', { class: 'sobretitulo', text: (rodando() ? 'Estudando' : 'Pausado') + (tempo.rotulo ? ' · ' + tempo.rotulo : '') }) : null,
      mostrador, progresso, controles,
      tempo.ativo ? null : el('div', { class: 'config-temporizador' },
        App.campo('O que vou estudar', rotulo),
        App.campo('Modo', modo, { voz: false }),
        camposDuracao, camposAte,
        el('div', { class: 'acoes' }, el('span', { class: 'dica', text: 'Atalhos:' }), rapidos)),
      el('p', { class: 'dica', text: `Hoje: ${Math.floor(hoje / 60)}h${String(hoje % 60).padStart(2, '0')} de estudo registrados. Ao terminar, toca um aviso sonoro.` }));
  }

  // ---------------- checklist do dia ----------------
  const caminhoDia = data => `${DIAS}/${data}.md`;
  function lerLista(data) {
    const doc = App.store.obter(caminhoDia(data));
    const itens = []; const outras = [];
    for (const l of String(doc?.corpo || '').split('\n')) {
      const m = l.match(ITEM);
      if (m) itens.push({ texto: m[2].trim(), feito: m[1] !== ' ' }); else outras.push(l);
    }
    return { doc, itens, outras };
  }
  function gravarLista(data, itens, outras, doc) {
    const corpo = [itens.map(i => `- [${i.feito ? 'x' : ' '}] ${i.texto}`).join('\n'), outras.join('\n').trim()].filter(Boolean).join('\n\n');
    return App.store.gravar(caminhoDia(data), { tipo: 'estudo_dia', data, ...(doc?.meta || {}) }, corpo, { inline: true });
  }
  const pendentesDe = data => lerLista(data).itens.filter(i => !i.feito);

  function checklist() {
    const data = App.hoje();
    const raiz = el('section', { class: 'caixa', 'aria-labelledby': 'titulo-check' });
    const desenhar = () => {
      const { doc, itens, outras } = lerLista(data);
      const salvar = () => App.tentar(() => gravarLista(data, itens, outras, doc), 'Não foi possível salvar').then(desenhar);
      const novo = el('input', { type: 'text', placeholder: 'ex.: revisar capítulo 3, 20 questões de física' });
      const adicionar = () => { const t = novo.value.trim(); if (!t) { novo.focus(); return; } itens.push({ texto: t, feito: false }); salvar().then(() => raiz.querySelector('input[type=text]')?.focus()); };
      novo.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } });
      const ontem = pendentesDe(App.somarDias(data, -1)).filter(p => !itens.some(i => i.texto === p.texto));
      const feitos = itens.filter(i => i.feito).length;
      raiz.replaceChildren(...[
        el('h2', { id: 'titulo-check', text: 'Checklist de hoje' }),
        el('p', { class: 'dica', text: itens.length ? `${feitos} de ${itens.length} feitos.` : 'O que você quer estudar hoje?' }),
        el('div', { class: 'campo-linha' }, el('div', { class: 'espaco' }, App.campo('Nova tarefa de estudo', novo)),
          el('button', { type: 'button', class: 'alinhar-base', text: 'Adicionar', onclick: adicionar })),
        el('ul', { class: 'checklist' }, itens.map((it, i) => {
          const id = `est-${i}`;
          return el('li', { class: it.feito ? 'feito' : null },
            el('input', { type: 'checkbox', id, checked: it.feito, onchange: e => { it.feito = e.target.checked; salvar(); } }),
            el('label', { for: id, text: it.texto }),
            el('button', { type: 'button', class: 'icone', 'aria-label': `Remover ${it.texto}`, onclick: () => { itens.splice(i, 1); salvar(); } }, App.icone('lixeira')));
        })),
        ontem.length ? el('button', { type: 'button', class: 'secundario pequeno', text: `Trazer ${ontem.length} pendente(s) de ontem`,
          onclick: () => { itens.push(...ontem.map(p => ({ texto: p.texto, feito: false }))); salvar(); } }) : null].filter(Boolean));
    };
    desenhar();
    return raiz;
  }

  // ---------------- simulados ----------------
  const simulados = () => App.store.listar({ pasta: SIM, tipo: 'simulado' }).sort((a, b) => String(b.meta.data || '').localeCompare(String(a.meta.data || '')));
  const pct = (a, t) => (t ? Math.round((a / t) * 1000) / 10 : 0);

  function editarSimulado(doc) {
    const m = doc ? doc.meta : { data: App.hoje() };
    const f = {
      titulo: el('input', { type: 'text', value: m.titulo || '', placeholder: 'ex.: Simulado ENEM — 2º dia' }),
      data: el('input', { type: 'date', value: m.data || App.hoje() }),
      prova: el('input', { type: 'text', value: m.prova || '', placeholder: 'ex.: ENEM, FUVEST, UFMG' }),
      materia: el('input', { type: 'text', value: m.materia || '', placeholder: 'ex.: Matemática (ou vazio = geral)' }),
      questoes: el('input', { type: 'number', min: 1, value: m.questoes ?? '' }),
      acertos: el('input', { type: 'number', min: 0, value: m.acertos ?? '' }),
      tempo: el('input', { type: 'number', min: 0, value: m.tempo_min ?? '' }),
      notas: el('textarea', { rows: 5, class: 'editor-md', value: doc ? doc.corpo : '', placeholder: 'O que errei, o que revisar…' }),
    };
    const resultado = el('p', { class: 'numero-grande', 'aria-live': 'polite' });
    const calcular = () => {
      const q = Number(f.questoes.value); const a = Number(f.acertos.value);
      resultado.replaceChildren(q > 0 && f.acertos.value !== '' ? el('strong', { text: `${pct(a, q)}%` }) : el('strong', { text: '—' }),
        q > 0 && f.acertos.value !== '' ? ` de acerto (${a} de ${q}, ${q - a} erro(s))` : ' de acerto');
    };
    f.questoes.addEventListener('input', calcular); f.acertos.addEventListener('input', calcular); calcular();
    const salvar = async () => {
      const q = Number(f.questoes.value); const a = Number(f.acertos.value);
      if (!(q > 0)) { f.questoes.focus(); App.toast('Informe quantas questões tinha.', 'erro'); return; }
      if (f.acertos.value === '' || a < 0 || a > q) { f.acertos.focus(); App.toast('Os acertos precisam estar entre 0 e o total de questões.', 'erro'); return; }
      const t = f.titulo.value.trim() || `Simulado ${f.prova.value.trim()} ${App.fmtData(f.data.value)}`.replace(/\s+/g, ' ');
      const meta = { ...m, tipo: 'simulado', titulo: t, data: f.data.value || App.hoje(), prova: f.prova.value.trim() || null,
        materia: f.materia.value.trim() || null, questoes: q, acertos: a, percentual: pct(a, q), tempo_min: Number(f.tempo.value) || null, tags: App.lista(m.tags) };
      const ok = await App.tentar(() => (doc ? App.store.gravar(doc.caminho, meta, f.notas.value) : App.store.criar(SIM, `${meta.data}-${t}`, meta, f.notas.value)), 'Não foi possível salvar');
      if (ok) { if (!doc) App.gamificacao.registrarEvento('simulado_feito', ok.caminho, { percentual: meta.percentual }); dlg.close(); App.toast(`Simulado salvo: ${meta.percentual}% de acerto.`); }
    };
    const excluir = async () => {
      if (!App.confirmar('Mover este simulado para a lixeira?')) return;
      if (await App.tentar(() => App.store.moverParaLixeira(doc.caminho).then(() => true), 'Não foi possível excluir')) dlg.close();
    };
    const dlg = App.dialogo(doc ? 'Editar simulado' : 'Novo simulado', el('div', { class: 'grade-form' },
      App.campo('Nome', f.titulo, { largo: true }),
      App.campo('Data', f.data, { voz: false }), App.campo('Prova / vestibular', f.prova), App.campo('Matéria', f.materia),
      App.campo('Total de questões', f.questoes, { voz: false }), App.campo('Acertos', f.acertos, { voz: false }), App.campo('Tempo gasto (min)', f.tempo, { voz: false }),
      el('div', { class: 'largo' }, resultado),
      App.campo('Anotações (Markdown)', f.notas, { largo: true })), [
      doc ? el('button', { type: 'button', class: 'perigo', text: 'Excluir', onclick: excluir }) : null,
      el('span', { class: 'espaco' }),
      el('button', { type: 'button', class: 'secundario', text: 'Cancelar', onclick: () => dlg.close() }),
      el('button', { type: 'button', text: 'Salvar', onclick: salvar }),
    ]);
    f.questoes.focus();
  }

  function abaSimulados() {
    const docs = simulados();
    const total = docs.reduce((a, d) => a + (Number(d.meta.questoes) || 0), 0);
    const acertos = docs.reduce((a, d) => a + (Number(d.meta.acertos) || 0), 0);
    const melhor = docs.reduce((m, d) => Math.max(m, Number(d.meta.percentual) || 0), 0);
    const cronologico = docs.slice().reverse().slice(-20);
    const porMateria = new Map();
    for (const d of docs) {
      const k = d.meta.materia || 'Geral';
      const v = porMateria.get(k) || { q: 0, a: 0, n: 0 };
      v.q += Number(d.meta.questoes) || 0; v.a += Number(d.meta.acertos) || 0; v.n++;
      porMateria.set(k, v);
    }
    return el('div', {},
      el('div', { class: 'barra' }, el('span', { class: 'espaco' }), el('button', { type: 'button', text: '+ Novo simulado', onclick: () => editarSimulado(null) })),
      docs.length ? el('div', {},
        el('div', { class: 'numeros-mes caixa' },
          el('p', { class: 'numero-grande' }, el('strong', { text: `${pct(acertos, total)}%` }), ' de acerto no total'),
          el('p', { class: 'numero-grande' }, el('strong', { text: `${melhor}%` }), ' melhor resultado'),
          el('p', { class: 'numero-grande' }, el('strong', { text: docs.length }), ` simulado(s), ${total} questões`)),
        cronologico.length > 1 ? el('section', { class: 'caixa' }, el('h2', { text: 'Evolução' }),
          App.grafico(cronologico.map(d => ({ rotulo: App.fmtData(d.meta.data).slice(0, 5), valor: Number(d.meta.percentual) || 0 })),
            { unidade: '%', min: 0, max: 100, descricao: `Percentual de acerto dos últimos ${cronologico.length} simulados, de ${cronologico[0].meta.percentual}% a ${cronologico[cronologico.length - 1].meta.percentual}%.` })) : null,
        porMateria.size > 1 ? el('section', { class: 'caixa' }, el('h2', { text: 'Por matéria' }),
          el('ul', { class: 'lista-habitos-stats' }, [...porMateria.entries()].sort(([, a], [, b]) => pct(a.a, a.q) - pct(b.a, b.q)).map(([k, v]) => el('li', {},
            el('div', { class: 'linha-stat' }, el('strong', { text: k }), el('span', { class: 'dica', text: `${pct(v.a, v.q)}% · ${v.n} simulado(s)` })),
            el('div', { class: 'barra-progresso' }, el('span', { style: `width:${pct(v.a, v.q)}%` })))))) : null,
        el('section', { class: 'caixa' }, el('h2', { text: 'Todos os simulados' }),
          el('div', { class: 'rolagem-mes' }, el('table', { class: 'tabela' },
            el('thead', {}, el('tr', {}, ['Data', 'Simulado', 'Matéria', 'Acertos', '%'].map(t => el('th', { scope: 'col', text: t })))),
            el('tbody', {}, docs.map(d => el('tr', {},
              el('td', { text: App.fmtData(d.meta.data) }),
              el('td', {}, el('button', { type: 'button', class: 'link', text: d.meta.titulo || d.nome, onclick: () => editarSimulado(d) })),
              el('td', { text: d.meta.materia || 'Geral' }),
              el('td', { text: `${d.meta.acertos}/${d.meta.questoes}` }),
              el('td', {}, el('strong', { text: `${d.meta.percentual ?? pct(d.meta.acertos, d.meta.questoes)}%` })))))))))
        : el('p', { class: 'vazio', text: 'Nenhum simulado registrado. Adicione o primeiro: é só informar o total de questões e os acertos.' }));
  }

  // Abas com endereço próprio (#/estudo/notas, #/estudo/cadernos…), para voltar e favoritar.
  const ABAS = { hoje: 'Hoje', notas: 'Notas', cadernos: 'Cadernos', simulados: 'Simulados' };
  function render(container) {
    const daUrl = location.hash.replace(/^#\/?/, '').split(/[/?]/)[1];
    estado.aba = ABAS[daUrl] ? daUrl : 'hoje';
    const redesenhar = () => render(container);
    const area = el('div', { class: 'estudo-aba' });
    container.replaceChildren(
      el('header', { class: 'cabecalho-tela' }, el('h1', { text: 'Estudo' })),
      el('nav', { class: 'alternador abas', 'aria-label': 'Seções do estudo' },
        Object.entries(ABAS).map(([v, r]) => el('a', { href: '#/estudo/' + v, 'aria-current': estado.aba === v ? 'page' : null, text: r }))),
      area);
    if (estado.aba === 'hoje') {
      area.append(el('div', { class: 'estudo-hoje' }, painelTemporizador(redesenhar), checklist()), App.timebox.componente('estudo'));
    } else if (estado.aba === 'notas') App.notas.render(area, { embutido: true });
    else if (estado.aba === 'cadernos') App.cadernos.render(area);
    else area.append(abaSimulados());
  }

  const ultimoSimulado = () => simulados()[0] || null;
  const estadoTemporizador = () => ({ ativo: tempo.ativo, rodando: rodando(), texto: fmt(tempo.ativo ? restante() : tempo.total), rotulo: tempo.rotulo });
  return { render, ultimoSimulado, pendentesDe, lerLista, estadoTemporizador, simulados };
})();
