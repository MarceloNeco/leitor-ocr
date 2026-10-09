// Testa o app instalável, sem fotos pessoais: tudo é gerado na hora.
//
//   node testes/offline.js
//
// 1. Abre o index.html num Chromium invisível, espera o sw.js guardar os
//    arquivos, desliga a internet e abre o app de novo: tem que abrir e ler
//    o comprovante de exemplo (motor OCR saindo da cópia guardada).
// 2. Gera um PDF de 2 páginas com dois comprovantes e manda pelo botão
//    "Fotos ou PDF": tem que virar 2 abas, cada uma com seu valor.
// 3. Manda 2 fotos de uma vez: 2 abas, cada uma com seu valor.
// 4. Câmera de computador: com uma câmera falsa do Chromium, o botão
//    Fotografar abre a prévia ao vivo e "Tirar foto" manda a foto para leitura.
// Também avisa se a versão do sw.js não bate com a do index.html.

const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

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

const receipt = (loja, valor, data) => `<div style="width:520px;padding:40px 30px;font:bold 26px monospace;color:#111;background:#fff;line-height:1.6;">
  ${loja}<br>CNPJ 12.345.678/0001-90<br>COMPROVANTE DE PAGAMENTO<br>VIA CLIENTE<br>
  DATA ${data} 14:22<br>CREDITO A VISTA<br>TERMINAL POS1234<br>VALOR TOTAL R$ ${valor}<br>AUTORIZACAO 123456</div>`;

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

  // Material de teste: um PDF de 2 páginas e 2 fotos, gerados na hora
  const gen = await context.newPage();
  await gen.setContent(`<body style="margin:0">${receipt('PADARIA EXEMPLO LTDA', '85,00', '08/10/2026')}<div style="page-break-after:always"></div>${receipt('POSTO MODELO LTDA', '150,00', '09/10/2026')}</body>`);
  const pdf = path.join(tmp, 'dois.pdf');
  await gen.pdf({ path: pdf, width: '600px', height: '560px' });
  const fotos = [];
  for (const [i, [loja, valor]] of [['MERCADO UM LTDA', '23,50'], ['LOJA DOIS LTDA', '47,90']].entries()) {
    await gen.setContent(`<body style="margin:0;background:#444;padding:40px">${receipt(loja, valor, '09/10/2026')}</body>`);
    const f = path.join(tmp, `foto${i + 1}.png`);
    await gen.screenshot({ path: f, fullPage: true });
    fotos.push(f);
  }
  await gen.close();

  const readTabs = async (page) => {
    await page.waitForFunction(() => document.getElementById('fieldsEditorCard').style.display === 'flex', null, { timeout: 300000 });
    const tabs = await page.$$eval('#paperTabs .paper-tab', els => els.filter(e => e.offsetParent !== null).map(e => e.textContent));
    const values = [];
    for (let i = 0; i < Math.max(1, tabs.length); i++) {
      if (tabs.length > 1) await page.click(`#paperTabs .paper-tab:nth-child(${i + 1})`);
      values.push(await page.$$eval('#fieldsListContainer .field-row', rows => (rows.map(r => ({ k: r.querySelector('.fld-key').value, v: r.querySelector('.fld-val').value })).find(f => f.k === 'Valor') || {}).v || ''));
    }
    return { tabs, values };
  };
  const send = async (page, files, tipo) => {
    await page.setInputFiles('#fileInputGallery', files);
    await page.waitForSelector('#docTypeDialog[open]', { timeout: 60000 });
    await page.click(`#docTypeDialog button[data-tipo="${tipo}"]`);
    // "ler separados?" nunca deve aparecer nestes testes; se aparecer, é um papel só
    page.waitForSelector('#papersDialog[open]', { timeout: 300000 }).then(() => page.click('#btnPapersOne')).catch(() => {});
    return readTabs(page);
  };

  // 1. Guarda os arquivos, desliga a internet, abre de novo e lê
  let page = await context.newPage();
  const logs = [];
  page.on('pageerror', e => logs.push('pageerror: ' + e.message));
  await page.goto(base + 'index.html');
  await page.waitForFunction(() => document.getElementById('offlineStatus').textContent.includes('guardada'), null, { timeout: 120000 });
  const cached = await page.evaluate(async () => { const c = await caches.open((await caches.keys())[0]); return (await c.keys()).length; });
  const listed = (sw.match(/^\s*'\.\//gm) || []).length;
  check(cached === listed, `arquivos guardados para uso sem internet: ${cached} de ${listed}`);
  await page.close();
  await context.setOffline(true);
  page = await context.newPage();
  page.on('pageerror', e => logs.push('pageerror: ' + e.message));
  const offlineLoad = await page.goto(base + 'index.html').then(r => r && r.ok()).catch(() => false);
  check(offlineLoad, 'app abre sem internet');
  await page.click('#samplePosto');
  const t0 = Date.now();
  const r1 = await readTabs(page);
  check(r1.values[0] === 'R$ 150,00', `comprovante de exemplo lido sem internet em ${((Date.now() - t0) / 1000).toFixed(1)}s (Valor=${r1.values[0]})`);
  await context.setOffline(false);
  await page.close();

  // 2. PDF de 2 páginas
  page = await context.newPage();
  page.on('pageerror', e => logs.push('pageerror: ' + e.message));
  await page.goto(base + 'index.html');
  const r2 = await send(page, [pdf], 'cartao');
  check(r2.tabs.length === 2 && r2.values[0] === 'R$ 85,00' && r2.values[1] === 'R$ 150,00', `PDF de 2 páginas: abas=${JSON.stringify(r2.tabs)} valores=${JSON.stringify(r2.values)}`);
  await page.close();

  // 3. Duas fotos de uma vez
  page = await context.newPage();
  page.on('pageerror', e => logs.push('pageerror: ' + e.message));
  await page.goto(base + 'index.html');
  const r3 = await send(page, fotos, 'cartao');
  check(r3.tabs.length === 2 && r3.values[0] === 'R$ 23,50' && r3.values[1] === 'R$ 47,90', `2 fotos de uma vez: abas=${JSON.stringify(r3.tabs)} valores=${JSON.stringify(r3.values)}`);
  await page.close();

  // 4. Câmera ao vivo (computador)
  page = await context.newPage();
  page.on('pageerror', e => logs.push('pageerror: ' + e.message));
  await page.goto(base + 'index.html');
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
