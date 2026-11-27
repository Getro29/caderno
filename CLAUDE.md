# CLAUDE.md — Bit-life (antigo "Caderno"; substituto local do Notion)

App web estático, hospedado no **GitHub Pages** (domínio próprio depois), que roda
**no navegador do usuário** para organizar tarefas (com timeboxing), calendário (feriados, esportes,
vestibulares), estudo (temporizador, simulados), hábitos (com nível/XP), dieta, finanças, notas, leitura, entretenimento
(filmes/séries/animes), uma galeria de arte e um Início com briefing diário. Os dados vivem como arquivos `.md` com frontmatter YAML numa pasta escolhida
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
- Nome do app: **Bit-life** (o repositório continua `caderno`; as pastas de dados `Caderno/`
  e o banco IndexedDB `caderno` mantêm o nome antigo para não perder dados nem a pasta salva).
- **Únicas exceções de rede**, sempre **só quando o usuário clica**:
  - `js/catalogo.js` consulta catálogos públicos (Google Books, Open Library, IMDb, iTunes,
    TVmaze, AniList, Jikan) em "Buscar capa" / "Completar capas", enviando apenas o título.
  - `js/agenda.js` baixa calendários esportivos em "Buscar/Atualizar" (Jolpica F1 em
    api.jolpi.ca; ESPN em site.api.espn.com para NFL e futebol). Nada do usuário é enviado. Capas são guardadas como URL no campo `capa`.
  Goodreads e Letterboxd não têm API aberta: a sincronização é por **importação do CSV**
  que esses sites exportam (Goodreads → Export Library; Letterboxd → Settings → Data).
- Usar só caminhos relativos (`./css/...`) para funcionar tanto em `usuario.github.io/caderno`
  quanto num domínio próprio.

## Estrutura do código

```
index.html            # casca da página; carrega CSS e scripts em ordem
css/estilo.css        # tokens de cor em :root; tema escuro automático ou forçado por data-theme
js/
  app.js              # cria window.App, utilitários (datas, slug, eventos)
  animacao.js         # App.animacao: entrada das páginas, barra de XP, nível, "pulo" do check (Web Animations API)
  yaml.js             # parse/serialize de frontmatter (subconjunto de YAML)
  markdown.js         # conversor Markdown mínimo e seguro + texto puro para leitura em voz
  store.js            # File System Access: pasta, ler/listar/gravar/alterar/mover .md, cache em memória
  voz.js              # ditado (SpeechRecognition) e leitura (speechSynthesis)
  preferencias.js     # diálogo de Preferências: tema, voz de leitura, pasta (IndexedDB)
  gamificacao.js      # XP e nível a partir dos hábitos; selo "Nv" no cabeçalho; Caderno/progresso.md
  diario.js           # check-in diário (Diario/) e lista de hábitos; estatísticas do mês
  timebox.js          # componente de timeboxing (blocos de 30 min), usado em Tarefas e Estudo
  entrada.js          # captura rápida (Entrada/) — exibida dentro da página Tarefas
  tarefas.js          # página Tarefas: Entrada + tarefas + timeboxing do dia
  notas.js            # módulo Notas de Estudo
  catalogo.js         # busca de capas/dados em catálogos públicos + importação CSV Goodreads/Letterboxd
  livros.js           # página "Leitura" (App.livros; arquivos em Livros/, rota #/leitura)
  entretenimento.js   # filmes, séries e animes
  calendario.js       # mês, eventos, feriados nacionais e datas comemorativas (calculados localmente)
  arte.js             # galeria de referências (imagens em Arte/imagens/)
  agenda.js           # agendas externas no calendário: F1, NFL, futebol, vestibulares, .ics
  habitos.js          # página Hábitos: check-in, grade do mês, estatísticas
  dieta.js            # página Dieta: refeições/macros, água, peso, metas, progresso, receitas
  financeiro.js       # página Finanças (rota #/financas): entradas, saídas, planejados por data
  estudo.js           # página Estudo: temporizador, checklist, timeboxing, simulados
  painel.js           # Início: nível, briefing do dia, check-in, próximos dias, em andamento, finanças
  notificacoes.js     # sino do cabeçalho (tarefas/eventos/contas de hoje) e selo do temporizador
  main.js             # roteamento por hash (#/tarefas…), inicialização
tests/e2e.js          # teste Playwright (usa OPFS no lugar da pasta real)
.claude/skills/ui-ux-pro-max/  # skill de design (só para o Claude; o app não carrega nada dela)
.claude/skills/motion-design/   # skill de movimento (LottieFiles, MIT): tempos, curvas, coreografia
```

Cada módulo de tela expõe `render(container)` e só fala com os arquivos via `App.store`.
Nenhum módulo acessa a File System Access API diretamente fora de `store.js`.

