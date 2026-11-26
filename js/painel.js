'use strict';
// Painel inicial: visão do dia. A parte gamificada entra aqui quando for definida.
App.painel = (() => {
  const { el } = App;

  function cartao(titulo, link, conteudo) {
    return el('section', { class: 'cartao-painel' },
      el('header', {}, el('h2', { text: titulo }), link ? el('a', { href: link, text: 'Ver tudo' }) : null),
      conteudo);
  }
  const lista = (itens, vazio) => itens.length ? el('ul', { class: 'lista-simples' }, itens) : el('p', { class: 'vazio', text: vazio });

  function render(container) {
    const abertas = App.tarefas.todas().filter(d => d.meta.status !== 'feita' && d.meta.prazo && App.diasAte(d.meta.prazo) <= 7)
      .sort((a, b) => String(a.meta.prazo).localeCompare(String(b.meta.prazo)));
    const revisar = App.notas.paraRevisar();
    const lendo = App.livros.todos().filter(d => d.meta.status === 'lendo');
    const capturas = App.entrada.todas().length;
    const hora = new Date().getHours();
    const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

    container.replaceChildren(
      el('header', { class: 'cabecalho-tela' },
        el('div', {},
          el('h1', { text: saudacao + '!' }),
          el('p', { class: 'resumo', text: new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) }))),
      App.entrada.formulario(),
      el('div', { class: 'grade-painel' },
        cartao('Prazos da semana', '#/tarefas', lista(abertas.slice(0, 8).map(d => {
          const n = App.diasAte(d.meta.prazo);
          return el('li', {},
            el('button', { type: 'button', class: 'link', text: d.meta.titulo || d.nome, onclick: () => App.tarefas.editar(d) }),
            el('span', { class: 'selo ' + (n < 0 ? 'perigo' : n <= 1 ? 'alerta' : ''), text: App.descreverPrazo(d.meta.prazo) }));
        }), 'Nada vencendo nos próximos 7 dias.')),
        cartao('Revisar hoje', '#/notas', lista(revisar.slice(0, 8).map(d => el('li', {},
          el('span', { text: d.meta.titulo || d.nome }), el('span', { class: 'selo', text: App.notas.materiaDe(d) }))),
          'Nenhuma nota para revisar.')),
        cartao('Lendo agora', '#/livros', lista(lendo.map(d => el('li', {},
          el('span', { text: d.meta.titulo || d.nome }), el('span', { class: 'dica', text: d.meta.autor || '' }))),
          'Nenhum livro em andamento.')),
        cartao('Entrada', '#/entrada', el('p', { class: 'numero-grande' },
          el('strong', { text: capturas }), capturas === 1 ? ' captura para organizar' : ' capturas para organizar')),
        cartao('Progresso', null, el('p', { class: 'vazio', text: 'Nível, XP e missões diárias chegam junto com a direção de arte.' }))));
  }

  return { render };
})();
