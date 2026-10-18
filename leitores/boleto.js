/* leitores/boleto.js — boleto de banco (ficha de compensação). O valor e o
   vencimento estão dentro da linha digitável (47 números) e do código de barras
   (44): o leitor tira de lá, conferindo os dígitos verificadores. Número lido
   errado não fecha a conta, e aí o valor vem do texto ("Valor do documento")
   como em qualquer papel, ou fica vazio, nunca errado. As partes do valor
   (condomínio, água, gás...) viram itens só quando somam o valor exato.
   palavras e ignorar: para o valor no texto, quando o código não foi lido. */
(function (L) {
  'use strict';
  const BANCOS = { '001': 'Banco do Brasil', '004': 'Banco do Nordeste', '033': 'Santander', '041': 'Banrisul', '070': 'BRB', '077': 'Inter',
    '104': 'Caixa', '208': 'BTG Pactual', '212': 'Original', '237': 'Bradesco', '260': 'Nubank', '290': 'PagBank', '323': 'Mercado Pago',
    '336': 'C6 Bank', '341': 'Itaú', '380': 'PicPay', '422': 'Safra', '748': 'Sicredi', '756': 'Sicoob' };

  // Dígito do módulo 10 (cada campo da linha digitável)
  function mod10(s) {
    let soma = 0, peso = 2;
    for (let i = s.length - 1; i >= 0; i--) { const p = +s[i] * peso; soma += p > 9 ? p - 9 : p; peso = peso === 2 ? 1 : 2; }
    return (10 - soma % 10) % 10;
  }
  // Dígito geral do código de barras (módulo 11; 0, 10 e 11 viram 1)
  function mod11(s) {
    let soma = 0, peso = 2;
    for (let i = s.length - 1; i >= 0; i--) { soma += +s[i] * peso; peso = peso === 9 ? 2 : peso + 1; }
    const d = 11 - soma % 11;
    return d === 0 || d === 10 || d === 11 ? 1 : d;
  }

  // Código de barras (44 números, moeda 9 = real) que confere, ou null
  const barrasOk = b => b.length === 44 && b[3] === '9' && mod11(b.slice(0, 4) + b.slice(5)) === +b[4] ? b : null;

  // Linha digitável (47 números) → código de barras, se os 4 dígitos conferem
  function daLinha(l) {
    if (l[3] !== '9' || mod10(l.slice(0, 9)) !== +l[9] || mod10(l.slice(10, 20)) !== +l[20] || mod10(l.slice(21, 31)) !== +l[31]) return null;
    return barrasOk(l.slice(0, 4) + l[32] + l.slice(33, 47) + l.slice(4, 9) + l.slice(10, 20) + l.slice(21, 31));
  }

  // O código de barras do boleto no texto lido ou nos códigos da foto, ou null
  function achar(texto, codes) {
    for (const c of codes || []) { const b = barrasOk(String(c.text || '').replace(/\D/g, '')); if (b) return b; }
    for (const linha of String(texto || '').split('\n')) {
      const d = linha.replace(/\D/g, '');
      for (let i = 0; i + 47 <= d.length; i++) { const b = daLinha(d.slice(i, i + 47)); if (b) return b; }
    }
    for (const m of String(texto || '').matchAll(/(^|\D)(\d{44})(?!\d)/g)) { const b = barrasOk(m[2]); if (b) return b; }
    return null;
  }

  // Fator de vencimento: dias desde 07/10/1997; chegou a 9999 em 21/02/2025 e
  // voltou a 1000 em 22/02/2025. Das duas datas possíveis, a mais perto de hoje.
  function vencimento(fator) {
    if (!fator) return '';
    const dia = 86400000, hoje = Date.now();
    const velho = Date.UTC(1997, 9, 7) + fator * dia, novo = Date.UTC(2025, 1, 22) + (fator - 1000) * dia;
    const d = new Date(fator >= 1000 && Math.abs(novo - hoje) < Math.abs(velho - hoje) ? novo : velho);
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  }

  // A linha digitável escrita como no boleto, a partir do código de barras
  function linhaDe(b) {
    const c1 = b.slice(0, 4) + b.slice(19, 24), c2 = b.slice(24, 34), c3 = b.slice(34, 44);
    const f = (c, n) => c.slice(0, n) + '.' + c.slice(n);
    return `${f(c1 + mod10(c1), 5)} ${f(c2 + mod10(c2), 5)} ${f(c3 + mod10(c3), 5)} ${b[4]} ${b.slice(5, 19)}`;
  }

  // As partes do valor ("Discriminação das verbas": condomínio, fundo de
  // reserva, água, gás...), só quando somam exatamente o valor do código
  function verbas(texto, centavos, data) {
    const linhas = String(texto || '').split('\n');
    const i = linhas.findIndex(l => /DISCRIMINA[CÇ][AÃ]O DAS VERBAS|COMPOSI[CÇ][AÃ]O DO (?:VALOR|BOLETO)/i.test(l));
    if (i < 0) return null;
    const itens = [];
    let soma = 0;
    for (const l of linhas.slice(i + 1, i + 25)) {
      const m = l.match(/^(.*?[A-Za-zÀ-ÿ].*?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})(?!\d)/);
      if (!m) continue;
      const c = +m[2].replace(/\D/g, '');
      soma += c;
      itens.push({ data, descricao: m[1].trim(), valor: -c / 100 });
      if (soma >= centavos) break;
    }
    return soma === centavos && itens.length > 1 ? itens : null;
  }

  // Valor e campos exatos, vindos do código; o beneficiário e as partes do valor vêm do texto
  function exato(readings, codes) {
    let b = null;
    for (const r of readings) if ((b = achar(r.text, codes))) break;
    if (!b && codes && codes.length) b = achar('', codes);
    if (!b) return null;
    const valor = parseInt(b.slice(9, 19), 10) / 100;
    const campos = { Vencimento: vencimento(+b.slice(5, 9)), Banco: `${BANCOS[b.slice(0, 3)] || 'Banco'} (${b.slice(0, 3)})`, 'Linha digitável': linhaDe(b) };
    for (const r of readings) {
      const linhas = String(r.text || '').split('\n').map(l => l.trim());
      const i = linhas.findIndex(l => /^BENEFICI[AÁ]RIO\b/i.test(l));
      const nome = i >= 0 && (linhas[i + 1] || '').replace(/\s*CNPJ.*$|\s*CPF.*$/i, '').trim();
      if (nome && /[A-Za-zÀ-ÿ]{3}/.test(nome)) { campos.Estabelecimento = nome; break; }
    }
    const itens = valor ? readings.map(r => verbas(r.text, Math.round(valor * 100), campos.Vencimento)).find(Boolean) : null;
    if (!campos.Vencimento) delete campos.Vencimento;
    // Comprovante de pagamento do boleto: o que vale é o valor pago (pode ter
    // desconto ou multa); o do código fica como "Valor do boleto". Sem o valor
    // pago escrito, o campo Valor fica vazio em vez de mostrar o do boleto.
    const recibo = readings.map(r => String(r.text || '')).find(t => /COMPROVANTE DE PAGAMENTO|PAGAMENTO (?:EFETUADO|REALIZADO)|VALOR PAGO/i.test(t));
    if (recibo) {
      const pago = recibo.match(/(?:VALOR (?:TOTAL )?PAGO|VALOR DO PAGAMENTO|TOTAL PAGO)\s*:?\s*(?:R\$)?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i) || recibo.match(/R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/);
      const num = pago ? +pago[1].replace(/\./g, '').replace(',', '.') : null;
      if (valor) campos['Valor do boleto'] = L.texto.formatBRL(valor);
      return { valor: num, campos, itens: null, semTexto: true,
        status: num === valor ? 'Valor conferido pelo código do boleto' : 'Valor pago, lido do comprovante (o do boleto está abaixo)' };
    }
    return { valor: valor || null, campos, itens, status: 'Valor conferido pelo código do boleto' };
  }

  L.registrarLeitor({
    id: 'boleto',
    vitais: ['Valor'],
    palavras: /VALOR DO DOCUMENTO|VALOR COBRADO|\(=\)|VALOR/,
    ignorar: /MORA|MULTA|JUROS|DESCONTO|ABATIMENTO|DEDU[CÇ]|ACR[EÉ]SCIMO|ATUALIZA/,
    achar, exato
  });
})(window.Leitura);
