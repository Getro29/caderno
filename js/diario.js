'use strict';
// Diário: um arquivo por dia (Diario/AAAA-MM-DD.md) com o check-in diário — hábitos marcados,
// horas de sono, humor e minutos de estudo. É a base das estatísticas e do briefing do Início.
// A lista de hábitos fica em Caderno/habitos.md.
App.diario = (() => {
  const PASTA = 'Diario';
  const CONFIG = 'Caderno/habitos.md';
  const PADRAO = ['Leitura', 'Dieta do dia', 'Exercício', 'Bíblia'];

  const caminho = data => `${PASTA}/${data}.md`;
  const obter = data => App.store.obter(caminho(data)) || null;
  const meta = data => obter(data)?.meta || {};

  // Atualiza só os campos pedidos, preservando o resto do arquivo.
  // patch pode ser um objeto ou uma função (metaAtual) => objeto, aplicada na versão mais recente.
  function atualizar(data, patch, opcoes = { inline: true }) {
    return App.store.alterar(caminho(data), doc => {
      const atual = { tipo: 'diario', data, habitos: [], sono_horas: null, humor: null, estudo_minutos: null, ...(doc?.meta || {}) };
      return { meta: { ...atual, ...(typeof patch === 'function' ? patch(atual) : patch) }, corpo: doc?.corpo || '' };
    }, opcoes);
  }

  // ---- hábitos ----
  function habitos() {
    const c = App.store.obter(CONFIG);
    const lista = App.lista(c?.meta.habitos).map(String).filter(Boolean);
    return lista.length ? lista : PADRAO.slice();
  }
  async function salvarHabitos(lista) {
    const doc = App.store.obter(CONFIG);
    const corpo = doc?.corpo || 'Lista de hábitos marcados no check-in diário do Caderno. Cada dia fica em Diario/AAAA-MM-DD.md.\n';
    return App.store.gravar(CONFIG, { tipo: 'config_habitos', ...(doc?.meta || {}), habitos: lista }, corpo);
  }
  const chave = nome => App.slug(nome);
  const feitos = data => App.lista(meta(data).habitos).map(String);
  const fez = (data, nome) => feitos(data).includes(chave(nome));

  function alternar(data, nome, marcado) {
    if (marcado) App.gamificacao.registrarEvento('habito_marcado', caminho(data), { habito: chave(nome) });
    return atualizar(data, m => {
      const atual = new Set(App.lista(m.habitos).map(String));
      if (marcado) atual.add(chave(nome)); else atual.delete(chave(nome));
      return { habitos: [...atual] };
    });
  }

  // ---- estatísticas ----
  function diasDoMes(ano, mes) { // mes 0–11
    const n = new Date(ano, mes + 1, 0).getDate();
    return Array.from({ length: n }, (_, i) => App.dataISO(new Date(ano, mes, i + 1)));
  }
  // Dias já vividos do mês, a partir do primeiro check-in já feito (não pune o tempo antes de
  // começar a usar o Caderno nem conta o futuro).
  const primeiroDia = () => App.store.listar({ pasta: PASTA, tipo: 'diario' }).map(d => String(d.meta.data || d.nome)).sort()[0] || App.hoje();
  const diasContados = (ano, mes) => { const ini = primeiroDia(); return diasDoMes(ano, mes).filter(d => d <= App.hoje() && d >= ini); };

  function sequencia(nome, ate = App.hoje()) {
    let n = 0; let d = ate;
    if (!fez(d, nome)) d = App.somarDias(d, -1); // hoje ainda pode ser marcado
    while (fez(d, nome)) { n++; d = App.somarDias(d, -1); }
    return n;
  }

  function resumoMes(ano, mes) {
    const dias = diasContados(ano, mes);
    const porHabito = habitos().map(h => {
      const qtd = dias.filter(d => fez(d, h)).length;
      return { nome: h, feitos: qtd, dias: dias.length, pct: dias.length ? Math.round((qtd / dias.length) * 100) : 0, sequencia: sequencia(h) };
    });
    const registros = dias.map(meta);
    const media = campo => {
      const v = registros.map(m => Number(m[campo])).filter(x => x > 0);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    const estudo = registros.reduce((a, m) => a + (Number(m.estudo_minutos) || 0), 0);
    const total = porHabito.reduce((a, h) => a + h.feitos, 0);
    const possivel = porHabito.reduce((a, h) => a + h.dias, 0);
    return {
      ano, mes, dias: dias.length, porHabito, geralPct: possivel ? Math.round((total / possivel) * 100) : 0,
      sonoMedio: media('sono_horas'), humorMedio: media('humor'), estudoMinutos: estudo,
    };
  }

  function somarEstudo(data, minutos) {
    return atualizar(data, m => ({ estudo_minutos: (Number(m.estudo_minutos) || 0) + Math.round(minutos) }), {});
  }

  return { caminho, obter, meta, atualizar, habitos, salvarHabitos, chave, feitos, fez, alternar, sequencia, resumoMes, diasDoMes, somarEstudo };
})();
