/* leitores/cartao-plastico.js — a frente do cartão de crédito ou débito, pela câmera.
   Para o MoneyTRIO cadastrar um cartão com uma foto (pedido 32).

     const c = await Leitura.lerCartao(foto, { progresso, aviso });
     // c = { final: '1111', bandeira: 'Visa', nome: 'FULANO DE TAL', validade: '08/29',
     //       emissor: 'Itaú' ou null, conferido: true }   (ou null: não achei um cartão)

   foto: File, Blob, <img>, <canvas> ou ImageBitmap.

   Segurança (PCI/LGPD):
   - o número inteiro só existe na memória durante a leitura, para tirar o final, a
     bandeira (pelos primeiros dígitos) e conferir a leitura pelo dígito verificador
     (Luhn). Ele nunca é devolvido, guardado, mandado para fora nem posto em log;
   - o código de segurança (CVV) não é procurado, e o verso não é lido;
   - a foto e o texto lido não são guardados: este caminho não passa pelo histórico
     nem pelo trabalho guardado do Leitura.ler; nada vai para a internet (sem IA).
   Leitura.mascararCartoes(texto) troca, em qualquer texto, um número de cartão que
   confere (Luhn e bandeira) por "•••• •••• •••• 1111": o Leitura.ler usa isso nas
   leituras de foto, para um cartão fotografado pelo caminho comum não ficar no texto. */
