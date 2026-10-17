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
// 4. Duas fotos de uma vez: 2 abas, cada uma com seu valor.
// 5. TXT, CSV (de banco, em Windows-1252), OFX de fatura, XLSX e DOCX.
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

  // 4. duas fotos de uma vez
  page = await open();
  const r4 = await send(page, fotos, 'cartao');
  check(r4.tabs.length === 2 && r4.values[0] === 'R$ 23,50' && r4.values[1] === 'R$ 47,90', `2 fotos de uma vez: abas=${JSON.stringify(r4.tabs)} valores=${JSON.stringify(r4.values)}`);
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