Convenções importantes de gravação:
- Telas com edição direta (timeboxing, check-in, dieta, checklist) gravam com
  `{ inline: true }`: o arquivo é salvo sem redesenhar a página (o campo não perde o foco).
- Quando o novo valor depende do arquivo atual (marcar hábito, somar água, somar minutos),
  usar `App.store.alterar(caminho, doc => ({ meta, corpo }))`, que roda na fila do arquivo
  sobre a versão mais recente. Gravar a partir de uma cópia antiga perde cliques rápidos.
- Listas estruturadas vão no **corpo** em Markdown (o YAML só aceita listas simples e mapas de
  1 nível). Ao reescrever o corpo, manter as linhas que não seguem o formato (edições no Obsidian).
- `App.el` ignora `null`, mas `replaceChildren(null)` escreve "null" na tela: filtrar antes.
  O teste e2e varre todas as páginas procurando "null"/"undefined" soltos.

## Formato dos arquivos na pasta do usuário

```
<pasta escolhida>/
  Tarefas/<slug>.md
  Notas/<materia>/<slug>.md
  Livros/<slug>.md
  Entretenimento/<slug>.md
  Calendario/<AAAA-MM-DD>-<slug>.md
  Arte/<slug>.md + Arte/imagens/<slug>.<ext>
  Calendario/Agendas/<id>.md  # f1, nfl, futebol, vestibulares, ics-<nome>
  Diario/AAAA-MM-DD.md        # check-in do dia
  Timebox/AAAA-MM-DD-dia.md   # e -estudo.md
  Dieta/metas.md, Dieta/Registros/AAAA-MM-DD.md, Dieta/Receitas/<slug>.md
  Estudo/Dias/AAAA-MM-DD.md, Estudo/Simulados/<slug>.md
  Financeiro/AAAA-MM.md       # lançamentos do mês (tabela no corpo)
  Entrada/<data-hora>.md      # capturas rápidas
  Caderno/habitos.md          # lista de hábitos do check-in
  Caderno/progresso.md        # retrato do nível/XP (recalculado a partir do Diario/)
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
- **agenda:** `tipo, nome, categoria (esporte|vestibular|importado), fonte, atualizado, mostrar`
  — corpo: uma linha por compromisso `- AAAA-MM-DD HH:MM | título` (hora opcional), hora local.
- **diario:** `tipo, data, habitos (lista de slugs feitos), sono_horas, humor (1–5), estudo_minutos`.
- **config_habitos** (`Caderno/habitos.md`): `tipo, habitos` (lista de nomes; padrão Leitura,
  Dieta do dia, Exercício, Bíblia). Slug do nome é a chave usada no diário.
- **timebox:** `tipo, data, contexto (dia|estudo)` — corpo `- [ ] HH:MM o que fazer` ([x] = feito).
- **metas_dieta:** `tipo, calorias, proteina_g, carboidrato_g, gordura_g, agua_ml, peso_meta_kg`.
- **dieta_dia:** `tipo, data, peso_kg, agua_ml, calorias, proteina_g, carboidrato_g, gordura_g`
  (totais recalculados) — corpo: tabela `| Refeição | Alimento | kcal | Proteína (g) | Carboidrato (g) | Gordura (g) |`.
- **receita:** `tipo, titulo, porcoes, tempo_min, calorias, proteina_g, carboidrato_g, gordura_g
  (por porção), tags, criado` — ingredientes e preparo no corpo.
- **estudo_dia:** `tipo, data` — corpo `- [ ] item` (checklist do dia).
- **simulado:** `tipo, titulo, data, prova, materia, questoes, acertos, percentual, tempo_min, tags`.
- **financeiro_mes:** `tipo, mes (AAAA-MM), entradas, saidas, saldo, previsto_entradas, previsto_saidas`
  (totais recalculados; só `feito` entra em entradas/saidas/saldo) — corpo: tabela
  `| Data | Tipo | Descrição | Categoria | Valor (R$) | Situação |`, tipo `entrada|saida`,
  situação `feito|previsto`, valor com ponto decimal (`1200.00`). Lançamento repetido = uma linha
  `previsto` em cada mês seguinte.
- **progresso** (`Caderno/progresso.md`, retrato recalculado; a fonte é o `Diario/`): `tipo, xp_total,
  nivel, xp_para_proximo, xp_por_area {habitos}, sequencia_dias, ultimo_dia_ativo`

Nomes de arquivo: título em slug legível (`revisao-de-calculo.md`), sem acentos nem espaços;
em colisão, sufixo `-2`, `-3`.

## Gamificação (regras de negócio)

Definida pelo usuário: **XP vem dos hábitos do check-in diário.**
- Um dia com todos os hábitos feitos vale **100 XP**; cada hábito vale a sua fração
  (4 hábitos → 25 XP cada). Máximo de 100 XP por dia.
- **A cada 5 dias completos (500 XP) sobe um nível.** Começa no nível 1.
- Tudo é calculado a partir dos arquivos `Diario/` (`App.gamificacao.progresso()`); depois de
  marcar um hábito, `aposHabito()` avisa a subida de nível e regrava `Caderno/progresso.md`.
- Outros eventos continuam passando por `registrarEvento(tipo, id)` mas ainda não dão XP.
  Missões e XP de outras áreas: decidir com o usuário antes de implementar.

## Animação e design

- Animações só com CSS e a Web Animations API, via `App.animacao` (sem Framer Motion, GSAP etc.).
  Animar só `transform`/`opacity`, 150–450 ms, e nada quando `prefers-reduced-motion: reduce`.
  A entrada da página roda só quando a rota muda (não a cada gravação).
- Identidade de movimento (skill `motion-design`): base sóbria e toque brincalhão só nas conquistas.
  Curvas em `animacao.js`: `ENTRA` (entrada), `SAI` (saída, mais curta), `MOLA` (conquista);
  durações `RAPIDO` 160, `PADRAO` 280, `LENTO` 600 ms; cascata total < 500 ms; erro = sacudida sem mola.
  Ignorar a sugestão dela de usar o serviço Creator MCP da LottieFiles (só exporta vídeo/GIF).
- Skill `ui-ux-pro-max` (MIT, de nextlevelbuilder) instalada em `.claude/skills/`. Pesquisa:
  `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<busca>" --domain ux` (domínios: ux, style,
  color, typography, gsap, chart…). As sugestões dela assumem React/Tailwind/GSAP/Google Fonts:
  aproveitar só a ideia e escrever em JS/CSS puro. Ela desaconselha gradiente roxo, mas o visual
  roxo do Bit-life é escolha do usuário — as regras deste arquivo sempre vencem.

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