(function (L) {
  'use strict';

  // ---------- número: Luhn e bandeira pelos primeiros dígitos ----------
  const luhn = s => {
    let t = 0;
    for (let i = 0; i < s.length; i++) {
      let d = s.charCodeAt(s.length - 1 - i) - 48;
      if (i % 2) { d *= 2; if (d > 9) d -= 9; }
      t += d;
    }
    return t % 10 === 0;
  };
  const entre = (s, n, a, b) => { const p = +s.slice(0, n); return p >= a && p <= b; };
  // Elo antes de Visa e Discover: parte dos cartões Elo começa com 4 ou 65
  const ELO = [[401178, 401179], [431274, 431274], [438935, 438935], [451416, 451416], [457393, 457393], [457631, 457632], [504175, 504175],
    [506699, 506778], [509000, 509999], [627780, 627780], [636297, 636297], [636368, 636368], [650031, 650033], [650035, 650051], [650405, 650439],
    [650485, 650538], [650541, 650598], [650700, 650718], [650720, 650727], [650901, 650978], [651652, 651679], [655000, 655019], [655021, 655058]];
  function bandeiraDe(n) {
    const len = n.length;
    if (len === 16 && ELO.some(([a, b]) => entre(n, 6, a, b))) return 'Elo';
    if ((len === 16 || len === 19) && (n.startsWith('606282') || /^38(41(00|40|60))/.test(n))) return 'Hipercard';
    if (len === 15 && /^3[47]/.test(n)) return 'American Express';
    if ((len === 14 || len === 16) && (/^3(6|8|0[0-5])/.test(n))) return 'Diners Club';
    if (len === 16 && (entre(n, 2, 51, 55) || entre(n, 4, 2221, 2720))) return 'Mastercard';
    if ((len === 13 || len === 16 || len === 19) && n[0] === '4') return 'Visa';
    if ((len === 16 || len === 19) && (n.startsWith('6011') || n.startsWith('65') || entre(n, 3, 644, 649))) return 'Discover';
    if ((len === 16 || len === 19) && entre(n, 4, 3528, 3589)) return 'JCB';
    return null;
  }
  const valido = n => n.length >= 13 && n.length <= 19 && luhn(n) && bandeiraDe(n) !== null;

  // Letras que o OCR troca por dígitos num grupo de números (O→0, I→1, S→5, B→8...)
  const TROCA = { O: '0', o: '0', Q: '0', D: '0', U: '0', I: '1', l: '1', '|': '1', '!': '1', i: '1', Z: '2', z: '2', S: '5', s: '5', G: '6', b: '6', B: '8', T: '7', g: '9', q: '9' };
  // Um pedaço do texto como grupo de números: pelo menos 2 dígitos e metade do pedaço,
  // letras trocadas contadas (o número do cartão aceita no máximo 2 trocas)
  function grupo(t) {
    const limpo = t.replace(/[.,:;'"`´~^()\[\]{}]/g, '');
    const dig = limpo.replace(/[^0-9]/g, '').length;
    if (dig < 2 || dig < limpo.length * 0.5) return null;
    let trocas = 0;
    const n = [...limpo].map(c => /\d/.test(c) ? c : (TROCA[c] ? (trocas++, TROCA[c]) : '')).join('');
    return n.length >= 2 ? { n, trocas } : null;
  }
  // Onde um número de cartão é dividido em blocos: 4 4 4 4, 4 6 5 (Amex), 4 6 4 (Diners), 4 4 4 4 3
  const BLOCOS = { 14: [4, 10], 15: [4, 10], 16: [4, 8, 12], 19: [4, 8, 12, 16] };
  // Os números de cartão que conferem num texto (uma linha, ou linhas seguidas): blocos
  // inteiros seguidos, do jeito que o cartão é impresso (o OCR pode grudar blocos, nunca
  // partir um), sem outro grupo de números colado na mesma linha antes ou depois, com
  // no máximo 2 letras trocadas, Luhn e bandeira conferidos
  function numerosDaLinha(texto) {
    const tk = [];
    String(texto).split('\n').forEach((l, li) => (l.match(/\S+/g) || []).forEach(t => tk.push({ li, g: grupo(t) })));
    const achados = [];
    for (let i = 0; i < tk.length; i++) {
      if (!tk[i].g || (i > 0 && tk[i - 1].g && tk[i - 1].li === tk[i].li)) continue;
      let n = '', trocas = 0;
      const cortes = [];
      for (let j = i; j < tk.length && tk[j].g; j++) {
        n += tk[j].g.n; trocas += tk[j].g.trocas;
        if (n.length > 19) break;
        cortes.push(n.length);
        const colado = tk[j + 1] && tk[j + 1].g && tk[j + 1].li === tk[j].li;
        const blocos = BLOCOS[n.length];
        if (!colado && blocos && trocas <= 2 && cortes.slice(0, -1).every(c => blocos.includes(c)) && valido(n)) achados.push(n);
      }
    }
    return achados;
  }
  L.mascararCartoes = texto => String(texto || '').split('\n').map(linha => {
    const nums = numerosDaLinha(linha);
    if (!nums.length) return linha;
    // os grupos do número saem da linha; fica só a máscara com o final
    let out = linha;
    nums.forEach(n => {
      const fim = n.slice(-4);
      let falta = n;
      out = out.replace(/\S+/g, t => {
        const g = grupo(t), d = g ? g.n : '';
        if (d.length >= 2 && falta.startsWith(d)) { falta = falta.slice(d.length); return falta.length ? '' : `•••• •••• •••• ${fim}`; }
        return t;
      }).replace(/\s{2,}/g, ' ');
    });
    return out;
  }).join('\n');

  // Uma leitura de foto do Leitura.ler (texto, linhas e palavras) com os números de cartão
  // escondidos: o texto é guardado no aparelho para retomar a leitura (trabalho guardado)
  L.mascararLeitura = r => {
    const nums = String(r.text || '').split('\n').flatMap((l, i, ls) => numerosDaLinha(l).concat(ls[i + 1] ? numerosDaLinha(l + '\n' + ls[i + 1]) : []));
    if (!nums.length) return r;
    // cada pedaço que é parte do número vira "••••" (o número pode estar partido em duas linhas)
    const parte = t => { const g = grupo(t); return g && g.n.length >= 3 && nums.some(n => n.includes(g.n)); };
    const esconde = txt => String(txt || '').replace(/\S+/g, t => parte(t) ? '•'.repeat(t.length) : t);
    r.text = esconde(r.text);
    (r.lines || []).forEach(l => { l.text = esconde(l.text); });
    (r.words || []).forEach(w => { w.text = esconde(w.text); });
    return r;
  };

  // ---------- validade, nome e emissor ----------
  const hoje = new Date(), anoHoje = hoje.getFullYear() % 100;
  function validadesDe(texto) {
    const lista = [];
    String(texto).split('\n').forEach(linha => {
      const desde = /DESDE|SINCE|FROM|MEMBRO|MEMBER/i.test(linha);
      const re = /(?:^|[^0-9])([0-9OoDQ][0-9])\s?[\/\\|-]\s?(20)?(\d{2})(?![0-9])/g;
      let m;
      while ((m = re.exec(linha))) {
        const aa = +m[3];
        let mm = m[1];
        if (!/^(0[1-9]|1[0-2])$/.test(mm)) mm = /^[9688OoDQ][1-9]$/.test(mm) ? '0' + mm[1] : null;   // "98/29": o 0 lido como 9
        if (!mm || aa < anoHoje - 6 || aa > anoHoje + 15) continue;
        lista.push({ v: `${mm}/${m[3]}`, peso: (/VAL|THRU|AT[EÉ]|EXP|VENC|GOOD/i.test(linha) ? 2 : 1) - (desde ? 3 : 0), ordem: aa * 12 + +m[1] });
      }
    });
    return lista;
  }
  const NAO_NOME = /\b(VISA|MASTER\s?CARD|MASTERCARD|ELO|AMEX|AMERICAN|EXPRESS|HIPERCARD|DINERS|DISCOVER|JCB|BANCO|BANK|CARD|CART[AÃ]O|CR[EÉ]DITO|CREDIT|D[EÉ]BITO|DEBIT|PLATINUM|GOLD|BLACK|INFINITE|SIGNATURE|NANQUIM|GRAFITE|INTERNACIONAL|INTERNATIONAL|NACIONAL|ELECTRON|MAESTRO|WORLD|ELITE|PREMIUM|PERSONNALIT[EÉ]|UNIQUE|VALID[OA]?|THRU|AT[EÉ]|DESDE|MEMBER|SINCE|M[UÚ]LTIPLO|CONTACTLESS|PREPAGO|PR[EÉ]-?PAGO|BUSINESS|EMPRESARIAL|CORPORATE|UNIVERSITY|NUBANK|ITA[UÚ]|BRADESCO|SANTANDER|CAIXA|INTER|SICREDI|SICOOB|BTG|PORTO|SEGURO|PICPAY|NEON|NEXT|ORIGINAL|SAFRA|BANRISUL|AVENUE|WILL|MERCADO|PAGO|PAGBANK|XP|C6|SMILES|LATAM|AZUL|ULTRAVIOLETA|VIRTUAL)\b/i;
  function nomesDe(res) {
    const PONTA = /^(?:VISA|MASTER\s?CARD|ELO|AMEX|HIPERCARD|DINERS)\s+|\s+(?:VISA|MASTER\s?CARD|ELO|AMEX|HIPERCARD|DINERS|AMERICAN EXPRESS)$/i;
    return (res.lines || []).map(l => ({ t: String(l.text || '').trim().replace(/\s+/g, ' ').replace(PONTA, ''), c: l.confidence || 0 }))
      .filter(l => l.c >= 55 && /^[A-ZÀ-Ý][A-ZÀ-Ý.' ]+$/.test(l.t) && !NAO_NOME.test(l.t))
      .map(l => ({ t: l.t.replace(/\s?\.$/, ''), c: l.c }))
      .filter(l => { const ws = l.t.split(' ').filter(w => w.length); return ws.length >= 2 && ws.length <= 5 && ws.filter(w => w.length >= 3 && [...w].every(c => TROCA[c])).length < 2 && l.t.replace(/[^A-ZÀ-Ý]/g, '').length >= 6 && l.t.length <= 28 && ws.every(w => w.length >= 1 && w.replace(/\./g, '').length <= 14); });
  }
  const EMISSORES = [
    ['Nubank', /NU\s?BANK|Nu\s?bank|\bnu\b/], ['Itaú', /ITA[UÚ]|PERSONNALIT/i], ['Bradesco', /BRADESCO/i], ['Santander', /SANTANDER/i],
    ['Banco do Brasil', /BANCO DO BRASIL|\bOUROCARD\b/i], ['Caixa', /\bCAIXA\b/i], ['Inter', /\bBANCO INTER\b|\binter\b/], ['C6 Bank', /\bC6\b/i],
    ['BTG Pactual', /\bBTG\b/i], ['XP', /\bXP\b/], ['Porto Bank', /\bPORTO\b/i], ['Sicredi', /SICREDI/i], ['Sicoob', /SICOOB/i],
    ['PicPay', /PICPAY/i], ['Mercado Pago', /MERCADO\s?PAGO/i], ['PagBank', /PAG\s?BANK|PAGSEGURO/i], ['Neon', /\bNEON\b/i], ['Next', /\bNEXT\b/i],
    ['Banco Original', /\bORIGINAL\b/i], ['Safra', /\bSAFRA\b/i], ['Banrisul', /BANRISUL/i], ['BS2', /\bBS2\b/i], ['Will Bank', /\bWILL\b/i],
    ['Avenue', /\bAVENUE\b/i], ['Banco Pan', /\bBANCO PAN\b/i], ['Digio', /\bDIGIO\b/i], ['Agibank', /AGIBANK/i]
  ];
  const BANDEIRA_ESCRITA = [['Mastercard', /MASTER\s?CARD/i], ['Visa', /\bVISA\b/i], ['Elo', /\belo\b/i], ['American Express', /AMERICAN EXPRESS|\bAMEX\b/i], ['Hipercard', /HIPERCARD/i], ['Diners Club', /DINERS/i]];

  // ---------- a foto ----------
  async function paraCanvas(fonte) {
    if (fonte instanceof HTMLCanvasElement) return fonte;
    let img = fonte;
    if (typeof Blob !== 'undefined' && fonte instanceof Blob) img = await createImageBitmap(fonte, { imageOrientation: 'from-image' });
    else if (fonte instanceof HTMLImageElement && !fonte.complete) await new Promise((ok, erro) => { fonte.onload = ok; fonte.onerror = erro; });
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0);
    if (img.close) img.close();
    return c;
  }
  // A foto girada, em tons de cinza, com o contraste esticado; "inverter" para letra clara em cartão escuro
  function preparar(src, rot, largura, inverter, local) {
    const r = rot * Math.PI / 180, cos = Math.abs(Math.cos(r)), sin = Math.abs(Math.sin(r));
    const sw = src.width * cos + src.height * sin, sh = src.width * sin + src.height * cos;
    const s = largura / sw;
    const c = document.createElement('canvas');
    c.width = Math.round(sw * s); c.height = Math.round(sh * s);
    const x = c.getContext('2d');
    x.fillStyle = '#808080';
    x.fillRect(0, 0, c.width, c.height);
    x.translate(c.width / 2, c.height / 2);
    x.rotate(rot * Math.PI / 180);
    x.drawImage(src, -src.width * s / 2, -src.height * s / 2, src.width * s, src.height * s);
    const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < p.length; i += 4) { const g = (p[i] * 299 + p[i + 1] * 587 + p[i + 2] * 114) / 1000 | 0; p[i] = g; hist[g]++; }
    let acc = 0, lo = 0, hi = 255; const n = p.length / 4;
    for (let g = 0; g < 256; g++) { acc += hist[g]; if (acc < n * 0.02) lo = g; if (acc < n * 0.98) hi = g; }
    const k = 255 / Math.max(1, hi - lo);
    for (let i = 0; i < p.length; i += 4) {
      let g = Math.max(0, Math.min(255, (p[i] - lo) * k));
      if (inverter) g = 255 - g;
      p[i] = p[i + 1] = p[i + 2] = g;
    }
    // "local": preto e branco pelo claro de cada pedaço da foto (média numa janela), não da foto
    // toda: cartão amarelo em mesa branca, onde um corte só apaga as letras junto com o cartão
    if (local) {
      const W = c.width, H = c.height, r = Math.max(8, Math.round(W / 40)), soma = new Float64Array((W + 1) * (H + 1));
      for (let y = 0; y < H; y++) { let lin = 0; for (let xx = 0; xx < W; xx++) { lin += p[(y * W + xx) * 4]; soma[(y + 1) * (W + 1) + xx + 1] = soma[y * (W + 1) + xx + 1] + lin; } }
      const out = new Uint8ClampedArray(W * H);
      for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
        const x0 = Math.max(0, xx - r), x1 = Math.min(W, xx + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
        const m = (soma[y1 * (W + 1) + x1] - soma[y0 * (W + 1) + x1] - soma[y1 * (W + 1) + x0] + soma[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
        out[y * W + xx] = p[(y * W + xx) * 4] < m - 12 ? 0 : 255;
      }
      for (let i = 0; i < out.length; i++) p[i * 4] = p[i * 4 + 1] = p[i * 4 + 2] = out[i];
    }
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.putImageData(d, 0, 0);
    return c;
  }

  let T = null;
  async function motor() {
    await L.precisa('foto');
    if (!window.Tesseract) await L.carregarScript('tesseract/tesseract.min.js');
    T = window.Tesseract;
    const base = L.url('tesseract/');
    return T.createWorker('por', 1, { workerPath: base + 'worker.min.js', corePath: base, langPath: base });
  }

  L.lerCartao = async (fonte, opcoes = {}) => {
    const o = Object.assign({ aviso: () => {}, progresso: () => {} }, opcoes);
    o.aviso('Preparando a foto do cartão...');
    let src = await paraCanvas(fonte);
    const worker = await motor();
    // endireitar pelas linhas de letras (leitura/foto.js); de cabeça para baixo, o giro de 180 resolve.
    // Sem linhas claras (cartão escuro), o cartão é deitado: a foto em pé foi tirada de lado
    const inc = L.foto.anguloLinhas(src);
    const pelaFoto = src.width >= src.height ? [0, 180] : [90, 270];
    // a medida engana com fundo listrado (mesa de madeira): as posições pela foto vêm logo depois
    const medidos = inc.razao > 1.5 ? [-inc.a, 180 - inc.a] : [];
    const perto = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180) < 3;
    const giros = medidos.concat(pelaFoto.filter(g => !medidos.some(m => perto(m, g))));
    const votosNum = new Map(), validades = [], nomes = [];
    let textoTodo = '', melhor = { conf: -1, rot: giros[0], inverter: false }, extras = false;
    const passos = giros.map(rot => ({ rot, inverter: false })).concat(giros.map(rot => ({ rot, inverter: false, local: true })), giros.map(rot => ({ rot, inverter: true })), giros.map(rot => ({ rot, inverter: true, local: true })));
    try {
      for (let k = 0; k < passos.length; k++) {
        const { rot, inverter, local } = passos[k];
        o.aviso('Lendo o cartão...');
        o.progresso(Math.round(k * 100 / passos.length));
        await worker.setParameters({ tessedit_pageseg_mode: '11' });   // texto solto pelo cartão
        const res = (await worker.recognize(preparar(src, rot, 1600, inverter, local))).data;
        let texto = res.text || '';
        // o número numa linha, ou partido em até três seguidas ("6362 9700 0045" e "7013")
        const linhas = texto.split('\n').filter(l => l.trim());
        const desta = new Set();
        linhas.forEach((linha, i) => {
          for (let j = i; j < Math.min(i + 3, linhas.length); j++) numerosDaLinha(linhas.slice(i, j + 1).join('\n')).forEach(n => desta.add(n));
        });
        desta.forEach(n => votosNum.set(n, (votosNum.get(n) || 0) + 1));
        desta.clear();
        validades.push(...validadesDe(texto));
        nomes.push(...nomesDe(res));
        textoTodo += L.mascararCartoes(texto) + '\n';
        texto = null;
        if (res.confidence > melhor.conf) melhor = { conf: res.confidence, rot, inverter, local };
        // achou o número duas vezes, a validade e o nome: não precisa das outras leituras
        if ([...votosNum.values()].some(v => v >= 2) && validades.length && nomes.length) break;
        // nenhum número que confere: o cartão pode estar torto e a medida ter errado (fundo listrado);
        // tenta a posição que leu melhor, girada uns graus para cada lado
        if (k === passos.length - 1 && !votosNum.size && !extras) {
          extras = true;
          [-5, 5, -10, 10].forEach(d => passos.push({ rot: melhor.rot + d, inverter: melhor.inverter, local: melhor.local }));
        }
      }
    } finally {
      await worker.terminate();
      src = null;
    }
    o.progresso(100);

    const ordem = [...votosNum.entries()].sort((a, b) => b[1] - a[1]);
    // dois números diferentes que conferem, lidos as mesmas vezes: não dá para saber qual
    let numero = ordem.length && !(ordem[1] && ordem[1][1] === ordem[0][1]) ? ordem[0][0] : null;
    const conferido = numero !== null;
    const final = conferido ? numero.slice(-4) : null;
    let bandeira = conferido ? bandeiraDe(numero) : null;
    numero = null;
    votosNum.clear();
    if (!bandeira) { const b = BANDEIRA_ESCRITA.find(([, re]) => re.test(textoTodo)); bandeira = b ? b[0] : null; }
    const val = validades.filter(v => v.peso > -1).sort((a, b) => b.peso - a.peso || b.ordem - a.ordem)[0];
    const contaNomes = new Map();
    nomes.forEach(n => { const e = contaNomes.get(n.t) || { t: n.t, vezes: 0, c: 0 }; e.vezes++; e.c = Math.max(e.c, n.c); contaNomes.set(n.t, e); });
    const nome = [...contaNomes.values()].sort((a, b) => b.vezes - a.vezes || b.c - a.c)[0];
    const em = EMISSORES.find(([, re]) => re.test(textoTodo));
    textoTodo = null;
    if (!final && !val && !nome) return null;
    return Object.freeze({ final, bandeira, nome: nome ? nome.t : null, validade: val ? val.v : null, emissor: em ? em[0] : null, conferido });
  };

  // para os testes: a conta do Luhn e a bandeira, sem foto
  L.cartaoPlastico = { luhn, bandeiraDe, numerosDaLinha };
})(window.Leitura);
