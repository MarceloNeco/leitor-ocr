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
    'CNPJ',
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

  // The establishment's name: among the lines of every reading, the one the
  // engine read with confidence that looks like a business name (LTDA,
  // RESTAURANTE, POSTO...), comes after "COMPRA" (Stone) or sits next to
  // the CNPJ, and is not an address, a city, a card brand or a label.
  const ESTAB_SKIP = /VIA\s?CLIENTE|VIA DO CLIENTE|COMPROVANTE|CUPOM|DANFE|NFC-?E|DOCU|AUXILIAR|NOTA FISCAL|FISCAL|ELETR[OÔ]NIC|PROTOCOLO|CONSUMIDOR|CONSULTE|CHAVE|\bCPF\b|\bCEP\b|TELEFONE|\bTEL\b|FONE|CR[EÉ]DITO|D[EÉ]BITO|MASTERCARD|\bVISA\b|\bELO\b|AMEX|HIPERCARD|CART[AÃ]O|\bAUT\b|\bNSU\b|\bDOC\b|TERMINAL|SERIAL|\bAID\b|ARQC|VALOR|TOTAL|SUBTOTAL|TROCO|DESCONTO|\bITE[MN]|\bQTD|\bDATA\b|HORA|EMISS|PARCELA|SENHA|APROVAD|OBRIGADO|VOLTE SEMPRE|EXTRATO|RESUMO|PEDIDO|\bMESA\b|ATENDENTE|OPERADOR|\bOPE\b|CAIXA|\bPDV\b|ORDER|CASHIER|SERVER|RECEIPT|SURVEY|CHECK|GUEST|WELCOME|THANK|CUSTOMER|MERCHANT|\b(?:RUA|R\.|AV\.?|AVENIDA|ALAMEDA|AL\.|PRA[CÇ]A|ROD\.?|RODOVIA|ESTRADA|TRAVESSA|TV\.|LARGO|PKWY|PARKWAY|STREET|SUITE)\b|^\d|\b[A-Z]{3,}\/[A-Z]{2}\b|\b(?:SP|RJ|MG|RS|PR|SC|BA|PE|CE|GO|DF|ES|MT|MS|PA|AM|MA|PB|RN|PI|AL|SE|RO|TO|AC|AP|RR)\b\s*$/;
  const ESTAB_ACQUIRER = /^(?:STONE|GETNET|CIELO|REDE|PAGSEGURO|PAGBANK|INFINITEPAY|SUMUP|SAFRAPAY|MERCADO PAGO|VERO|BIN|ELAVON|GLOBAL PAYMENTS)\s*$/;
  const ESTAB_CLUE = /LTDA|\bS\.?A\.?\b|\bS\/A\b|EIRELI|\bME\b|\bEPP\b|COM[EÉ]RCIO|RESTAURANTE|LANCHONETE|LANCHES|\bBAR\b|PIZZARIA|PADARIA|CAFE|CAF[EÉ]|POSTO|FARM[AÁ]CIA|DROGARIA|SUPERMERCADO|MERCADO|VAREJ[AÃ]O|LOJA|CL[IÍ]NICA|HOSPITAL|ESTACIONAMENTO|KITCHEN|GRILL|BURGER|HOTEL|ACADEMIA|PET|ATACAD/;
  function pickEstablishment(readings) {
    let best = null;
    readings.forEach(r => {
      const lines = r.lines || [];
      lines.forEach((l, i) => {
        let text = l.text.toUpperCase();
        let score = l.conf / 25;                     // 0 a 4
        if (/CNPJ|\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}/.test(text)) {
          text = text.replace(/\s*[-:]*\s*CNPJ.*$/, '').replace(/\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}/, '');
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
        if (ESTAB_CLUE.test(text)) score += 2;
        const near = [lines[i + 1], lines[i + 2], lines[i - 1]].filter(Boolean).map(x => x.text.toUpperCase());
        if (near.some(x => /CNPJ|\d{2}\.\d{3}\.\d{3}\/\d{4}/.test(x))) score += 1.5;
        if (i < 8) score += 1;
        if (tokens.length === 1 && text.length < 6) score -= 1;
        if (!best || score > best.score) best = { text, score };
      });
    });
    return best ? best.text : '';
  }

  // Guesses the document type from the words that give it away
  function detectDocType(readings) {
    const text = readings.map(r => r.text).join('\n').toUpperCase();
    // A card bill talks about card, credit and debit all the time, like a
    // card slip, but no slip says "pagamento mínimo" or "total da fatura":
    // with many signs of a bill, it is a bill (and has no single amount)
    if ((text.match(L.catalogo.tipo('fatura').sinais) || []).length >= 6) return 'fatura';
    // A bank slip's code line has check digits: one that checks out is a boleto
    if (L.leitores.boleto && readings.some(r => L.leitores.boleto.achar(r.text))) return 'boleto';
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
  function buildResult(readings, tipo, codes, tilt) {
    const def = L.tipo(tipo);
    const expectsValue = def.vitais.includes('Valor');
    const parsed = readings.map(r => parseDocument(r.text, tipo));
    // A value carried by a code with check digits (boleto) is exact and wins
    const codigo = def.exato ? def.exato(readings, codes) : null;
    const valor = codigo && codigo.valor ? codigo.valor : expectsValue ? agreedValue(readings, tipo) : null;
    const candidates = expectsValue && valor === null
      ? [...new Set(parsed.map(p => p.candidatos[0] ? p.candidatos[0].num : null).filter(n => n !== null))]
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
    else if (valor !== null) status = { cls: 'ok', text: codigo && codigo.valor ? codigo.status : readings[0].exato ? 'Valor lido do arquivo' : 'Valor confirmado em 2 leituras' };
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
      tipo, detected, sinais, valor, candidates, textKind, tilt, codes: codes || [],
      readings: readings.map((r, i) => ({ text: r.text, conf: r.conf, words: r.words.length, good: goodWords(r), rot: r.rot, bin: r.bin, size: r.size, region: r.region, candidatos: parsed[i].candidatos }))
    };

    return { fields, tipo, expectsValue, valor, candidates, status, hint, textKind, far, debug };
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

  L.texto = { CAMPOS: ORDERED_FIELD_KEYS, parseDocument, findMoney, parseChave, pickEstablishment, detectDocType, mostCommon, agreedValue, goodWords, classifyTextKind, formatBRL, buildResult };
})(window.Leitura);
