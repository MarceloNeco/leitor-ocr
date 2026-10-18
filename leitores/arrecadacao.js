/* leitores/arrecadacao.js — conta de consumo, imposto e multa pagos pelo
   código de arrecadação (48 números, começa com 8: luz, água, gás, telefone,
   IPTU, DARF, multa). O valor está dentro do código, conferido pelos dígitos
   verificadores; número lido errado não fecha a conta e o valor fica vazio.
   O vencimento não está no código: vem do texto, quando a coluna dele é clara.
   Sem o código, o valor não é tirado do texto (a conta de luz e a de gás têm
   muitos valores soltos): a tela mostra os valores lidos para a pessoa tocar. */
(function (L) {
  'use strict';
  // O 2º número diz de quem é a conta
  const SEGMENTOS = { 1: ['imposto', 'Prefeitura'], 2: ['consumo', 'Água e saneamento'], 3: ['consumo', 'Energia elétrica e gás'],
    4: ['consumo', 'Telefone e internet'], 5: ['imposto', 'Órgão do governo'], 7: ['multa', 'Multa de trânsito'] };

  function mod10(s) {
    let soma = 0, peso = 2;
    for (let i = s.length - 1; i >= 0; i--) { const p = +s[i] * peso; soma += p > 9 ? p - 9 : p; peso = peso === 2 ? 1 : 2; }
    return (10 - soma % 10) % 10;
  }
  function mod11(s) {
    let soma = 0, peso = 2;
    for (let i = s.length - 1; i >= 0; i--) { soma += +s[i] * peso; peso = peso === 9 ? 2 : peso + 1; }
    const r = soma % 11;
    return r === 0 || r === 1 ? 0 : 11 - r;
  }
  // O 3º número diz a conta dos dígitos: 6 e 7 módulo 10, 8 e 9 módulo 11
  const dv = (b, s) => (b[2] === '6' || b[2] === '7' ? mod10 : mod11)(s);

  // Código de barras (44 números) que confere, ou null
  const barrasOk = b => b.length === 44 && b[0] === '8' && '6789'.includes(b[2]) && dv(b, b.slice(0, 3) + b.slice(4)) === +b[3] ? b : null;

  // Linha de 48 números (4 blocos de 11 com o dígito de cada um) → código de barras
  function daLinha(l) {
    if (l[0] !== '8' || !'6789'.includes(l[2])) return null;
    for (let k = 0; k < 4; k++) if (dv(l, l.slice(k * 12, k * 12 + 11)) !== +l[k * 12 + 11]) return null;
    return barrasOk([0, 1, 2, 3].map(k => l.slice(k * 12, k * 12 + 11)).join(''));
  }

  function achar(texto, codes) {
    for (const c of codes || []) { const b = barrasOk(String(c.text || '').replace(/\D/g, '')); if (b) return b; }
    for (const linha of String(texto || '').split('\n')) {
      const d = linha.replace(/\D/g, '');
      for (let i = 0; i + 48 <= d.length; i++) { const b = daLinha(d.slice(i, i + 48)); if (b) return b; }
    }
    for (const m of String(texto || '').matchAll(/(^|\D)(8\d{43})(?!\d)/g)) { const b = barrasOk(m[2]); if (b) return b; }
    return null;
  }

  // O tipo do documento pelo código (consumo, imposto ou multa), ou null
  const tipoDe = b => (SEGMENTOS[b[1]] || [])[0] || null;

  // "DATA DE EMISSÃO: ... DATA DE VENCIMENTO: VALOR:" numa linha e os valores na
  // de baixo: o vencimento é o da mesma coluna, quando as colunas batem
  function vencimento(texto) {
    const linhas = String(texto || '').split('\n');
    for (let i = 0; i < linhas.length - 1; i++) {
      const m = linhas[i].match(/VENCIMENTO\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
      if (m) return m[1];
      if (!/VENCIMENTO\s*:/i.test(linhas[i])) continue;
      const rotulos = linhas[i].split(':').map(t => t.trim()).filter(Boolean);
      const valores = linhas[i + 1].trim().split(/\s+/).filter(t => !/^R\$$/i.test(t));
      const k = rotulos.findIndex(r => /VENCIMENTO/i.test(r));
      if (rotulos.length === valores.length && /^\d{2}\/\d{2}\/\d{4}$/.test(valores[k])) return valores[k];
    }
    return '';
  }

  function exato(readings, codes) {
    let b = null;
    for (const r of readings) if ((b = achar(r.text, codes))) break;
    if (!b && codes && codes.length) b = achar('', codes);
    if (!b) return null;
    const campos = { 'Código de barras': [0, 1, 2, 3].map(k => { const p = b.slice(k * 11, k * 11 + 11); return p + '-' + dv(b, p); }).join(' ') };
    if (SEGMENTOS[b[1]]) campos.Conta = SEGMENTOS[b[1]][1];
    const venc = readings.map(r => vencimento(r.text)).find(Boolean);
    if (venc) campos.Vencimento = venc;
    // 6 e 8: o código traz o valor em reais; 7 e 9 trazem outra referência
    const valor = b[2] === '6' || b[2] === '8' ? parseInt(b.slice(4, 15), 10) / 100 : 0;
    return { valor: valor || null, campos, status: 'Valor conferido pelo código de barras' };
  }

  L.registrarLeitor({
    id: 'arrecadacao',
    vitais: ['Valor'],
    soCodigo: true,
    palavras: /VALOR DO DOCUMENTO|TOTAL A PAGAR|VALOR A PAGAR|VALOR COBRADO|[TIF1]OTAL|VALOR/,
    ignorar: /MORA|MULTA|JUROS|DESCONTO|SUBTOTAL|BASE DE C[AÁ]LC|ICMS|PIS|COFINS|TARIFA|PRE[CÇ]O UNIT|M[EÉ]DIA/,
    achar, exato, tipoDe
  });
})(window.Leitura);
