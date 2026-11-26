# CLAUDE.md — Caderno (substituto local do Notion)

App web estático, hospedado no **GitHub Pages** (domínio próprio depois), que roda
**no navegador do usuário** para organizar tarefas, calendário, notas de estudo, leitura,
entretenimento (filmes/séries/animes), uma galeria de arte e um painel gamificado. Os dados vivem como arquivos `.md` com frontmatter YAML numa pasta escolhida
pelo usuário, compatível com um vault do Obsidian.

## Regras inegociáveis

1. **Zero dependências e zero build.** Só HTML, CSS e JavaScript puro. Nada de npm,
   bundler, framework, CDN ou fonte externa. O app abre com duplo clique no `index.html`.
2. **Sem ES modules** (`type="module"` não carrega via `file://`). Usar scripts clássicos
   carregados em ordem no `index.html`, cada um registrando seu módulo em `window.App`
   (ex.: `App.yaml`, `App.store`, `App.tarefas`). Sem variáveis globais soltas.
3. **Os arquivos `.md` são a fonte da verdade.** Não existe banco de dados paralelo.
   IndexedDB só guarda o *handle* da pasta escolhida e preferências de interface.
   `localStorage` não guarda dados do usuário.
4. **Nunca destruir dados do usuário.**
   - Ao regravar um arquivo, preservar campos YAML desconhecidos e todo o corpo Markdown.
   - "Excluir" move o arquivo para `.lixeira/` dentro da pasta; nunca apaga de verdade.
   - Gravar com `createWritable()` e só fechar após escrita completa.
   - Se um arquivo não puder ser lido/parseado, mostrar aviso e **não** sobrescrevê-lo.
5. **Compatibilidade com Obsidian.** Frontmatter delimitado por `---`, chaves em
   `snake_case` sem acento, datas `AAAA-MM-DD`, `tags` como lista YAML, sem HTML no corpo.
   Links entre notas como `[[Nome do arquivo]]`.
6. **Interface e textos em português do Brasil.** Fala e reconhecimento de voz em `pt-BR`.
7. **Degradação elegante.** Detectar suporte antes de usar APIs:
   - File System Access API (`showDirectoryPicker`) → só Chrome/Edge. Em outro navegador,
     mostrar aviso claro em vez de quebrar.
   - `SpeechRecognition`/`webkitSpeechRecognition` → esconder o botão de ditado se ausente.
     Avisar que o ditado do Chrome envia áudio aos servidores do Google (precisa de internet).
   - `speechSynthesis` → esconder "ler em voz alta" se ausente.
8. **Sem emojis na interface.** Ícones são SVG de traço via `App.icone(nome)` (decorativos,
   com `aria-label` no botão). Símbolos tipográficos (★ ½ ☆ …) podem.
9. **Acessibilidade.** HTML semântico, `<button>` para ações, `label` em todo campo,
   foco visível, navegação completa por teclado, contraste AA, tema claro/escuro.

## Alvo atual e direção futura

- **Agora:** apenas Chrome/Edge no computador. Não gastar esforço com outros navegadores
  além do aviso de "navegador não suportado".
