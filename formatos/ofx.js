/* formatos/ofx.js — extrato ou fatura no formato OFX (o arquivo que o banco
   exporta para programas de finanças). Vira a lista de lançamentos e um resumo
   (banco, conta só com os 4 últimos dígitos, saldo). OFX 1 não fecha as
   etiquetas e OFX 2 é XML: o mesmo jeito de ler serve para os dois. */
(function (L) {
  'use strict';
  const tag = (bloco, nome) => { const m = bloco.match(new RegExp('<' + nome + '>([^<\\r\\n]*)', 'i')); return m ? m[1].trim() : ''; };
  const data = s => { const m = (s || '').match(/^(\d{4})(\d{2})(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
  const num = s => { const v = parseFloat(String(s || '').replace(',', '.')); return isFinite(v) ? v : null; };

  L.formatos.ofx = async arquivo => {
    const texto = await L.textoDoArquivo(arquivo);
    const itens = [];
    const re = /<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi;
    let m;
    while ((m = re.exec(texto)) !== null) {
      const valor = num(tag(m[1], 'TRNAMT')), dia = data(tag(m[1], 'DTPOSTED'));
      if (valor === null || !dia) continue;
      itens.push({ data: dia, descricao: tag(m[1], 'MEMO') || tag(m[1], 'NAME') || tag(m[1], 'TRNTYPE'), valor });
    }
    if (!itens.length) throw Object.assign(new Error('OFX sem lançamentos'), { motivo: 'o arquivo OFX não tem lançamentos' });
    const cartao = /<CCSTMTRS>/i.test(texto);
    const conta = tag(texto, 'ACCTID').replace(/\D/g, '');
    const saldo = num(tag((texto.match(/<LEDGERBAL>[\s\S]*?(?=<\/LEDGERBAL>|<AVAILBAL>|$)/i) || [''])[0], 'BALAMT'));
    const info = {
      banco: tag(texto, 'ORG') || (tag(texto, 'BANKID') ? 'Banco ' + tag(texto, 'BANKID') : ''),
      conta: conta ? 'final ' + conta.slice(-4) : '',
      cartao,
      saldo: saldo === null ? undefined : saldo
    };
    return [{ itens, info, tipoSugerido: cartao ? 'fatura' : 'extrato', texto: itens.map(i => `${i.data} ${i.descricao} ${i.valor}`).join('\n') }];
  };
})(window.Leitura);
