'use strict';
// Compartilhar: gera um link do próprio Bit-life com um cartão dentro do endereço
// (#/ver?d=...). Nada passa por servidor: quem abre o link vê o cartão e um convite para usar o
// Bit-life com a própria pasta. Só dá para compartilhar o que o usuário escolheu mostrar:
//   - livro que está lendo ou terminou;
//   - filme, série ou anime que já assistiu;
//   - nível alcançado (a partir do 2).
// O link leva só título, autor/criador, ano, nota, capa (endereço público) e o nome do perfil.
// Resenha, tags e qualquer outro dado da pasta nunca entram.
App.compartilhar = (() => {
  const { el } = App;
  const CAT = { filme: 'filme', serie: 'série', anime: 'anime' };
  const limitar = (t, n = 120) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  const urlSegura = u => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? String(u).slice(0, 500) : '');
  const nota = n => { const x = Number(n); return Number.isFinite(x) && x > 0 ? Math.min(5, Math.round(x * 2) / 2) : null; };

  // ---- codificação (JSON em base64 "de URL", com acentos) ----
  function codificar(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decodificar(txt) {
    const b64 = String(txt).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
  }

  // ---- o que pode ser compartilhado ----
  const nomePerfil = () => limitar(App.store.obter('Caderno/perfil.md')?.meta?.nome, 40);
  function cartaoDe(tipo, doc) {
    const m = doc?.meta || {};
    if (tipo === 'livro' && (m.status === 'lendo' || m.status === 'lido')) {
      return { v: 1, t: 'livro', s: m.status, titulo: limitar(m.titulo || doc.nome), autor: limitar(m.autor, 80), ano: limitar(m.ano, 10),
        nota: m.status === 'lido' ? nota(m.nota) : null, capa: urlSegura(m.capa), nome: nomePerfil() };
    }
    if (tipo === 'tela' && m.status === 'visto') {
      return { v: 1, t: 'tela', s: 'visto', titulo: limitar(m.titulo || doc.nome), cat: CAT[m.categoria] ? m.categoria : 'filme',
        autor: limitar(m.criador, 80), ano: limitar(m.ano, 10), nota: nota(m.nota), capa: urlSegura(m.capa), nome: nomePerfil() };
    }
    if (tipo === 'nivel') {
      const p = App.gamificacao.progresso();
      if (p.nivel < 2) return null;
      return { v: 1, t: 'nivel', nivel: p.nivel, seq: p.sequencia, nome: nomePerfil() };
    }
    return null;
  }

  const link = cartao => `${location.origin}${location.pathname}#/ver?d=${codificar(cartao)}`;
  function frase(c) {
    const quem = c.nome || 'Alguém';
    if (c.t === 'livro') return `${quem} ${c.s === 'lido' ? 'terminou de ler' : 'está lendo'} "${c.titulo}"${c.autor ? `, de ${c.autor}` : ''}.`;
    if (c.t === 'tela') return `${quem} assistiu ${c.cat === 'serie' ? 'à série' : c.cat === 'anime' ? 'ao anime' : 'ao filme'} "${c.titulo}".`;
    return `${quem} chegou ao nível ${c.nivel} no Bit-life.`;
  }

  async function compartilhar(cartao) {
    const url = link(cartao);
    const texto = frase(cartao);
    if (navigator.share) {
      try { await navigator.share({ title: 'Bit-life', text: texto, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(url); App.toast('Link copiado. É só colar na conversa.'); return; } catch { /* sem permissão: mostra o link */ }
    const campo = el('input', { type: 'text', value: url, readonly: true });
    const dlg = App.dialogo('Link para compartilhar', el('div', {},
      el('p', { text: texto }), App.campo('Copie o link', campo, { voz: false, largo: true }),
      el('p', { class: 'dica', text: 'Quem abrir vê só este cartão. Nada da sua pasta vai junto.' })), [
      el('span', { class: 'espaco' }), el('button', { type: 'button', text: 'Fechar', onclick: () => dlg.close() })]);
    campo.select();
  }

  // Botão pronto para pôr num diálogo ou cartão. Retorna null quando o item não pode ser compartilhado.
  function botao(tipo, doc, { classe = 'secundario', rotulo = 'Compartilhar' } = {}) {
    const c = cartaoDe(tipo, doc);
    if (!c) return null;
    return el('button', { type: 'button', class: classe, title: frase(c), 'aria-label': `${rotulo}: ${frase(c)}`, onclick: () => compartilhar(cartaoDe(tipo, doc) || c) },
      App.icone('compartilhar'), classe.includes('icone') ? null : ' ' + rotulo);
  }

  // ---- página de quem recebe o link (funciona sem pasta escolhida) ----
  function lerCartao() {
    const d = new URLSearchParams(location.hash.split('?')[1] || '').get('d');
    if (!d || d.length > 4000) return null;
    try {
      const c = decodificar(d);
      if (!c || c.v !== 1 || !['livro', 'tela', 'nivel'].includes(c.t)) return null;
      // Só campos conhecidos, limpos de novo: o link pode ter sido editado à mão.
      return { v: 1, t: c.t, s: c.s === 'lendo' ? 'lendo' : c.t === 'livro' ? 'lido' : 'visto', titulo: limitar(c.titulo), autor: limitar(c.autor, 80),
        ano: limitar(c.ano, 10), cat: CAT[c.cat] ? c.cat : 'filme', nota: nota(c.nota), capa: urlSegura(c.capa), nome: limitar(c.nome, 40),
        nivel: Math.max(1, Math.min(999, Math.floor(Number(c.nivel)) || 1)), seq: Math.max(0, Math.min(9999, Math.floor(Number(c.seq)) || 0)) };
    } catch { return null; }
  }

  function render(container) {
    const c = lerCartao();
    const convite = el('section', { class: 'caixa convite' },
      el('h2', { text: 'Organize a sua vida também' }),
      el('p', { text: 'O Bit-life junta tarefas, estudo, hábitos com nível, leitura, filmes e finanças. Tudo fica numa pasta do seu computador: sem conta, sem cadastro e sem mandar seus dados para a internet.' }),
      el('div', { class: 'acoes' }, el('a', { class: 'botao', href: '#/inicio', text: 'Começar o meu Bit-life' })),
      el('p', { class: 'dica', text: 'Funciona no Google Chrome ou no Microsoft Edge, no computador.' }));
    if (!c) {
      container.replaceChildren(el('section', { class: 'boas-vindas' }, el('h1', { text: 'Link inválido' }),
        el('p', { text: 'Este link de compartilhamento está incompleto ou foi alterado.' })), convite);
      return;
    }
    document.title = `${frase(c)} · Bit-life`;
    const capa = c.t === 'nivel'
      ? el('div', { class: 'compartilhado-nivel', 'aria-hidden': 'true' }, el('span', { text: c.nivel }))
      : App.catalogo.capa(c.capa, c.titulo, 'capa capa-grande');
    container.replaceChildren(
      el('article', { class: 'compartilhado' },
        capa,
        el('div', { class: 'compartilhado-texto' },
          el('p', { class: 'sobretitulo', text: c.t === 'livro' ? (c.s === 'lido' ? 'Terminou de ler' : 'Está lendo') : c.t === 'tela' ? `Assistiu · ${CAT[c.cat]}` : 'Subiu de nível' }),
          el('h1', { text: c.t === 'nivel' ? `Nível ${c.nivel}` : c.titulo }),
          c.t !== 'nivel' && (c.autor || c.ano) ? el('p', { class: 'dica', text: [c.autor, c.ano].filter(Boolean).join(' · ') }) : null,
          c.nota ? el('p', { class: 'estrelas', 'aria-label': `Nota ${c.nota} de 5`, text: App.estrelas(c.nota) }) : null,
          c.t === 'nivel' && c.seq ? el('p', { text: `${c.seq} dia(s) seguidos cumprindo hábitos.` }) : null,
          el('p', { class: 'compartilhado-quem', text: frase(c) }))),
      convite);
  }

  return { botao, compartilhar, cartaoDe, link, render, frase };
})();
