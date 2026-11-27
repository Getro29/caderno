'use strict';
// Agendas externas mostradas no Calendário: F1, NFL, futebol (times favoritos), vestibulares e
// arquivos .ics importados. Cada agenda é um arquivo Calendario/Agendas/<id>.md com uma linha
// por compromisso no corpo, legível por humanos e no Obsidian:
//   - 2026-12-06 14:00 | Futebol · Arsenal x Chelsea · Premier League
// Os jogos são buscados só quando o usuário clica em "Atualizar" (ESPN e Jolpica-F1, sem chave).
App.agenda = (() => {
  const { el } = App;
  const PASTA = 'Calendario/Agendas';
  const LINHA = /^- (\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}))? \| (.+)$/;

  const TIMES = [
    { nome: 'Cruzeiro', busca: /cruzeiro/i, ligas: [['bra.1', 'Brasileirão'], ['bra.copa_do_brazil', 'Copa do Brasil'], ['conmebol.libertadores', 'Libertadores'], ['conmebol.sudamericana', 'Sul-Americana'], ['bra.camp.mineiro', 'Campeonato Mineiro']] },
    { nome: 'Barcelona', busca: /^barcelona$/i, ligas: [['esp.1', 'La Liga'], ['esp.copa_del_rey', 'Copa do Rei'], ['esp.super_cup', 'Supercopa da Espanha'], ['uefa.champions', 'Champions League']] },
    { nome: 'Arsenal', busca: /^arsenal$/i, ligas: [['eng.1', 'Premier League'], ['eng.fa', 'FA Cup'], ['eng.league_cup', 'Copa da Liga Inglesa'], ['uefa.champions', 'Champions League']] },
  ];
  const FONTES = {
    f1: { nome: 'Fórmula 1', categoria: 'esporte', fonte: 'Jolpica F1 (api.jolpi.ca)', buscar: buscarF1 },
    nfl: { nome: 'NFL', categoria: 'esporte', fonte: 'ESPN', buscar: buscarNFL },
    futebol: { nome: `Futebol (${TIMES.map(t => t.nome).join(', ')})`, categoria: 'esporte', fonte: 'ESPN', buscar: buscarFutebol },
    vestibulares: { nome: 'Vestibulares, ENEM e SISU (previsões)', categoria: 'vestibular', fonte: 'estimativa do Bit-life com base nos anos anteriores', buscar: gerarVestibulares },
  };

  // ---- leitura ----
  const todas = () => App.store.listar({ pasta: PASTA, tipo: 'agenda' }).sort((a, b) => String(a.meta.nome || a.nome).localeCompare(String(b.meta.nome || b.nome), 'pt-BR'));
  const memo = new WeakMap();
  function itens(doc) {
    if (memo.has(doc)) return memo.get(doc);
    const lista = [];
    for (const l of String(doc.corpo || '').split('\n')) {
      const m = l.trim().match(LINHA);
      if (m) lista.push({ data: m[1], hora: m[2] || null, titulo: m[3].trim(), agenda: doc.meta.nome || doc.nome, categoria: doc.meta.categoria || 'importado' });
    }
    memo.set(doc, lista);
    return lista;
  }
  const visiveis = () => todas().filter(d => d.meta.mostrar !== false);
  const doDia = iso => visiveis().flatMap(d => itens(d).filter(i => i.data === iso))
    .sort((a, b) => String(a.hora || '00:00').localeCompare(String(b.hora || '00:00')));

  // ---- gravação ----
  async function gravarAgenda(id, { nome, categoria, fonte }, lista) {
    const caminho = `${PASTA}/${id}.md`;
    const doc = App.store.obter(caminho);
    const vistas = new Set();
    const linhas = lista.filter(i => i.data && i.titulo).sort((a, b) => (a.data + (a.hora || '')).localeCompare(b.data + (b.hora || '')))
      .map(i => `- ${i.data}${i.hora ? ' ' + i.hora : ''} | ${String(i.titulo).replace(/\s+/g, ' ').trim()}`)
      .filter(l => !vistas.has(l) && vistas.add(l));
    // Linhas escritas à mão (que não são compromissos) são mantidas.
    const outras = String(doc?.corpo || '').split('\n').filter(l => !LINHA.test(l.trim())).join('\n').trim();
    const meta = { tipo: 'agenda', mostrar: true, ...(doc?.meta || {}), nome, categoria, fonte, atualizado: App.agoraISO() };
    await App.store.gravar(caminho, meta, [outras, linhas.join('\n')].filter(Boolean).join('\n\n'));
    return linhas.length;
  }

  async function atualizar(id) {
    const f = FONTES[id];
    App.toast(`Buscando ${f.nome}…`);
    const r = await App.tentar(async () => {
      const lista = await f.buscar();
      if (!lista.length) throw new Error('nenhum compromisso encontrado (o serviço pode estar fora do ar)');
      return gravarAgenda(id, f, lista);
    }, `Não foi possível atualizar ${f.nome}`);
    if (r) App.toast(`${f.nome}: ${r} compromisso(s) no calendário.`);
  }

  // ---- utilitários de data ----
  const z = n => String(n).padStart(2, '0');
  const local = d => ({ data: App.dataISO(d), hora: `${z(d.getHours())}:${z(d.getMinutes())}` });
  const doISO = s => { const d = new Date(s); return isNaN(d) ? null : local(d); };

  async function json(url) {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const r = await fetch(url, { signal: ctrl.signal, referrerPolicy: 'no-referrer', credentials: 'omit' });
      if (!r.ok) throw new Error(`o serviço respondeu ${r.status}`);
      return await r.json();
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('o serviço demorou demais');
      if (e instanceof TypeError) throw new Error('sem conexão com o serviço');
      throw e;
    } finally { clearTimeout(t); }
  }

  // ---- Fórmula 1 (Jolpica, sucessor da Ergast) ----
  const SESSOES_F1 = [['FirstPractice', 'Treino Livre 1'], ['SecondPractice', 'Treino Livre 2'], ['ThirdPractice', 'Treino Livre 3'],
    ['SprintQualifying', 'Classificação Sprint'], ['SprintShootout', 'Classificação Sprint'], ['Sprint', 'Sprint'], ['Qualifying', 'Classificação']];
  async function buscarF1() {
    const ano = new Date().getFullYear();
    const res = await Promise.allSettled([ano, ano + 1].map(a => json(`https://api.jolpi.ca/ergast/f1/${a}.json?limit=100`)));
    if (res.every(r => r.status === 'rejected')) throw res[0].reason;
    const out = [];
    for (const r of res) {
      for (const c of r.value?.MRData?.RaceTable?.Races || []) {
        const gp = String(c.raceName || '').replace(/Grand Prix/i, 'GP').trim();
        const quando = s => (s?.date ? (s.time ? doISO(`${s.date}T${s.time}`) : { data: s.date, hora: null }) : null);
        for (const [k, rotulo] of SESSOES_F1) { const q = quando(c[k]); if (q) out.push({ ...q, titulo: `F1 · ${gp} · ${rotulo}` }); }
        const q = quando(c); if (q) out.push({ ...q, titulo: `F1 · ${gp} · Corrida` });
      }
    }
    return out;
  }

  // ---- NFL (ESPN) ----
  async function buscarNFL() {
    const agora = new Date();
    const temporada = agora.getMonth() >= 2 ? agora.getFullYear() : agora.getFullYear() - 1; // de março em diante: temporada do ano
    const j = await json(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${temporada}0801-${temporada + 1}0220&limit=1000`);
    return (j.events || []).map(e => {
      const q = doISO(e.date); if (!q) return null;
      const comp = e.competitions?.[0]?.competitors || [];
      const casa = comp.find(c => c.homeAway === 'home')?.team?.shortDisplayName;
      const fora = comp.find(c => c.homeAway === 'away')?.team?.shortDisplayName;
      const nome = casa && fora ? `${fora} @ ${casa}` : String(e.name || '').replace(' at ', ' @ ');
      const extra = e.season?.type === 3 ? ' · Playoffs' : e.week?.number ? ` · Semana ${e.week.number}` : '';
      return { ...q, titulo: `NFL · ${nome}${extra}` };
    }).filter(Boolean);
  }

  // ---- Futebol (ESPN): acha o id do time pela liga nacional e busca os jogos em cada competição ----
  async function buscarFutebol() {
    const out = []; const vistos = new Set(); const falhas = [];
    for (const time of TIMES) {
      let id = null;
      try {
        const j = await json(`https://site.api.espn.com/apis/site/v2/sports/soccer/${time.ligas[0][0]}/teams`);
        id = (j.sports?.[0]?.leagues?.[0]?.teams || []).map(t => t.team).find(t => time.busca.test(t.displayName) || time.busca.test(t.shortDisplayName || ''))?.id;
      } catch (e) { console.warn('futebol: lista de times', time.nome, e); }
      if (!id) { falhas.push(time.nome); continue; }
      const res = await Promise.allSettled(time.ligas.map(([liga]) => json(`https://site.api.espn.com/apis/site/v2/sports/soccer/${liga}/teams/${id}/schedule?fixture=true`)));
      res.forEach((r, i) => {
        for (const e of r.value?.events || []) {
          if (vistos.has(e.id)) continue;
          const q = doISO(e.date); if (!q) continue;
          vistos.add(e.id);
          const comp = e.competitions?.[0]?.competitors || [];
          const casa = comp.find(c => c.homeAway === 'home')?.team?.displayName;
          const fora = comp.find(c => c.homeAway === 'away')?.team?.displayName;
          out.push({ ...q, titulo: `Futebol · ${casa && fora ? `${casa} x ${fora}` : e.name} · ${time.ligas[i][1]}` });
        }
      });
    }
    if (falhas.length) App.toast(`Não encontrei os jogos de: ${falhas.join(', ')}.`, 'erro');
    return out;
  }

  // ---- Vestibulares: previsões a partir do calendário típico dos anos anteriores ----
  // Datas exatas mudam todo ano; por isso os itens dizem "fique de olho" e levam o site oficial.
  const VESTIBULARES = [
    [1, 15, 'SISU: inscrições da 1ª edição costumam abrir em janeiro — acesso.mec.gov.br/sisu'],
    [1, 25, 'ProUni: inscrições costumam abrir entre janeiro e fevereiro — acessounico.mec.gov.br/prouni'],
    [2, 10, 'FIES: inscrições costumam abrir em fevereiro — acessounico.mec.gov.br/fies'],
    [4, 1, 'ENEM: pedido de isenção da taxa costuma ser em abril — gov.br/inep'],
    [5, 15, 'ENEM: edital e inscrições costumam sair entre maio e junho — gov.br/inep'],
    [11, 1, 'ENEM: provas costumam ser em dois domingos de novembro — gov.br/inep'],
    [5, 1, 'UnB (federal): edital do vestibular/PAS costuma sair no meio do ano — cebraspe.org.br'],
    [7, 1, 'UFPR (federal): edital do vestibular costuma sair em julho — nc.ufpr.br'],
    [7, 15, 'UFSC (federal): edital do vestibular costuma sair entre julho e agosto — vestibular.ufsc.br'],
    [8, 1, 'FUVEST/USP (estadual SP): inscrições costumam abrir em agosto — fuvest.br'],
    [8, 1, 'Unicamp (estadual SP): inscrições da Comvest costumam abrir entre julho e agosto — comvest.unicamp.br'],
    [8, 15, 'Unimontes/PAES (estadual MG): edital costuma sair no 2º semestre — ceps.unimontes.br'],
    [9, 1, 'Unesp (estadual SP): inscrições da Vunesp costumam abrir em setembro — vunesp.com.br'],
    [9, 1, 'UFRGS (federal): edital do vestibular costuma sair entre agosto e setembro — ufrgs.br/coperse'],
    [10, 1, 'UEMG (estadual MG): edital do processo seletivo costuma sair no 2º semestre — uemg.br'],
    [6, 1, 'UERJ (estadual RJ): fique de olho no edital do vestibular — vestibular.uerj.br'],
  ];
  async function gerarVestibulares() {
    const hoje = App.hoje(); const ano = new Date().getFullYear();
    return VESTIBULARES.map(([m, d, texto]) => {
      let data = `${ano}-${z(m)}-${z(d)}`;
      if (data < hoje) data = `${ano + 1}-${z(m)}-${z(d)}`;
      return { data, hora: null, titulo: `Previsão: ${texto}` };
    });
  }

  // ---- importar .ics (calendário de qualquer site) ----
  function lerICS(texto) {
    const linhas = String(texto).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
    const out = []; let ev = null;
    const quando = (params, v) => {
      const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
      if (!m) return null;
      if (!m[4] || /VALUE=DATE(?!-)/.test(params)) return { data: `${m[1]}-${m[2]}-${m[3]}`, hora: null };
      const d = m[7] ? new Date(Date.UTC(m[1], m[2] - 1, m[3], m[4], m[5])) : new Date(m[1], m[2] - 1, m[3], m[4], m[5]);
      return local(d);
    };
    for (const l of linhas) {
      if (l === 'BEGIN:VEVENT') ev = {};
      else if (l === 'END:VEVENT') { if (ev?.q && ev.titulo) out.push({ ...ev.q, titulo: ev.titulo }); ev = null; }
      else if (ev) {
        const i = l.indexOf(':'); if (i < 0) continue;
        const [nome, ...params] = l.slice(0, i).split(';'); const v = l.slice(i + 1);
        if (nome === 'DTSTART') ev.q = quando(params.join(';'), v.trim());
        if (nome === 'SUMMARY') ev.titulo = v.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/gi, ' ').trim();
      }
    }
    return out;
  }
  function importarICS() {
    const inp = el('input', { type: 'file', accept: '.ics,text/calendar', hidden: true });
    inp.addEventListener('change', async () => {
      const f = inp.files[0]; inp.remove(); if (!f) return;
      const lista = lerICS(await f.text());
      if (!lista.length) { App.toast('Não encontrei compromissos nesse arquivo .ics.', 'erro'); return; }
      const nome = f.name.replace(/\.ics$/i, '');
      const n = await App.tentar(() => gravarAgenda('ics-' + App.slug(nome), { nome, categoria: 'importado', fonte: `arquivo ${f.name}` }, lista), 'Não foi possível importar');
      if (n) App.toast(`${n} compromisso(s) importado(s) de ${f.name}.`);
    });
    inp.addEventListener('cancel', () => inp.remove());
    document.body.append(inp); inp.click();
  }

  // ---- seção na página do Calendário ----
  let secaoAberta = null; // lembra se a pessoa abriu ou fechou, entre um redesenho e outro
  function secao() {
    const docs = todas();
    const porId = Object.fromEntries(docs.map(d => [d.nome, d]));
    const alternar = (doc, mostrar) => App.tentar(() => App.store.gravar(doc.caminho, { ...doc.meta, mostrar }, doc.corpo), 'Não foi possível salvar');
    const linha = (id, f, doc) => el('li', {},
      el('div', { class: 'agenda-info' },
        el('strong', { text: f?.nome || doc.meta.nome || doc.nome }),
        el('span', { class: 'dica', text: doc ? `${itens(doc).length} compromisso(s) · atualizado em ${App.fmtData(doc.meta.atualizado)}` : 'ainda não buscado' })),
      el('div', { class: 'acoes' },
        doc ? el('label', { class: 'opcao' }, el('input', { type: 'checkbox', checked: doc.meta.mostrar !== false, onchange: e => alternar(doc, e.target.checked) }), ' Mostrar') : null,
        f ? el('button', { type: 'button', class: 'secundario pequeno', text: doc ? 'Atualizar' : 'Buscar', onclick: () => atualizar(id) }) : null));
    const importados = docs.filter(d => !FONTES[d.nome]);
    const det = el('details', { class: 'feriados-ano agendas', open: secaoAberta ?? !docs.length },
      el('summary', { text: 'Esportes, vestibulares e outros calendários' }),
      el('ul', { class: 'lista-agendas' },
        Object.entries(FONTES).map(([id, f]) => linha(id, f, porId[id])),
        importados.map(d => linha(null, null, d))),
      el('div', { class: 'acoes' },
        el('button', { type: 'button', class: 'secundario', text: 'Importar arquivo .ics', onclick: importarICS })),
      el('p', { class: 'dica', text: 'Os jogos são buscados na internet (ESPN e Jolpica F1) só quando você clica, e ficam salvos em Calendario/Agendas na sua pasta. Clique em “Atualizar” de vez em quando para pegar horários novos. As datas de vestibulares são previsões com base nos anos anteriores: confirme sempre no site oficial. Se algum serviço não responder, baixe o calendário em .ics do site do time ou da liga e use “Importar arquivo .ics”.' }));
    det.addEventListener('toggle', () => { secaoAberta = det.open; });
    return det;
  }

  return { todas, doDia, itens, secao, atualizar, lerICS, gravarAgenda, FONTES };
})();