- **Futuro (não implementar ainda):** versão para celular com um assistente de IA ("a mente
  do Caderno") com quem o usuário conversa e para quem joga coisas a lembrar, e que lê as
  notas. O celular não tem File System Access API, então isso exigirá outro armazenamento
  (sincronização/servidor). Para não travar esse caminho:
  - Todo acesso a dados passa por `App.store`, com interface assíncrona genérica
    (`listar`, `ler`, `gravar`, `mover`) que um adaptador futuro possa implementar.
  - Os `.md` devem ser legíveis por humanos e por uma IA sem contexto extra: campos
    autoexplicativos e corpo em Markdown limpo.
  - Prever uma caixa de "captura rápida" (`Entrada/`) para anotações soltas a classificar.

## Hospedagem

- Repositório GitHub, publicado pelo GitHub Pages a partir da branch `main` (raiz).
- Os dados do usuário **nunca** vão para o repositório nem para o site: ficam na pasta
  local escolhida. Nada de analytics, rastreamento ou servidor próprio.
- **Única exceção de rede:** `js/catalogo.js` consulta catálogos públicos (Google Books,
  Open Library, IMDb, iTunes, TVmaze, AniList, Jikan) **só quando o usuário clica** em "Buscar capa" ou
  "Completar capas", enviando apenas o título. Capas são guardadas como URL no campo `capa`.
  Goodreads e Letterboxd não têm API aberta: a sincronização é por **importação do CSV**
  que esses sites exportam (Goodreads → Export Library; Letterboxd → Settings → Data).
- Usar só caminhos relativos (`./css/...`) para funcionar tanto em `usuario.github.io/caderno`
  quanto num domínio próprio.

## Estrutura do código

```
index.html            # casca da página; carrega CSS e scripts em ordem
css/estilo.css        # tokens de cor em :root, tema escuro via prefers-color-scheme
js/
  app.js              # cria window.App, utilitários (datas, slug, eventos)
  yaml.js             # parse/serialize de frontmatter (subconjunto de YAML)
  markdown.js         # conversor Markdown mínimo e seguro + texto puro para leitura em voz
  store.js            # File System Access: pasta, ler/listar/gravar/mover .md, cache em memória
  voz.js              # ditado (SpeechRecognition) e leitura (speechSynthesis)
  gamificacao.js      # por ora só registrarEvento(); regras a definir
  entrada.js          # captura rápida (Entrada/)
  tarefas.js          # módulo Tarefas e Prazos
  notas.js            # módulo Notas de Estudo
  catalogo.js         # busca de capas/dados em catálogos públicos + importação CSV Goodreads/Letterboxd
  livros.js           # página "Leitura" (App.livros; arquivos em Livros/, rota #/leitura)
  entretenimento.js   # filmes, séries e animes
  calendario.js       # mês, eventos, feriados nacionais e datas comemorativas (calculados localmente)
  arte.js             # galeria de referências (imagens em Arte/imagens/)
  painel.js           # Início: visão do dia (gamificação entra aqui depois)
  main.js             # roteamento por hash (#/tarefas…), inicialização
tests/e2e.js          # teste Playwright (usa OPFS no lugar da pasta real)
```

Cada módulo de tela expõe `render(container)` e só fala com os arquivos via `App.store`.
Nenhum módulo acessa a File System Access API diretamente fora de `store.js`.

## Formato dos arquivos na pasta do usuário

```
<pasta escolhida>/
  Tarefas/<slug>.md
  Notas/<materia>/<slug>.md
  Livros/<slug>.md
  Entretenimento/<slug>.md
  Calendario/<AAAA-MM-DD>-<slug>.md
  Arte/<slug>.md + Arte/imagens/<slug>.<ext>
  Entrada/<data-hora>.md      # capturas rápidas
  Caderno/progresso.md        # estado da gamificação (XP, nível, histórico)
  Caderno/missoes/AAAA-MM-DD.md
  .lixeira/
```

Campos obrigatórios por tipo (`tipo` sempre presente para identificar o arquivo):

- **tarefa:** `tipo, titulo, status (a-fazer|fazendo|feita), prioridade (baixa|media|alta),
  prazo, criado, concluido, area, tags`
- **nota:** `tipo, titulo, materia, criado, atualizado, revisar_em, revisoes, tags`
  (revisão espaçada: intervalos de 1, 3, 7, 14, 30, 60, 120 dias)
- **entrada:** `tipo, criado (AAAA-MM-DDTHH:MM), tags` — o texto capturado é o corpo.
- **livro:** `tipo, titulo, autor, status (quero-ler|lendo|lido), nota (0–5), paginas,
  inicio, fim, tags` + opcionais `ano, isbn, capa (URL), sinopse, generos, goodreads_id`
  — a resenha é o corpo Markdown.
- **entretenimento:** `tipo, titulo, categoria (filme|serie|anime), status (quero-ver|vendo|visto),
  nota (0–5, aceita meia estrela), criador, ano, temporadas, episodios, inicio, fim, capa, tags`
  + opcionais `sinopse, generos, link, titulo_original, letterboxd_uri` — resenha no corpo.
- **evento:** `tipo, titulo, data, hora, hora_fim, repetir (nao|semanal|mensal|anual), local,
  tags, criado` — descrição no corpo. Feriados **não** são arquivos: são calculados.
- **arte:** `tipo, titulo, artista, ano, colecao, imagem (caminho na pasta) ou imagem_url,
  fonte, criado, tags` — corpo começa com `![[arquivo]]` (para o Obsidian) e segue com anotações.
  Excluir move o `.md` **e** a imagem para `.lixeira/`.
- **progresso:** `tipo, xp_total, xp_por_area {produtividade, estudos, leitura}, sequencia_dias,
  ultimo_dia_ativo`

Nomes de arquivo: título em slug legível (`revisao-de-calculo.md`), sem acentos nem espaços;
em colisão, sufixo `-2`, `-3`.

## Gamificação (regras de negócio)

**A definir** junto com a direção de arte. Até lá, `gamificacao.js` expõe apenas a
interface (`registrarEvento(tipo, id)`) e os módulos chamam essa função; valores de XP,
níveis e missões não devem ser implementados.

## Estilo de código

- JavaScript moderno (ES2020+), `const`/`let`, `async/await`, sem `var`.
- Funções pequenas, nomes em português coerentes com o domínio (`salvarTarefa`, `prazo`).
- Sem `innerHTML` com dado do usuário sem escapar — usar `textContent` ou `App.esc()`.
- Markdown renderizado por um conversor mínimo próprio (títulos, listas, negrito, itálico,
  código, links, checklists), sempre escapando HTML.
- Comentários só onde a intenção não é óbvia.

## Como testar

- Abrir `index.html` no Chrome ou Edge (ou servir a pasta com `python3 -m http.server`), escolher uma pasta de teste (nunca o vault real
  durante o desenvolvimento).
- Verificar no Obsidian que os arquivos abrem com as propriedades corretas.
- Testes automatizados: `python3 -m http.server 8123` e depois `node tests/e2e.js`
  (Playwright fora do app, sem afetar a regra de zero dependências do app em si).

## Estado do projeto (contexto para novas sessões)

**Publicado:** https://getro29.github.io/caderno/ (GitHub Pages, branch `main`, raiz).
Repositório: https://github.com/Getro29/caderno. O usuário fala português e não é
programador: explicar em linguagem simples, sem jargão.

**Já feito (v1):**
- Cabeçalho de navegação no topo; sem emojis (ícones SVG).
- Calendário (mês com feriados nacionais, pontos facultativos e datas comemorativas,
  eventos com repetição, prazos das tarefas), Entretenimento (filmes/séries/animes, capas via
  catálogos, importação Letterboxd), Arte (galeria; enviar, arrastar, colar ou link),
  Leitura (antiga "Livros": capas, importação Goodreads).
- Entrada (captura rápida → vira tarefa ou nota), Tarefas (lista agrupada por prazo e
  quadro a-fazer/fazendo/feita), Notas (por matéria, editor Markdown com pré-visualização,
  revisão espaçada), Livros (estantes lendo/quero-ler/lidos, estrelas, resenha), Início
  (prazos da semana, notas a revisar, lendo agora, contador da Entrada).
- Ditado (ícone de microfone) em todos os campos de texto e leitura em voz alta de notas e resenhas (pt-BR).
- Preservação de YAML desconhecido, `.lixeira/`, detecção de edição externa (Obsidian).
- Teste e2e passando (`tests/e2e.js`). Visual atual é **provisório**.

**Decisões tomadas:**
- Só Chrome/Edge no computador por enquanto.
- "Sincronizar com Goodreads/Letterboxd" = importar o CSV exportado + capas de catálogos
  abertos (não há API pública utilizável num site estático). Reimportar só completa campos
  vazios e avança status (quero-ler → lido); nunca apaga.
- Busca de Entretenimento consulta **todas** as fontes ao mesmo tempo (AniList, IMDb, TVmaze,
  MyAnimeList, iTunes), ordena por semelhança do título e categoria escolhida, e ao escolher
  um resultado ajusta a categoria. Se uma fonte falhar, as outras seguram (aviso no diálogo).
- Feriados estaduais/municipais não são automáticos: o usuário cria evento anual.
- O usuário digita os dados no próprio app; a pasta escolhida serve para **salvar** (e reler
  o que foi salvo). Sugestão dada: criar `Documentos/Caderno` e, depois, abrir no Obsidian.
- Repositório público (exigência do GitHub Pages gratuito); dados nunca vão para o repo.
- Domínio próprio: o usuário pretende comprar; configura em Settings → Pages → Custom domain.

**Pendente / próximos passos:**
1. Definir **gamificação** (XP por área, níveis, missões diárias) **junto com a direção de
   arte** — decidir com o usuário antes de implementar.
2. Direção de arte definitiva (substituir o estilo provisório de `css/estilo.css`).
3. Talvez: deixar a tela de boas-vindas mais clara sobre para que serve a pasta
   (o usuário teve essa dúvida).
4. Futuro: versão celular + assistente de IA ("mente do Caderno") — ver seção acima.

**Limitações do ambiente de nuvem do Claude:** o `gh` não consegue criar repositórios nem
mexer nas configurações do GitHub Pages; isso o usuário faz pelo site do GitHub.
Commits: autor `Getro29 <Getro29@users.noreply.github.com>`.
