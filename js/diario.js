'use strict';
// Diário: um arquivo por dia (Diario/AAAA-MM-DD.md) com o check-in diário — hábitos marcados,
// horas de sono, humor e minutos de estudo. É a base das estatísticas e do briefing do Início.
// A lista de hábitos (dão XP) e de métricas (só acompanhamento, sem XP) fica em Caderno/habitos.md.
// Hábitos e métricas marcados no dia ficam juntos no campo `habitos` (lista de slugs) do diário,
// então mudar algo de hábito para métrica (ou o contrário) não perde o histórico.
App.diario = (() => {
  const PASTA = 'Diario';
  const CONFIG = 'Caderno/habitos.md';
  const PADRAO = ['Leitura', 'Dieta do dia', 'Exercício', 'Socializar'];
  const PADRAO_METRICAS = ['Bíblia'];

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
  const chave = nome => App.slug(nome);
  // Arquivo sem `metricas` é da versão anterior: lá Bíblia dava XP. Agora Bíblia vira métrica
  // e Socializar entra no lugar dela entre os hábitos. A conversão só é gravada no próximo salvamento.
  function config() {
    const m = App.store.obter(CONFIG)?.meta || {};
    let hab = App.lista(m.habitos).map(String).filter(Boolean);
    let met = App.lista(m.metricas).map(String).filter(Boolean);
    if (!Object.prototype.hasOwnProperty.call(m, 'metricas')) {
      if (!hab.length) { hab = PADRAO.slice(); met = PADRAO_METRICAS.slice(); }
      else {
        const biblia = hab.filter(h => chave(h) === 'biblia');
        hab = hab.filter(h => chave(h) !== 'biblia');
        if (!hab.some(h => chave(h) === 'socializar')) hab.push('Socializar');
        met = biblia.length ? biblia : PADRAO_METRICAS.slice();
      }
    }
    return { habitos: hab.length ? hab : PADRAO.slice(), metricas: met };
  }
  const habitos = () => config().habitos;
  const metricas = () => config().metricas;
  async function salvarConfig({ habitos: hab = habitos(), metricas: met = metricas() }) {
    const doc = App.store.obter(CONFIG);
    const corpo = doc?.corpo || 'Lista do check-in diário do Bit-life. "habitos" dão XP; "metricas" são só acompanhamento (sem XP). Cada dia fica em Diario/AAAA-MM-DD.md.\n';
    return App.store.gravar(CONFIG, { tipo: 'config_habitos', ...(doc?.meta || {}), habitos: hab, metricas: met }, corpo);
  }
  const salvarHabitos = lista => salvarConfig({ habitos: lista });
  const salvarMetricas = lista => salvarConfig({ metricas: lista });

  // Slugs marcados no dia. `socializou: true` é o formato antigo de "Socializar".
  const feitos = data => {
    const m = meta(data);
    const l = App.lista(m.habitos).map(String);
    return m.socializou === true && !l.includes('socializar') ? [...l, 'socializar'] : l;
  };
  const fez = (data, nome) => feitos(data).includes(chave(nome));
  const feitosXP = data => habitos().filter(h => fez(data, h)).length;

  function alternar(data, nome, marcado) {
    if (marcado) App.gamificacao.registrarEvento('habito_marcado', caminho(data), { habito: chave(nome) });
    return atualizar(data, m => {
      const atual = new Set(App.lista(m.habitos).map(String));
      if (m.socializou === true) atual.add('socializar');
      if (marcado) atual.add(chave(nome)); else atual.delete(chave(nome));
      const patch = { habitos: [...atual] };
      if ('socializou' in m) patch.socializou = atual.has('socializar'); // mantém o campo antigo coerente
      return patch;
    }).then(r => { App.gamificacao.aposHabito(); return r; });
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
    const contar = h => {
      const qtd = dias.filter(d => fez(d, h)).length;
      return { nome: h, feitos: qtd, dias: dias.length, pct: dias.length ? Math.round((qtd / dias.length) * 100) : 0, sequencia: sequencia(h) };
    };
    const porHabito = habitos().map(contar);
    const porMetrica = metricas().map(contar);
    const registros = dias.map(meta);
    const media = campo => {
      const v = registros.map(m => Number(m[campo])).filter(x => x > 0);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    const estudo = registros.reduce((a, m) => a + (Number(m.estudo_minutos) || 0), 0);
    const social = dias.filter(d => fez(d, 'Socializar')).length;
    const total = porHabito.reduce((a, h) => a + h.feitos, 0);
    const possivel = porHabito.reduce((a, h) => a + h.dias, 0);
    return {
      ano, mes, dias: dias.length, porHabito, porMetrica, geralPct: possivel ? Math.round((total / possivel) * 100) : 0,
      sonoMedio: media('sono_horas'), humorMedio: media('humor'), estudoMinutos: estudo,
      socialDias: social, socialPct: dias.length ? Math.round((social / dias.length) * 100) : 0,
    };
  }

  // Socializar: métrica à parte dos hábitos (não muda o XP, que vem só dos hábitos).
  const socializou = data => fez(data, 'Socializar');

  // semParar: o trecho mais longo da sessão sem pausar; o diário guarda o maior do dia (selos de estudo).
  function somarEstudo(data, minutos, semParar = 0) {
    return atualizar(data, m => ({
      estudo_minutos: (Number(m.estudo_minutos) || 0) + Math.round(minutos),
      ...(semParar > 0 ? { estudo_sem_parar_min: Math.max(Number(m.estudo_sem_parar_min) || 0, Math.floor(semParar)) } : {}),
    }), {});
  }

  return { caminho, obter, meta, atualizar, habitos, salvarHabitos, chave, feitos, fez, alternar, sequencia, resumoMes, diasDoMes, somarEstudo, socializou, metricas, salvarMetricas, feitosXP };
})();
