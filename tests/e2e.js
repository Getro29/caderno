// Teste ponta a ponta: usa o OPFS do Chromium no lugar da pasta escolhida pelo usuário.
// Uso: python3 -m http.server 8123 &  node tests/e2e.js
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8123/';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
  page.on('dialog', d => d.accept());
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

  // livros
  await page.goto(URL + '#/livros');
  await page.getByRole('button', { name: '+ Novo livro' }).click();
  await page.getByLabel('Título').fill('Dom Casmurro');
  await page.getByLabel('Autor(a)').fill('Machado de Assis');
  await page.getByLabel('Status').selectOption('lido');
  await page.getByLabel('Nota').selectOption('5');
  await page.getByLabel('Resenha (Markdown)').fill('Capitu traiu? *Nunca saberemos.*');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.getByRole('button', { name: /Dom Casmurro/ }).click();
  await page.locator('.livro-detalhe em', { hasText: 'Nunca saberemos.' }).waitFor();
  await page.keyboard.press('Escape');

  // entrada -> tarefa
  await page.goto(URL + '#/entrada');
  await page.getByRole('button', { name: '→ Tarefa' }).click();
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.getByText('Entrada vazia').waitFor();

  await page.goto(URL + '#/inicio');
  await page.waitForTimeout(300);
  await page.screenshot({ path: process.env.SHOT || 'painel.png', fullPage: true });

  const arquivos = await page.evaluate(async () => {
    const out = {};
    async function andar(d, p) {
      for await (const [n, h] of d.entries()) {
        const c = p ? p + '/' + n : n;
        if (h.kind === 'directory') await andar(h, c); else out[c] = await (await h.getFile()).text();
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
