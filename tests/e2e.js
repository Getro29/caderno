// Teste ponta a ponta: usa o OPFS do Chromium no lugar da pasta escolhida pelo usuário.
// Os catálogos externos (Google Books, Jikan…) são simulados: o teste não depende de internet.
// Uso: python3 -m http.server 8123 &  node tests/e2e.js
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8123/';

const GOODREADS_CSV = [
  'Book Id,Title,Author,ISBN,ISBN13,My Rating,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Exclusive Shelf,My Review',
  '1,Dom Casmurro,Machado de Assis,"=""""","=""9788535910663""",4,256,2016,1899,2024/03/02,2024/01/01,,read,',
  '2,"O Cortiço",Aluísio Azevedo,"=""""","=""""",0,300,2010,1890,,2024/01/01,"classicos, to-read",to-read,"Dizem que é bom<br/>mesmo"',
  '3,Vidas Secas,Graciliano Ramos,"=""""","=""9788501001234""",0,176,2019,1938,,2024/01/01,,currently-reading,',
].join('\n') + '\n';

const z = n => String(n).padStart(2, '0');
const isoLocal = d => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
const hojeISO = isoLocal(new Date());
const hojeAs = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  // O 503 do catálogo derrubado de propósito (abaixo) não conta como erro do app.
  page.on('console', m => { if (m.type() === 'error' && !/status of (503|404)/.test(m.text())) erros.push(m.text()); });
  page.on('dialog', d => d.accept());

  const json = body => ({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.route('https://www.googleapis.com/**', r => r.fulfill(json({ items: [{ volumeInfo: {
    title: 'Dom Casmurro', authors: ['Machado de Assis'], publishedDate: '1899', pageCount: 256,
    industryIdentifiers: [{ type: 'ISBN_13', identifier: '9788535910663' }], imageLinks: { thumbnail: 'http://capas.exemplo/dom.png' } } }] })));
  await page.route('https://openlibrary.org/**', r => r.fulfill(json({ docs: [] })));
  await page.route('https://covers.openlibrary.org/**', r => r.fulfill({ status: 404, body: '' }));
  // Entretenimento: Jikan fora do ar de propósito; os outros catálogos precisam dar conta.
  await page.route('https://api.jikan.moe/**', r => r.fulfill({ status: 503, body: '' }));
  await page.route('https://graphql.anilist.co/**', r => r.fulfill(json({ data: { Page: { media: [
    { title: { romaji: 'Naruto', native: 'ナルト' }, startDate: { year: 2002 }, episodes: 220, genres: ['Action'], format: 'TV',
      description: 'Um ninja <br>barulhento.', siteUrl: 'https://anilist.co/anime/20', coverImage: { extraLarge: 'https://capas.exemplo/naruto.png' },
      studios: { nodes: [{ name: 'Pierrot' }] } },
    { title: { romaji: 'Naruto: Shippuuden' }, startDate: { year: 2007 }, episodes: 500, genres: [], coverImage: {}, studios: { nodes: [] } }] } } })));
  await page.route('https://v3.sg.media-imdb.com/**', r => r.fulfill(json({ d: [
    { l: 'Naruto', y: 2002, qid: 'tvSeries', id: 'tt0409591', s: 'Junko Takeuchi', i: { imageUrl: 'https://capas.exemplo/naruto-imdb._V1_.jpg' } },
    { l: 'Naruto Video Game', y: 2005, qid: 'videoGame', id: 'tt1' }] })));
  await page.route('https://api.tvmaze.com/**', r => r.fulfill(json([])));
  await page.route('https://itunes.apple.com/**', r => r.fulfill(json({ results: [] })));
  await page.route('https://capas.exemplo/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: png }));
  // Agendas esportivas simuladas: um jogo hoje às 23:00 (para o sino e o briefing).
  const ano = new Date().getFullYear();
  await page.route('https://api.jolpi.ca/**', r => r.fulfill(json({ MRData: { RaceTable: { Races: r.request().url().includes(`/${ano}.json`) ? [
    { raceName: 'Brazilian Grand Prix', date: hojeISO, time: hojeAs(23, 0).toISOString().slice(11, 19) + 'Z', Qualifying: { date: hojeISO, time: hojeAs(22, 0).toISOString().slice(11, 19) + 'Z' } }] : [] } } })));
  await page.route('https://site.api.espn.com/**', r => {
    const u = r.request().url();
    if (u.includes('/nfl/scoreboard')) return r.fulfill(json({ events: [{ date: hojeAs(21, 15).toISOString(), week: { number: 13 }, competitions: [{ competitors: [
      { homeAway: 'home', team: { shortDisplayName: 'Ravens' } }, { homeAway: 'away', team: { shortDisplayName: 'Chiefs' } }] }] }] }));
    if (/\/teams$/.test(u.split('?')[0])) return r.fulfill(json({ sports: [{ leagues: [{ teams: [
      { team: { id: '2022', displayName: 'Cruzeiro' } }, { team: { id: '359', displayName: 'Arsenal' } }, { team: { id: '83', displayName: 'Barcelona' } }] }] }] }));
    if (u.includes('/teams/359/schedule') && u.includes('eng.1')) return r.fulfill(json({ events: [{ id: 'g1', date: hojeAs(17, 30).toISOString(), competitions: [{ competitors: [
      { homeAway: 'home', team: { displayName: 'Arsenal' } }, { homeAway: 'away', team: { displayName: 'Chelsea' } }] }] }] }));
    return r.fulfill(json({ events: [] }));
  });
  await page.clock.install();
  await page.addInitScript(() => { window.showDirectoryPicker = async () => navigator.storage.getDirectory(); });
  await page.goto(URL);

  // Arquivo "do Obsidian" com campos desconhecidos para testar preservação.
  await page.evaluate(async () => {
    const r = await navigator.storage.getDirectory();
    const d = await (await r.getDirectoryHandle('Tarefas', { create: true }));
    const w = await (await d.getFileHandle('do-obsidian.md', { create: true })).createWritable();
    await w.write('---\ntipo: tarefa\ntitulo: Veio do Obsidian\nstatus: a-fazer\naliases:\n  - apelido\ncssclass: >\n  texto dobrado\n  em duas linhas\nprazo: 2020-01-01\n---\n\nCorpo **original** com [[link]].\n');
    await w.close();
  });

  await page.getByRole('button', { name: 'Escolher pasta' }).click();
  await page.getByRole('heading', { name: /Bom dia|Boa tarde|Boa noite/ }).waitFor();

  await page.getByRole('heading', { name: 'Briefing do dia' }).waitFor();

  // captura rápida (agora na página de Tarefas) e timeboxing do dia
  await page.goto(URL + '#/tarefas');
  await page.getByLabel('Captura rápida').fill('Comprar café\ne pão');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.getByRole('heading', { name: 'Entrada (1)' }).waitFor();
  await page.getByLabel('07:00', { exact: true }).fill('Academia');
  await page.getByLabel('07:00', { exact: true }).press('Enter');
  await page.getByLabel('Feito às 07:00').check();
  await page.waitForTimeout(300);

  // tarefas
  await page.goto(URL + '#/tarefas');
  await page.getByText('Veio do Obsidian').waitFor();
  await page.getByRole('button', { name: '+ Nova tarefa' }).click();
  await page.getByLabel('Título').fill('Entregar trabalho: cálculo #1');
  await page.getByLabel('Prazo').fill('2030-05-10');
  await page.getByLabel('Tags').fill('faculdade, urgente');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.getByText('Entregar trabalho: cálculo #1').waitFor();
  await page.getByRole('checkbox', { name: 'Veio do Obsidian' }).check();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Quadro' }).click();
  await page.getByRole('button', { name: 'Mover para Fazendo' }).first().click();
  await page.waitForTimeout(400);

  // notas
  await page.goto(URL + '#/notas');
  await page.getByRole('button', { name: '+ Nova nota' }).click();
  await page.getByLabel('Título').fill('Derivadas');
  await page.getByLabel('Matéria', { exact: true }).fill('Cálculo I');
  await page.getByLabel('Conteúdo').fill('# Regra da cadeia\n\n- [x] entender\n- revisar <script>alert(1)</script>');
  await page.getByRole('button', { name: 'Pré-visualizar' }).click();
  await page.locator('.previa h2').waitFor();
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.getByRole('button', { name: /Derivadas/ }).click();
  await page.locator('.nota h2', { hasText: 'Derivadas' }).waitFor();

  // leitura (o endereço antigo #/livros continua funcionando)
  await page.goto(URL + '#/livros');
  await page.getByRole('heading', { name: 'Leitura' }).waitFor();
  await page.getByRole('button', { name: '+ Novo livro' }).click();
  await page.getByLabel('Título').fill('Dom Casmurro');
  await page.getByRole('button', { name: 'Buscar capa e informações' }).click();
  await page.getByRole('button', { name: /Dom Casmurro.*Google Books/ }).click();
  if (await page.getByLabel('Autor(a)').inputValue() !== 'Machado de Assis') throw new Error('a busca não preencheu o autor');
  await page.getByLabel('Status').selectOption('lido');
  await page.getByLabel('Nota').selectOption('5');
  await page.getByLabel('Resenha (Markdown)').fill('Capitu traiu? *Nunca saberemos.*');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.getByRole('button', { name: /Dom Casmurro/ }).click();
  await page.locator('.detalhe-obra em', { hasText: 'Nunca saberemos.' }).waitFor();
  await page.locator('.detalhe-obra img.capa').waitFor();
  await page.keyboard.press('Escape');

  // importação do Goodreads: um livro já existe (só completa), outro é novo
  await page.getByRole('button', { name: 'Importar do Goodreads' }).click();
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Escolher arquivo' }).click()]);
  await fc.setFiles({ name: 'goodreads_library_export.csv', mimeType: 'text/csv', buffer: Buffer.from(GOODREADS_CSV) });
  await page.getByText(/Goodreads: 2 livro\(s\) novo\(s\), 1 atualizado/).waitFor();
  await page.getByRole('button', { name: /Quero ler \(1\)/ }).click();
  await page.getByRole('button', { name: /O Cortiço/ }).waitFor();

  // entretenimento
  await page.goto(URL + '#/entretenimento');
  await page.getByRole('button', { name: '+ Adicionar' }).click();
  await page.getByLabel('Título').fill('Naruto');
  await page.getByLabel('Status', { exact: true }).selectOption('visto');
  await page.getByLabel('Nota').selectOption('4.5');
  await page.getByRole('button', { name: 'Buscar capa e informações' }).click();
  await page.getByText('Sem resposta de: MyAnimeList').waitFor();
  const nomes = await page.locator('.resultado').allInnerTexts();
  if (!/Anime/.test(nomes[0]) || nomes.some(n => /Video Game/.test(n))) throw new Error('ordem/filtro da busca errados: ' + nomes.join(' | '));
  await page.getByRole('button', { name: /^Naruto Anime · Pierrot · 2002/ }).click();
  if (await page.getByLabel('Categoria', { exact: true }).inputValue() !== 'anime') throw new Error('categoria não mudou para anime');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.getByRole('button', { name: 'Vistos (1)' }).waitFor();
  await page.getByRole('button', { name: 'Importar do Letterboxd' }).click();
  const [fl] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Escolher arquivos' }).click()]);
  await fl.setFiles([
    { name: 'watched.csv', mimeType: 'text/csv', buffer: Buffer.from('Date,Name,Year,Letterboxd URI\n2024-05-01,Parasite,2019,https://boxd.it/hTha\n') },
    { name: 'ratings.csv', mimeType: 'text/csv', buffer: Buffer.from('Date,Name,Year,Letterboxd URI,Rating\n2024-05-01,Parasite,2019,https://boxd.it/hTha,4.5\n') },
    { name: 'watchlist.csv', mimeType: 'text/csv', buffer: Buffer.from('Date,Name,Year,Letterboxd URI\n2024-06-01,"Central do Brasil",1998,https://boxd.it/abc\n') },
  ]);
  await page.getByText(/Letterboxd: 2 filme\(s\) novo/).waitFor();

  // calendário: feriados móveis calculados e evento anual
  await page.goto(URL + '#/calendario');
  await page.getByRole('heading', { name: 'Calendário' }).waitFor();
  const moveis = await page.evaluate(() => [App.calendario.pascoa(2025), App.calendario.pascoa(2026), App.calendario.datasDoAno(2026).get('2026-02-17')?.[0]?.nome]);
  if (moveis.join() !== '2025-04-20,2026-04-05,Carnaval') throw new Error('feriados móveis errados: ' + moveis);
  await page.getByRole('button', { name: '+ Novo evento' }).click();
  await page.getByLabel('Título').fill('Aniversário da Ana');
  await page.getByLabel('Data', { exact: true }).fill('2026-12-03');
  await page.getByLabel('Repetir').selectOption('anual');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.getByRole('button', { name: /3 de dezembro de 2026.*1 evento/ }).waitFor();
  await page.getByRole('button', { name: /25 de dezembro de 2026.*Natal/ }).waitFor();
  // agendas: F1, NFL, futebol, vestibulares e .ics
  if (!(await page.locator('details.agendas').evaluate(d => d.open))) await page.getByText('Esportes, vestibulares e outros calendários').click();
  for (const nome of ['Fórmula 1', 'NFL', 'Futebol', 'Vestibulares']) {
    await page.locator('.lista-agendas li', { hasText: nome }).getByRole('button', { name: 'Buscar' }).click();
    await page.locator('.lista-agendas li', { hasText: nome }).getByText(/compromisso\(s\) · atualizado/).waitFor();
  }
  const [fi] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Importar arquivo .ics' }).click()]);
  await fi.setFiles({ name: 'Provas da faculdade.ics', mimeType: 'text/calendar', buffer: Buffer.from(
    'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261210\r\nSUMMARY:Prova de C\r\n álculo\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n') });
  await page.getByText('1 compromisso(s) importado(s)').waitFor();
  await page.getByRole('button', { name: /10 de dezembro de 2026.*1 jogo/ }).click();
  await page.locator('.painel-dia', { hasText: 'Prova de Cálculo' }).waitFor();
  await page.screenshot({ path: (process.env.SHOT_DIR || '.') + '/calendario.png', fullPage: true });

  // hábitos: check-in do dia
  await page.goto(URL + '#/habitos');
  await page.getByRole('checkbox', { name: 'Leitura' }).check();
  await page.getByRole('checkbox', { name: 'Bíblia' }).check();
  await page.getByLabel('Horas de sono (noite anterior)').fill('7.5');
  await page.getByLabel('Horas de sono (noite anterior)').press('Tab');
  await page.getByLabel('Como foi o dia').selectOption('4');
  await page.getByText('2/1 dias').or(page.getByText(/1\/\d+ dias · \d+%/).first()).first().waitFor();
  await page.screenshot({ path: (process.env.SHOT_DIR || '.') + '/habitos.png', fullPage: true });

  // dieta: metas, alimento, peso, receita
  await page.goto(URL + '#/dieta');
  await page.getByRole('button', { name: 'Metas' }).click();
  await page.getByLabel('Calorias (kcal)').fill('2000');
  await page.getByLabel('Proteína (g)').fill('150');
  await page.getByRole('button', { name: 'Salvar metas' }).click();
  await page.getByText('Metas salvas.').waitFor();
  await page.getByRole('button', { name: 'Hoje', exact: true }).click();
  await page.getByLabel('Refeição', { exact: true }).selectOption('Café da manhã');
  await page.getByLabel('Alimento', { exact: true }).fill('Ovos | mexidos');
  await page.getByLabel('Calorias (kcal)').fill('220');
  await page.getByLabel('Proteína (g)').fill('18');
  await page.getByRole('button', { name: 'Adicionar ao dia' }).click();
  await page.getByText('220 de 2000 kcal (11%)').waitFor();
  await page.getByLabel('Peso neste dia (kg)').fill('80.5');
  await page.getByLabel('Peso neste dia (kg)').press('Tab');
  await page.getByText('80.5 kg').first().waitFor();
  await page.getByRole('button', { name: 'Receitas' }).click();
  await page.getByRole('button', { name: '+ Nova receita' }).click();
  await page.getByLabel('Nome').fill('Panqueca de banana');
  await page.getByLabel('Calorias (kcal)').fill('300');
  await page.getByLabel('Proteína (g)').fill('20');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.getByRole('button', { name: /Panqueca de banana/ }).click();
  await page.getByLabel('Porções comidas').fill('2');
  await page.getByRole('button', { name: 'Adicionar ao dia de hoje' }).click();
  await page.getByRole('button', { name: 'Hoje', exact: true }).click();
  await page.getByText('820 de 2000 kcal (41%)').waitFor();
  await page.screenshot({ path: (process.env.SHOT_DIR || '.') + '/dieta.png', fullPage: true });

  // estudo: temporizador com pausa, checklist, timeboxing e simulado
  await page.goto(URL + '#/estudo');
  await page.getByRole('button', { name: '25 min' }).click();
  await page.getByLabel('O que vou estudar').fill('Funções');
  await page.getByRole('button', { name: 'Começar' }).click();
  await page.getByRole('button', { name: 'Pausar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.locator('.selo-tempo').waitFor();
  await page.getByLabel('Nova tarefa de estudo').fill('Revisar funções');
  await page.getByLabel('Nova tarefa de estudo').press('Enter');
  await page.getByRole('checkbox', { name: 'Revisar funções' }).check();
  await page.screenshot({ path: (process.env.SHOT_DIR || '.') + '/estudo.png', fullPage: true });
  await page.clock.fastForward('26:00');
  await page.getByText(/Tempo esgotado: Funções! 25 min registrados/).waitFor();
  await page.getByRole('button', { name: 'Simulados' }).click();
  await page.getByRole('button', { name: '+ Novo simulado' }).click();
  await page.getByLabel('Total de questões').fill('45');
  await page.getByLabel('Acertos').fill('36');
  await page.getByText('80% de acerto (36 de 45, 9 erro(s))').waitFor();
  await page.getByLabel('Prova / vestibular').fill('ENEM');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.getByText('80% de acerto no total').waitFor();

  // arte: envio de imagem
  await page.goto(URL + '#/arte');
  const [fa] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Adicionar imagens' }).click()]);
  await fa.setFiles({ name: 'noite-estrelada.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('heading', { name: 'Editar referência' }).waitFor();
  await page.getByLabel('Artista').fill('Van Gogh');
  await page.getByLabel('Anotações (Markdown)').fill('Pinceladas em **espiral**.');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.getByRole('button', { name: /noite estrelada, de Van Gogh/ }).click();
  await page.locator('.ver-arte img.arte-grande').waitFor();
  await page.keyboard.press('Escape');

  // entrada -> tarefa (o endereço antigo #/entrada abre Tarefas)
  await page.goto(URL + '#/entrada');
  await page.getByRole('heading', { name: 'Tarefas e prazos' }).waitFor();
  await page.getByRole('button', { name: 'Virar tarefa' }).click();
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.getByText('Entrada vazia').waitFor();

  // Nenhuma página pode mostrar "null" ou "undefined" soltos na tela.
  for (const rota of ['inicio', 'tarefas', 'calendario', 'estudo', 'notas', 'habitos', 'dieta', 'leitura', 'entretenimento', 'arte']) {
    await page.goto(URL + '#/' + rota);
    await page.waitForTimeout(150);
    const ruins = await page.evaluate(() => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const out = []; while (w.nextNode()) if (/^\s*(null|undefined|NaN|\[object \w+\])\s*$/.test(w.currentNode.textContent)) out.push(w.currentNode.parentElement.outerHTML.slice(0, 120));
      return out;
    });
    if (ruins.length) throw new Error(`texto quebrado em #/${rota}: ${ruins.join(' | ')}`);
  }

  await page.goto(URL + '#/inicio');
  await page.getByText(/Para assistir: .*Arsenal x Chelsea/).waitFor();
  await page.locator('.carrossel', { hasText: 'Vidas Secas' }).waitFor();
  const sino = page.getByRole('button', { name: /Avisos: \d+ para hoje/ });
  await sino.click();
  await page.getByRole('region', { name: 'Avisos de hoje' }).getByText(/Brazilian GP · Corrida/).waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: (process.env.SHOT_DIR || '.') + '/painel.png', fullPage: true });

  const arquivos = await page.evaluate(async () => {
    const out = {};
    async function andar(d, p) {
      for await (const [n, h] of d.entries()) {
        const c = p ? p + '/' + n : n;
        if (h.kind === 'directory') await andar(h, c);
        else out[c] = /\.md$/.test(n) ? await (await h.getFile()).text() : `(binário, ${(await h.getFile()).size} bytes)`;
      }
    }
    await andar(await navigator.storage.getDirectory(), '');
    return out;
  });
  for (const [c, t] of Object.entries(arquivos).sort()) console.log(`===== ${c}\n${t}`);
  console.log('ERROS:', erros.length ? erros : 'nenhum');
  await browser.close();
  process.exit(erros.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
