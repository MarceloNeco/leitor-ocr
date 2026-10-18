/* leitores/transferencia.js — comprovante de Pix, TED ou transferência (do app
   ou do site do banco): o valor, a data e para quem foi.
   palavras: o que acompanha o valor; ignorar: linhas que nunca têm o valor. */
Leitura.registrarLeitor({
  id: 'transferencia',
  vitais: ['Valor'],
  palavras: /VALOR|QUANTIA|TOTAL/,
  ignorar: /TARIFA|LIMITE|SALDO|DISPON/,
  // "Para": o nome que vem logo depois de "dados da transação", "destino" ou "quem recebeu"
  campos(textUpper, fieldsMap) {
    const m = textUpper.match(/(?:DADOS DA TRANSA[CÇ][AÃ]O|DESTINO|QUEM RECEBEU|PARA)\s*:?\s*\n?\s*NOME\s*:?\s*([^\n]+)/);
    if (m) fieldsMap['Para'] = m[1].trim();
  }
});
