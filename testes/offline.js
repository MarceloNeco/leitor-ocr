// Testa o app instalável e os arquivos que ele abre, sem fotos pessoais: tudo
// é gerado na hora (lojas, banco e cartões fictícios).
//
//   node testes/offline.js
//
// 0. Os apps do solverone.com.br dividem o endereço: a cópia sem internet de
//    outro app tem que continuar lá depois de o leitor se instalar.
// 1. Na primeira visita só o básico é guardado (nada pesado baixa sozinho).
//    Lê o comprovante de exemplo com internet (o leitor de fotos baixa e fica
//    guardado), desliga a internet e lê de novo: tem que ler pelo OCR.
// 2. Ajustes → "Guardar tudo": o leitor de PDF e o de códigos ficam guardados.
// 3. PDF com texto (2 páginas, lido sem OCR) e PDF escaneado (lido com OCR).
//    PDF com senha: pede a senha, avisa quando está errada, abre com a certa
//    e não guarda a senha no aparelho.
// 4. Duas fotos de uma vez: 2 abas, cada uma com seu valor. Espiada rápida e
//    app certo: um comprovante espiado "dentro do HyperNutry" manda para o MoneyTRIO.
// 5. TXT, CSV (de banco, em Windows-1252), OFX de fatura, XLSX e DOCX.
//    Boleto: valor e vencimento da linha digitável; com um número trocado,
//    o código não vale e o valor fica vazio.
//    Detecção automática: uma receita médica fictícia vira "Saúde › Receita médica".
// 6. Arquivo em formato antigo (.xls): recusado com o motivo.
// 7. Pagamento dividido: uma conta e duas vias de cartão; "O cartão final ...
//    é meu" mostra a minha parte.
// 8. Câmera de computador (câmera falsa do Chromium).
// Também avisa se a versão do sw.js não bate com a do index.html.

const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const zlib = require('zlib');
const crypto = require('crypto');

const REPO = path.resolve(__dirname, '..');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.mjs': 'application/javascript', '.json': 'application/json',
  '.gz': 'application/gzip', '.wasm': 'application/wasm', '.png': 'image/png', '.webmanifest': 'application/manifest+json',
  '.pfb': 'application/octet-stream', '.ttf': 'font/ttf' };

function serveRepo() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const file = path.join(REPO, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
      if (!file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// Um .zip mínimo (é o que são o .xlsx e o .docx), comprimido como o Excel faz
function zip(files) {
  const local = [], central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content, 'utf8'), comp = zlib.deflateRawSync(data), nb = Buffer.from(name);
    const crc = zlib.crc32 ? zlib.crc32(data) : 0;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nb.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(offset, 42);
    local.push(lh, nb, comp); central.push(ch, nb);
    offset += 30 + nb.length + comp.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

// Um PDF fictício de uma página com senha (o padrão mais simples do PDF:
// RC4 de 40 bits), com o texto das linhas dadas
function pdfComSenha(linhas, senha) {
  const md5 = (...partes) => crypto.createHash('md5').update(Buffer.concat(partes)).digest();
  const rc4 = (chave, dados) => {
    const S = [...Array(256).keys()];
    for (let i = 0, j = 0; i < 256; i++) { j = (j + S[i] + chave[i % chave.length]) & 255; [S[i], S[j]] = [S[j], S[i]]; }
    const out = Buffer.alloc(dados.length);
    for (let k = 0, i = 0, j = 0; k < dados.length; k++) {
      i = (i + 1) & 255; j = (j + S[i]) & 255; [S[i], S[j]] = [S[j], S[i]];
      out[k] = dados[k] ^ S[(S[i] + S[j]) & 255];
    }
    return out;
  };
  const PAD = Buffer.from('28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A', 'hex');
  const pad = s => Buffer.concat([Buffer.from(s, 'latin1'), PAD]).subarray(0, 32);
  const id = crypto.randomBytes(16), P = -44, p4 = Buffer.alloc(4);
  p4.writeInt32LE(P);
  const O = rc4(md5(pad(senha)).subarray(0, 5), pad(senha));
  const chave = md5(pad(senha), O, p4, id).subarray(0, 5);
  const texto = Buffer.from('BT /F1 18 Tf 40 780 Td 26 TL ' + linhas.map(l => `(${l}) '`).join(' ') + ' ET', 'latin1');
  const cifrado = rc4(md5(chave, Buffer.from([4, 0, 0, 0, 0])).subarray(0, 10), texto);   // o objeto 4 é o texto da página
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    Buffer.concat([Buffer.from(`<< /Length ${cifrado.length} >>\nstream\n`), cifrado, Buffer.from('\nendstream')]),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Filter /Standard /V 1 /R 2 /O <${O.toString('hex')}> /U <${rc4(chave, PAD).toString('hex')}> /P ${P} >>`
  ];
  const partes = [Buffer.from('%PDF-1.4\n')], onde = [];
  let pos = partes[0].length;
  objs.forEach((o, n) => {
    const b = Buffer.concat([Buffer.from(`${n + 1} 0 obj\n`), Buffer.from(o), Buffer.from('\nendobj\n')]);
    onde.push(pos); partes.push(b); pos += b.length;
  });
  partes.push(Buffer.from(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + onde.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')
    + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Encrypt 6 0 R /ID [<${id.toString('hex')}> <${id.toString('hex')}>] >>\nstartxref\n${pos}\n%%EOF\n`));
  return Buffer.concat(partes);
}

