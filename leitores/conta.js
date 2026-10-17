/* leitores/conta.js — conta de restaurante (conferência de mesa).
   sinais: palavras que denunciam o tipo; palavras: o que acompanha o valor;
   ignorar: linhas que nunca têm o valor (subtotal, gorjeta, por pessoa...). */
Leitura.registrarLeitor({
  id: 'conta',
  vitais: ['Valor'],
  sinais: /CONFER[EÊ]NCIA|SUB-?\s?TOTAL|GORJETA|SERVI[CÇ]O|MESA|PESSOAS?|COUVERT|GAR[CÇ]OM|\bTIP\b|GRATUITY|\d\s?X\s|\bTAX\b|CHANGE|CASH/g,
  palavras: /[TIF1]OTAL|A PAGAR|PAGO|VALOR/,
  ignorar: /SUB-?\s?TOTAL|GORJETA|SERVI[CÇ]O|PESSOA|COUVERT|\d\s?X\s|TRIB|DESCONTO|TROCO|TAXA|\bTIP\b|CHANGE|CASH|SUGGEST|ITE[MN]S|\bTAX\b|\(\s?[+-]\s?\)/
});
