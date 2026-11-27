'use strict';
// Animações da interface, feitas com a Web Animations API do próprio navegador (sem biblioteca).
// Regras: só transform e opacity (leve para o navegador), curtas (150–450 ms), e nenhuma
// animação quando o sistema pede "reduzir movimento". Animação nunca é necessária para entender
// a tela: o estado final já está no HTML, a animação só mostra a mudança.
App.animacao = (() => {
  // Identidade de movimento: base "sóbria" (painel de produtividade) e um toque "brincalhão"
  // só nas conquistas (marcar hábito, subir de nível). Uma curva principal e três durações.
  const ENTRA = 'cubic-bezier(.05, .7, .1, 1)';      // entrada: começa rápido e pousa devagar
  const SAI = 'cubic-bezier(.3, 0, 1, 1)';           // saída: começa devagar e acelera
  const MOLA = 'cubic-bezier(.175, .885, .32, 1.275)'; // passa um pouco e assenta (conquista)
  const RAPIDO = 160; const PADRAO = 280; const LENTO = 600;
  const pedeMenos = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reduzido = () => !!pedeMenos?.matches || typeof Element.prototype.animate !== 'function';

  function animar(alvo, quadros, opcoes) {
    if (!alvo || reduzido()) return null;
    return alvo.animate(quadros, { fill: 'backwards', easing: ENTRA, ...opcoes });
  }

  // Cartões da página entram em sequência (de cima para baixo), uma vez por troca de página.
  function entrada(raiz) {
    if (!raiz || reduzido()) return;
    const altura = window.innerHeight;
    const itens = [...raiz.querySelectorAll('.cartao-painel, .caixa, .nivel, .boas-vindas, .cartao')]
      .filter(e => !e.parentElement.closest('.caixa, .cartao-painel, .cartao, .nivel'))
      .filter(e => e.getBoundingClientRect().top < altura) // só o que está visível
      .slice(0, 14);
    itens.forEach((e, i) => animar(e,
      [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
      { duration: PADRAO, delay: Math.min(i * 40, 400) })); // cascata total abaixo de meio segundo
    raiz.querySelectorAll('.barra-progresso > span').forEach((s, i) => encher(s, 0, Math.min(150 + i * 30, 500)));
  }

  // Barra enche a partir de uma fração (0 = vazia) até o valor atual, que já está no estilo.
  function encher(span, deFracao = 0, delay = 0) {
    if (!span || !(deFracao < 1)) return;
    animar(span, [{ transformOrigin: 'left', transform: `scaleX(${Math.max(0, deFracao)})` }, { transformOrigin: 'left', transform: 'scaleX(1)' }],
      { duration: LENTO, delay });
  }

  // Pequeno "pulo" de confirmação (hábito marcado, caixa de seleção).
  function confirmar(alvo) {
    animar(alvo, [{ transform: 'scale(.9)' }, { transform: 'scale(1.15)', offset: .45 }, { transform: 'scale(1)' }],
      { duration: 220, easing: MOLA, fill: 'none' });
  }

  // Comemoração da subida de nível: o emblema e o selo pulam e soltam faíscas.
  function comemorar() {
    if (reduzido()) return;
    const alvos = [...document.querySelectorAll('.nivel-emblema, #nivel-topo')].filter(e => e.offsetParent);
    for (const alvo of alvos) {
      animar(alvo, [
        { transform: 'scale(1) rotate(0)' }, { transform: 'scale(1.35) rotate(-8deg)', offset: .35 },
        { transform: 'scale(.92) rotate(4deg)', offset: .65 }, { transform: 'scale(1) rotate(0)' },
      ], { duration: 700, easing: 'ease-in-out', fill: 'none' });
      faiscas(alvo);
    }
  }

  function faiscas(alvo) {
    const r = alvo.getBoundingClientRect();
    const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
    const n = 14;
    for (let i = 0; i < n; i++) {
      const p = App.el('span', { class: 'faisca', 'aria-hidden': 'true' });
      p.style.left = cx + 'px'; p.style.top = cy + 'px';
      document.body.append(p);
      const ang = (i / n) * Math.PI * 2 + Math.random() * .4;
      const dist = 34 + Math.random() * 30;
      const a = p.animate([
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist}px)) scale(.3)`, opacity: 0 },
      ], { duration: 650 + Math.random() * 250, easing: 'cubic-bezier(.1, .7, .3, 1)' });
      a.onfinish = a.oncancel = () => p.remove();
    }
  }

  // Avisos (toast) deslizam ao entrar; os de erro dão uma sacudida curta e firme (sem mola).
  function aviso(t) {
    const a = animar(t, [{ opacity: 0, transform: 'translateY(12px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: PADRAO });
    if (a && t.classList.contains('erro')) {
      a.onfinish = () => animar(t, [0, -8, 8, -5, 5, 0].map(x => ({ transform: `translateX(${x}px)` })),
        { duration: 320, easing: 'ease-in-out', fill: 'none' });
    }
  }

  // Saída mais curta que a entrada, acelerando. Sem animação, remove na hora.
  function sair(t) {
    const a = animar(t, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(6px) scale(.98)' }],
      { duration: RAPIDO + 20, easing: SAI, fill: 'forwards' });
    if (a) a.onfinish = () => t.remove(); else t.remove();
  }

  // Diálogos crescem levemente ao abrir.
  function dialogo(d) {
    animar(d, [{ opacity: 0, transform: 'translateY(8px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: PADRAO + 20 });
  }

  // Caixas de seleção dão um "pulo" quando a própria pessoa marca (não quando a tela é redesenhada).
  document.addEventListener('change', e => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.type === 'checkbox' && t.checked) confirmar(t);
  });

  App.on('nivel', () => setTimeout(comemorar, 80)); // espera a tela mostrar o nível novo

  return { entrada, encher, confirmar, comemorar, aviso, sair, dialogo, reduzido };
})();
