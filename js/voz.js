'use strict';
// Ditado (SpeechRecognition) e leitura em voz alta (speechSynthesis), em pt-BR.
App.voz = (() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const sintese = 'speechSynthesis' in window ? window.speechSynthesis : null;
  let rec = null; let campoAtivo = null; let botaoAtivo = null; let avisou = false;
  let botaoLendo = null;

  function inserir(campo, texto) {
    if (!texto) return;
    const ini = campo.selectionStart ?? campo.value.length;
    const fim = campo.selectionEnd ?? ini;
    const antes = campo.value.slice(0, ini);
    const sep = antes && !/\s$/.test(antes) ? ' ' : '';
    campo.setRangeText(sep + texto, ini, fim, 'end');
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function marcar(botao, ativo) {
    if (!botao) return;
    botao.classList.toggle('gravando', ativo);
    botao.setAttribute('aria-pressed', String(ativo));
    botao.setAttribute('aria-label', ativo ? 'Parar ditado' : 'Ditar por voz');
  }

  function pararDitado() {
    if (rec) { rec.onend = null; rec.stop(); rec = null; }
    marcar(botaoAtivo, false); campoAtivo = null; botaoAtivo = null;
  }

  function ditar(campo, botao) {
    const mesmo = campoAtivo === campo;
    pararDitado();
    if (mesmo) return;
    if (!avisou) {
      App.toast('Ditado ativo: o Chrome envia o áudio ao Google para transcrever (precisa de internet).');
      avisou = true;
    }
    rec = new SR();
    rec.lang = 'pt-BR'; rec.continuous = true; rec.interimResults = false;
    rec.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) inserir(campo, e.results[i][0].transcript.trim());
      }
    };
    rec.onerror = e => {
      const msgs = {
        'not-allowed': 'Permita o uso do microfone para ditar.',
        'service-not-allowed': 'Permita o uso do microfone para ditar.',
        network: 'Sem conexão: o ditado precisa de internet.',
        'audio-capture': 'Nenhum microfone encontrado.',
      };
      if (msgs[e.error]) App.toast(msgs[e.error], 'erro');
    };
    rec.onend = () => pararDitado();
    campoAtivo = campo; botaoAtivo = botao;
    marcar(botao, true);
    campo.focus();
    rec.start();
  }

  function botaoDitado(campo) {
    if (!SR) return null;
    const b = App.el('button', {
      type: 'button', class: 'icone mic', title: 'Ditar por voz', 'aria-label': 'Ditar por voz', 'aria-pressed': 'false',
      onclick: () => ditar(campo, b),
    }, App.icone('mic'));
    return b;
  }

  // ---- leitura ----
  function voz() {
    const vozes = sintese.getVoices().filter(v => /^pt[-_]BR/i.test(v.lang));
    return vozes.find(v => /google/i.test(v.name)) || vozes.find(v => v.localService) || vozes[0] || null;
  }

  function pedacos(texto) {
    // O Chrome corta falas longas; dividimos por frases em blocos de até ~200 caracteres.
    const frases = texto.match(/[^.!?\n]+[.!?]*\s*/g) || [texto];
    const out = []; let atual = '';
    for (const f of frases) {
      if ((atual + f).length > 200 && atual) { out.push(atual); atual = ''; }
      atual += f;
    }
    if (atual.trim()) out.push(atual);
    return out;
  }

  const rotular = (b, icone, texto) => b.replaceChildren(App.icone(icone), ' ' + texto);

  function pararLeitura() {
    if (sintese) sintese.cancel();
    if (botaoLendo) { rotular(botaoLendo, 'som', 'Ouvir'); botaoLendo.setAttribute('aria-pressed', 'false'); }
    botaoLendo = null;
  }

  function ler(texto, botao) {
    if (!sintese) return;
    const eraEste = botaoLendo && botaoLendo === botao;
    pararLeitura();
    if (eraEste || !texto.trim()) return;
    const v = voz();
    const partes = pedacos(texto);
    partes.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p);
      u.lang = 'pt-BR'; if (v) u.voice = v;
      if (i === partes.length - 1) u.onend = () => { if (botaoLendo === botao) pararLeitura(); };
      sintese.speak(u);
    });
    if (botao) { botaoLendo = botao; rotular(botao, 'parar', 'Parar'); botao.setAttribute('aria-pressed', 'true'); }
  }

  function botaoLeitura(obterTexto) {
    if (!sintese) return null;
    const b = App.el('button', {
      type: 'button', class: 'secundario', 'aria-pressed': 'false',
      onclick: () => ler(obterTexto(), b),
    });
    rotular(b, 'som', 'Ouvir');
    return b;
  }

  if (sintese) sintese.getVoices(); // dispara o carregamento das vozes

  return {
    temDitado: !!SR, temLeitura: !!sintese,
    botaoDitado, botaoLeitura, ler, pararLeitura,
    pararTudo() { pararDitado(); pararLeitura(); },
  };
})();
