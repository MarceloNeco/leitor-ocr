/* leitores/extrato.js — extrato bancário e fatura de cartão vindos de arquivo
   (OFX, CSV ou planilha): a lista de lançamentos e um resumo (período, entradas,
   saídas, saldo). O mesmo resumo serve aos lançamentos tirados de uma foto
   (print de notificação, leitores/notificacao.js) e às compras de uma fatura
   em PDF com texto. Foto de extrato ainda é lida como texto: falta a
   capacidade "tabela" (posição das palavras na página). */
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

  const brlReal = n => (n < 0 ? '-' : '') + L.texto.formatBRL(Math.abs(n));
  // Conta em outra moeda (conta internacional): o símbolo dela, nunca "R$"
  const SIMBOLOS = { USD: 'US$', EUR: '€', GBP: '£', CAD: 'C$', AUD: 'A$', CHF: 'CHF', JPY: '¥', ARS: 'AR$' };
  const simbolo = moeda => moeda && moeda !== 'BRL' ? SIMBOLOS[moeda] || moeda : null;

  // Fatura de cartão em PDF com texto (exato): total, vencimento e as compras.
  // As compras só entram quando a soma bate com um total impresso na própria
  // fatura (as compras, as despesas, ou o saldo anterior mais os lançamentos
  // dando o total); se não bater, ficam de fora e a tela diz.
  const DINHEIRO = /-?\s?\d{1,3}(?:\.\d{3})*,\d{2}(?!\d)/g;
  const centavos = s => Math.round(numero(s.replace(/\s/g, '')) * 100);
  // Extrato de conta em PDF com texto: "dd/mm/aaaa DESCRIÇÃO valor [saldo]".
  // Os lançamentos só entram quando o saldo anterior mais a soma deles dá um
  // saldo impresso no próprio extrato (o do fim do período ou o do último dia).
  function doExtrato(texto) {
    const lista = [], saldos = [];
    let anterior = null, futuro = false;
    texto.split('\n').forEach(l => {
      // os lançamentos futuros (agendados) ainda não aconteceram: não entram
      if (/LAN[CÇ]AMENTOS FUTUROS|ENTRADAS FUTURAS|SA[IÍ]DAS FUTURAS|AGENDAMENTOS/i.test(l)) futuro = true;
      const m = !futuro && l.match(/^\s*(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})(?:\s+(-?\d{1,3}(?:\.\d{3})*,\d{2}))?\s*$/);
      if (/SALDO/i.test(l)) {
        const v = (l.match(DINHEIRO) || []).map(x => centavos(x));
        if (v.length) { if (anterior === null && /SALDO ANTERIOR/i.test(l)) anterior = v[v.length - 1]; saldos.push(v[v.length - 1]); }
        return;
      }
      if (m) lista.push({ data: m[1], descricao: m[2].trim(), c: centavos(m[3]) });
    });
    const soma = lista.reduce((a, i) => a + i.c, 0);
    const conferido = lista.length > 0 && anterior !== null && saldos.includes(anterior + soma);
    return { itens: conferido ? lista.map(i => ({ data: i.data, descricao: i.descricao, valor: i.c / 100 })) : [],
      campos: {}, conferido, fora: conferido ? 0 : lista.length, nome: 'o saldo do extrato' };
  }

  function itens(readings, tipo) {
    if (!readings.length || !readings[0].exato) return null;
    if (tipo === 'extrato') return doExtrato(readings[0].text);
    if (tipo !== 'fatura') return null;
    const texto = readings[0].text, T = texto.toUpperCase();
    const total = (T.match(/(?:VALOR TOTAL [EÉ]|TOTAL DA SUA FATURA [EÉ]|TOTAL DESTA FATURA|TOTAL DA FATURA|TOTAL A PAGAR)\s*:?\s*(?:R\$)?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/) || [])[1];
    const venc = (T.match(/(?:VENCE EM|VENCIMENTO(?: EM)?|DATA DE VENCIMENTO)\s*:?\s*(\d{2}\/\d{2}\/\d{4})/) || [])[1];
    const campos = {};
    if (total) campos['Total da fatura'] = 'R$ ' + total;
    if (venc) campos.Vencimento = venc;
    if (!total) return Object.keys(campos).length ? { itens: [], campos, conferido: false } : null;
    // compras: "dd/mm DESCRIÇÃO 123,45" (duas por linha quando a fatura tem duas colunas);
    // as parcelas das próximas faturas não entram
    const lista = [], impressos = [];
    let fora = false;
    texto.split('\n').forEach(l => {
      if (/PR[OÓ]XIMAS FATURAS|A VENCER\b/i.test(l)) fora = true;
      else if (/LAN[CÇ]AMENTOS\s*:/i.test(l)) fora = false;
      const achados = fora ? [] : [...l.matchAll(/(?:^|\s)(\d{2})\/(\d{2})\s+(\S.*?)\s+(-?\s?\d{1,3}(?:\.\d{3})*,\d{2})(?=\s|$)/g)];
      // "- 75,00" pode ser estorno ou um nome que termina em traço ("LOJA -  75,00"): fica em dúvida
      achados.forEach(m => lista.push({ dia: m[1], mes: m[2], descricao: m[3].trim(), c: centavos(m[4]), duvida: /^-\s/.test(m[4]) }));
      // o IOF das compras no exterior vem numa linha sem data: entra com a data do vencimento
      const iof = !fora && venc && l.match(/REPASSE DE IOF\D*?(\d{1,3}(?:\.\d{3})*,\d{2})/i);
      if (iof && centavos(iof[1])) lista.push({ dia: venc.slice(0, 2), mes: venc.slice(3, 5), descricao: 'Repasse de IOF', c: centavos(iof[1]) });
      if (!achados.length) (l.match(DINHEIRO) || []).forEach(v => impressos.push(centavos(v)));
    });
    const anterior = (T.match(/(?:SALDO|TOTAL DA) FATURA ANTERIOR\s*:?\s*(?:R\$)?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/) || [])[1];
    const fecha = () => {
      const tudo = lista.reduce((a, i) => a + i.c, 0), compras = lista.filter(i => i.c > 0).reduce((a, i) => a + i.c, 0);
      return impressos.includes(tudo) || impressos.includes(compras) || (anterior && centavos(anterior) + tudo === centavos(total));
    };
    // O sinal em dúvida é o que fecha a conta (tenta as combinações, até 8 dúvidas)
    const duvidas = lista.filter(i => i.duvida);
    let conferido = lista.length > 0 && fecha();
    for (let k = 1; !conferido && duvidas.length <= 8 && k < 1 << duvidas.length; k++) {
      duvidas.forEach((i, j) => { i.c = (k >> j & 1 ? 1 : -1) * Math.abs(i.c); });
      conferido = fecha();
    }
    // ano da compra: o do vencimento, ou o anterior quando o mês é depois do vencimento
    const [, vm, va] = (venc || '').split('/').map(Number);
    const itensOk = conferido ? lista.map(i => ({
      data: va ? `${i.dia}/${i.mes}/${+i.mes > vm ? va - 1 : va}` : '', descricao: i.descricao, valor: -i.c / 100
    })) : [];
    return { itens: itensOk, campos, conferido, fora: conferido ? 0 : lista.length };
  }

  // base: o resultado da leitura da foto, quando os lançamentos saíram do
  // texto lido; lidos: { duvidas, confirmados } do leitor que os tirou
  function resultado(papel, base, lidos) {
    const itens = papel.itens || [], info = papel.info || {};
    const dias = itens.filter(i => i.data).map(i => i.data.split('/').reverse().join('')).sort();
    const br = s => `${s.slice(6)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
    const soma = lista => lista.reduce((s, i) => s + i.valor, 0);
    const entradas = soma(itens.filter(i => i.valor > 0)), saidas = soma(itens.filter(i => i.valor < 0));
    const fields = [];
    const add = (key, val) => { if (val) fields.push({ key, val }); };
    const sim = simbolo(info.moeda);
    const brl = n => sim ? (n < 0 ? '-' : '') + sim + ' ' + Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : brlReal(n);
    Object.entries((lidos && lidos.campos) || {}).forEach(([key, val]) => add(key, val));
    add('Banco', info.banco);
    add('Moeda', info.moeda && info.moeda !== 'BRL' ? info.moeda : '');
    add(info.cartao ? 'Cartão' : 'Conta', info.conta);
    if (dias.length) add('Período', `${br(dias[0])} a ${br(dias[dias.length - 1])}`);
    if (itens.length) add('Lançamentos', String(itens.length));
    add('Entradas', entradas ? brl(entradas) : '');
    add('Saídas', saidas ? brl(-saidas) : '');
    add('Saldo', info.saldo !== undefined ? brl(info.saldo) : '');
    if (base) {
      // Da foto: valor só entra confirmado; o que as leituras não confirmaram, conferir
      const n = itens.length, todos = lidos.confirmados === n;
      return Object.assign({}, base, {
        fields, expectsValue: false, valor: null, candidates: [], itens,
        status: lidos.conferido !== undefined
          ? (lidos.conferido ? { cls: 'ok', text: `${n} lançamentos; a soma confere com ${lidos.nome || 'a fatura'}` }
            : { cls: 'warn', text: lidos.nome
              ? `${lidos.fora} lançamentos não fecharam com ${lidos.nome} e ficaram de fora`
              : lidos.fora ? `Total e vencimento lidos; ${lidos.fora} lançamentos não fecharam com o total e ficaram de fora` : 'Total e vencimento lidos' })
          : lidos.duvidas
          ? { cls: 'warn', text: `${n} lançamentos lidos; ${lidos.duvidas} com valor duvidoso ficou de fora: confira a foto` }
          : { cls: todos ? 'ok' : 'warn', text: todos ? `${n} lançamentos, valores confirmados em 2 leituras` : `${n} lançamentos lidos: confira os valores` },
        debug: Object.assign({}, base.debug, { itens: n, duvidas: lidos.duvidas })
      });
    }
    return {
      fields, tipo: papel.tipo, expectsValue: false, valor: null, candidates: [], itens, moeda: sim || undefined,
      status: { cls: 'ok', text: `${itens.length} lançamentos lidos` }, hint: null,
      textKind: { label: 'Arquivo ' + String((papel.fonte && papel.fonte.formato) || '').toUpperCase(), good: 100 }, far: false,
      debug: { tipo: papel.tipo, itens: itens.length, readings: [], codes: [] }
    };
  }

  L.registrarLeitor({ id: 'extrato', vitais: [], daTabela, resultado, itens, dataBR, numero });
})(window.Leitura);
