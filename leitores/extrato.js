/* leitores/extrato.js — o leitor de lançamentos. Um só, para extrato de conta
   corrente, poupança e carteira digital, fatura de cartão de crédito e print de
   notificação do celular, de qualquer banco, venha de arquivo (OFX, CSV,
   planilha), de PDF com texto, de PDF escaneado ou de foto.
   Não tem código de banco: o formato sai do jeito das linhas. Cada lançamento
   tem data, descrição, valor e sinal (D/C, + e −, parênteses, colunas de
   débito e crédito, ou palavras como pagamento e estorno); o valor pode estar
   na linha da data, na de cima ou na de baixo, e a descrição na mesma linha ou
   numa vizinha. O que um banco tem de diferente cabe só como dica, na tabela
   DICAS (dados, nunca código). Todo lançamento sai no mesmo formato
   (ARQUITETURA.md, "Lançamento").
   O saldo e o total impressos servem para conferir a soma, não para esconder:
   quando a soma não fecha, os lançamentos aparecem marcados para a pessoa
   conferir, com a diferença. Sem nenhum lançamento confiável, a tela mostra o
   texto lido e diz por quê. Lançamento nenhum é inventado. */
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

  /* ---------- Dicas de banco: só dados ---------- */

  // Sem dica que bata, o leitor faz igual: as dicas só desempatam o que o
  // próprio papel não deixa claro. cabecalho: palavras que dizem o banco;
  // descricao: onde fica o histórico quando a linha da data não tem ('acima'
  // ou 'abaixo'); sinal: como o banco marca o valor sem sinal ('-': só a saída
  // tem sinal, então sem sinal é entrada; '+/-': as duas têm, sem sinal é dúvida).
  const DICAS = [
    { banco: 'Banco do Brasil', cabecalho: /SISBB|BANCO DO BRASIL|OUROCARD/i, descricao: 'acima' },
    { banco: 'Itaú', cabecalho: /ITA[UÚ] UNIBANCO|ITAUCARD|ITA[UÚ] CART[OÕ]ES|PERSONNALIT|ITAU\.COM\.BR/i, sinal: '-' },
    { banco: 'Porto Seguro', cabecalho: /CARTAOPORTOSEGURO|PORTOSEGURO\.COM\.BR/i },
    { banco: 'BS2', cabecalho: /BANCOBS2|\bBS2 EMPRESAS/i, sinal: '+/-' }
  ];

  /* ---------- Os pedaços de uma linha: datas e valores ---------- */

  const MESES = { JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6, JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12 };
  const MES = 'JAN(?:EIRO)?|FEV(?:EREIRO)?|MAR(?:[CÇ]O)?|ABR(?:IL)?|MAI(?:O)?|JUN(?:HO)?|JUL(?:HO)?|AGO(?:STO)?|SET(?:EMBRO)?|OUT(?:UBRO)?|NOV(?:EMBRO)?|DEZ(?:EMBRO)?';
  // "15/10/2026", "15/10/26", "15/10", "15.10.2026", "2026-10-15", "15 OUT", "15/out/2026", "15 de outubro de 2026"
  const DATA = new RegExp(`(?<![\\d/])(?:(\\d{4})-(\\d{2})-(\\d{2})|(\\d{1,2})/(\\d{1,2})(?:/(\\d{4}|\\d{2}))?|(\\d{1,2})[.-](\\d{1,2})[.-](\\d{4})|(\\d{1,2})(?:\\s?/\\s?|\\s(?:DE\\s)?)(${MES})(?![A-Za-zÀ-ÿ])\\.?(?:(?:\\s?/\\s?|\\s(?:DE\\s)?)(\\d{4}))?)(?![\\d/])`, 'gi');

  function datas(s) {
    return [...s.matchAll(DATA)].map(m => {
      const [d, mes, a] = m[1] ? [m[3], m[2], m[1]] : m[4] ? [m[4], m[5], m[6]] : m[7] ? [m[7], m[8], m[9]] : [m[10], MESES[m[11].slice(0, 3).toUpperCase().replace('Ç', 'C')], m[12]];
      const dia = +d, mm = +mes;
      if (!(dia >= 1 && dia <= 31 && mm >= 1 && mm <= 12)) return null;
      return { i: m.index, fim: m.index + m[0].length, dia, mes: mm, ano: a ? (a.length === 2 ? 2000 + +a : +a) : null };
    }).filter(Boolean);
  }

  // "1.234,56", "1234,56" e "1,234.56" (conta em dólar), com R$/US$, com sinal
  // antes (-, +, — da leitura da foto) ou depois ("12,00-"), D ou C depois, ou
  // entre parênteses. Porcentagem não é valor.
  const NUMERO = /(?<![\d.,])(\d{1,3}(?:([.,])\d{3})+|\d+)([.,])(\d{2})(?!\d)(?!\s?%)/g;
  const MOEDAS = { 'R$': 'BRL', 'US$': 'USD', 'U$': 'USD', '€': 'EUR', '£': 'GBP' };
  const CODIGOS = /^(USD|BRL|EUR|GBP|CAD|AUD|CHF|JPY)\b/;

  function valores(s) {
    const lista = [];
    for (const m of s.matchAll(NUMERO)) {
      if (m[2] && m[2] === m[3]) continue;
      const fimNum = m.index + m[0].length;
      const antes = s.slice(Math.max(0, m.index - 10), m.index).match(/(\(\s?)?(?:([-+−–—]+)(\s*))?(?:(R\$|US\$|U\$|€|£)\s?)?(?:([-+−–—]+)(\s*))?$/);
      const depois = s.slice(fimNum).match(/^(-(?![\d]))?(?:\s?([DC])(?![A-Za-zÀ-ÿ]))?(\s?\))?(?:\s?(USD|BRL|EUR|GBP|CAD|AUD|CHF|JPY)\b)?/);
      const sinalAntes = antes[5] || antes[2], espaco = antes[5] ? antes[6] : antes[2] && !antes[4] ? antes[3] : '';
      let sinal = 0;
      if (antes[1] && depois[3]) sinal = -1;
      else if (sinalAntes) sinal = sinalAntes.includes('+') ? 1 : -1;
      else if (depois[1]) sinal = -1;
      if (depois[2]) sinal = depois[2] === 'D' ? -1 : 1;
      lista.push({
        i: m.index - (antes[0] || '').length, fim: fimNum + depois[0].length,
        c: Math.round(+(m[1].replace(/[.,]/g, '') + '.' + m[4]) * 100), sinal,
        // "LOJA - 75,00": o traço solto pode ser o fim do nome ou o sinal
        duvida: !!(sinalAntes && espaco && sinal < 0 && !depois[2]),
        dc: depois[2] || null, moeda: depois[4] || MOEDAS[antes[4]] || null
      });
    }
    return lista;
  }

  const letras = s => String(s || '').toUpperCase().normalize('NFD').replace(/[^A-Z]/g, '');
  const SALDO = /\bS\s?A\s?L\s?D\s?O/i;
  // Os lançamentos que ainda não aconteceram (agendados, parcelas das próximas faturas) ficam de fora
  const FORA = /LAN[CÇ]AMENTOS FUTUROS|ENTRADAS FUTURAS|SA[IÍ]DAS FUTURAS|AGENDAMENTOS|PR[OÓ]XIMAS FATURAS|A VENCER\b/i;
  const DENTRO = /LAN[CÇ]AMENTOS\s*:/i;
  const CABECALHO = /\b(?:DATA|HIST[OÓ]RICO|DESCRI[CÇ][AÃ]O|VALOR|SALDO|LAN[CÇ]AMENTOS?|DOCUMENTO|D[EÉ]BITOS?|CR[EÉ]DITOS?|ENTRADAS|SA[IÍ]DAS|TRANSA[CÇ][AÃ]O)\b/gi;
  const FINAL = /\bFINAL\s*\*?\s*(\d{3,4})\b|[X*]{4}[ .]?(\d{4})\b/i;
  const SECOES = [[/D[OÓ]LAR AMERICANO|\bUSD\b/i, 'USD'], [/\bEURO\b/i, 'EUR'], [/LIBRA/i, 'GBP'], [/D[OÓ]LAR CANADENSE/i, 'CAD'], [/D[OÓ]LAR AUSTRALIANO/i, 'AUD'], [/\bREAL\b|REAIS/i, 'BRL']];
  const SAIDA = /COMPRA|PAGAMENTO|PAGTO|\bPAG\b|SAQUE|TARIFA|\bIOF\b|JUROS|D[EÉ]BITO|ENVIAD|APLICA[CÇ]|ANUIDADE|ENCARGO/i;
  const ENTRADA = /RECEB|ESTORNO|DEVOLU|REEMBOLSO|CASHBACK|DEP[OÓ]SITO|CR[EÉ]DITO|SAL[AÁ]RIO|RESGATE|RENDIMENTO/i;
  // Linha sem data com encargo da fatura (IOF, juros): só entra se fecha a soma
  const ENCARGO = /\bIOF\b|JUROS|ENCARGO|MULTA|TARIFA|ANUIDADE/i;
  const TIPOS = [
    ['estorno', /ESTORNO|DEVOLU[CÇ]|CANCELAMENTO|REEMBOLSO|CHARGEBACK/i],
    ['anuidade', /ANUIDADE/i],
    ['encargo', /\bIOF\b|I\.O\.F|JUROS|ENCARGO|MULTA|\bMORA\b|TARIFA|\bTAR\b|CESTA DE SERV/i],
    ['pagamento', /PAGAMENTO|PAGTO|\bPAG\b|BOLETO|D[EÉ]B(?:ITO)?\.? AUT/i],
    ['transferencia', /\bPIX\b|\bTED\b|\bDOC\b|TRANSF|\bTEF\b|VOC[EÊ] ENVIOU/i],
    ['compra', /COMPRA/i]
  ];
  const tipoDe = (descricao, valor, doc) => (TIPOS.find(([, re]) => re.test(descricao)) || [doc === 'fatura' && valor < 0 ? 'compra' : 'outro'])[0];

  /* ---------- As linhas ---------- */

  // As linhas da leitura em ordem de leitura, com a página e o número da linha.
  // Página de PDF impressa em duas colunas (fatura): a coluna da esquerda
  // inteira, depois a da direita. A coluna aparece pela posição: linhas com uma
  // compra completa (data, descrição, valor) e outra data mais à direita.
  function linhasDe(r) {
    const textos = String(r.text || '').split('\n');
    const pos = r.posicoes && r.posicoes.length === textos.length ? r.posicoes : null;
    const paginas = r.paginas && r.paginas.length ? r.paginas : [{ n: null, inicio: 0 }];
    const todas = textos.map((t, k) => {
      const p = paginas.filter(q => q.inicio <= k).pop();
      return { t: t.trim(), partes: pos ? pos[k] : null, pagina: p.n, linha: k - p.inicio + 1 };
    });
    if (!pos) return todas.filter(l => l.t);
    const saida = [];
    paginas.forEach((p, j) => {
      const da = todas.slice(p.inicio, j + 1 < paginas.length ? paginas[j + 1].inicio : todas.length);
      const cortes = {};
      da.forEach(l => {
        let completa = false;
        l.partes.forEach(q => {
          if (completa && q.x0 > 0.3 && /^\d{1,2}\/\d{1,2}\b/.test(q.s)) cortes[Math.round(q.x0 * 50)] = (cortes[Math.round(q.x0 * 50)] || 0) + 1;
          if (valores(q.s).length) completa = l.partes.some(o => o.x0 < q.x0 && /^\d{1,2}\/\d{1,2}\b/.test(o.s));
        });
      });
      const [melhor, vezes] = Object.entries(cortes).sort((a, b) => b[1] - a[1])[0] || [];
      if (!(vezes >= 3)) { saida.push(...da); return; }
      const corte = melhor / 50 - 0.01;
      const lado = esq => da.map(l => {
        const ps = l.partes.filter(q => esq ? q.x0 < corte : q.x0 >= corte);
        return Object.assign({}, l, { t: ps.map(q => q.s).join(' ').replace(/\s+/g, ' ').trim(), partes: ps });
      });
      saida.push(...lado(true), ...lado(false));
    });
    return saida.filter(l => l.t);
  }

  // A posição (centro, de 0 a 1) de um valor da linha, pelo pedaço que o tem
  function centro(l, v) {
    if (!l.partes) return null;
    let k = 0;
    for (const q of l.partes) {
      const ini = l.t.indexOf(q.s, k);
      if (ini < 0) continue;
      k = ini + q.s.length;
      if (v.i + 1 >= ini && v.i < k) return (q.x0 + q.x1) / 2;
    }
    return null;
  }

  /* ---------- Ler o texto: as linhas viram lançamentos ---------- */

  // Total, vencimento e saldo anterior de uma fatura (frases que valem para qualquer banco)
  const TOTAL = /(?:VALOR TOTAL [EÉ]|TOTAL DA SUA FATURA [EÉ]|TOTAL DESTA FATURA|TOTAL DA FATURA|TOTAL A PAGAR)\s*:?\s*(?:R\$)?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i;
  const VENCE = /(?:VENCE EM|VENCIMENTO(?: EM)?|DATA DE VENCIMENTO)\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i;
  const ANTERIOR = /(?:SALDO|TOTAL DA) FATURA ANTERIOR\s*:?\s*(?:R\$)?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i;
  const cents = s => Math.round(numero(s) * 100);

  // Lê um texto (de arquivo ou de uma leitura da foto) e devolve os lançamentos
  // e o que serve para conferir a soma
  function analisar(r, tipo) {
    const exato = !!r.exato, fatura = tipo === 'fatura';
    const T = String(r.text || '');
    const dica = DICAS.find(d => d.cabecalho.test(T)) || {};
    const ls = linhasDe(r).map(l => Object.assign(l, { datas: datas(l.t), valores: valores(l.t) }));
    const total = (T.match(TOTAL) || [])[1], venc = (T.match(VENCE) || [])[1] || '', anterior = (T.match(ANTERIOR) || [])[1];
    const campos = {};
    if (fatura && total) campos['Total da fatura'] = 'R$ ' + total;
    if (fatura && venc) campos.Vencimento = venc;
    if (dica.banco) campos.Banco = dica.banco;

    const linhas = [], pontos = [], impressos = [], candidatos = [];
    let fora = false, cartao = null, moedaSecao = null, cab = null, misturadas = 0;
    ls.forEach((l, k) => {
      if (FORA.test(l.t)) fora = true;
      else if (DENTRO.test(l.t)) fora = false;
      const secao = /^MOEDA\b/i.test(l.t) && SECOES.find(([re]) => re.test(l.t));
      if (secao) moedaSecao = secao[1];
      // cabeçalho com as colunas: pela posição, cada valor cai na coluna de débito, crédito ou saldo
      const palavras = l.t.match(CABECALHO) || [];
      if (palavras.length >= 2 && !l.valores.length) {
        l.cabecalho = true;
        if (l.partes) {
          const c = {};
          l.partes.forEach(q => {
            const x = (q.x0 + q.x1) / 2;
            if (/D[EÉ]BITO|SA[IÍ]DA/i.test(q.s)) c.debito = x;
            else if (/CR[EÉ]DITO|ENTRADA/i.test(q.s)) c.credito = x;
            else if (/SALDO/i.test(q.s)) c.saldo = x;
            else if (/VALOR/i.test(q.s)) c.valor = x;
          });
          if (c.debito !== undefined && c.credito !== undefined) cab = c;
        }
      }
      // onde começa cada lançamento: a data no começo da linha (a foto pode ter
      // um resto de borda antes); no arquivo, também uma 2ª data depois de um
      // valor, quando a fatura põe duas compras na mesma linha
      const junto = (l.t.match(/^[^A-Za-zÀ-ÿ0-9]{0,3}/) || [''])[0].length;
      const inicios = l.datas.filter(d => d.i <= (exato ? 0 : junto));
      if (exato && inicios.length) l.datas.forEach(d => {
        if (d.i <= inicios[inicios.length - 1].i || !/\s/.test(l.t[d.i - 1] || '')) return;
        const antes = l.valores.some(v => v.i >= inicios[inicios.length - 1].fim && v.fim <= d.i);
        const prox = l.valores.find(v => v.i >= d.fim);
        if (antes && prox && /[A-Za-zÀ-ÿ]/.test(l.t.slice(d.fim, prox.i))) inicios.push(d);
      });
      const saldo = SALDO.test(l.t);
      if (saldo || !inicios.length) {
        if (saldo && l.valores.length) {
          const v = l.valores[l.valores.length - 1];
          pontos.push({ k, c: (v.sinal || 1) * v.c, anterior: /ANTERIOR|INICIAL/i.test(l.t) });
        } else if (l.valores.length) {
          // linha só com valor (o lançamento da linha vizinha), ou um total impresso
          const resto = l.valores.reduce((s, v) => s.replace(l.t.slice(v.i, v.fim), ' '), l.t);
          const sobra = letras(resto.replace(CODIGOS, '').replace(/\b(?:USD|BRL|EUR|GBP|CAD|AUD)\b/g, ''));
          if (l.valores.length === 1 && sobra.length <= (exato ? 0 : 6)) l.soValor = true;
          l.valores.forEach(v => impressos.push((v.sinal || 1) * v.c));
          if (fatura && !fora && !l.soValor && ENCARGO.test(l.t) && l.valores[0].c && !l.datas.length) {
            candidatos.push({ k, descricao: l.t.slice(0, l.valores[0].i).replace(/\s+(?:EM\s+)?R\$\s*$/i, '').trim(), c: l.valores[0].c, sinal: 0, pagina: l.pagina, linha: l.linha, cartao });
          }
        } else if (/[A-Za-zÀ-ÿ]{3}/.test(l.t) && !l.cabecalho) l.texto = true;
        // "FULANO (final 1234)" abre o cartão; "Lançamentos no cartão (final 1234) 500,00" (o subtotal) fecha
        const f = l.t.match(FINAL);
        if (f) cartao = l.valores.length ? null : f[1] || f[2];
        return;
      }
      inicios.forEach((d, j) => {
        const fim = j + 1 < inicios.length ? inicios[j + 1].i : l.t.length;
        const vs = l.valores.filter(v => v.i >= d.fim && v.fim <= fim);
        const linha = { k, d, pagina: l.pagina, linha: l.linha, fora, cartao, moeda: moedaSecao };
        // o valor do lançamento e, se houver, o saldo da linha
        let valor = null, saldoLinha = null;
        const doc = vs.filter(v => !moedaSecao || !v.moeda || v.moeda === moedaSecao);
        if (cab && l.partes) {
          doc.forEach(v => {
            const x = centro(l, v);
            if (x === null) return;
            const col = Object.entries(cab).sort((a, b) => Math.abs(a[1] - x) - Math.abs(b[1] - x))[0][0];
            if (col === 'saldo') saldoLinha = v;
            else if (!valor) valor = Object.assign({}, v, { coluna: col });
          });
        } else if (doc.length) {
          valor = doc[0];
          if (doc.length > 1 && !fatura) saldoLinha = doc[doc.length - 1];
        }
        let descricao = l.t.slice(d.fim, valor ? valor.i : (vs[0] ? vs[0].i : fim)).replace(/\s+/g, ' ').trim();
        // na foto, uma 2ª data seguida de nome no meio da linha são duas colunas
        // lidas juntas: o valor pode ser da outra compra, então a linha fica de fora
        if (!exato && datas(descricao).some(o => /^\s*[A-Za-zÀ-ÿ]{3}/.test(descricao.slice(o.fim)))) { misturadas++; return; }
        if (!exato) descricao = descricao.replace(/^(?:(?:\S|(?![A-Za-zÀ-ÿ]{2})\S{2})\s+)+/, '').replace(/(?:\s+[^\sA-Za-zÀ-ÿ0-9]+)+$/, '');
        descricao = descricao.replace(/^[\s\-–—|:]+|[\s\-–—|:]+$/g, '');
        if (!/[A-Za-zÀ-ÿ]{2}/.test(descricao)) descricao = '';
        Object.assign(linha, { descricao, valor, saldoLinha });
        linhas.push(linha);
        if (saldoLinha) pontos.push({ k, c: (saldoLinha.sinal || 1) * saldoLinha.c, linhaDe: linha });
      });
      const f = l.t.match(FINAL);
      if (f) cartao = f[1] || f[2];
    });

    // Lançamento sem valor na própria linha: o valor está na linha de cima ou
    // na de baixo (o papel diz qual: vale o lado que mais aparece)
    const semValor = linhas.filter(x => !x.valor && !x.fora);
    const lado = { cima: 0, baixo: 0 };
    semValor.forEach(x => { if (ls[x.k - 1] && ls[x.k - 1].soValor) lado.cima++; if (ls[x.k + 1] && ls[x.k + 1].soValor) lado.baixo++; });
    const ordem = lado.cima > lado.baixo ? [-1, 1] : [1, -1];
    semValor.forEach(x => {
      const opcoes = ordem.map(o => ls[x.k + o]).filter(l => l && l.soValor && !l.usada && l.valores[0].c);
      const daMoeda = opcoes.filter(l => !x.moeda || !l.valores[0].moeda || l.valores[0].moeda === x.moeda);
      const l = daMoeda[0];
      if (!l) return;
      l.usada = true;
      x.valor = l.valores[0];
    });

    // Linha da data sem histórico (o banco põe o histórico na linha de cima e
    // o detalhe na de baixo): a descrição vem das linhas de texto vizinhas
    const limites = linhas.map(x => x.k).concat(pontos.map(p => p.k)).sort((a, b) => a - b);
    const textoEntre = (a, b) => ls.slice(a + 1, b).filter(l => l.texto && !l.usada);
    const daLinha = k => linhas.find(x => x.k === k);
    const vazias = linhas.filter(x => !x.descricao);
    if (vazias.length) {
      const fronteiras = [...new Set(limites)];
      const lacunas = fronteiras.slice(0, -1).map((a, j) => ({ a, b: fronteiras[j + 1], t: textoEntre(a, fronteiras[j + 1]) }));
      const duplas = lacunas.filter(g => g.t.length >= 2 && daLinha(g.a) && !daLinha(g.a).descricao && daLinha(g.b) && !daLinha(g.b).descricao).length;
      const simples = lacunas.filter(g => g.t.length === 1).length;
      const primeira = vazias[0], ultima = vazias[vazias.length - 1];
      const acima = dica.descricao ? dica.descricao === 'acima'
        : duplas >= simples || !!(ls[primeira.k - 1] && ls[primeira.k - 1].texto) || !(ls[ultima.k + 1] && ls[ultima.k + 1].texto);
      const partes = new Map(vazias.map(x => [x, { cima: '', baixo: '' }]));
      const antes = [{ a: -1, b: fronteiras[0], t: textoEntre(-1, fronteiras[0]).slice(-1) }];
      const depois = [{ a: fronteiras[fronteiras.length - 1], b: ls.length, t: textoEntre(fronteiras[fronteiras.length - 1], ls.length).slice(0, 1) }];
      antes.concat(lacunas, depois).forEach(g => {
        const A = daLinha(g.a), B = daLinha(g.b);
        const a = A && partes.get(A), b = B && partes.get(B);
        if (!g.t.length) return;
        if (a && b) {
          if (g.t.length >= 2) { a.baixo = g.t[0].t; b.cima = g.t[g.t.length - 1].t; } else if (acima) b.cima = g.t[0].t; else a.baixo = g.t[0].t;
        } else if (b && acima) b.cima = g.t[g.t.length - 1].t;
        else if (a) a.baixo = g.t[0].t;
      });
      partes.forEach((p, x) => { x.descricao = [p.cima, p.baixo].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(); });
    }

    // O sinal de cada lançamento: o que está escrito (D/C, +/−, parênteses,
    // coluna); sem nada escrito, o costume do papel (só a saída com sinal: sem
    // sinal é entrada), a dica do banco ou as palavras
    const comValor = linhas.filter(x => x.valor && !x.fora);
    const temMenos = comValor.some(x => x.valor.sinal < 0 && !x.valor.duvida), temMais = comValor.some(x => x.valor.sinal > 0);
    const costume = dica.sinal || (temMenos && !temMais ? '-' : temMais && !temMenos ? '+' : temMenos && temMais ? '+/-' : '');
    const itens = comValor.map(x => {
      const v = x.valor;
      let s = v.sinal, duvida = v.duvida;
      if (!s && x.valor.coluna) s = x.valor.coluna === 'debito' ? -1 : x.valor.coluna === 'credito' ? 1 : 0;
      if (fatura) s = s ? -s : -1;   // na fatura, o valor impresso sem sinal é gasto; com menos, é crédito
      else if (!s) {
        if (costume === '-') s = 1;
        else if (costume === '+') s = -1;
        else if (ENTRADA.test(x.descricao)) s = 1;
        else if (SAIDA.test(x.descricao)) s = -1;
        else { s = -1; duvida = true; }
      }
      return {
        dia: x.d.dia, mes: x.d.mes, ano: x.d.ano, descricao: x.descricao, c: s * v.c, duvida,
        moeda: v.moeda || x.moeda || null, cartaoFinal: fatura ? x.cartao : null,
        parcela: fatura ? parcela(x.descricao) : null, pagina: x.pagina, linha: x.linha, k: x.k
      };
    });

    return { itens, pontos, impressos, candidatos, campos, total, anterior, venc, ref: referencia(T, fatura, venc), fatura, linhasComData: linhas.length + misturadas, misturadas, ls };
  }

  // "LOJA 03/10", "PARC 3/10", "PARCELA 3 DE 10" → { n: 3, de: 10 }
  function parcela(descricao) {
    const m = String(descricao || '').match(/(?:PARC(?:ELA)?\.?\s*)?(\d{1,2})\s?(?:\/|\sDE\s)\s?(\d{1,2})\s*$/i);
    return m && +m[1] >= 1 && +m[2] >= 2 && +m[1] <= +m[2] ? { n: +m[1], de: +m[2] } : null;
  }

  // A data de referência para o ano das datas sem ano: o vencimento da
  // fatura; no extrato, o fim do período ou a última data completa do papel
  function referencia(T, fatura, venc) {
    const br = s => { const [d, m, a] = s.split('/').map(Number); return new Date(a, m - 1, d); };
    if (fatura && venc) return br(venc);
    const periodo = T.match(/\bA\s+(\d{2}\/\d{2}\/\d{4})/i);
    if (periodo) return br(periodo[1]);
    const todas = [...T.matchAll(/\b(\d{2}\/\d{2}\/\d{4})\b/g)].map(m => br(m[1])).filter(d => d.getFullYear() > 2000 && d <= new Date(Date.now() + 86400000 * 40));
    return todas.length ? new Date(Math.max(...todas)) : new Date();
  }

  // dd/mm sem ano: o ano mais recente em que a data não passa da referência
  // (na compra parcelada, a data é a da compra: a referência volta os meses das
  // parcelas já cobradas; a anuidade parcelada vem com a data da cobrança)
  function comAno(i, ref) {
    if (i.ano) return i.ano;
    const r = new Date(ref.getFullYear(), ref.getMonth() - (i.parcela && !/ANUIDADE/i.test(i.descricao) ? i.parcela.n - 1 : 0), ref.getDate() + 1);
    return new Date(r.getFullYear(), i.mes - 1, i.dia) <= r ? r.getFullYear() : r.getFullYear() - 1;
  }

  /* ---------- Conferir a soma ---------- */

  // A soma confere com o que o papel imprime? Extrato: o saldo de antes mais
  // os lançamentos dá o saldo depois do último. Fatura: os lançamentos dão um
  // total impresso (as compras, os lançamentos do cartão), ou o saldo da
  // fatura anterior mais os lançamentos dá o total desta.
  function conta(lista, a) {
    const soma = lista.reduce((s, i) => s + i.c, 0);
    if (a.fatura) {
      if (!a.total) return { checavel: false };
      const deve = -soma, gastos = -lista.filter(i => i.c < 0).reduce((s, i) => s + i.c, 0);
      const total = cents(a.total), ant = a.anterior ? cents(a.anterior) : null;
      const fecha = a.impressos.includes(deve) || a.impressos.includes(gastos) || (ant !== null && ant + deve === total) || deve === total;
      const difs = [total - deve].concat(ant !== null ? [total - ant - deve] : []);
      return { checavel: true, fecha, diferenca: difs.sort((x, y) => Math.abs(x) - Math.abs(y))[0], nome: 'o total da fatura' };
    }
    if (!lista.length) return { checavel: false };
    const primeiro = Math.min(...lista.map(i => i.k)), ultimo = Math.max(...lista.map(i => i.k));
    const antes = a.pontos.filter(p => p.k < primeiro);
    const abertura = antes.filter(p => p.anterior).pop() || antes.pop();
    const depois = a.pontos.filter(p => p.k > ultimo || (p.linhaDe && p.k === ultimo));
    if (!abertura || !depois.length) return { checavel: false };
    const fim = abertura.c + soma;
    return { checavel: true, fecha: depois.some(p => p.c === fim), diferenca: depois[0].c - fim, nome: 'o saldo' };
  }

  // Tenta os sinais em dúvida ("- 75,00") e os encargos sem data (IOF) que
  // fecham a soma; sem combinação que feche, fica o que está impresso
  function conferir(lista, a) {
    const duvidas = lista.filter(i => i.duvida), extras = a.candidatos.slice(0, 4);
    const n = duvidas.length + extras.length;
    const base = conta(lista, a);
    if (!base.checavel || base.fecha || !n || n > 12) return { lista, r: base };
    const mascaras = Array.from({ length: (1 << n) - 1 }, (_, j) => j + 1).sort((x, y) => bits(x) - bits(y));
    for (const m of mascaras) {
      const trocadas = lista.map(i => { const j = duvidas.indexOf(i); return j >= 0 && m >> j & 1 ? Object.assign({}, i, { c: -i.c }) : i; });
      const mais = extras.filter((e, j) => m >> (duvidas.length + j) & 1).map(e => Object.assign({}, e, { c: -e.c, semData: true }));
      const r = conta(trocadas.concat(mais), a);
      if (r.fecha) return { lista: trocadas.concat(mais), r };
    }
    return { lista, r: base };
  }
  const bits = x => { let n = 0; while (x) { n += x & 1; x >>= 1; } return n; };

  /* ---------- Duas leituras da foto ---------- */

  // Bigramas das letras: o quanto duas descrições lidas parecem a mesma
  function parecidas(a, b) {
    const pares = s => { const t = letras(s), r = []; for (let i = 0; i < t.length - 1; i++) r.push(t.slice(i, i + 2)); return r; };
    const x = pares(a), y = pares(b);
    if (!x.length || !y.length) return false;
    let comum = 0;
    const resto = y.slice();
    x.forEach(p => { const j = resto.indexOf(p); if (j >= 0) { comum++; resto.splice(j, 1); } });
    return 2 * comum / (x.length + y.length) >= 0.5;
  }

  // As listas de duas leituras, alinhadas na ordem do papel: o lançamento lido
  // igual nas duas fica confirmado; o mesmo lançamento com valor ou data
  // diferente fica de fora (dúvida); o que só uma leitura achou entra sem
  // confirmação
  function votar(x, y) {
    const mesmo = (a, b) => (a.dia === b.dia && a.mes === b.mes && (a.c === b.c || parecidas(a.descricao, b.descricao))) || (a.c === b.c && parecidas(a.descricao, b.descricao));
    const n = x.length, m = y.length;
    const t = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = mesmo(x[i], y[j]) ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    const itens = [];
    let i = 0, j = 0, duvidas = 0, confirmados = 0;
    while (i < n && j < m) {
      if (mesmo(x[i], y[j]) && t[i][j] === t[i + 1][j + 1] + 1) {
        if (x[i].c === y[j].c && x[i].dia === y[j].dia && x[i].mes === y[j].mes) { itens.push(Object.assign({}, x[i], { confirmado: true })); confirmados++; } else duvidas++;
        i++; j++;
      } else if (t[i + 1][j] >= t[i][j + 1]) itens.push(x[i++]);
      else itens.push(y[j++]);
    }
    while (i < n) itens.push(x[i++]);
    while (j < m) itens.push(y[j++]);
    return { itens, duvidas, confirmados };
  }

  /* ---------- Print de notificação ---------- */

  // Onde começa cada aviso
  const INICIO = /COMPRA APROVADA|COMPRA (?:DE|NO VALOR DE) R|VOC[EÊ] (?:USOU|RECEBEU|PAGOU|FEZ|ENVIOU|TRANSFERIU)|DEBITAMOS|PIX (?:RECEBIDO|ENVIADO|REALIZADO|AGENDADO)|TRANSFER[EÊ]NCIA (?:RECEBIDA|ENVIADA|REALIZADA)|PAGAMENTO (?:APROVADO|REALIZADO|EFETUADO|RECEBIDO)|SAQUE (?:REALIZADO|APROVADO)|ESTORNO/gi;
  // "R$ 250,80", "RS 53,84" (o OCR lê o cifrão como S), "-R$1.116,06"
  const VALOR_AVISO = /([+-]\s?)?R\s?[$S5]\s?(\d{1,3}(?:\.\d{3})*,\d{2})(?!\d)/gi;
  // "12/10" ou "12/10/2026", com a hora logo depois: "12/10, às 13h25", "12/10/2026 às 10:16"
  const DATA_AVISO = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?(?![\d/])(?:,?\s*(?:[aà]s\s*)?(\d{1,2})\s?[h:]\s?(\d{2}))?/gi;
  const ENTRADA_AVISO = /RECEB|ESTORNO|DEVOLU|DEVOLVID|REEMBOLSO|CASHBACK|DEP[OÓ]SITO|CR[EÉ]DITO EM CONTA/i;
  const NAO_E_LANCAMENTO = /LIMITE|SALDO|DISPON[IÍ]VEL/i;   // "limite disponível R$ 5.000,00"

  const limpa = s => s.replace(/[|;!«»“”"(){}[\]_=~^€]+/g, ' ').replace(/\s+/g, ' ').trim();
  // Restos do ícone e da borda do aviso que o OCR lê como letras soltas ("id h LOJA À ã")
  const semRestos = s => s.replace(/^(?:(?:\S|(?![A-Z]{2})\S{2})\s+)+/, '').replace(/(?:\s+\S)+$/, '');
  const curta = s => s.length <= 60 ? s : s.slice(0, 60).replace(/\s+\S*$/, '') + '…';

  // Aviso sem ano ("em 12/10"): o ano de hoje, ou o passado se a data ainda não chegou
  function anoAviso(dia, mes) {
    const hoje = new Date(), a = hoje.getFullYear();
    return new Date(a, mes - 1, dia) > new Date(hoje.getTime() + 86400000) ? a - 1 : a;
  }

  // Os avisos de um texto lido: [{ data, hora, descricao, valor }]
  function avisos(texto) {
    // a palavra partida no fim da linha ("PADA-" / "RIA") volta a ser uma só
    const t = limpa(String(texto || '').replace(/([A-Za-zÀ-ÿ])-\s*\n\s*([A-Za-zÀ-ÿ])/g, '$1$2'));
    const inicios = [...t.matchAll(INICIO)].map(m => m.index);
    const vals = [...t.matchAll(VALOR_AVISO)].filter(m => !NAO_E_LANCAMENTO.test(t.slice(Math.max(0, m.index - 25), m.index)));
    const ds = s => [...s.matchAll(DATA_AVISO)].filter(d => +d[1] >= 1 && +d[1] <= 31 && +d[2] >= 1 && +d[2] <= 12);
    return vals.map((m, k) => {
      // o aviso deste valor: do começo dele (ou do valor anterior) até o próximo aviso (ou o próximo valor)
      const ini = Math.max(k ? vals[k - 1].index + vals[k - 1][0].length : 0, ...inicios.filter(i => i <= m.index));
      const fim = Math.min(k + 1 < vals.length ? vals[k + 1].index : t.length, ...inicios.filter(i => i > m.index));
      const antes = t.slice(ini, m.index), depois = t.slice(m.index + m[0].length, fim);
      // depois do valor, só a data do próprio aviso ("em 12/10", "dia 12/10", "12/10 às 10:16"),
      // não a do cabeçalho da notificação seguinte (o Pix que mostra só a hora fica sem data)
      const doAviso = ds(depois).filter(d => d[4] || /(?:\bEM|\bDIA|\bDE)\s*$/i.test(depois.slice(Math.max(0, d.index - 8), d.index)));
      const d = doAviso[0] || ds(antes).pop();
      let data = '', hora = '';
      if (d) {
        const a = d[3] ? (d[3].length === 2 ? '20' + d[3] : d[3]) : anoAviso(+d[1], +d[2]);
        data = `${d[1].padStart(2, '0')}/${d[2].padStart(2, '0')}/${a}`;
        if (d[4] && +d[4] <= 23 && +d[5] <= 59) hora = `${d[4].padStart(2, '0')}:${d[5]}`;
      }
      const loja = (antes.trim().match(/FINAL\s*\d{4}\d?\s*(?:\S\s+)?(.+?)\s+VALOR$/i) || [])[1]   // "final 1234 - LOJA valor R$"
        || (depois.match(/^\s*(?:APROVADA\s+)?(?:EM|DE|PARA|NO|NA)\s+(?:\S\s+)*?([A-Za-zÀ-ÿ*][^,.!;]{2,40}?)(?=\s+(?:NO DIA|PARA O|COM|EM \d|[AÀ]S \d)|[,.!;]|$)/i) || [])[1];   // "R$ 41,00 em SHOPPING X no dia", "de FULANO"
      const resto = (antes + ' ' + depois).replace(DATA_AVISO, ' ').replace(/\b\d{1,2}[:h]\d{2}\b/g, ' ');
      const valor = parseFloat(m[2].replace(/\./g, '').replace(',', '.'));
      const sinal = m[1] ? (m[1].trim() === '-' ? -1 : 1) : (ENTRADA_AVISO.test(antes + ' ' + depois) ? 1 : -1);
      const cartao = ((antes + ' ' + depois).match(/FINAL\s*(\d{4})\b/i) || [])[1];
      return Object.assign({ data, hora, descricao: curta(loja ? semRestos(loja) : limpa(resto)), valor: sinal * valor, contexto: antes + ' ' + depois }, cartao ? { cartaoFinal: cartao } : {});
    });
  }

  // Os avisos de todas as leituras da foto. O mesmo aviso (mesma data e
  // hora) com valores diferentes: fica o valor lido mais vezes; empate fica de fora.
  function dosAvisos(readings) {
    const votos = new Map();
    readings.forEach(r => {
      const vistos = new Set();
      avisos(r.text).forEach(i => {
        const k = `${i.data}|${i.hora}|${i.valor}`;
        if (vistos.has(k)) return;
        vistos.add(k);
        if (votos.has(k)) votos.get(k).vezes++; else votos.set(k, { item: i, vezes: 1 });
      });
    });
    const lista = [...votos.values()], fora = new Set(), momentos = {};
    let duvidas = 0;
    lista.forEach(v => { if (v.item.data && v.item.hora) (momentos[v.item.data + ' ' + v.item.hora] = momentos[v.item.data + ' ' + v.item.hora] || []).push(v); });
    Object.values(momentos).filter(g => g.length > 1).forEach(g => {
      g.sort((a, b) => b.vezes - a.vezes);
      if (g[0].vezes === g[1].vezes) { duvidas++; g.forEach(v => fora.add(v)); } else g.slice(1).forEach(v => fora.add(v));
    });
    const ficam = lista.filter(v => !fora.has(v));
    const quando = i => i.data ? i.data.split('/').reverse().join('') + i.hora : '9';
    ficam.sort((a, b) => quando(a.item) < quando(b.item) ? -1 : quando(a.item) > quando(b.item) ? 1 : 0);
    return { itens: ficam.map(v => v.item), duvidas, confirmados: ficam.filter(v => v.vezes > 1).length, aviso: true };
  }

  /* ---------- Entrada do leitor ---------- */

  const DE_LANCAMENTOS = ['extrato', 'fatura', 'notificacao'];
  const dd = n => String(n).padStart(2, '0');

  // Os lançamentos tirados do texto (arquivo ou foto) de um papel de extrato,
  // fatura ou print. Devolve { itens, campos, conferido, checavel, diferenca,
  // nome, duvidas, confirmados, motivo } ou null para outros tipos.
  function itens(readings, tipo) {
    if (!readings.length || !DE_LANCAMENTOS.includes(tipo)) return null;
    if (tipo === 'notificacao') {
      const v = dosAvisos(readings);
      if (v.itens.length || v.duvidas) return Object.assign(v, { campos: {}, checavel: false });
    }
    // na foto, as duas leituras que acharam mais lançamentos
    const lidas = readings.map(r => analisar(r, tipo === 'notificacao' ? 'extrato' : tipo)).sort((x, y) => y.itens.length - x.itens.length);
    const a = lidas[0];
    let lista = a.itens, duvidas = 0, confirmados = 0;
    if (!readings[0].exato && lidas.length > 1) ({ itens: lista, duvidas, confirmados } = votar(lidas[0].itens, lidas[1].itens));
    duvidas += Math.max(...lidas.map(x => x.misturadas));
    const { lista: certa, r } = conferir(lista, a);
    const saida = certa.map(i => {
      const data = i.semData ? a.venc : `${dd(i.dia)}/${dd(i.mes)}/${comAno(i, a.ref)}`;
      return { data, descricao: i.descricao, valor: i.c / 100, moeda: i.moeda, parcela: i.parcela, cartaoFinal: i.cartaoFinal || (i.semData ? i.cartao : null), pagina: i.pagina, linha: i.linha, confirmado: i.confirmado };
    });
    // um cartão só no papel: todos os lançamentos são dele
    const finais = [...new Set(a.ls.map(l => (l.t.match(FINAL) || []).slice(1).find(Boolean)).filter(Boolean))];
    if (a.fatura && finais.length === 1) saida.forEach(i => { i.cartaoFinal = finais[0]; });
    let motivo = '';
    if (!saida.length) {
      const legivel = String(readings[0].text || '').replace(/[^0-9A-Za-zÀ-ÿ]/g, '').length;
      motivo = legivel < 40 ? 'a leitura saiu com pouco texto legível'
        : duvidas ? 'as duas leituras da foto discordaram dos valores'
        : !a.linhasComData ? 'nenhuma linha começa com uma data'
        : 'as linhas com data não têm valor ao lado';
    }
    return { itens: saida, campos: a.campos, checavel: !!r.checavel, conferido: !!(r.checavel && r.fecha), diferenca: r.diferenca || 0, nome: r.nome, duvidas, confirmados, motivo };
  }

  /* ---------- O lançamento combinado e o resultado do papel ---------- */

  // O lançamento no formato de todos os apps (ARQUITETURA.md, "Lançamento")
  function contrato(i, ctx) {
    const item = { data: i.data || '' };
    if (i.hora) item.hora = i.hora;
    Object.assign(item, { descricao: i.descricao || '', valor: i.valor, moeda: i.moeda || ctx.moeda || 'BRL', entrada: i.valor > 0, tipo: tipoDe(`${i.descricao || ''} ${i.contexto || ''}`, i.valor, ctx.tipo) });
    // a categoria, só quando a loja é de uma rede conhecida (dados/estabelecimentos.json)
    const categoria = L.categoriaDe ? L.categoriaDe(i.descricao) : '';
    if (categoria) item.categoria = categoria;
    if (i.parcela) item.parcela = i.parcela;
    if (i.cartaoFinal) item.cartaoFinal = i.cartaoFinal;
    item.conferido = !!ctx.conferido;
    const origem = { papel: ctx.papel };
    if (i.pagina) origem.pagina = i.pagina;
    if (i.linha) origem.linha = i.linha;
    item.origem = origem;
    return item;
  }

  // Pagamento e estorno do mesmo valor no mesmo dia: os dois ficam, marcados
  // como anulados (o app que importa decide se esconde)
  function anular(lista) {
    lista.forEach(e => {
      if (e.tipo !== 'estorno' || e.anulado) return;
      const par = lista.find(o => o !== e && !o.anulado && o.data === e.data && o.moeda === e.moeda && Math.abs(o.valor + e.valor) < 0.005);
      if (par) { e.anulado = true; par.anulado = true; }
    });
    return lista;
  }

  // base: o resultado da leitura do texto (foto ou PDF), quando os
  // lançamentos saíram dele; lidos: o que itens() devolveu
  function resultado(papel, base, lidos) {
    const info = papel.info || {};
    const deArquivo = !base;
    const conferido = deArquivo ? true : !!lidos.conferido;
    const papelNome = papel.label || (papel.fonte && papel.fonte.arquivo) || '';
    const brutos = papel.itens || [];
    const moedas = [...new Set(brutos.map(i => i.moeda || info.moeda || 'BRL'))];
    const itens = anular(brutos.map(i => contrato(i, { moeda: info.moeda, tipo: papel.tipo, conferido, papel: papelNome })));
    const moeda = moedas.length === 1 ? moedas[0] : 'BRL';
    const dias = itens.filter(i => i.data).map(i => i.data.split('/').reverse().join('')).sort();
    const br = s => `${s.slice(6)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
    const soma = lista => lista.reduce((s, i) => s + i.valor, 0);
    const entradas = soma(itens.filter(i => i.valor > 0)), saidas = soma(itens.filter(i => i.valor < 0));
    const fields = [];
    const add = (key, val) => { if (val && !fields.some(f => f.key === key)) fields.push({ key, val }); };
    const sim = simbolo(moeda);
    const brl = n => sim ? (n < 0 ? '-' : '') + sim + ' ' + Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : brlReal(n);
    Object.entries((lidos && lidos.campos) || {}).forEach(([key, val]) => add(key, val));
    add('Banco', info.banco);
    add('Moeda', moeda !== 'BRL' ? moeda : '');
    add(info.cartao ? 'Cartão' : 'Conta', info.conta);
    if (dias.length) add('Período', `${br(dias[0])} a ${br(dias[dias.length - 1])}`);
    if (itens.length) add('Lançamentos', String(itens.length));
    add('Entradas', entradas ? brl(entradas) : '');
    add('Saídas', saidas ? brl(-saidas) : '');
    add('Saldo', info.saldo !== undefined ? brl(info.saldo) : '');
    if (deArquivo) {
      return {
        fields, tipo: papel.tipo, expectsValue: false, valor: null, candidates: [], itens, moeda: sim || undefined, conferido,
        status: { cls: 'ok', text: `${itens.length} lançamentos lidos` }, hint: null,
        textKind: { label: 'Arquivo ' + String((papel.fonte && papel.fonte.formato) || '').toUpperCase(), good: 100 }, far: false,
        debug: { tipo: papel.tipo, itens: itens.length, readings: [], codes: [] }
      };
    }
    const n = itens.length;
    const fora = lidos.duvidas ? `; ${lidos.duvidas} com valor duvidoso ${lidos.duvidas > 1 ? 'ficaram' : 'ficou'} de fora: confira a foto` : '';
    let status;
    if (!n) {
      // Nenhum lançamento confiável: o texto lido fica na tela, com o porquê
      if (!base.fields.some(f => f.key === 'Texto')) fields.push({ key: 'Texto', val: papel.readings.map(r => r.text).sort((a, b) => b.length - a.length)[0].trim() });
      status = { cls: 'warn', text: `Não achei lançamentos: ${lidos.motivo || 'nenhuma linha tem data e valor'}. O texto lido está abaixo.` };
    } else if (lidos.aviso) {
      const todos = lidos.confirmados === n;
      status = lidos.duvidas ? { cls: 'warn', text: `${n} lançamentos lidos${fora}` }
        : { cls: todos ? 'ok' : 'warn', text: todos ? `${n} lançamentos, valores confirmados em 2 leituras` : `${n} lançamentos lidos: confira os valores` };
    } else if (lidos.conferido) status = { cls: 'ok', text: `${n} lançamentos; a soma confere com ${lidos.nome === 'o saldo' ? 'o saldo do extrato' : lidos.nome}${fora}` };
    else if (lidos.checavel) status = { cls: 'warn', text: `${n} lançamentos; a soma não fecha com ${lidos.nome} (diferença de ${brl(Math.abs(lidos.diferenca) / 100)}): confira${fora}` };
    else status = { cls: 'warn', text: `${n} lançamentos lidos; não há ${papel.tipo === 'fatura' ? 'total' : 'saldo'} para conferir a soma${fora}` };
    return Object.assign({}, base, {
      fields: n ? fields : base.fields.filter(f => !fields.some(g => g.key === f.key)).concat(fields), expectsValue: false, valor: null, candidates: [], itens, conferido: n ? conferido : false,
      diferenca: lidos.checavel && !lidos.conferido ? lidos.diferenca / 100 : undefined, moeda: sim || undefined, status,
      debug: Object.assign({}, base.debug, { itens: n, duvidas: lidos.duvidas })
    });
  }

  L.registrarLeitor({ id: 'extrato', vitais: [], daTabela, resultado, itens, dataBR, numero, avisos, contrato });
})(window.Leitura);
