/* formatos/ofx.js — extrato ou fatura no formato OFX (o arquivo que o banco
   exporta para programas de finanças), e no OFC 1.06 (Money e Quicken), que
   usa as mesmas etiquetas. Vira a lista de lançamentos e um resumo
   (banco, conta só com os 4 últimos dígitos, moeda, saldo). OFX 1 não fecha as
   etiquetas e OFX 2 é XML: o mesmo jeito de ler serve para os dois. */
(function (L) {
  'use strict';
  const tag = (bloco, nome) => { const m = bloco.match(new RegExp('<' + nome + '>([^<\\r\\n]*)', 'i')); return m ? m[1].trim() : ''; };
  const data = s => { const m = (s || '').match(/^(\d{4})(\d{2})(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
  const num = s => { const v = parseFloat(String(s || '').replace(',', '.')); return isFinite(v) ? v : null; };

  // Um arquivo pode ter várias contas (a conta internacional traz uma por moeda):
  // cada uma vira uma parte, com a própria moeda, e as que não têm lançamento ficam de fora
  L.formatos.ofx = async arquivo => {
    const texto = await L.textoDoArquivo(arquivo);
    const blocos = texto.match(/<(?:CC)?STMTRS>[\s\S]*?(?=<\/(?:CC)?STMTRS>|<(?:CC)?STMTRS>|$)/gi) || [texto];
    const partes = [];
    blocos.forEach(bloco => {
      const itens = [];
      const re = /<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi;
      let m;
      while ((m = re.exec(bloco)) !== null) {
        const valor = num(tag(m[1], 'TRNAMT')), dia = data(tag(m[1], 'DTPOSTED'));
        if (valor === null || !dia) continue;
        itens.push({ data: dia, descricao: tag(m[1], 'MEMO') || tag(m[1], 'NAME') || tag(m[1], 'TRNTYPE'), valor });
      }
      if (!itens.length) return;
      const cartao = /<CCSTMTRS>/i.test(bloco);
      const conta = tag(bloco, 'ACCTID').replace(/\D/g, '');
      // OFX: <LEDGERBAL><BALAMT>; OFC (o formato antigo do Money e do Quicken): <LEDGER>
      const saldo = num(tag((bloco.match(/<LEDGERBAL>[\s\S]*?(?=<\/LEDGERBAL>|<AVAILBAL>|$)/i) || [''])[0], 'BALAMT') || tag(bloco, 'LEDGER'));
      const moeda = (tag(bloco, 'CURDEF') || tag(texto, 'CURDEF') || 'BRL').toUpperCase();
      const info = {
        banco: tag(texto, 'ORG') || (tag(bloco, 'BANKID') ? 'Banco ' + tag(bloco, 'BANKID') : ''),
        conta: conta ? 'final ' + conta.slice(-4) : '',
        cartao,
        saldo: saldo === null ? undefined : saldo,
        moeda
      };
      partes.push({ itens, info, tipoSugerido: cartao ? 'fatura' : 'extrato', texto: itens.map(i => `${i.data} ${i.descricao} ${i.valor}`).join('\n'),
        parte: blocos.length > 1 || moeda !== 'BRL' ? 'Conta em ' + moeda : undefined });
    });
    if (!partes.length) throw Object.assign(new Error('OFX sem lançamentos'), { motivo: 'o arquivo não tem lançamentos que o leitor entenda (exporte do banco em OFX ou CSV)' });
    return partes;
  };
})(window.Leitura);