**Já feito (v2 — Bit-life):**
- App renomeado para **Bit-life**. Visual novo (roxo/gradiente, cartões com sombra, cabeçalho
  translúcido, tema claro/escuro automático ou escolhido em Preferências).
- Cabeçalho com nomes curtos + ícone (Início, Tarefas, Agenda, Estudo, Notas, Hábitos, Dieta,
  Finanças, Livros, Filmes, Arte); em telas < 1340 px só ícones (o nome completo fica no `title`).
  À direita: selo de nível, sino e botão de Preferências (tema, voz, pasta/recarregar/trocar).
- **Finanças** (`#/financas`): lançar entrada/saída com categoria, data e "ainda vai acontecer"
  (planejado), repetir todo mês por 3/6/12 meses, marcar planejado como feito, resumo do mês,
  saldo previsto, caixa total, planejados dos próximos 45 dias, gastos por categoria.
  Contas planejadas vencidas/de hoje aparecem no sino e no briefing.
- **Nível/XP** pelos hábitos (ver Gamificação): cartão no Início e em Hábitos, selo "Nv" no topo.
- **Início mais limpo:** saudação + nível, briefing em blocos (com Ouvir), check-in, próximos
  dias (prazos + agenda juntos), em andamento (livros e séries num carrossel só) e finanças.
  Entrada e notas a revisar viraram frases do briefing.
- **Voz:** padrão masculina pt-BR (heurística por nome: Antonio, Daniel, Donato, Fabio…),
  velocidade 0,9 e tom 0,8 ("narrador"); ajustável em Preferências.

**Já feito (v1):**
- Navegação: Início, Tarefas, Calendário, Estudo, Notas, Hábitos, Dieta, Leitura,
  Entretenimento, Arte. Endereços antigos `#/entrada` e `#/livros` redirecionam.
- Tarefas = Entrada (captura) + lista/quadro de tarefas + timeboxing do dia (30 em 30 min).
- Estudo: temporizador por duração ou "até HH:MM", com pausa/continuar, aviso sonoro, selo no
  cabeçalho, estado no sessionStorage (é estado de interface); minutos concluídos somam no
  diário. Checklist do dia (traz pendentes de ontem), timeboxing de estudo, simulados (% de
  acerto, evolução, por matéria).
- Hábitos: check-in (hábitos, sono, humor), grade do mês clicável, estatísticas, sequências.
  O mês conta a partir do primeiro check-in já feito.
- Dieta: refeições com kcal/macros, água, peso, metas com barras, gráfico de peso e calorias,
  receitas com "adicionar ao dia".
- Calendário: agendas de F1 (todas as sessões), NFL (temporada), futebol (Cruzeiro, Barcelona,
  Arsenal em liga, copas e Champions/Libertadores), previsões de vestibulares/ENEM/SISU
  (marcadas como "Previsão", com site oficial) e importação de .ics.
