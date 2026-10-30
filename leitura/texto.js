/* =====================================================================
   leitura/texto.js — entender o texto lido: valor, data, hora, CNPJ, chave da
   nota, estabelecimento, que tipo de documento é, e o resultado de cada papel.
   Vale para texto de foto (OCR) e para texto de arquivo (PDF, TXT, DOCX).
   O que é próprio de um tipo fica no leitor dele (pasta leitores/).
   ===================================================================== */
(function (L) {
  'use strict';

  // Ordered fields specification
  const ORDERED_FIELD_KEYS = [
    'Estabelecimento',
    'Razão social',
    'CNPJ',
    'Categoria',
    'Atividade',
    'Nota',
    'Valor',
    'Vencimento',
    'Data',
    'Hora',
    'Bandeira',
    'Cartão',
    'Modalidade',
    'Terminal',
    'NSU/DOC',
    'Autorização',
    'AID',
    'Via'
  ];

  // The access key of a nota fiscal (NF-e/NFC-e): 44 digits in groups of 4,
  // with a check digit (modulo 11) that tells a correct reading from a
  // wrong one. It carries the issuer's CNPJ, the month of issue and the
  // number of the nota.
  function parseChave(text) {
    const re = /(?:\d{4}[\s|.-]{0,3}){10}\d{4}/g;
    let m;
    while ((m = re.exec(text || '')) !== null) {
      const digits = m[0].replace(/\D/g, '');
      if (digits.length !== 44) continue;
      let sum = 0, w = 2;
      for (let i = 42; i >= 0; i--) { sum += +digits[i] * w; w = w === 9 ? 2 : w + 1; }
      const dv = (11 - (sum % 11)) % 11;
      if (dv > 9 || dv !== +digits[43]) continue;
      const modelo = digits.slice(20, 22);
      if (modelo !== '55' && modelo !== '65') continue;
      const c = digits.slice(6, 20);
      return {
        chave: digits,
        cnpj: `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`,
        ano: '20' + digits.slice(2, 4), mes: digits.slice(4, 6),
        numero: String(+digits.slice(25, 34)), modelo
      };
    }
    return null;
  }

  // The QR code of a nota fiscal is the address of its page at the state
  // tax office (Sefaz): the app can open it for the person to check the
  // nota. Only official addresses (.gov.br): never any address printed on
  // a paper. Returns the address, or null.
  function linkSefaz(texto) {
    try {
      const u = new URL(String(texto || '').trim());
      return /^https?:$/.test(u.protocol) && /\.gov\.br$/.test(u.hostname) ? u.href : null;
    } catch (e) { return null; }
  }

  // The establishment's name: among the lines of every reading, the one the
  // engine read with confidence that looks like a business name (LTDA,
  // RESTAURANTE, POSTO...), comes after "COMPRA" (Stone) or sits next to
  // the CNPJ, and is not an address, a city, a card brand or a label.
  const ESTAB_SKIP = /VIA\s?CLIENTE|VIA DO CLIENTE|COMPROVANTE|CUPOM|DANFE|NFC-?E|DOCU|AUXILIAR|NOTA FISCAL|FISCAL|ELETR[OÔ]NIC|PROTOCOLO|CONSUMIDOR|CONSULTE|CHAVE|\bCPF\b|\bCEP\b|TELEFONE|\bTEL\b|FONE|CR[EÉ]DITO|D[EÉ]BITO|MASTERCARD|\bVISA\b|\bELO\b|AMEX|HIPERCARD|CART[AÃ]O|\bAUT\b|\bNSU\b|\bDOC\b|TERMINAL|SERIAL|\bAID\b|ARQC|VALOR|TOTAL|SUBTOTAL|TROCO|DESCONTO|\bITE[MN]|\bQTD|\bDATA\b|HORA|EMISS|PARCELA|SENHA|APROVAD|OBRIGADO|VOLTE SEMPRE|EXTRATO|RESUMO|PEDIDO|\bMESA\b|ATENDENTE|OPERADOR|\bOPE\b|CAIXA|\bPDV\b|ORDER|CASHIER|SERVER|RECEIPT|SURVEY|CHECK|GUEST|IMPRESS[AÃ]O|PARA CONTROLE|CONFER[EÊ]NCIA|DETALHES DA VENDA|WELCOME|THANK|CUSTOMER|MERCHANT|\b(?:RUA|R\.|AV\.?|AVENIDA|ALAMEDA|AL\.|PRA[CÇ]A|ROD\.?|RODOVIA|ESTRADA|TRAVESSA|TV\.|LARGO|PKWY|PARKWAY|STREET|SUITE)\b|^\d|\b[A-Z]{3,}\/[A-Z]{2}\b|\b(?:SP|RJ|MG|RS|PR|SC|BA|PE|CE|GO|DF|ES|MT|MS|PA|AM|MA|PB|RN|PI|AL|SE|RO|TO|AC|AP|RR)\b\s*$/;
  const ESTAB_ACQUIRER = /^(?:STONE|GETNET|CIELO|REDE|PAGSEGURO|PAGBANK|INFINITEPAY|SUMUP|SAFRAPAY|MERCADO PAGO|VERO|BIN|ELAVON|GLOBAL PAYMENTS|LARANJINHA(?: ITA[UÚ])?|TON|ALTEC)\s*$/;
  // The legal name has the company type: SA, LTDA, CIA, EIRELI, ME
  const ESTAB_LEGAL = /\bLTDA\b|\bS\.?\/?A\.?(?=\s|$)|\bCIA\b|COMPANHIA|EIRELI|\bME\b|\bEPP\b/;
  // Address, city, ZIP and phone lines: the neighborhood (bairro) of the store
  // shows up again inside them ("JARDIM EXEMPLO, CIDADE - SP")
  const ESTAB_ENDERECO = /\b(?:RUA|R\.|AV\.?|AVENIDA|ALAMEDA|AL\.|PRA[CÇ]A|ROD\.?|RODOVIA|ESTRADA|TRAVESSA)\b|\bCEP\b|\d{5}-?\d{3}|[,-]\s*(?:SP|RJ|MG|RS|PR|SC|BA|PE|CE|GO|DF|ES|MT|MS|PA|AM|MA|PB|RN|PI|AL|SE|RO|TO|AC|AP|RR)\b\s*$|\b[A-Z]{3,}\/[A-Z]{2}\b/;
  const ESTAB_CLUE = /LTDA|\bS\.?A\.?\b|\bS\/A\b|\bCIA\b|COMPANHIA|EIRELI|\bME\b|\bEPP\b|COM[EÉ]RCIO|RESTAURANTE|LANCHONETE|LANCHES|\bBAR\b|PIZZARIA|PADARIA|CAFE|CAF[EÉ]|POSTO|FARM[AÁ]CIA|DROGARIA|SUPERMERCADO|MERCADO|VAREJ[AÃ]O|LOJA|CL[IÍ]NICA|HOSPITAL|ESTACIONAMENTO|KITCHEN|GRILL|BURGER|HOTEL|ACADEMIA|PET|ATACAD/;
  // The establishment: the first line at the top that is not address,
  // neighborhood, city, ZIP, phone or CNPJ; a line with the company type (SA,
  // LTDA, CIA, EIRELI, ME) wins. The OCR confidence weighs in, because the
  // first line of a photo is often the border of the paper or the table.
  function pickEstablishment(readings) {
    const cands = [];
    readings.forEach(r => {
      const lines = r.lines || [];
      const enderecos = lines.map(l => l.text.toUpperCase()).filter(t => ESTAB_ENDERECO.test(t)).map(t => t.replace(/[^A-ZÀ-Ú]/g, ''));
      let rank = 0;
      lines.forEach((l, i) => {
        let text = l.text.toUpperCase();
        let score = l.conf / 25;                     // 0 a 4
        if (/CNPJ|\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}/.test(text)) {
          text = text.replace(/[\s.:-]*C\s?N\s?P\S*.*$/, '').replace(/\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}/, '')   // "CNPI", "CNP)": a foto lê o J errado
            .replace(/^(?:[^A-ZÀ-Ú\s]\s+)+/, '');   // the paper's edge read as "2 " or "= " before the name
          score += 1.5;
        }
        text = text.replace(/^[^A-ZÀ-Ú0-9]+|[^A-ZÀ-Ú0-9.&)]+$/g, '').replace(/\s+[\d\s#\-]+$/, '');
        if (/\d+[.,]\d{2}\b/.test(text)) return;   // a price: an item line, not a name
        const m = text.match(/^(?:COMPRA|ESTABELECIMENTO|LOJA)\s*[:\-]?\s+(.{3,})$/);
        if (m) { text = m[1]; score += 2; }
        const letters = (text.match(/[A-ZÀ-Ú]/g) || []).length;
        if (text.length < 4 || text.length > 48 || letters < 0.6 * text.length) return;
        const tokens = text.split(/\s+/);
        const wordy = tokens.filter(t => /^[A-ZÀ-Ú&.'-]{2,}$/.test(t) && /[AEIOUÀ-Ú]/.test(t)).length;
        if (wordy < Math.max(1, Math.ceil(tokens.length * 0.6))) return;   // mostly garbage
        if (ESTAB_SKIP.test(text) || ESTAB_ACQUIRER.test(text)) return;
        const so = text.replace(/[^A-ZÀ-Ú]/g, '');
        if (!ESTAB_LEGAL.test(text) && enderecos.some(e => e !== so && so.length >= 6 && e.includes(so))) return;   // the neighborhood
        if (ESTAB_CLUE.test(text)) score += 2;
        if (ESTAB_LEGAL.test(text)) score += 2;
        if (i < 12 && l.conf >= 60) score += Math.max(0, 2 - rank++);   // the first lines at the top (read with confidence: the top of a photo is often the table)
        const near = [lines[i + 1], lines[i + 2], lines[i - 1]].filter(Boolean).map(x => x.text.toUpperCase());
        if (near.some(x => /CNPJ|\d{2}\.\d{3}\.\d{3}\/\d{4}/.test(x))) score += 1.5;
        if (i < 8) score += 1;
        if (tokens.length === 1 && text.length < 6) score -= 1;
        cands.push({ text, score });
      });
    });
    const best = cands.reduce((b, c) => !b || c.score > b.score ? c : b, null);
    if (!best) return '';
    // A letter lost at the paper's edge in one reading ("ADARIA" for "PADARIA"):
    // the other reading's whole word wins
    const inteiro = cands.find(c => c.text.length > best.text.length && c.text.length <= best.text.length + 2 &&
      c.text.endsWith(best.text) && /^[A-ZÀ-Ú]+$/.test(c.text.slice(0, c.text.length - best.text.length)));
    return (inteiro || best).text;
  }

  // Guesses the document type from the words that give it away. A paper
  // with an amount in big letters read on its own (grandes) is a money
  // paper even when few of its words were read: the money reader with the
  // most signs, or a card slip.
  function detectDocType(readings, grandes = []) {
    const text = readings.map(r => r.text).join('\n').toUpperCase();
    if (valorGrande(grandes, 3)) {
      const dinheiro = ['cartao', 'conta', 'nfce'].filter(k => L.leitores[k]);
      const sinais = dinheiro.map(k => (text.match(L.leitores[k].sinais) || []).length);
      const melhor = dinheiro[sinais.indexOf(Math.max(...sinais))];
      if (sinais.some(n => n > 0) && detectDocType(readings) === 'livre') return melhor;
    }
    // A bank slip's code line has check digits: one that checks out is a
    // boleto, even on a page that also has the condo's report or the bill
    if (L.leitores.boleto && readings.some(r => L.leitores.boleto.achar(r.text))) return 'boleto';
    // The same for the collection code of utility bills, taxes and fines (48
    // digits starting with 8): its 2nd digit says which of them it is
    const arrecadacao = L.leitores.arrecadacao && readings.map(r => L.leitores.arrecadacao.achar(r.text)).find(Boolean);
    if (arrecadacao && L.leitores.arrecadacao.tipoDe(arrecadacao)) return L.leitores.arrecadacao.tipoDe(arrecadacao);
    // A card bill or a condo's financial report talks about credit and debit
    // all the time, like a card slip, but no slip says "pagamento mínimo" or
    // "posição financeira": with 6 or more of their own signs, they come
    // before the money readers (and have no single amount)
    let forte = null, forteScore = 5;
    L.catalogo.comSinais().forEach(t => {
      const score = t.forte ? (text.match(t.sinais) || []).length : 0;
      if (score > forteScore) { forte = t.id; forteScore = score; }
    });
    if (forte) return forte;
    let best = 'livre', bestScore = 2;   // fewer than 3 signs: free text
    L.detectaveis().forEach(key => {
      const score = (text.match(L.leitores[key].sinais) || []).length;
      if (score > bestScore) { best = key; bestScore = score; }
    });
    if (best !== 'livre') return best;
    // No money reader recognized the paper (they come first, because they
    // read the amount): the other types of the catalog by their own signs, so
    // the category is found even before each type has its own reader
    L.catalogo.comSinais().forEach(t => {
      const score = (text.match(t.sinais) || []).length;
      if (score > bestScore) { best = t.id; bestScore = score; }
    });
    return best;
  }

  // Among all readings, the value most often read for a field (Data, Hora)
  function mostCommon(parsed, key, fallback) {
    const counts = {};
    parsed.forEach(p => { const f = p.fields.find(x => x.key === key); if (f) counts[f.val] = (counts[f.val] || 0) + 1; });
    const keys = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    return keys.length && (!fallback || counts[keys[0]] > counts[fallback]) ? keys[0] : fallback;
  }

  // The amount two differently processed readings agree on, or null. Two
  // readings of the same crop at the same size and rotation make the same
  // mistakes, so they do not confirm each other.
  function agreedValue(readings, tipo) {
    const bests = readings.map(r => { const c = parseDocument(r.text, tipo).candidatos[0]; return c ? c.num : null; });
    // Text that came from a file (PDF with text, TXT, DOCX) is exact: there is
    // no reading mistake to rule out, so one reading is enough
    if (readings.length === 1 && readings[0].exato) return bests[0];
    for (let i = 0; i < readings.length; i++) {
      if (bests[i] === null) continue;
      for (let j = i + 1; j < readings.length; j++) {
        if (bests[j] !== bests[i]) continue;
        const a = readings[i], b = readings[j];
        if (a.size !== b.size || a.bin !== b.bin || a.rot !== b.rot || a.size === undefined) return bests[i];
      }
    }
    return null;
  }

  // The band of big digits (lerValorGrande in foto.js) read the same amount
  // at most of the four sizes, with confidence, and no reading of it was
  // doubtful (two alike symbols as different digits): an amount to trust
  // on its own. Read at two sizes only, it still counts to contest the
  // regular readings (see decidirValor).
  const valorGrande = (grandes, vezes) => {
    const [top, segundo] = grandes.slice().sort((a, b) => b.vezes - a.vezes || b.conf - a.conf);
    return top && top.vezes >= vezes && top.conf >= (vezes >= 3 ? 65 : 60) && !top.duvida && (!segundo || segundo.vezes < top.vezes) ? top : null;
  };

  // The amount of the paper: what two regular readings agree on
  // (agreedValue) and what the band of big digits says, put together. When
  // the regular readings read nothing, the band is the amount if read the
  // same at three sizes or more (two sizes agreeing read 198,18 on a slip
  // of 190,10). When the two disagree (23,09 in the regular readings, 23,00
  // in the band), nothing is decided and both are offered: empty beats
  // wrong. Returns { valor, fonte ('leituras' | 'grande' | null) }.
  function decidirValor(readings, tipo, grandes = []) {
    const regular = agreedValue(readings, tipo);
    const forte = valorGrande(grandes, 3), fraco = valorGrande(grandes, 2);
    if (regular !== null) return !fraco || fraco.valor === regular ? { valor: regular, fonte: 'leituras' } : { valor: null, fonte: null };
    return forte ? { valor: forte.valor, fonte: 'grande' } : { valor: null, fonte: null };
  }

  // How many words the engine read with confidence: the measure of a
  // reading being right side up
  function goodWords(reading) {
    return (reading.words || []).filter(w => w.confidence >= 60 && w.text && w.text.replace(/[^0-9A-Za-zÀ-ÿ]/g, '').length >= 3).length;
  }

  // Printed text comes out as confident, word-like tokens; handwriting
  // comes out as low-confidence gibberish. This only labels the photo,
  // the person confirms.
  function classifyTextKind(words) {
    const ws = (words || []).filter(w => w.text && w.text.replace(/[^0-9A-Za-zÀ-ÿ]/g, '').length >= 3);
    if (ws.length < 5) return { label: 'Pouco texto', good: 0 };
    const good = ws.filter(w => w.confidence >= 70).length / ws.length;
    const pct = Math.round(good * 100);
    if (good >= 0.6) return { label: 'Texto impresso', good: pct };
    if (good <= 0.3) return { label: 'Parece escrito à mão ou apagado', good: pct };
    return { label: 'Impresso com partes à mão ou apagadas', good: pct };
  }

  function formatBRL(num) {
    return 'R$ ' + num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Decides the final result from the readings of one photo: the amount
  // only when two readings agree, otherwise the candidates are offered as
  // buttons; every other field comes from the best reading.
  // Decides the result of one paper from its readings: the amount only
  // when two readings agree, otherwise the candidates are offered as
  // buttons; every other field comes from the best reading. Returns the
  // result object that renderFieldsEditor shows.
  function buildResult(readings, tipo, codes, tilt, grandes = []) {
    const def = L.tipo(tipo);
    const expectsValue = def.vitais.includes('Valor');
    const parsed = readings.map(r => parseDocument(r.text, tipo));
    // A value carried by a code with check digits (boleto) is exact and wins
    const codigo = def.exato ? def.exato(readings, codes) : null;
    const decidido = expectsValue && !def.soCodigo && !(codigo && codigo.semTexto) ? decidirValor(readings, tipo, grandes) : { valor: null, fonte: null };
    const valor = codigo && codigo.valor ? codigo.valor : decidido.valor;
    // the amounts to offer as buttons: the first of each reading, and the big digits read with confidence
    const candidates = expectsValue && valor === null
      ? [...new Set(parsed.map(p => p.candidatos[0] ? p.candidatos[0].num : null).concat(grandes.filter(g => g.conf >= 60).map(g => g.valor)).filter(n => n !== null))]
      : [];

    // The other fields come from the reading that found the agreed amount,
    // or from the most confident one
    let bestIdx = 0;
    readings.forEach((r, i) => {
      const has = valor !== null && parsed[i].candidatos.some(c => c.num === valor);
      const bestHas = valor !== null && parsed[bestIdx].candidatos.some(c => c.num === valor);
      if ((has && !bestHas) || (has === bestHas && r.conf > readings[bestIdx].conf)) bestIdx = i;
    });
    const fields = parsed[bestIdx].fields.slice();
    let estabelecimento = null;
    (codes || []).forEach(c => {
      fields.push(c.format === 'QR_CODE' ? { key: 'QR code', val: c.text } : { key: 'Código de barras', val: `${c.text} (${c.format.replace(/_/g, ' ')})` });
    });
    if (def.palavras) {
      const chave = readings.map(r => parseChave(r.text)).find(Boolean) || (codes || []).map(c => parseChave(c.text)).find(Boolean);
      if (chave) {
        const set = (key, val) => { const f = fields.find(x => x.key === key); if (f) f.val = val; else fields.push({ key, val }); };
        set('CNPJ', chave.cnpj);
        set('Nota', chave.numero);
        set('Chave', chave.chave);
        // the key says the month of issue: keep a date only if it agrees
        const ok = d => d && d.slice(3, 5) === chave.mes && d.slice(6) === chave.ano;
        const f = fields.find(x => x.key === 'Data');
        if (f && !ok(f.val)) {
          const alt = parsed.flatMap(p => p.fields.filter(x => x.key === 'Data').map(x => x.val)).find(ok);
          if (alt) f.val = alt; else fields.splice(fields.indexOf(f), 1);
        }
      }
      const estab = pickEstablishment(readings);
      const f = fields.find(x => x.key === 'Estabelecimento');
      if (estab && f) f.val = estab;
      else if (estab) fields.unshift({ key: 'Estabelecimento', val: estab });
      else if (f) fields.splice(fields.indexOf(f), 1);
      // The CNPJ (checked by its digits) says the chain: the name people know
      // (nome fantasia) and the category; the legal name gets its own field
      if (L.estabelecimento) {
        const cnpjF = fields.find(x => x.key === 'CNPJ');
        const cnpj = [cnpjF && cnpjF.val].concat(readings.flatMap(r => String(r.text || '').match(/\d{2}[.\s]{0,2}\d{3}[.\s]{0,2}\d{3}\s?\/\s?\d{4}\s?-?\s?\d{2}/g) || [])).find(c => L.cnpjValido(c));
        const e = L.estabelecimento({ razao: estab, cnpj, cabecalho: String(readings[0].text || '').split('\n').slice(0, 8).join(' ') });
        if (e.razao || e.cnpj) {
          estabelecimento = e;
          const ef = fields.find(x => x.key === 'Estabelecimento');
          const nome = e.fantasia || e.razao;
          if (ef) ef.val = nome; else if (nome) fields.unshift({ key: 'Estabelecimento', val: nome });
          const depois = (key, val) => { const at = fields.findIndex(x => ORDERED_FIELD_KEYS.indexOf(x.key) > ORDERED_FIELD_KEYS.indexOf(key)); fields.splice(at === -1 ? fields.length : at, 0, { key, val }); };
          if (e.fantasia && e.razao && e.fantasia !== e.razao) depois('Razão social', e.razao);
          if (e.cnpj) { if (cnpjF) cnpjF.val = e.cnpj; else depois('CNPJ', e.cnpj); }
          if (e.categoria) depois('Categoria', e.categoria);
          else if (e.atividade) depois('Atividade', e.atividade);
        }
      }
    }
    ['Data', 'Hora'].forEach(key => {
      const f = fields.find(x => x.key === key);
      const common = mostCommon(parsed, key, f ? f.val : null);
      if (common && f) f.val = common;
      else if (common) fields.push({ key, val: common });
    });
    // Fields that came with the code (due date, bank) are exact too
    if (codigo) Object.entries(codigo.campos).forEach(([key, val]) => {
      const f = fields.find(x => x.key === key);
      if (f) { f.val = val; return; }
      const at = ORDERED_FIELD_KEYS.includes(key) ? fields.findIndex(x => ORDERED_FIELD_KEYS.indexOf(x.key) > ORDERED_FIELD_KEYS.indexOf(key)) : -1;
      fields.splice(at === -1 ? fields.length : at, 0, { key, val });
    });
    if (valor !== null) {
      const at = fields.findIndex(f => ORDERED_FIELD_KEYS.indexOf(f.key) > ORDERED_FIELD_KEYS.indexOf('Valor'));
      fields.splice(at === -1 ? fields.length : at, 0, { key: 'Valor', val: formatBRL(valor) });
    }

    let status;
    if (!expectsValue) status = { cls: 'neutral', text: 'Texto lido' };
    else if (valor !== null) status = { cls: 'ok', text: codigo && codigo.valor ? codigo.status : readings[0].exato ? 'Valor lido do arquivo' : decidido.fonte === 'grande' ? 'Valor em letra grande, confirmado em 2 leituras' : 'Valor confirmado em 2 leituras' };
    else if (candidates.length) status = { cls: 'warn', text: 'Valor incerto: confira' };
    else status = { cls: 'bad', text: 'Valor não lido' };

    // Suggest another type when the text looks like something else
    const detected = detectDocType(readings);
    const hint = (detected !== tipo && detected !== 'livre') ? detected : null;
    const textKind = readings[bestIdx].exato ? { label: 'Texto do arquivo (sem foto)', good: 100 } : classifyTextKind(readings[bestIdx].words);
    const far = readings.every(r => goodWords(r) < 8) && readings.some(r => r.region && r.frame && r.region.cw < 0.4 * r.frame.width);

    // Debug info for the console and the test script (testes/medir.js)
    const allText = readings.map(r => r.text).join('\n').toUpperCase();
    const sinais = {};
    L.detectaveis().forEach(k => { sinais[k] = (allText.match(L.leitores[k].sinais) || []).length; });
    const debug = {
      tipo, detected, sinais, valor, candidates, textKind, tilt, grandes, codes: codes || [],
      readings: readings.map((r, i) => ({ text: r.text, conf: r.conf, words: r.words.length, good: goodWords(r), rot: r.rot, bin: r.bin, size: r.size, region: r.region, candidatos: parsed[i].candidatos }))
    };

    const r = { fields, tipo, expectsValue, valor, candidates, status, hint, textKind, far, debug };
    if (estabelecimento) r.estabelecimento = estabelecimento;
    const sefaz = (codes || []).map(c => c.format === 'QR_CODE' ? linkSefaz(c.text) : null).find(Boolean);
    if (sefaz) r.sefaz = sefaz;
    // The products of the receipt: detail of the one amount, not transactions
    const prod = def.produtos ? def.produtos(readings) : null;
    if (prod) Object.assign(r, { produtos: prod.produtos, produtosConferido: prod.conferido, produtosDiferenca: prod.diferenca !== null ? prod.diferenca / 100 : undefined });
    // the parts of the amount (boleto), in the same format as every transaction
    if (codigo && codigo.itens) r.itens = codigo.itens.map(i => L.leitores.extrato.contrato(i, { tipo, conferido: true, papel: '' }));
    return r;
  }

  function parseDocument(rawText, tipo) {
    const def = L.tipo(tipo);
    const textUpper = (rawText || '').toUpperCase();
    const lines = textUpper.split('\n').map(l => l.trim()).filter(Boolean);

    const fieldsMap = {};

    // 1. CNPJ: \d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2} -> 00.000.000/0000-00
    const cnpjMatch = textUpper.match(/\b(\d{2})[\.\s]?(\d{3})[\.\s]?(\d{3})[\/\s]?(\d{4})[-\s]?(\d{2})\b/);
    if (cnpjMatch) {
      fieldsMap['CNPJ'] = `${cnpjMatch[1]}.${cnpjMatch[2]}.${cnpjMatch[3]}/${cnpjMatch[4]}-${cnpjMatch[5]}`;
    }

    // 2. Valor: candidates ranked by findMoney; which one is shown is
    // decided by agreedValue, when two readings agree
    const candidatos = def.vitais.includes('Valor') ? findMoney(lines, def) : [];

    // 3. Data: dd/mm/aaaa ou dd/mm/aa, only real dates; the most repeated wins
    const dates = {};
    const dateRe = /\b(\d{2})[\/\.-](\d{2})[\/\.-](\d{2,4})\b/g;
    let dm;
    while ((dm = dateRe.exec(textUpper)) !== null) {
      let yr = dm[3];
      if (yr.length === 3) continue;
      if (yr.length === 2) yr = '20' + yr;
      const d = +dm[1], mo = +dm[2], y = +yr;
      const minYear = def.vitais.includes('Valor') ? 2010 : 1900;
      if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < minYear || y > new Date().getFullYear() + 1) continue;
      const key = `${dm[1]}/${dm[2]}/${yr}`;
      const lineStart = textUpper.lastIndexOf('\n', dm.index) + 1;
      const line = textUpper.slice(lineStart, textUpper.indexOf('\n', dm.index) === -1 ? undefined : textUpper.indexOf('\n', dm.index));
      dates[key] = (dates[key] || 0) + (/EMISS|\bDATA\b|COMPRA|VENDA|PAGAMENTO/.test(line) ? 2 : 1);
    }
    const dateKeys = Object.keys(dates).sort((a, b) => dates[b] - dates[a]);
    if (dateKeys.length) fieldsMap['Data'] = dateKeys[0];

    // 4. Hora: hh:mm ou 14H26, preferably on the same line as the date
    const timeRe = /\b([01]?\d|2[0-3])[:Hh]([0-5]\d)\b/;
    const dateLine = fieldsMap['Data'] ? lines.find(l => l.includes(fieldsMap['Data'].slice(0, 5))) : null;
    const timeMatch = (dateLine && dateLine.match(timeRe)) || textUpper.match(timeRe);
    if (timeMatch) fieldsMap['Hora'] = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;

    // Fields only this type has (leitores/<tipo>.js)
    if (def.campos) def.campos(textUpper, fieldsMap);

    if (def.palavras) {
      // 12. Estabelecimento: line after ESTABELECIMENTO, or first containing S.A./LTDA/COMERCIO/RESTAURANTE/POSTO/LOJA
      let estab = '';
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('ESTABELECIMENTO') && lines[i + 1]) {
          estab = lines[i + 1];
          break;
        }
      }
      if (!estab) {
        for (const line of lines) {
          if (/(?:S\.A\.|LTDA|COMERCIO|COMÉRCIO|RESTAURANTE|POSTO|LOJA|DROGARIA|FARMACIA|PADARIA)/.test(line)) {
            estab = line;
            break;
          }
        }
      }
      if (!estab && lines.length > 0) {
        estab = lines[0];
      }
      if (estab) {
        fieldsMap['Estabelecimento'] = estab.replace(/CNPJ.*$/, '').trim();
      }
    } else {
      // Free text: everything that was read, to be kept as is
      fieldsMap['Texto'] = (rawText || '').trim();
    }

    // Order fields according to prompt specification
    const orderedResult = [];
    ORDERED_FIELD_KEYS.forEach(key => {
      if (fieldsMap[key]) {
        orderedResult.push({ key, val: fieldsMap[key] });
      }
    });

    // Add any additional extracted fields not in standard order
    Object.keys(fieldsMap).forEach(key => {
      if (!ORDERED_FIELD_KEYS.includes(key)) {
        orderedResult.push({ key, val: fieldsMap[key] });
      }
    });

    return { fields: orderedResult, candidatos };
  }

  // Every money-looking number in the text, ranked. Lines that never hold
  // the amount (items, taxes, tips, change...) are skipped; "R$" and words
  // like TOTAL add points; a number seen on more than one line gets a
  // bonus. Only numbers with "R$" or a keyword can win: a bare number is
  // never shown as the amount.
  function findMoney(lines, def) {
    const seen = {};
    let lineNo = 0;
    const add = (num, score) => {
      const k = num.toFixed(2);
      if (!seen[k]) seen[k] = { num, score: 0, lines: new Set() };
      seen[k].score = Math.max(seen[k].score, score);
      seen[k].lines.add(lineNo);
    };
    lines.forEach(raw => {
      lineNo++;
      const line = raw.replace(/\b(?:R|H|K|P)\s?[$S5§&]{1,2}(?=\s*[:\d])/g, 'R$');   // R$ mal lido (RS, R5, H$...)
      if (def.ignorar && def.ignorar.test(line)) return;
      const clean = line
        .replace(/\d{2}[.,\s]?\d{3}[.,\s]?\d{3}\s?\/\s?\d{4}\s?-?\s?\d{2}/g, ' ')   // CNPJ
        .replace(/\d{1,2}\s?[\/-]\s?\d{1,2}\s?[\/-]\s?\d{2,4}/g, ' ')                // datas
        .replace(/\b\d{1,2}\s?[:H]\s?\d{2}(?:\s?:\s?\d{2})?/g, ' ')                  // horas
        .replace(/\*+\s?\d+/g, ' ');                                                 // cartão ****1234
      // "1otal" and "T0TAL" still count as TOTAL
      const keyword = def.palavras.test(clean.replace(/1/g, 'I').replace(/0/g, 'O'));
      const re = /((?:R|US)?\$\s?)?(\d{1,3}(?:[.,\s]\d{3})*|\d+)\s?[.,]\s?(\d{2})(?![\d\/])/g;
      let m, found = false;
      while ((m = re.exec(clean)) !== null) {
        const before = clean[m.index - 1];
        if (!m[1] && before && /[\d.\/-]/.test(before)) continue;
        const num = parseFloat(m[2].replace(/[.,\s]/g, '') + '.' + m[3]);
        if (!(num > 0 && num < 100000)) continue;
        found = true;
        add(num, (m[1] ? 4 : 0) + (keyword ? 3 : 0));
      }
      // "R$35096" (vírgula perdida na leitura): só vale com palavra-chave
      // na linha, e ainda precisa de outra leitura concordando
      if (!found && keyword) {
        const glued = clean.match(/R\$\s?(\d{3,7})(?![\d.,])/);
        if (glued) add(parseInt(glued[1], 10) / 100, 3);
      }
    });
    return Object.values(seen)
      .map(c => ({ num: c.num, score: c.score + (c.lines.size > 1 ? 1 : 0) }))
      .filter(c => c.score >= 3)
      .sort((a, b) => b.score - a.score || b.num - a.num);
  }

  L.texto = { CAMPOS: ORDERED_FIELD_KEYS, parseDocument, findMoney, parseChave, pickEstablishment, detectDocType, mostCommon, agreedValue, decidirValor, valorGrande, goodWords, classifyTextKind, formatBRL, buildResult, linkSefaz };
})(window.Leitura);