// Linha digitável fictícia que confere (banco 237), com o vencimento e o valor dados
function linhaBoleto(venc, centavos) {
  const mod10 = s => { let soma = 0, p = 2; for (let i = s.length - 1; i >= 0; i--) { const x = +s[i] * p; soma += x > 9 ? x - 9 : x; p = 3 - p; } return (10 - soma % 10) % 10; };
  const [d, m, a] = venc.split('/').map(Number);
  const fator = 1000 + Math.round((Date.UTC(a, m - 1, d) - Date.UTC(2025, 1, 22)) / 86400000);
  const valor = String(centavos).padStart(10, '0'), livre = '1234567890123456789012345';
  const barras = '2379' + fator + valor + livre;
  let soma = 0;
  for (let i = barras.length - 1, p = 2; i >= 0; i--, p = p === 9 ? 2 : p + 1) soma += +barras[i] * p;
  const dv = 11 - soma % 11 >= 10 ? 1 : 11 - soma % 11;
  const campo = (c, n) => c.slice(0, 5) + '.' + c.slice(5) + mod10(c);
  return `${campo('2379' + livre.slice(0, 5))} ${campo(livre.slice(5, 15))} ${campo(livre.slice(15))} ${dv} ${fator}${valor}`;
}

const receipt = (loja, valor, data) => `<div style="width:520px;padding:40px 30px;font:bold 26px monospace;color:#111;background:#fff;line-height:1.6;">
  ${loja}<br>CNPJ 12.345.678/0001-90<br>COMPROVANTE DE PAGAMENTO<br>VIA CLIENTE<br>
  DATA ${data} 14:22<br>CREDITO A VISTA<br>TERMINAL POS1234<br>VALOR TOTAL R$ ${valor}<br>AUTORIZACAO 123456</div>`;
const slip = (bandeira, final, valor) => `<div style="width:520px;padding:40px 30px;font:bold 26px monospace;color:#111;background:#fff;line-height:1.6;">
  VIA CLIENTE - COMPRA<br>RESTAURANTE EXEMPLO LTDA<br>10/10/2026 14:07<br>CREDITO A VISTA<br>${bandeira}<br>CARTAO FINAL ${final}<br>VALOR R$ ${valor}<br>AUT 654321</div>`;
const bill = `<div style="width:520px;padding:40px 30px;font:bold 26px monospace;color:#111;background:#fff;line-height:1.6;">
  RESTAURANTE EXEMPLO<br>CONFERENCIA DE CONTA<br>MESA 03 - 2 PESSOAS<br>SUBTOTAL R$ 90,91<br>GORJETA 10% R$ 9,09<br>TOTAL R$ 100,00<br>10/10/2026 14:05</div>`;

let failed = 0;
const check = (ok, msg) => { console.log((ok ? 'OK   ' : 'FALHA') + ' ' + msg); if (!ok) failed++; };