- Início: briefing do dia em texto (agenda, tarefas, hábitos de ontem, sono/humor, dieta, peso,
  estudo, mês; botão Ouvir), check-in rápido, carrossel de capas em Lendo/Assistindo (troca a
  cada 4 s, pausa no foco/mouse e com movimento reduzido), hábitos do mês.
- Sino no cabeçalho: tarefas atrasadas/de hoje, compromissos do dia e o que vence amanhã.
- Cabeçalho de navegação no topo; sem emojis (ícones SVG).
- Calendário (mês com feriados nacionais, pontos facultativos e datas comemorativas,
  eventos com repetição, prazos das tarefas), Entretenimento (filmes/séries/animes, capas via
  catálogos, importação Letterboxd), Arte (galeria; enviar, arrastar, colar ou link),
  Leitura (antiga "Livros": capas, importação Goodreads).
- Entrada (captura rápida → vira tarefa ou nota), Tarefas (lista agrupada por prazo e
  quadro a-fazer/fazendo/feita), Notas (por matéria, editor Markdown com pré-visualização,
  revisão espaçada), Livros (estantes lendo/quero-ler/lidos, estrelas, resenha), Início
  (prazos da semana, notas a revisar, contador da Entrada).
- Ditado (ícone de microfone) em todos os campos de texto e leitura em voz alta de notas e resenhas (pt-BR).
- Preservação de YAML desconhecido, `.lixeira/`, detecção de edição externa (Obsidian).
- Teste e2e passando (`tests/e2e.js`), incluindo Finanças, nível e Preferências.

**Decisões tomadas:**
- Voz do Cid Moreira: **não** clonar a voz de uma pessoa real a partir de vídeos (direitos de
  voz/imagem e exige servidor de IA). Alternativa adotada: voz masculina do sistema com tom grave.
- Só Chrome/Edge no computador por enquanto.
- "Sincronizar com Goodreads/Letterboxd" = importar o CSV exportado + capas de catálogos
  abertos (não há API pública utilizável num site estático). Reimportar só completa campos
  vazios e avança status (quero-ler → lido); nunca apaga.
- Busca de Entretenimento consulta **todas** as fontes ao mesmo tempo (AniList, IMDb, TVmaze,
  MyAnimeList, iTunes), ordena por semelhança do título e categoria escolhida, e ao escolher
  um resultado ajusta a categoria. Se uma fonte falhar, as outras seguram (aviso no diálogo).
- Feriados estaduais/municipais não são automáticos: o usuário cria evento anual.
- Datas de vestibulares não têm fonte aberta: são **previsões** pelo calendário típico, com
  aviso para conferir no site oficial. Não apresentar como data confirmada.
- Times de futebol ficam em `TIMES` no `agenda.js` (id do time descoberto pela lista da liga
  na ESPN). As APIs da ESPN e da Jolpica não foram testadas de dentro do ambiente de nuvem
  (rede bloqueada): o e2e usa respostas simuladas. Se falharem, o caminho é importar .ics.
- O usuário digita os dados no próprio app; a pasta escolhida serve para **salvar** (e reler
  o que foi salvo). Sugestão dada: criar `Documentos/Bit-life` e, depois, abrir no Obsidian. A tela de boas-vindas
  agora explica isso.
- Repositório público (exigência do GitHub Pages gratuito); dados nunca vão para o repo.
- Domínio próprio: o usuário pretende comprar; configura em Settings → Pages → Custom domain.

**Já feito (v2.1):** animações (entrada das páginas em sequência, barras enchendo, barra de XP
andando, comemoração com faíscas ao subir de nível, "pulo" ao marcar caixas e células de hábito,
avisos e diálogos deslizando) e skill de design `ui-ux-pro-max` instalada.

**Pendente / próximos passos:**
0. Confirmar no navegador do usuário que as buscas de jogos (ESPN/Jolpica) e de capas
   funcionam de verdade; ajustar fontes se algum serviço bloquear.
1. **Front-end:** continuar a direção de arte com o usuário (primeira versão moderna feita:
   tokens em `:root` de `css/estilo.css`); revisar página por página.
2. Gamificação além dos hábitos (missões, XP de tarefas/estudo) — só com o usuário.
3. Finanças: talvez metas/orçamento por categoria e gráfico do saldo.
4. Futuro: versão celular + assistente de IA ("mente do Caderno") — ver seção acima.

**Limitações do ambiente de nuvem do Claude:** o `gh` não consegue criar repositórios nem
mexer nas configurações do GitHub Pages; isso o usuário faz pelo site do GitHub.
Commits: autor `Getro29 <Getro29@users.noreply.github.com>`.
