# Caderno

Substituto pessoal do Notion: **tarefas** com caixa de entrada e timeboxing do dia,
**calendário** com feriados brasileiros, jogos (F1, NFL, futebol) e vestibulares, **estudo**
(temporizador, checklist, simulados), **hábitos** com check-in diário, **dieta** (calorias,
macros, peso, receitas), **notas**, **leitura**, **entretenimento** (filmes, séries e animes),
uma **galeria de arte** e um **Início** com briefing do dia — com ditado por voz e leitura em
voz alta.

Tudo fica como arquivos `.md` (com propriedades YAML) **numa pasta do seu computador**, que
pode ser o seu vault do Obsidian. Seus dados não vão para a internet: o site só entrega o programa.
As exceções são quando você clica em **Buscar capa** / **Completar capas** (só o título vai para
catálogos públicos: Google Books, Open Library, IMDb, iTunes, TVmaze, AniList, MyAnimeList) e
em **Buscar/Atualizar** jogos no Calendário (o app baixa as tabelas da ESPN e da Jolpica F1).

## Goodreads e Letterboxd

Esses sites não deixam outros sites lerem sua conta, então a sincronização é por arquivo:

- **Goodreads:** My Books → Import and export → *Export Library*. Em **Leitura**, clique em
  *Importar do Goodreads* e escolha o `.csv`.
- **Letterboxd:** Settings → Data → *Export your data*, descompacte o `.zip`. Em
  **Entretenimento**, clique em *Importar do Letterboxd* e escolha os `.csv`.

Pode reimportar quando quiser: só o que estiver vazio é preenchido, nada é apagado.

## Como usar

1. Abra o site no **Google Chrome** ou **Microsoft Edge** (no computador).
2. Clique em **Escolher pasta** e permita leitura e edição.
3. Pronto. Nas próximas vezes, clique em **Reabrir** para usar a mesma pasta.

Também funciona offline: baixe o repositório e abra o `index.html`.

## Onde ficam os arquivos

```
sua-pasta/
  Entrada/   capturas rápidas
  Tarefas/   uma tarefa por arquivo
  Notas/<Matéria>/
  Livros/    a resenha é o texto do arquivo
  Entretenimento/  filmes, séries e animes
  Calendario/      seus eventos; Agendas/ guarda jogos e vestibulares (feriados são calculados)
  Diario/          check-in de cada dia (hábitos, sono, humor, minutos de estudo)
  Timebox/         a divisão de horários de cada dia
  Dieta/           metas, registro de cada dia e Receitas/
  Estudo/          checklist de cada dia e Simulados/
  Arte/      fichas das referências; as imagens ficam em Arte/imagens/
  .lixeira/  o que você exclui vem para cá (nunca é apagado de verdade)
```

## Voz

- Botão de microfone ao lado dos campos: ditado em português. No Chrome, o áudio é transcrito pelo Google e precisa de internet.
- **Ouvir** em notas, livros e filmes: lê o texto em voz alta usando as vozes do sistema.
