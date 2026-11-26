// Teste ponta a ponta: usa o OPFS do Chromium no lugar da pasta escolhida pelo usuário.
// Os catálogos externos (Google Books, Jikan…) são simulados: o teste não depende de internet.
// Uso: python3 -m http.server 8123 &  node tests/e2e.js
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8123/';

const GOODREADS_CSV = [
  'Book Id,Title,Author,ISBN,ISBN13,My Rating,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Exclusive Shelf,My Review',
  '1,Dom Casmurro,Machado de Assis,"=""""","=""9788535910663""",4,256,2016,1899,2024/03/02,2024/01/01,,read,',
  '2,"O Cortiço",Aluísio Azevedo,"=""""","=""""",0,300,2010,1890,,2024/01/01,"classicos, to-read",to-read,"Dizem que é bom<br/>mesmo"',
].join('\n') + '\n';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
  page.on('dialog', d => d.accept());

  const json = body => ({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.route('https://www.googleapis.com/**', r => r.fulfill(json({ items: [{ volumeInfo: {
    title: 'Dom Casmurro', authors: ['Machado de Assis'], publishedDate: '1899', pageCount: 256,
    industryIdentifiers: [{ type: 'ISBN_13', identifier: '9788535910663' }], imageLinks: { thumbnail: 'http://capas.exemplo/dom.png' } } }] })));
  await page.route('https://openlibrary.org/**', r => r.fulfill(json({ docs: [] })));
  await page.route('https://covers.openlibrary.org/**', r => r.fulfill({ status: 404, body: '' }));
  await page.route('https://api.jikan.moe/**', r => r.fulfill(json({ data: [{ title: 'Frieren', year: 2023, episodes: 28,
    studios: [{ name: 'Madhouse' }], genres: [{ name: 'Fantasy' }], synopsis: 'Uma elfa maga.', url: 'https://myanimelist.net/anime/52991',
    images: { jpg: { large_image_url: 'https://capas.exemplo/frieren.png' } } }] })));
  await page.route('https://capas.exemplo/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: png }));
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

  // captura rápida
  await page.getByLabel('Captura rápida').fill('Comprar café\ne pão');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.getByText('1').first().waitFor();

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
  await page.getByText(/Goodreads: 1 livro\(s\) novo\(s\), 1 atualizado/).waitFor();
  await page.getByRole('button', { name: /Quero ler \(1\)/ }).click();
  await page.getByRole('button', { name: /O Cortiço/ }).waitFor();

  // entretenimento
  await page.goto(URL + '#/entretenimento');
  await page.getByRole('button', { name: '+ Adicionar' }).click();
  await page.getByLabel('Título').fill('Frieren');
  await page.getByLabel('Categoria', { exact: true }).selectOption('anime');
  await page.getByLabel('Status', { exact: true }).selectOption('visto');
  await page.getByLabel('Nota').selectOption('4.5');
  await page.getByRole('button', { name: 'Buscar capa e informações' }).click();
  await page.getByRole('button', { name: /Frieren.*MyAnimeList/ }).click();
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
  await page.screenshot({ path: (process.env.SHOT_DIR || '.') + '/calendario.png', fullPage: true });

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

  // entrada -> tarefa
  await page.goto(URL + '#/entrada');
  await page.getByRole('button', { name: 'Virar tarefa' }).click();
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.getByText('Entrada vazia').waitFor();

  await page.goto(URL + '#/inicio');
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
