/* leitores/nfce.js — nota fiscal ou cupom (NFC-e, SAT, DANFE).
   sinais: palavras que denunciam o tipo; palavras: o que acompanha o valor;
   ignorar: linhas que nunca têm o valor (itens, tributos, troco...). */
Leitura.registrarLeitor({
  id: 'nfce',
  vitais: ['Valor'],
  sinais: /NFC-?E|NOTA FISCAL|CUPOM FISCAL|DANFE|CONSUMIDOR|CHAVE DE ACESSO|PROTOCOLO DE AUTORIZA|TRIBUT|\bSAT\b|ITENS|UN\s?X|VL\.?\s?ITEM|EMISS[AÃ]O|QTDE?\b/g,
  palavras: /VALOR A PAGAR|VALOR PAGO|TOTAL A PAGAR|VALOR TOTAL|[TIF1]OTAL|A PAGAR|PAGO|VALOR/,
  ignorar: /TRIB|DESCONTO|UN\s?X|VL\.?\s?ITEM|UNIT|ITE[MN]S|QTD|TROCO|DINHEIRO|SUB-?\s?TOTAL|ECONOMIZOU|\bTAX\b|CHANGE|CASH|ACESS[OÓ]RIO|PRODUTOS|SERVI[CÇ]O|\bTX\b|TAXA|\(\s?[+-]\s?\)/
});
