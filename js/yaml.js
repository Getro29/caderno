'use strict';
// Frontmatter YAML: subconjunto suficiente para o Caderno e seguro para arquivos do Obsidian.
// Suporta: escalares, strings com aspas, listas inline [a, b], listas em bloco e mapas de 1 nível.
// Qualquer chave em formato não suportado é guardada em texto bruto e regravada intacta.
App.yaml = (() => {
  const BRUTO = Symbol('bruto');

  function separar(texto) {
    const t = String(texto).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    if (!t.startsWith('---\n') && t !== '---') return { fm: null, corpo: t };
    const fim = t.indexOf('\n---', 3);
    if (fim === -1) return { fm: null, corpo: t, erro: 'frontmatter sem fechamento' };
    const depois = t.indexOf('\n', fim + 4);
    const linhaFim = t.slice(fim + 1, depois === -1 ? undefined : depois);
    if (linhaFim.trim() !== '---') return { fm: null, corpo: t, erro: 'frontmatter mal formado' };
    return {
      fm: t.slice(4, fim),
      corpo: depois === -1 ? '' : t.slice(depois + 1),
    };
  }

  function escalar(v) {
    const s = v.trim();
    if (s === '' || s === '~' || s === 'null') return null;
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    if (s.startsWith('"') && s.endsWith('"') && s.length > 1) return JSON.parse(s);
    if (s.startsWith("'") && s.endsWith("'") && s.length > 1) return s.slice(1, -1).replace(/''/g, "'");
    return s.replace(/\s+#.*$/, '');
  }

  function listaInline(s) {
    const dentro = s.trim().slice(1, -1);
    if (!dentro.trim()) return [];
    const itens = []; let atual = ''; let aspas = null;
    for (const c of dentro) {
      if (aspas) { atual += c; if (c === aspas) aspas = null; }
      else if (c === '"' || c === "'") { aspas = c; atual += c; }
      else if (c === ',') { itens.push(atual); atual = ''; }
      else atual += c;
    }
    itens.push(atual);
    return itens.map(escalar);
  }

  function valorDoBloco(primeira, filhas) {
    const v = primeira.trim();
    if (v === '|' || v === '>' || /^[|>][-+]?\d*$/.test(v) || v.startsWith('{') || v.startsWith('&') || v.startsWith('*')) return BRUTO;
    if (v !== '') {
      if (filhas.some(l => l.trim())) return BRUTO;
      if (v.startsWith('[')) return v.endsWith(']') ? listaInline(v) : BRUTO;
      return escalar(v);
    }
    const uteis = filhas.filter(l => l.trim() && !l.trim().startsWith('#'));
    if (!uteis.length) return null;
    if (uteis.every(l => /^\s*- /.test(l) || /^\s*-$/.test(l))) {
      const ind = uteis[0].match(/^\s*/)[0].length;
      if (uteis.some(l => l.match(/^\s*/)[0].length !== ind)) return BRUTO;
      return uteis.map(l => escalar(l.replace(/^\s*-\s?/, '')));
    }
    const ind = uteis[0].match(/^\s*/)[0].length;
    if (ind > 0 && uteis.every(l => l.match(/^\s*/)[0].length === ind && /^\s*[\w-]+:(\s|$)/.test(l))) {
      const mapa = {};
      for (const l of uteis) {
        const m = l.trim().match(/^([\w-]+):\s?(.*)$/);
        if (m[2].trim().startsWith('[')) mapa[m[1]] = listaInline(m[2]);
        else mapa[m[1]] = escalar(m[2]);
      }
      return mapa;
    }
    return BRUTO;
  }

  // Retorna { meta, corpo, brutos, erro }. brutos guarda o texto original de cada chave.
  function parse(texto) {
    const { fm, corpo, erro } = separar(texto);
    const meta = {}; const brutos = {};
    if (erro) return { meta, corpo, brutos, erro };
    if (fm == null) return { meta, corpo, brutos, temFrontmatter: false };
    const linhas = fm.split('\n');
    const blocos = []; let atual = null; const preambulo = [];
    for (const linha of linhas) {
      const m = linha.match(/^([^\s#:'"\-][^:]*?|"[^"]+"|'[^']+'):(\s|$)(.*)$/);
      if (m && !/^\s/.test(linha)) {
        atual = { chave: escalar(m[1]), primeira: m[3], filhas: [], texto: [linha] };
        blocos.push(atual);
      } else if (atual) {
        atual.filhas.push(linha); atual.texto.push(linha);
      } else if (linha.trim() && !linha.trim().startsWith('#')) {
        return { meta: {}, corpo, brutos: {}, erro: 'linha YAML não reconhecida: ' + linha };
      } else preambulo.push(linha);
    }
    for (const b of blocos) {
      while (b.texto.length > 1 && !b.texto[b.texto.length - 1].trim()) { b.texto.pop(); b.filhas.pop(); }
      const valor = valorDoBloco(b.primeira, b.filhas);
      const chave = String(b.chave);
      meta[chave] = valor === BRUTO ? Object.freeze({ [BRUTO]: true }) : valor;
      brutos[chave] = { texto: b.texto.join('\n'), valor: meta[chave] };
    }
    return { meta, corpo, brutos, temFrontmatter: true };
  }

  function precisaAspas(s) {
    return s === '' || /^\s|\s$/.test(s) || /^[-?:,\[\]{}#&*!|>'"%@`]/.test(s) || /: |\s#|:$/.test(s)
      || /^(true|false|null|yes|no|on|off|~)$/i.test(s) || /^-?\d+(\.\d+)?$/.test(s) || /\n/.test(s);
  }
  function fmtEscalar(v) {
    if (v == null) return '';
    if (typeof v === 'boolean' || typeof v === 'number') return String(v);
    const s = String(v);
    return precisaAspas(s) ? JSON.stringify(s) : s;
  }
  function fmtChave(k) { return /^[\w-]+$/.test(k) ? k : JSON.stringify(k); }

  function igual(a, b) {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => igual(x, b[i]));
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      const ka = Object.keys(a), kb = Object.keys(b);
      return ka.length === kb.length && ka.every(k => igual(a[k], b[k]));
    }
    return false;
  }

  function serializarChave(k, v) {
    const ch = fmtChave(k);
    if (Array.isArray(v)) {
      if (!v.length) return `${ch}: []`;
      return `${ch}:\n` + v.map(x => `  - ${fmtEscalar(x)}`).join('\n');
    }
    if (v && typeof v === 'object') {
      const ks = Object.keys(v);
      if (!ks.length) return `${ch}: {}`;
      return `${ch}:\n` + ks.map(x => `  ${fmtChave(x)}: ${fmtEscalar(v[x])}`.replace(/ $/, '')).join('\n');
    }
    return `${ch}: ${fmtEscalar(v)}`.replace(/ $/, '');
  }

  function serializar(meta, corpo, brutos = {}) {
    const linhas = [];
    for (const [k, v] of Object.entries(meta)) {
      if (v === undefined) continue;
      if (v && v[BRUTO]) { if (brutos[k]) linhas.push(brutos[k].texto); continue; }
      if (brutos[k] && igual(brutos[k].valor, v)) linhas.push(brutos[k].texto);
      else linhas.push(serializarChave(k, v));
    }
    const c = String(corpo ?? '').replace(/^\n+/, '');
    return `---\n${linhas.join('\n')}\n---\n${c ? '\n' + c.replace(/\s*$/, '') + '\n' : ''}`;
  }

  return { parse, serializar, igual };
})();
