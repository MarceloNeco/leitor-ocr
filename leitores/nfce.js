/* leitores/nfce.js — nota fiscal ou cupom (NFC-e, SAT, DANFE).
   sinais: palavras que denunciam o tipo; palavras: o que acompanha o valor;
   ignorar: linhas que nunca têm o valor (itens, tributos, troco...).
   exato: no DANFE (a nota em folha A4), os nomes das colunas ficam numa linha
   e os valores na de baixo; o total da nota só vale quando fecha a conta
   (produtos + frete + seguro + outras despesas + IPI + ICMS ST − desconto).
   No cupom, o total também vale quando a soma dos produtos menos os descontos
   dá o "valor a pagar" impresso, quando "valor dos produtos" mais acréscimo
   menos desconto dá um valor pago lido, ou quando duas leituras leem igual o
   "valor a pagar" (o total depois do desconto).
   produtos: as linhas de item do cupom (código, descrição, quantidade,
   unidade, preço, desconto, valor), conferidas pela conta do próprio cupom
   (quantidade × preço = valor) e, na foto, pelas várias leituras. Produto
   não é lançamento: o papel continua com um valor só, e a lista é detalhe. */
(function (L) {
  'use strict';
  const ROTULOS = /VALOR TOTAL DA NOTA|VALOR TOTAL DOS PRODUTOS|VALOR (?:TOTAL )?DO IPI|VALOR DO FRETE|VALOR DO SEGURO|DESCONTO|OUTRAS DESPESAS(?: ACESS[OÓ]RIAS)?|BASE DE C[AÁ]LC(?:ULO|\.)? (?:DO )?ICMS(?: SUBST(?:ITUI[CÇ][AÃ]O|\.)?| S\.?T\.?)?|VALOR (?:DO )?ICMS(?: SUBST(?:ITUI[CÇ][AÃ]O|\.)?| S\.?T\.?)?|VALOR (?:DO |DA )?(?:PIS|COFINS)|VALOR (?:DO )?IMP\.? (?:DE )?IMPORTA[CÇ][AÃ]O|V(?:ALOR|\.) ?APROX(?:IMADO|\.)? (?:DOS )?TRIBUTOS|VALOR (?:DO )?FCP|VALOR (?:DO )?ICMS UF (?:REMET|DEST)\.?/g;
  const centavos = v => +v.replace(/\D/g, '');

  function exato(readings) {
    for (const r of readings) {
      const linhas = String(r.text || '').toUpperCase().split('\n');
      const v = {};
      for (let i = 0; i < linhas.length - 1; i++) {
        const rotulos = linhas[i].match(ROTULOS) || [];
        const valores = linhas[i + 1].match(/\d{1,3}(?:\.\d{3})*,\d{2}(?!\d)/g) || [];
        if (rotulos.length < 3 || rotulos.length !== valores.length) continue;
        rotulos.forEach((rot, k) => {
          const c = centavos(valores[k]);
          if (/TOTAL DA NOTA/.test(rot)) v.total = c;
          else if (/TOTAL DOS PRODUTOS/.test(rot)) v.produtos = c;
          else if (/FRETE|SEGURO|OUTRAS|IPI/.test(rot)) v.somar = (v.somar || 0) + c;
          else if (/^VALOR.*ICMS.*(?:SUBST|S\.?T)/.test(rot)) v.somar = (v.somar || 0) + c;
          else if (/DESCONTO/.test(rot)) v.desconto = c;
        });
      }
      if (v.total && v.produtos !== undefined && v.produtos + (v.somar || 0) - (v.desconto || 0) === v.total) {
        return { valor: v.total / 100, campos: {}, status: 'Valor conferido pela soma da nota' };
      }
    }
    const p = produtosDe(readings);
    if (p && p.conferido) return { valor: p.aPagar / 100, campos: {}, status: 'Valor conferido pela soma dos produtos' };
    const soma = somaDoCupom(readings);
    if (soma) return { valor: soma / 100, campos: {}, status: 'Valor conferido pela soma da nota' };
    const c = aPagarDe(readings);
    return c ? { valor: c / 100, campos: {}, status: 'Valor a pagar confirmado em 2 leituras' } : null;
  }

  // A conta do próprio cupom: "Valor dos Produtos" mais o acréscimo (despesas
  // acessórias, taxa de serviço) menos o desconto tem que dar um valor pago
  // lido em alguma leitura (na linha "a pagar", "valor pago" ou na forma de
  // pagamento). Uma leitura que troca um dígito do total (401,58 por 401,59
  // numa impressão apagada) não fecha a conta; a certa fecha.
  const PRODUTOS = /VALOR\s?DOS\s?PRODUTOS|TOTAL\s?DOS\s?PRODUTOS/i;
  const ACRESCIMO = /ACR[EÉ]SCIMO|D\.?\s?ACESS[OÓ]RIAS|DESPESAS ACESS|OUTRAS DESPESAS|TAXA DE SERVI[CÇ]O|SERVI[CÇ]O \(?\d/i;
  const DESC_TOTAL = /^\W*DESCONTO(?!\s*SOBRE)/i;
  const PAGO = /PAGAR|PAGO|CART[AÃ]O|DINHEIRO|\bPIX\b|[OQ]UTROS|D[EÉ]BITO|CR[EÉ]DITO/i;
  const FORMA = /FORMA DE PAGAMENTO|VALOR PAGO/i;
  function somaDoCupom(readings) {
    const ultimo = l => { const v = l.match(DINHEIRO); return v ? cents(v[v.length - 1]) : null; };
    const pagos = new Set();
    // os valores pagos: nas linhas de pagamento e nas três depois do cabeçalho "forma de pagamento"
    readings.forEach(r => String(r.text || '').split('\n').forEach((l, i, ls) => {
      if (PAGO.test(l) || ls.slice(Math.max(0, i - 3), i).some(x => FORMA.test(x))) { const v = ultimo(l); if (v) pagos.add(v); }
    }));
    for (const r of readings) {
      const linhas = String(r.text || '').split('\n');
      const acha = re => { const l = linhas.find(x => re.test(x)); return l ? ultimo(l) : null; };
      const produtos = acha(PRODUTOS);
      if (!produtos) continue;
      const soma = produtos + (acha(ACRESCIMO) || 0) - (acha(DESC_TOTAL) || 0);
      if (soma > 0 && pagos.has(soma)) return soma;
    }
    return null;
  }

  // O "valor a pagar" (o total menos os descontos) lido igual em duas leituras
  // feitas de jeitos diferentes: é o valor do cupom, mesmo quando o "valor
  // total" (antes do desconto) aparece com mais destaque
  function aPagarDe(readings) {
    const lidos = readings.map(r => {
      const l = String(r.text || '').split('\n').find(x => APAGAR.test(x));
      const v = l && l.match(DINHEIRO);
      return v ? cents(v[v.length - 1]) : null;
    });
    for (let i = 0; i < readings.length; i++) for (let j = i + 1; j < readings.length; j++) {
      const a = readings[i], b = readings[j];
      if (lidos[i] && lidos[i] === lidos[j] && (a.size !== b.size || a.bin !== b.bin || a.rot !== b.rot)) return lidos[i];
    }
    return null;
  }

  /* ---------- Produtos do cupom ---------- */

  // "0,500 kg X 19,90", "1 UN X 10,00", "3 UN X 2,50" (o OCR lê UN como UM e X como K)
  const QTD = /(\d{1,4}(?:[.,]\d{1,3})?)\s*(UN|UND|UM|KG|KA|K6|LT|ML|PC|PCT|CX|FD|DZ|L|G|M)\b\.?\s*[XK×*]\s*(\d{1,4}[.,]\d{2,3})(?!\d)/i;
  const DINHEIRO = /-?\d{1,4}(?:\.\d{3})?,\d{2}(?!\d)|-?\b\d{1,4}\.\d{2}(?=\W{0,4}$)/g;   // "12.90" no fim da linha: o OCR lê a vírgula como ponto
  const DESCONTO = /[DCSAE]?ESCONTO|SOBRE I?[TI]E[MN]/i;
  const INICIO = /\bCOD\b.*\bDESC|VL\.? ?ITEM|ITEM R\$|U?XILIAR|CONSUMIDOR ELETR/i;
  // "kg X 19,90", "UN x 12,90": a linha da quantidade, mesmo com o número dela ilegível
  const UNIDADE_X = /\b(?:UN|UM|UND|K[GA6]|LT|PC|CX)\b\.?\s*[XK×*]\s*\d/i;
  const FIM = /QTD[EÉ]?\.? ?TOTAL|TOTAL DE I?TENS|\bVALOR\s?\S?OTAL|SUB-?TOTAL|A PAGAR|FORMA DE PAGAMENTO/i;
  // linha de total, pagamento ou tributo nunca é produto
  const NAO_PRODUTO = /TOTAL|PAGAR|TROCO|ACR[EÉ]SCIMO|CART[AÃ]O|CR[EÉ]DITO|D[EÉ]BITO|DINHEIRO|TRIBUTO|CONSUMIDOR|CHAVE DE ACESSO/i;
  const APAGAR = /VALOR\s?\S{0,2}\s?PAGAR|TOTAL A PAGAR/i;
  const num = s => +(/,/.test(s) ? String(s).replace(/\./g, '').replace(',', '.') : s);
  const cents = s => Math.round(Math.abs(num(s)) * 100);
  const letras = s => String(s || '').toUpperCase().normalize('NFD').replace(/[^A-Z]/g, '');

  // Os produtos de uma leitura, na ordem do cupom
  function itensDe(texto) {
    const linhas = String(texto || '').split('\n');
    let ini = linhas.findIndex(l => INICIO.test(l));
    const fim = linhas.findIndex((l, i) => i > ini && FIM.test(l));
    const regiao = linhas.slice(ini + 1, fim < 0 ? linhas.length : fim);
    const itens = [];
    let atual = null;
    regiao.forEach(bruta => {
      // o tributo do item vem entre parênteses, "(0,42)" (a foto às vezes perde o fecha-parênteses)
      const l = bruta.replace(/\([^()]{0,8}\)|\(\s*\d{1,2}[.,:]\d{2}(?!\d)/g, ' ').replace(/\s+/g, ' ').trim();
      const valores = l.match(DINHEIRO) || [];
      const fimValor = valores.length && new RegExp(valores[valores.length - 1].replace(/[.,-]/g, '\\$&') + '\\W{0,4}$').test(l) ? valores[valores.length - 1] : null;
      if (DESCONTO.test(l)) {
        if (atual && fimValor) atual.desconto = cents(fimValor);
        else if (atual) atual.esperaDesconto = true;
        return;
      }
      const q = l.match(QTD);
      const ux = !q && l.match(UNIDADE_X);
      const textoItem = (q ? l.slice(0, q.index) : ux ? l.slice(0, ux.index) : l).replace(DINHEIRO, ' ');
      const cod = textoItem.match(/(?:^|\s)\D?(\d{4,14})\s+(?=\S*[A-Za-zÀ-ÿ])/);
      const desc = textoItem.slice(cod ? cod.index + cod[0].length : 0).replace(/^\W+|\W+$/g, '').replace(/\s+/g, ' ');
      // começa um produto a linha com o código (ou o número do item) ou com cara
      // de nome (duas palavras); o resto é continuação do produto de cima
      const nome = (desc.match(/[A-Za-zÀ-ÿ]{3,}/g) || []).length >= 2;
      if (NAO_PRODUTO.test(l)) { atual = null; return; }
      if (letras(desc).length >= 3 && (cod || /^\W{0,2}\d{3}\s/.test(textoItem) || nome) && !(ux && letras(desc).length < 6)) {
        atual = { descricao: desc, codigo: cod ? cod[1] : '', qtd: null, unidade: '', precoUnit: null, valor: null, desconto: 0 };
        itens.push(atual);
      } else if (!atual) return;
      if (q && atual.qtd === null) { atual.qtd = num(q[1]); atual.unidade = /^K/i.test(q[2]) ? 'kg' : q[2].toUpperCase().replace(/^UM$/, 'UN'); atual.precoUnit = num(q[3]); }
      if (ux && atual.precoUnit === null) { const pr = l.slice(ux.index).match(/[XK×*]\s*(\d{1,4}[.,]\d{2})(?!\d)/i); if (pr) { atual.precoUnit = num(pr[1]); atual.unidade = /^K/i.test(ux[0]) ? 'kg' : 'UN'; } }
      if (fimValor && (q || ux || letras(desc).length >= 3 || atual.valor === null)) {
        if (atual.esperaDesconto && /^-/.test(fimValor)) { atual.desconto = cents(fimValor); atual.esperaDesconto = false; }
        else if (atual.valor === null) atual.valor = cents(fimValor);
      }
    });
    itens.forEach(i => {
      // a conta do próprio cupom: quantidade × preço = valor
      i.calculado = i.qtd !== null && i.precoUnit !== null ? Math.round(i.qtd * i.precoUnit * 100) : null;
      // valor igual ao preço: é 1 unidade (o OCR troca o 1 por 7 ou 4)
      i.ok = i.valor !== null && (i.valor === i.calculado || (i.precoUnit !== null && i.valor === Math.round(i.precoUnit * 100) && i.unidade !== 'kg'));
      if (i.ok && i.valor !== i.calculado) { i.qtd = 1; i.calculado = i.valor; }
    });
    return itens;
  }

  // O quanto dois nomes lidos parecem o mesmo (bigramas das letras, 0 a 1)
  function semelhanca(a, b) {
    const pares = s => { const t = letras(s), r = []; for (let i = 0; i < t.length - 1; i++) r.push(t.slice(i, i + 2)); return r; };
    const x = pares(a), y = pares(b);
    if (!x.length || !y.length) return 0;
    let comum = 0;
    const resto = y.slice();
    x.forEach(p => { const j = resto.indexOf(p); if (j >= 0) { comum++; resto.splice(j, 1); } });
    return 2 * comum / (x.length + y.length);
  }
  // O mesmo produto em duas leituras: código igual, nome parecido, ou nome
  // meio parecido com o mesmo valor
  function parecido(a, b) {
    if (a.codigo && b.codigo && a.codigo.length >= 5 && a.codigo === b.codigo) return true;
    const sim = semelhanca(a.descricao, b.descricao);
    const valores = [a.valor, a.calculado].filter(v => v !== null);
    return sim >= 0.5 || (sim >= 0.3 && [b.valor, b.calculado].some(v => v !== null && valores.includes(v)));
  }

  // As listas das leituras, alinhadas na ordem do cupom: a que leu mais
  // valores é a base, e cada outra se alinha a ela pela maior sequência comum
  function alinhar(listas) {
    const lidos = l => l.filter(i => i.valor !== null || i.calculado !== null).length;
    const ordem = listas.slice().sort((a, b) => lidos(b) - lidos(a));
    const base = ordem[0], grupos = base.map(i => [i]);
    ordem.slice(1).forEach(y => {
      const n = base.length, m = y.length;
      const t = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
      for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = parecido(base[i], y[j]) ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
      let i = 0, j = 0;
      while (i < n && j < m) {
        if (parecido(base[i], y[j]) && t[i][j] === t[i + 1][j + 1] + 1) { grupos[i].push(y[j]); i++; j++; }
        else if (t[i + 1][j] >= t[i][j + 1]) i++; else j++;
      }
    });
    return grupos;
  }

  const maisVezes = lista => {
    const n = new Map();
    lista.forEach(v => n.set(v, (n.get(v) || 0) + 1));
    return [...n.entries()].sort((a, b) => b[1] - a[1])[0] || [null, 0];
  };

  // Os produtos do cupom: { produtos, conferido, aPagar, diferenca } ou null.
  // O valor de cada produto é o que fecha a conta dele (quantidade × preço) ou
  // o que duas leituras leram igual; lido uma vez só, entra para conferir.
  function produtosDe(readings) {
    const listas = readings.map(r => itensDe(r.text)).filter(l => l.length);
    if (!listas.length) return null;
    const produtos = alinhar(listas).map(g => {
      // pontos de cada valor: lido (1), igual à conta quantidade × preço de
      // uma leitura (2), lido e conferido pela conta na mesma leitura (3)
      const pontos = new Map();
      const soma = (v, n) => { if (v !== null && v > 0) pontos.set(v, (pontos.get(v) || 0) + n); };
      g.forEach(i => { soma(i.valor, i.ok ? 3 : 1); if (!i.ok) soma(i.calculado, 2); });
      const [valor, melhor] = [...pontos.entries()].sort((a, b) => b[1] - a[1])[0] || [null, 0];
      const empate = [...pontos.values()].filter(n => n === melhor).length > 1;
      // lido uma vez só, sem a conta: entra só quando é a única leitura (arquivo)
      if (valor === null || empate || (melhor < 2 && listas.length > 1)) return null;
      const base = g.find(i => i.ok) || g.find(i => i.qtd !== null && i.calculado === valor) || g[0];
      // o nome mais legível entre as leituras, sem os restos do número do item
      const limpo = d => d.replace(/^(?:\S{1,3}\s+)*?(?=[A-Za-zÀ-ÿ]{3})/, '').replace(/(?:\s+\S)+$/, '');
      // (o cupom é impresso em maiúsculas: minúscula, sinal e "UN X" no nome são restos de leitura)
      const legivel = d => (d.match(/\b[A-ZÀ-Ú]{3,}\b/g) || []).join('').length - (d.match(/[a-zà-ÿ]/g) || []).length
        - (d.match(/[^\w\s]/g) || []).length * 2 - (/\b(?:UN|UM)\b.{0,3}\b[XK]/i.test(d) ? 10 : 0);
      const descricao = g.map(i => limpo(i.descricao)).sort((a, b) => legivel(b) - legivel(a))[0];
      const [desconto] = maisVezes(g.map(i => i.desconto).filter(Boolean));
      const [codigo] = maisVezes(g.map(i => i.codigo).filter(c => c.length >= 4));
      const p = { descricao };
      if (codigo) p.codigo = codigo;
      Object.assign(p, { qtd: base.qtd !== null ? base.qtd : 1, unidade: base.unidade || 'UN', precoUnit: base.precoUnit !== null && base.calculado === valor ? base.precoUnit : +(valor / 100 / (base.qtd || 1)).toFixed(2) });
      if (desconto) p.desconto = desconto / 100;
      p.valor = valor / 100;
      return p;
    }).filter(Boolean);
    if (!produtos.length) return null;
    // a soma confere com o "valor a pagar" impresso (em alguma das leituras)?
    const aPagar = readings.flatMap(r => String(r.text || '').split('\n').filter(l => APAGAR.test(l)).flatMap(l => (l.match(DINHEIRO) || []).map(cents)));
    const soma = produtos.reduce((t, p) => t + Math.round(p.valor * 100) - Math.round((p.desconto || 0) * 100), 0);
    const conferido = aPagar.includes(soma);
    const [lido] = maisVezes(aPagar);
    produtos.forEach(p => { p.conferido = conferido; });
    return { produtos, conferido, aPagar: conferido ? soma : lido, diferenca: !conferido && lido !== null ? lido - soma : null };
  }

  L.registrarLeitor({
    id: 'nfce',
    vitais: ['Valor'],
    sinais: /NFC-?E|NOTA FISCAL|CUPOM FISCAL|DANFE|CONSUMIDOR|CHAVE DE ACESSO|PROTOCOLO DE AUTORIZA|TRIBUT|\bSAT\b|ITENS|UN\s?X|VL\.?\s?ITEM|EMISS[AÃ]O|QTDE?\b/g,
    palavras: /VALOR\s?\S{0,2}\s?PAGAR|VALOR PAGO|TOTAL A PAGAR|VALOR TOTAL|[TIF1]OTAL|A PAGAR|PAGO|VALOR/,   // "VALOR à PAGAR": a foto troca o A
    // a linha dos tributos também pelo número da lei (12.741) e por "Incid": no papel amassado a palavra "Trib" some
    ignorar: /TRIB|12\.?741|LEI FED|INCID|DESCONTO|UN\s?X|VL\.?\s?ITEM|UNIT|ITE[MN]S|QTD|TROCO|DINHEIRO|SUB-?\s?TOTAL|ECONOMIZOU|\bTAX\b|CHANGE|CASH|ACESS[OÓ]RIO|PRODUTOS|SERVI[CÇ]O|\bTX\b|TAXA|\(\s?[+-]\s?\)/,
    // num cupom, "R$" sozinho não basta: o valor só vale numa linha de total, "a pagar" ou "pago" (a linha dos impostos também traz "R$")
    exigePalavra: true,
    exato, produtos: produtosDe
  });
})(window.Leitura);
