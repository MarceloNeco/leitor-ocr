/* leitores/extrato.js — extrato bancário e fatura de cartão vindos de arquivo
   (OFX, CSV ou planilha): a lista de lançamentos e um resumo (período, entradas,
   saídas, saldo). Foto de extrato ainda é lida como texto: falta a capacidade
   "tabela" (posição das palavras na página). */
(function (L) {
  'use strict';
  const sem = s => String(s === undefined || s === null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

  // "15/10/2026", "15/10/26", "2026-10-15", "20261015" → "15/10/2026"
  function dataBR(v) {
    const s = String(v || '').trim();
    let m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})\b/);
    if (m) return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3].length === 2 ? '20' + m[3] : m[3]}`;
    m = s.match(/^(\d{4})-?(\d{2})-?(\d{2})\b/);
    return m && +m[2] >= 1 && +m[2] <= 12 ? `${m[3]}/${m[2]}/${m[1]}` : '';
  }

  // "1.234,56", "-1.234,56", "1234.56", "(123,45)", "R$ 12,00", "12,00 D" → número
  function numero(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let s = String(v || '').trim().toUpperCase();
    if (!s) return null;
    const neg = /^-|^\(.*\)$|-$|\sD$/.test(s);
    s = s.replace(/R\$|\s|[()+-]|[DC]$/g, '');
    if (!/^\d[\d.,]*$/.test(s)) return null;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = parseFloat(s);
    return isFinite(n) ? (neg ? -n : n) : null;
  }

  // Em que colunas estão a data, a descrição e o valor: pelo cabeçalho, ou,
  // sem cabeçalho, pelo que as próprias células parecem
  function colunas(linhas) {
    for (let i = 0; i < Math.min(linhas.length, 15); i++) {
      const c = {};
      linhas[i].forEach((cel, j) => {
        const t = sem(cel);
        if (c.data === undefined && /^(data|date|dt)\b/.test(t)) c.data = j;
        else if (c.valor === undefined && /^(valor|value|amount|quantia|montante)\b/.test(t)) c.valor = j;
        else if (c.credito === undefined && /^(credito|entrada)s?\b/.test(t)) c.credito = j;
        else if (c.debito === undefined && /^(debito|saida)s?\b/.test(t)) c.debito = j;
        else if (c.desc === undefined && /descri|historico|lancamento|title|titulo|estabelecimento|memo|detalhe|^nome/.test(t)) c.desc = j;
      });
      if (c.data !== undefined && (c.valor !== undefined || c.credito !== undefined || c.debito !== undefined)) return Object.assign(c, { inicio: i + 1 });
    }
    const n = Math.max(...linhas.map(l => l.length));
    const parte = teste => Array.from({ length: n }, (_, j) => linhas.filter(l => teste(l[j])).length / linhas.length);
    const datas = parte(x => !!dataBR(x));
    const valores = parte(x => numero(x) !== null && /[.,]\d{2}$|^-?\d+$/.test(String(x).trim()));
    const data = datas.indexOf(Math.max(...datas));
    if (datas[data] < 0.6) return null;
    let valor = -1;
    valores.forEach((f, j) => { if (j !== data && f >= 0.6) valor = j; });   // a mais à direita
    if (valor < 0) return null;
    let desc, maior = 0;
    for (let j = 0; j < n; j++) {
      if (j === data || j === valor) continue;
      const media = linhas.reduce((s, l) => s + String(l[j] || '').length, 0) / linhas.length;
      if (media > maior) { maior = media; desc = j; }
    }
    return { data, valor, desc, inicio: 0 };
  }

  function daTabela(linhas) {
    const c = linhas && linhas.length ? colunas(linhas) : null;
    if (!c) return null;
    const itens = [];
    linhas.slice(c.inicio).forEach(l => {
      const data = dataBR(l[c.data]);
      const valor = c.valor !== undefined
        ? numero(l[c.valor])
        : (numero(l[c.credito]) || 0) - Math.abs(numero(l[c.debito]) || 0);
      if (!data || valor === null || (c.valor === undefined && !valor)) return;
      itens.push({ data, descricao: c.desc !== undefined ? String(l[c.desc] || '').trim() : '', valor });
    });
    return itens.length ? itens : null;
  }

  const brl = n => (n < 0 ? '-' : '') + L.texto.formatBRL(Math.abs(n));

  function resultado(papel) {
    const itens = papel.itens, info = papel.info || {};
    const dias = itens.map(i => i.data.split('/').reverse().join('')).sort();
    const br = s => `${s.slice(6)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
    const soma = lista => lista.reduce((s, i) => s + i.valor, 0);
    const entradas = soma(itens.filter(i => i.valor > 0)), saidas = soma(itens.filter(i => i.valor < 0));
    const fields = [];
    const add = (key, val) => { if (val) fields.push({ key, val }); };
    add('Banco', info.banco);
    add(info.cartao ? 'Cartão' : 'Conta', info.conta);
    add('Período', `${br(dias[0])} a ${br(dias[dias.length - 1])}`);
    add('Lançamentos', String(itens.length));
    add('Entradas', entradas ? brl(entradas) : '');
    add('Saídas', saidas ? brl(-saidas) : '');
    add('Saldo', info.saldo !== undefined ? brl(info.saldo) : '');
    return {
      fields, tipo: papel.tipo, expectsValue: false, valor: null, candidates: [], itens,
      status: { cls: 'ok', text: `${itens.length} lançamentos lidos` }, hint: null,
      textKind: { label: 'Arquivo ' + String((papel.fonte && papel.fonte.formato) || '').toUpperCase(), good: 100 }, far: false,
      debug: { tipo: papel.tipo, itens: itens.length, readings: [], codes: [] }
    };
  }

  L.registrarLeitor({ id: 'extrato', vitais: [], daTabela, resultado, dataBR, numero });
})(window.Leitura);
