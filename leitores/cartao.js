/* leitores/cartao.js — comprovante de maquininha (via do cliente).
   sinais: palavras que denunciam o tipo; palavras: o que acompanha o valor;
   ignorar: linhas que nunca têm o valor (parcelas, troco, gorjeta...). */
Leitura.registrarLeitor({
  id: 'cartao',
  vitais: ['Valor'],
  sinais: /VIA CLIENTE|VIA DO CLIENTE|COMPROVANTE DE (?:VENDA|PAGAMENTO)|CART[AÃ]O|CR[EÉ]DITO|D[EÉ]BITO|MASTERCARD|\bVISA\b|\bELO\b|\bNSU\b|\bAUTH?[:=\s]|\bAID\b|GETNET|CIELO|\bSTONE\b|\bREDE\b|PAGSEGURO|INFINITEPAY|SENHA APROVADA|PARCELA|VALOR:|\bCARD\b|APPROVAL|AMOUNT/g,
  palavras: /VALOR|[TIF1]OTAL|CR[EÉ]DITO|D[EÉ]BITO|COMPRA|VENDA|APROVAD|PAGO|PAGAR|AMOUNT/,
  ignorar: /\d\s?X\s|PARCELA|POR PESSOA|TRIB|DESCONTO|TROCO|SALDO|TAXA|JUROS|LIMITE|SUB-?\s?TOTAL|\bTIP\b|SUGGEST/,
  // Campos só da via do cartão
  campos(textUpper, fieldsMap) {
    // 5. Bandeira: MASTERCARD, VISA, ELO, AMEX, AMERICAN EXPRESS, HIPERCARD, DINERS
    const flags = [
      ['AMERICAN EXPRESS', 'AMEX'],
      ['AMEX', 'AMEX'],
      ['MASTERCARD', 'MASTERCARD'],
      ['VISA', 'VISA'],
      ['ELO', 'ELO'],
      ['HIPERCARD', 'HIPERCARD'],
      ['DINERS', 'DINERS']
    ];
    for (const [pattern, label] of flags) {
      if (textUpper.includes(pattern)) {
        fieldsMap['Bandeira'] = label;
        break;
      }
    }

    // 6. Modalidade: Crédito / Débito / Pix / Parcelado
    let mod = '';
    if (textUpper.includes('PIX')) {
      mod = 'Pix';
    } else if (textUpper.includes('CREDITO') || textUpper.includes('CRÉDITO')) {
      if (textUpper.includes('PARCELADO') || textUpper.includes('PARC')) {
        mod = 'Crédito Parcelado';
      } else {
        mod = 'Crédito à Vista';
      }
    } else if (textUpper.includes('DEBITO') || textUpper.includes('DÉBITO')) {
      mod = 'Débito';
    }
    if (mod) fieldsMap['Modalidade'] = mod;

    // 7. Terminal: (TERMINAL|POS)\s*[:\.]?\s*([A-Z0-9]{4,12})
    const termMatch = textUpper.match(/(?:TERMINAL|POS)\s*[:\.]?\s*([A-Z0-9]{4,12})/);
    if (termMatch) fieldsMap['Terminal'] = termMatch[1];

    // 8. NSU/DOC: (NSU|DOC\w*)\s*[:\.]?\s*(\d{4,})
    const nsuMatch = textUpper.match(/(?:NSU|DOC\w*)\s*[:\.]?\s*(\d{4,})/);
    if (nsuMatch) fieldsMap['NSU/DOC'] = nsuMatch[1];

    // 9. Autorização: the number after AUT, AUTH or AUTORIZACAO (never "AUTO POSTO")
    const authMatch = textUpper.match(/\bAUT(?:H|ORIZA[CÇ][AÃ]O)?\s*[:=.]?\s*(\d{5,})/);
    if (authMatch) fieldsMap['Autorização'] = authMatch[1];

    // 10. AID: \bA0000[0-9A-F]{10,12}\b
    const aidMatch = textUpper.match(/\b(A0000[0-9A-F]{10,12})\b/);
    if (aidMatch) fieldsMap['AID'] = aidMatch[1];

    // 11. Via: VIA CLIENTE ou VIA ESTABELECIMENTO
    if (textUpper.includes('VIA CLIENTE') || textUpper.includes('CLIENTE')) {
      fieldsMap['Via'] = 'VIA CLIENTE';
    } else if (textUpper.includes('VIA ESTABELECIMENTO')) {
      fieldsMap['Via'] = 'VIA ESTABELECIMENTO';
    } else {
      fieldsMap['Via'] = 'VIA CLIENTE';
    }

    // Final do cartão: só os 4 últimos dígitos ("******1234", "FINAL 1234"),
    // nunca o número inteiro. Serve para saber quem pagou (leitura/relacoes.js)
    // "MASTERCARD ****1234" (a foto pode ler os asteriscos como "t")
    const fim = textUpper.match(/(?:\*{2,}|(?:X{4}[\s.-]?){2,})\s?(\d{4})\b/) || textUpper.match(/\bFINAL\s*[:.]?\s*(\d{4})\b/)
      || textUpper.match(/(?:CARD|VISA|ELO|AMEX|MAESTRO)\s*-?\s*[*TX]{2,}[*TX\s]*(\d{4})\b/);
    if (fim) fieldsMap['Cartão'] = 'final ' + fim[1];
  }
});
