/* leitores/nfce.js — nota fiscal ou cupom (NFC-e, SAT, DANFE).
   sinais: palavras que denunciam o tipo; palavras: o que acompanha o valor;
   ignorar: linhas que nunca têm o valor (itens, tributos, troco...).
   exato: no DANFE (a nota em folha A4), os nomes das colunas ficam numa linha
   e os valores na de baixo; o total da nota só vale quando fecha a conta
   (produtos + frete + seguro + outras despesas + IPI + ICMS ST − desconto). */
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
    return null;
  }

  L.registrarLeitor({
    id: 'nfce',
    vitais: ['Valor'],
    sinais: /NFC-?E|NOTA FISCAL|CUPOM FISCAL|DANFE|CONSUMIDOR|CHAVE DE ACESSO|PROTOCOLO DE AUTORIZA|TRIBUT|\bSAT\b|ITENS|UN\s?X|VL\.?\s?ITEM|EMISS[AÃ]O|QTDE?\b/g,
    palavras: /VALOR A PAGAR|VALOR PAGO|TOTAL A PAGAR|VALOR TOTAL|[TIF1]OTAL|A PAGAR|PAGO|VALOR/,
    ignorar: /TRIB|DESCONTO|UN\s?X|VL\.?\s?ITEM|UNIT|ITE[MN]S|QTD|TROCO|DINHEIRO|SUB-?\s?TOTAL|ECONOMIZOU|\bTAX\b|CHANGE|CASH|ACESS[OÓ]RIO|PRODUTOS|SERVI[CÇ]O|\bTX\b|TAXA|\(\s?[+-]\s?\)/,
    exato
  });
})(window.Leitura);