(async () => {
  const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8'), sw = fs.readFileSync(path.join(REPO, 'sw.js'), 'utf8');
  const vApp = (html.match(/APP_VERSION = '([^']+)'/) || [])[1], vSw = (sw.match(/VERSAO = '([^']+)'/) || [])[1];
  check(vApp === vSw, `versão do index.html (${vApp}) e do sw.js (${vSw}) iguais`);

  const server = await serveRepo();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const context = await browser.newContext();
  const external = new Set();
  await context.route(() => true, route => {
    const url = route.request().url();
    if (url.startsWith(base)) return route.continue();
    external.add(url.split('?')[0]); return route.abort();
  });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'leitor-ocr-'));
  const file = (name, content) => { const f = path.join(tmp, name); fs.writeFileSync(f, content); return f; };

  // ---------- material de teste ----------
  const gen = await context.newPage();
  const shot = async (inner, name) => {
    await gen.setContent(`<body style="margin:0;background:#444;padding:40px">${inner}</body>`);
    const f = path.join(tmp, name); await gen.screenshot({ path: f, fullPage: true }); return f;
  };
  await gen.setContent(`<body style="margin:0">${receipt('PADARIA EXEMPLO LTDA', '85,00', '08/10/2026')}<div style="page-break-after:always"></div>${receipt('POSTO MODELO LTDA', '150,00', '09/10/2026')}</body>`);
  const pdf = path.join(tmp, 'dois.pdf');
  await gen.pdf({ path: pdf, width: '600px', height: '560px' });
  const fotos = [await shot(receipt('MERCADO UM LTDA', '23,50', '09/10/2026'), 'foto1.png'), await shot(receipt('LOJA DOIS LTDA', '47,90', '09/10/2026'), 'foto2.png')];
  await gen.setContent(`<body style="margin:0"><img src="data:image/png;base64,${fs.readFileSync(fotos[0]).toString('base64')}" style="width:600px"></body>`);
  const scanned = path.join(tmp, 'escaneado.pdf');
  await gen.pdf({ path: scanned, width: '640px', height: '700px' });
  const split = [await shot(bill, 'conta.png'), await shot(slip('MASTERCARD', '1234', '60,00'), 'via1.png'), await shot(slip('VISA', '5678', '40,00'), 'via2.png')];
  await gen.close();

  const txt = file('recibo.txt', 'LOJA EXEMPLO LTDA\nCNPJ 12.345.678/0001-90\nVIA CLIENTE\nCREDITO A VISTA\nMASTERCARD ************4321\nDATA 09/10/2026 14:22\nVALOR TOTAL R$ 42,50\n');
  const csv = file('extrato.csv', Buffer.from('Data;Lançamento;Valor\r\n01/10/2026;PIX RECEBIDO EXEMPLO;1.250,00\r\n02/10/2026;PADARIA EXEMPLO;-23,50\r\n03/10/2026;POSTO EXEMPLO;-150,00\r\n', 'latin1'));
  const ofx = file('fatura.ofx', ['OFXHEADER:100', 'DATA:OFXSGML', 'VERSION:102', 'ENCODING:USASCII', 'CHARSET:1252', '',
    '<OFX><SIGNONMSGSRSV1><SONRS><FI><ORG>BANCO EXEMPLO</ORG></FI></SONRS></SIGNONMSGSRSV1>',
    '<CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CURDEF>BRL<CCACCTFROM><ACCTID>0000111122223333</CCACCTFROM>',
    '<BANKTRANLIST><DTSTART>20260901<DTEND>20260930',
    '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260905120000[-3:BRT]<TRNAMT>-45.90<FITID>1<MEMO>RESTAURANTE EXEMPLO',
    '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260912<TRNAMT>-120.00<FITID>2<MEMO>LOJA EXEMPLO',
    '<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260920<TRNAMT>30.00<FITID>3<MEMO>ESTORNO EXEMPLO',
    '</BANKTRANLIST><LEDGERBAL><BALAMT>-135.90<DTASOF>20260930</LEDGERBAL></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>'].join('\r\n'));
  const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const serial = (y, m, d) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
  const strs = ['Data', 'Descrição', 'Valor', 'SALARIO EMPRESA EXEMPLO', 'MERCADO EXEMPLO', 'FARMACIA EXEMPLO'];
  const row = (r, d, s, v) => `<row r="${r}"><c r="A${r}" s="1"><v>${d}</v></c><c r="B${r}" t="s"><v>${s}</v></c><c r="C${r}"><v>${v}</v></c></row>`;
  const xlsx = file('extrato.xlsx', zip({
    'xl/workbook.xml': `<workbook xmlns="${S}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Extrato" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/styles.xml': `<styleSheet xmlns="${S}"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`,
    'xl/sharedStrings.xml': `<sst xmlns="${S}">${strs.map(t => `<si><t>${t}</t></si>`).join('')}</sst>`,
    'xl/worksheets/sheet1.xml': `<worksheet xmlns="${S}"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>`
      + row(2, serial(2026, 10, 5), 3, 3500) + row(3, serial(2026, 10, 6), 4, -150.4) + row(4, serial(2026, 10, 7), 5, -89.9) + '</sheetData></worksheet>'
  }));
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const p = t => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
  const docx = file('recibo.docx', zip({ 'word/document.xml': `<w:document xmlns:w="${W}"><w:body>${p('RECIBO DE PAGAMENTO')}${p('LOJA EXEMPLO LTDA')}`
    + `<w:tbl><w:tr><w:tc>${p('VIA CLIENTE')}</w:tc><w:tc>${p('CREDITO A VISTA')}</w:tc></w:tr><w:tr><w:tc>${p('MASTERCARD')}</w:tc><w:tc>${p('NSU 123456')}</w:tc></w:tr></w:tbl>`
    + `${p('DATA 11/10/2026')}${p('VALOR TOTAL R$ 99,90')}</w:body></w:document>` }));
  const xls = file('velho.xls', 'nao e uma planilha de verdade');
  const linha = linhaBoleto('10/11/2026', 45678);
  const boleto = file('boleto.txt', `BANCO EXEMPLO S.A.  237-2  ${linha}\nBeneficiário\nESCOLA EXEMPLO LTDA CNPJ: 12.345.678/0001-90\nVencimento 10/11/2026\nValor do Documento R$ 456,78\n(+) Mora / Multa R$ 9,13\n`);
  const trocado = linha.slice(0, 2) + (linha[2] === '1' ? '2' : '1') + linha.slice(3);
  const boletoErrado = file('boleto-errado.txt', `BANCO EXEMPLO S.A.\nBeneficiário\nESCOLA EXEMPLO LTDA\nNosso Número 123\nPagável em qualquer banco\nVencimento 10/11/2026\n${trocado}\n`);
  const SENHA = '73915';
  const trancado = file('trancado.pdf', pdfComSenha(['LOJA FICTICIA LTDA', 'COMPROVANTE DE PAGAMENTO', 'VIA CLIENTE', 'DATA 12/10/2026 10:30', 'CREDITO A VISTA', 'VALOR TOTAL R$ 64,90'], SENHA));
  const receita = file('receita.txt', 'CONSULTORIO EXEMPLO\nRECEITUARIO\nUSO ORAL\nREMEDIO EXEMPLO 500 MG\nTOMAR 1 COMPRIMIDO DE 8 EM 8 HORAS POR 5 DIAS\nDRA. EXEMPLO - CRM 000000\n');

  // ---------- ajudantes ----------
  const logs = [];
  const open = async () => {
    const pg = await context.newPage();
    pg.on('pageerror', e => logs.push('pageerror: ' + e.message));
    pg.on('console', m => { if (m.text().includes('OCR falhou')) logs.push('OCR falhou: ' + m.text().slice(0, 200)); });
    await pg.goto(base + 'index.html');
    return pg;
  };
  const fieldsOf = pg => pg.$$eval('#fieldsListContainer .field-row', rows => Object.fromEntries(rows.map(r => [r.querySelector('.fld-key').value, r.querySelector('.fld-val').value])));
  const readTabs = async pg => {
    await pg.waitForFunction(() => document.getElementById('fieldsEditorCard').style.display === 'flex', null, { timeout: 300000 });
    const tabs = await pg.$$eval('#paperTabs .paper-tab', els => els.filter(e => e.offsetParent !== null).map(e => e.textContent));
    const fields = [];
    for (let i = 0; i < Math.max(1, tabs.length); i++) {
      if (tabs.length > 1) await pg.click(`#paperTabs .paper-tab:nth-child(${i + 1})`);
      fields.push(await fieldsOf(pg));
    }
    return { tabs, fields, values: fields.map(f => f.Valor || ''), status: await pg.$eval('#confidenceVal', e => e.textContent) };
  };
  const send = async (pg, files, tipo) => {
    await pg.setInputFiles('#fileInputGallery', files);
    if (tipo) {
      await pg.waitForSelector('#docTypeDialog[open]', { timeout: 60000 });
      await pg.click(`#docTypeDialog button[data-tipo="${tipo}"]`);
    }
    // "ler separados?" nunca deve aparecer nestes testes; se aparecer, é um papel só
    pg.waitForSelector('#papersDialog[open]', { timeout: 300000 }).then(() => pg.click('#btnPapersOne')).catch(() => {});
    return readTabs(pg);
  };
  const saved = (pg, files) => pg.evaluate(async fs => { const out = {}; for (const f of fs) out[f] = !!(await caches.match(Leitura.url(f))); return out; }, files);

  // 0. a cópia de outro app e a antiga do próprio leitor existem antes
  let page = await context.newPage();
  await page.goto(base + 'icons/icon-192.png');
  await page.evaluate(async () => {
    await (await caches.open('outro-app-v1')).put('/outro-app/', new Response('outro'));
    await (await caches.open('leitor-ocr-0.6.0')).put('/velho', new Response('velho'));
  });
  await page.close();

  // 1. básico na primeira visita; leitor de fotos guardado no primeiro uso; OCR sem internet
  page = await open();
  await page.waitForFunction(() => document.getElementById('offlineStatus').textContent.includes('guardada'), null, { timeout: 120000 });
  // a limpeza das cópias velhas termina logo depois de o app ficar pronto
  await page.waitForFunction(async () => !(await caches.keys()).includes('leitor-ocr-0.6.0'), null, { timeout: 15000, polling: 250 }).catch(() => {});
  const keys = await page.evaluate(() => caches.keys());
  check(keys.includes('outro-app-v1'), 'a cópia sem internet de outro app continua lá depois de o leitor se instalar');
  check(!keys.includes('leitor-ocr-0.6.0'), 'a cópia antiga do próprio leitor foi apagada');
  const cached = await page.evaluate(async v => (await (await caches.open('dgo-leitor-ocr-' + v)).keys()).length, vSw);
  const listed = (sw.match(/^\s*'\.\//gm) || []).length;
  check(cached === listed, `básico guardado na primeira visita: ${cached} de ${listed} arquivos`);
  const motor = ['tesseract/tesseract.min.js', 'tesseract/worker.min.js', 'tesseract/por.traineddata.gz'];
  check(Object.values(await saved(page, motor)).every(v => !v), 'o leitor de fotos (9 MB) não baixou sozinho');
  await page.click('#samplePosto');
  const r0 = await readTabs(page);
  check(r0.values[0] === 'R$ 150,00', `comprovante de exemplo lido com internet (Valor=${r0.values[0]})`);
  const depois = await saved(page, motor);
  check(Object.values(depois).every(Boolean), 'depois do primeiro uso, o leitor de fotos ficou guardado ' + JSON.stringify(depois));
  await page.close();
  await context.setOffline(true);
  page = await open();
  check(await page.$('#samplePosto') !== null, 'app abre sem internet');
  const antes = logs.length;
  const t0 = Date.now();
  await page.click('#samplePosto');
  const r1 = await readTabs(page);
  check(r1.values[0] === 'R$ 150,00' && logs.length === antes, `exemplo lido sem internet pelo OCR em ${((Date.now() - t0) / 1000).toFixed(1)}s (Valor=${r1.values[0]})`);
  await context.setOffline(false);
  await page.close();

  // 2. Ajustes → Guardar tudo
  page = await open();
  await page.click('.nav-tab-btn[data-tab="tab-settings"]');
  await page.waitForSelector('#btnSaveAllOffline', { state: 'visible', timeout: 60000 });
  await page.click('#btnSaveAllOffline');
  await page.waitForFunction(() => document.querySelectorAll('#offlineParts li').length === 3 && [...document.querySelectorAll('#offlineParts li')].every(l => l.textContent.includes('✅')), null, { timeout: 120000 }).catch(() => {});
  const parts = await page.$$eval('#offlineParts li', ls => ls.map(l => l.textContent.trim()));
  check(parts.length === 3 && parts.every(t => t.includes('✅')), 'Guardar tudo: ' + parts.join(' | '));
  await page.close();

  // 3. PDF com texto e PDF escaneado
  page = await open();
  const r2 = await send(page, [pdf], 'cartao');
  check(r2.tabs.length === 2 && r2.values[0] === 'R$ 85,00' && r2.values[1] === 'R$ 150,00' && r2.status === 'Valor lido do arquivo',
    `PDF com texto, 2 páginas, sem OCR: abas=${JSON.stringify(r2.tabs)} valores=${JSON.stringify(r2.values)} (${r2.status})`);
  await page.close();
  page = await open();
  const r3 = await send(page, [scanned], 'cartao');
  check(r3.values[0] === 'R$ 23,50' && r3.status !== 'Valor lido do arquivo', `PDF escaneado, lido com OCR: Valor=${r3.values[0]} (${r3.status})`);
  await page.close();
  page = await open();
  await page.setInputFiles('#fileInputGallery', trancado);
  await page.waitForSelector('#passwordDialog[open]', { timeout: 60000 });
  await page.fill('#passwordInput', '00000');
  await page.click('#btnPasswordOk');
  const errada = await page.waitForSelector('#passwordDialog[open] #passwordError', { state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
  await page.fill('#passwordInput', SENHA);
  await page.click('#btnPasswordOk');
  await page.waitForSelector('#docTypeDialog[open]', { timeout: 60000 });
  await page.click('#docTypeDialog button[data-tipo="cartao"]');
  const r3b = await readTabs(page);
  const guardada = await page.evaluate(s => JSON.stringify(localStorage).includes(s) || JSON.stringify(sessionStorage).includes(s), SENHA);
  check(errada && r3b.values[0] === 'R$ 64,90' && r3b.status === 'Valor lido do arquivo' && !guardada,
    `PDF com senha: avisou a senha errada=${errada}, abriu com a certa (Valor=${r3b.values[0]}, ${r3b.status}), senha guardada=${guardada}`);
  await page.close();

  // 4. duas fotos de uma vez
  page = await open();
  const r4 = await send(page, fotos, 'cartao');
  check(r4.tabs.length === 2 && r4.values[0] === 'R$ 23,50' && r4.values[1] === 'R$ 47,90', `2 fotos de uma vez: abas=${JSON.stringify(r4.tabs)} valores=${JSON.stringify(r4.values)}`);
  const espiada = await page.evaluate(async data => {
    const img = new Image(); await new Promise(ok => { img.onload = ok; img.src = data; });
    const tipo = await Leitura.espiar({ img });
    return { tipo, onde: (Leitura.ondeLer(tipo, 'hypernutry') || {}).texto, rotulo: Leitura.ondeLer('nutricional', 'hypernutry') };
  }, 'data:image/png;base64,' + fs.readFileSync(fotos[0]).toString('base64'));
  check(espiada.tipo === 'cartao' && /MoneyTRIO/.test(espiada.onde || '') && espiada.rotulo === null,
    `espiada rápida no HyperNutry: ${espiada.tipo}, "${espiada.onde}"; rótulo no HyperNutry: sem aviso`);
  await page.close();

  // 5. TXT, CSV, OFX, XLSX, DOCX
  page = await open();
  const r5 = await send(page, [txt], 'auto');
  check(r5.values[0] === 'R$ 42,50' && r5.fields[0]['Cartão'] === 'final 4321', `TXT: Valor=${r5.values[0]} Cartão=${r5.fields[0]['Cartão']}`);
  await page.close();
  page = await open();
  const r6 = await send(page, [csv], 'auto');
  const f6 = r6.fields[0], rows6 = await page.$$eval('.items-table tbody tr', t => t.length);
  check(f6['Lançamentos'] === '3' && f6['Entradas'] === 'R$ 1.250,00' && f6['Saídas'] === 'R$ 173,50' && rows6 === 3,
    `CSV do banco (Windows-1252): ${f6['Lançamentos']} lançamentos, entradas ${f6['Entradas']}, saídas ${f6['Saídas']}, tabela com ${rows6} linhas`);
  await page.close();
  page = await open();
  const r7 = await send(page, [ofx], null);
  const f7 = r7.fields[0];
  check(f7['Banco'] === 'BANCO EXEMPLO' && f7['Cartão'] === 'final 3333' && f7['Lançamentos'] === '3' && f7['Saídas'] === 'R$ 165,90' && f7['Saldo'] === '-R$ 135,90'
    && (await page.$eval('#docTypeLabel', e => e.textContent)).includes('Fatura'),
    `OFX de fatura, sem perguntar o tipo: ${JSON.stringify(f7)}`);
  await page.close();
  page = await open();
  const r8 = await send(page, [xlsx], 'auto');
  const f8 = r8.fields[0], first8 = await page.$eval('.items-table tbody tr td', t => t.textContent);
  check(f8['Lançamentos'] === '3' && f8['Entradas'] === 'R$ 3.500,00' && f8['Saídas'] === 'R$ 240,30' && first8 === '05/10/2026',
    `XLSX: ${f8['Lançamentos']} lançamentos, entradas ${f8['Entradas']}, saídas ${f8['Saídas']}, primeira data ${first8}`);
  await page.close();
  page = await open();
  const r9 = await send(page, [docx], 'auto');
  check(r9.values[0] === 'R$ 99,90', `DOCX: Valor=${r9.values[0]}`);
  await page.close();
  page = await open();
  const r9b = await send(page, [boleto], 'auto');
  const f9b = r9b.fields[0], tipo9b = await page.$eval('#docTypeLabel', e => e.textContent);
  check(tipo9b.includes('Boleto') && f9b.Valor === 'R$ 456,78' && f9b.Vencimento === '10/11/2026' && f9b.Estabelecimento === 'ESCOLA EXEMPLO LTDA' && r9b.status === 'Valor conferido pelo código do boleto',
    `boleto: "${tipo9b}", Valor=${f9b.Valor}, Vencimento=${f9b.Vencimento}, Beneficiário=${f9b.Estabelecimento} (${r9b.status})`);
  await page.close();
  page = await open();
  const r9c = await send(page, [boletoErrado], 'auto');
  check(!r9c.values[0] && !r9c.fields[0].Vencimento && (await page.$eval('#docTypeLabel', e => e.textContent)).includes('Boleto'),
    `boleto com um número trocado na linha: Valor=${r9c.values[0] || 'vazio'} (${r9c.status})`);
  await page.close();
  page = await open();
  await send(page, [receita], 'auto');
  const tipoReceita = await page.$eval('#docTypeLabel', e => e.textContent);
  check(tipoReceita.includes('Saúde') && tipoReceita.includes('Receita médica'), `detecção automática: "${tipoReceita}"`);
  await page.close();

  // 6. formato antigo
  page = await open();
  await page.setInputFiles('#fileInputGallery', xls);
  const toast = await page.waitForSelector('.toast-msg', { timeout: 15000 }).then(t => t.textContent()).catch(() => '');
  check(/formato antigo/.test(toast) && !(await page.$('#docTypeDialog[open]')), `.xls recusado com o motivo: "${toast.trim()}"`);
  await page.close();

  // 7. pagamento dividido e "é meu"
  page = await open();
  const r10 = await send(page, split, 'auto');
  const pago = r10.fields[0]['Pago em partes'] || '';
  check(r10.values.join('|') === 'R$ 100,00|R$ 60,00|R$ 40,00' && pago.includes('R$ 60,00') && pago.includes('R$ 40,00') && (r10.fields[1]['Parte da conta'] || '').includes('R$ 100,00'),
    `conta paga em 2 partes: valores=${JSON.stringify(r10.values)} pago em partes="${pago}"`);
  await page.click('#paperTabs .paper-tab:nth-child(2)');
  await page.click('.card-mine-btn');
  const via = await fieldsOf(page);
  await page.click('#paperTabs .paper-tab:nth-child(1)');
  const conta = await fieldsOf(page);
  check(via['Quem pagou'] === 'Você' && conta['Minha parte'] === 'R$ 60,00', `"O cartão final 1234 é meu": quem pagou=${via['Quem pagou']}, minha parte=${conta['Minha parte']}`);
  await page.close();

  // 8. câmera ao vivo (computador)
  page = await open();
  await page.click('#btnCamera');
  const live = await page.waitForFunction(() => document.getElementById('cameraDialog').open && document.getElementById('cameraVideo').videoWidth > 0, null, { timeout: 15000 }).then(() => true).catch(() => false);
  check(live, 'botão Fotografar abre a câmera ao vivo no computador');
  await page.click('#btnCameraShot');
  const asked = await page.waitForSelector('#docTypeDialog[open]', { timeout: 15000 }).then(() => true).catch(() => false);
  check(asked, '"Tirar foto" manda a foto para leitura (pergunta o tipo)');
  await page.close();

  check(external.size === 0, 'nenhum pedido para fora do app' + (external.size ? ': ' + [...external].join(', ') : ''));
  check(logs.length === 0, 'nenhum erro de página' + (logs.length ? ': ' + logs.join(' | ') : ''));
  await browser.close();
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failed ? `\n${failed} verificação(ões) falharam` : '\nTudo certo');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
