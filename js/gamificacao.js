'use strict';
// Gamificação: regras (XP, níveis, missões) ainda serão definidas junto com a direção de arte.
// Por enquanto os módulos apenas registram eventos aqui; nada é gravado em disco.
App.gamificacao = (() => {
  const eventos = [];

  // tipo: 'tarefa_concluida' | 'nota_criada' | 'nota_revisada' | 'livro_lido' | 'resenha_escrita' | 'captura'
  function registrarEvento(tipo, id, dados = {}) {
    const ev = { tipo, id, dados, em: new Date().toISOString() };
    eventos.push(ev);
    App.emit('evento', ev);
  }

  return { registrarEvento, eventosDaSessao: () => eventos.slice() };
})();
