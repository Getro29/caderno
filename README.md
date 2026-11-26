# Caderno

Substituto pessoal do Notion: **tarefas e prazos**, **calendário** com feriados brasileiros,
**notas de estudo**, **leitura** (livros com resenhas), **entretenimento** (filmes, séries e animes),
uma **galeria de arte** e uma **caixa de entrada** para capturas rápidas — com ditado por voz e
leitura em voz alta.

Tudo fica como arquivos `.md` (com propriedades YAML) **numa pasta do seu computador**, que
pode ser o seu vault do Obsidian. Seus dados não vão para a internet: o site só entrega o programa.
A única exceção é quando você clica em **Buscar capa** / **Completar capas**: aí só o título é
enviado a catálogos públicos (Google Books, Open Library, IMDb, iTunes, TVmaze, AniList, MyAnimeList).

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
  Calendario/      seus eventos (feriados são calculados, não viram arquivo)
  Arte/      fichas das referências; as imagens ficam em Arte/imagens/
  .lixeira/  o que você exclui vem para cá (nunca é apagado de verdade)
```

## Voz

- Botão de microfone ao lado dos campos: ditado em português. No Chrome, o áudio é transcrito pelo Google e precisa de internet.
- **Ouvir** em notas, livros e filmes: lê o texto em voz alta usando as vozes do sistema.
