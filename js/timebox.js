'use strict';
// Timeboxing: o dia dividido em blocos de 30 minutos, cada um com o que fazer.
// Um arquivo por dia e contexto: Timebox/AAAA-MM-DD-dia.md (Tarefas) e -estudo.md (Estudo).
// Corpo em Markdown legível: "- [ ] 07:00 Academia" (com [x] quando feito). Linhas que não
// seguem esse formato (escritas no Obsidian, por exemplo) são mantidas no fim do arquivo.
App.timebox = (() => {
  const { el } = App;
  const PASTA = 'Timebox';
  const LINHA = /^- \[( |x|X)\] (\d{2}:\d{2}) (.*)$/;
  const NOMES = { dia: 'Timeboxing do dia', estudo: 'Timeboxing dos estudos' };

  const caminho = (data, contexto) => `${PASTA}/${data}-${contexto}.md`;
  const z = n => String(n).padStart(2, '0');
  const horarios = (de, ate) => {
    const out = [];
    for (let m = de * 60; m < ate * 60; m += 30) out.push(`${z(Math.floor(m / 60))}:${z(m % 60)}`);
    return out;
  };

  function ler(data, contexto) {
    const doc = App.store.obter(caminho(data, contexto));
    const blocos = new Map(); const outras = [];
    for (const l of String(doc?.corpo || '').split('\n')) {
      const m = l.match(LINHA);
      if (m) blocos.set(m[2], { texto: m[3].trim(), feito: m[1] !== ' ' });
      else outras.push(l);
    }
    return { doc, blocos, outras };
  }

  async function gravar(data, contexto, blocos, outras, doc) {
    const linhas = [...blocos.entries()].filter(([, b]) => b.texto).sort(([a], [b]) => a.localeCompare(b))
      .map(([h, b]) => `- [${b.feito ? 'x' : ' '}] ${h} ${b.texto}`);
    const resto = outras.join('\n').trim();
    const corpo = [linhas.join('\n'), resto].filter(Boolean).join('\n\n');
    const meta = { tipo: 'timebox', data, contexto, ...(doc?.meta || {}) };
    return App.store.gravar(caminho(data, contexto), meta, corpo, { inline: true });
  }

  // Próximo bloco preenchido a partir de agora (para o briefing e o sino).
  function proximo(contexto, data = App.hoje()) {
    const agora = new Date();
    const hhmm = `${z(agora.getHours())}:${z(agora.getMinutes() >= 30 ? 30 : 0)}`;
    const { blocos } = ler(data, contexto);
    return [...blocos.entries()].filter(([h, b]) => b.texto && !b.feito && h >= hhmm).sort(([a], [b]) => a.localeCompare(b))
      .map(([hora, b]) => ({ hora, texto: b.texto }))[0] || null;
  }
  const resumo = (contexto, data = App.hoje()) => {
    const { blocos } = ler(data, contexto);
    const cheios = [...blocos.values()].filter(b => b.texto);
    return { total: cheios.length, feitos: cheios.filter(b => b.feito).length };
  };

  // Componente com navegação de dia. estado é guardado por contexto enquanto o app está aberto.
  const estados = {};
  function componente(contexto) {
    const est = estados[contexto] ||= { data: App.hoje(), madrugada: false };
    const raiz = el('section', { class: 'timebox', 'aria-labelledby': `tb-${contexto}` });

    function desenhar() {
      const { doc, blocos, outras } = ler(est.data, contexto);
      const agora = new Date();
      const atual = est.data === App.hoje() ? `${z(agora.getHours())}:${agora.getMinutes() >= 30 ? '30' : '00'}` : null;
      const salvar = () => App.tentar(() => gravar(est.data, contexto, blocos, outras, doc), 'Não foi possível salvar o horário');
      const lista = el('ol', { class: 'timebox-lista' }, horarios(est.madrugada ? 0 : 5, 24).map(h => {
        const b = blocos.get(h) || { texto: '', feito: false };
        const id = `tb-${contexto}-${h.replace(':', '')}`;
        const texto = el('input', { type: 'text', id, value: b.texto, placeholder: '—', autocomplete: 'off',
          onchange: e => {
            const t = e.target.value.trim(); const antes = blocos.get(h) || { feito: false };
            blocos.set(h, { texto: t, feito: t ? antes.feito : false }); salvar();
          } });
        const check = el('input', { type: 'checkbox', checked: b.feito, 'aria-label': `Feito às ${h}`, disabled: !b.texto,
          onchange: e => { blocos.set(h, { texto: texto.value.trim(), feito: e.target.checked }); salvar(); linha.classList.toggle('feito', e.target.checked); } });
        texto.addEventListener('input', () => { check.disabled = !texto.value.trim(); });
        texto.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            const irmao = e.key === 'ArrowUp' ? linha.previousElementSibling : linha.nextElementSibling;
            if (irmao) { e.preventDefault(); irmao.querySelector('input[type=text]').focus(); }
          }
        });
        const linha = el('li', { class: ['timebox-bloco', h === atual ? 'agora' : '', b.feito ? 'feito' : '', h.endsWith(':00') ? 'hora-cheia' : ''].join(' ').trim() },
          el('label', { for: id, class: 'timebox-hora', text: h }), texto, check);
        return linha;
      }));
      const data = el('input', { type: 'date', value: est.data, 'aria-label': 'Dia do timeboxing',
        onchange: e => { if (e.target.value) { est.data = e.target.value; desenhar(); } } });
      const r = resumo(contexto, est.data);
      raiz.replaceChildren(
        el('header', { class: 'timebox-cabecalho' },
          el('h2', { id: `tb-${contexto}`, text: NOMES[contexto] }),
          el('div', { class: 'acoes' },
            el('button', { type: 'button', class: 'icone', 'aria-label': 'Dia anterior', onclick: () => { est.data = App.somarDias(est.data, -1); desenhar(); } }, App.icone('esquerda')),
            data,
            el('button', { type: 'button', class: 'icone', 'aria-label': 'Próximo dia', onclick: () => { est.data = App.somarDias(est.data, 1); desenhar(); } }, App.icone('direita')),
            est.data !== App.hoje() ? el('button', { type: 'button', class: 'secundario pequeno', text: 'Hoje', onclick: () => { est.data = App.hoje(); desenhar(); } }) : null)),
        el('p', { class: 'dica', text: r.total ? `${r.feitos} de ${r.total} blocos feitos. Enter ou setas passam para o próximo horário.` : 'Escreva o que vai fazer em cada horário. Enter ou setas passam para o próximo.' }),
        lista,
        el('label', { class: 'opcao' }, el('input', { type: 'checkbox', checked: est.madrugada, onchange: e => { est.madrugada = e.target.checked; desenhar(); } }), ' Mostrar madrugada (00:00–05:00)'));
      // Leva o horário atual para perto do topo da lista.
      if (atual) requestAnimationFrame(() => { const li = lista.querySelector('.agora'); if (li) lista.scrollTop = li.offsetTop - lista.offsetTop - 40; });
    }
    desenhar();
    return raiz;
  }

  return { componente, proximo, resumo, ler, caminho };
})();
