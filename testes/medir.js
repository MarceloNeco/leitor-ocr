// Mede a leitura do app numa pasta de fotos, sem celular.
//
//   node testes/medir.js /caminho/da/pasta-de-fotos [foto1.jpg foto2.jpg ...]
//
// Abre o index.html num Chromium invisível (Playwright), envia cada foto pelo
// botão "Galeria" e lê os campos que apareceram na tela. Nada sai para a
// internet: todo pedido fora do servidor local é bloqueado e listado.
//
// Se a pasta tiver um gabarito.json, imprime a tabela certo/vazio/errado:
//   { "foto.jpg": { "valores": ["558,80"], "datas": ["08/10/2026"],
//                   "estab": "ALMANARA", "obs": "..." } }
// "valores" vazio quer dizer que o papel não tem valor (pedido médico, etc.):
// aí o certo é o campo ficar vazio. "estab" pode ser uma lista.
//
// As fotos e o gabarito têm dados pessoais: ficam FORA do repositório.
// O resultado completo (com o texto lido) é gravado na pasta das fotos.

const fs = require('fs');
const path = require('path');
const http = require('http');

const REPO = path.resolve(__dirname, '..');
const PHOTOS = process.argv[2] && path.resolve(process.argv[2]);
const ONLY = process.argv.slice(3);
if (!PHOTOS || !fs.existsSync(PHOTOS)) {
  console.error('Uso: node testes/medir.js <pasta-de-fotos> [foto ...]');
  process.exit(1);
}

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json',
  '.gz': 'application/gzip', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

function serveRepo() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const file = path.join(REPO, decodeURIComponent(req.url.split('?')[0]));
      if (!file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); return res.end();
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const norm = s => (s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const money = s => (s || '').replace(/R\$\s*/i, '').replace(/\./g, '').trim();
const list = v => (v === undefined || v === null) ? [] : (Array.isArray(v) ? v : [v]);

function grade(fields, expected) {
  const g = k => (fields.find(f => f.key === k) || {}).val || '';
  const valores = list(expected.valores).map(money), datas = list(expected.datas), estabs = list(expected.estab).filter(Boolean);
  const v = money(g('Valor')), d = g('Data'), e = norm(g('Estabelecimento'));
  const judge = (read, ok) => ok.length === 0 ? (read ? 'errado' : 'certo') : (!read ? 'vazio' : ok.includes(read) ? 'certo' : 'errado');
  return {
    valor: judge(v, valores),
    data: judge(d, datas),
    estab: estabs.length === 0 ? '-' : (estabs.some(x => e.includes(norm(x))) ? 'certo' : 'nao')
  };
}

(async () => {
  const server = await serveRepo();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const gabaritoFile = path.join(PHOTOS, 'gabarito.json');
  const gabarito = fs.existsSync(gabaritoFile) ? JSON.parse(fs.readFileSync(gabaritoFile, 'utf8')) : null;
  const files = ONLY.length ? ONLY : fs.readdirSync(PHOTOS).filter(f => /\.(jpe?g|png)$/i.test(f) && !f.startsWith('_')).sort();

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const blocked = new Set();
  await context.route(() => true, route => {
    const url = route.request().url();
    if (url.startsWith(base)) return route.continue();
    blocked.add(url.split('?')[0]);
    return route.abort();
  });

  const results = [];
  const out = path.join(PHOTOS, '_resultado.json');
  for (const f of files) {
    const page = await context.newPage();
    const logs = [];
    page.on('console', m => logs.push(m.type() + ': ' + m.text()));
    page.on('pageerror', e => logs.push('pageerror: ' + e.message));
    await page.goto(base + 'index.html');
    await page.evaluate(() => {
      const orig = parseReceiptText;
      window.__ocrTexts = [];
      window.parseReceiptText = t => { window.__ocrTexts.push(t); return orig(t); };
    });
    const t0 = Date.now();
    await page.setInputFiles('#fileInputGallery', path.join(PHOTOS, f));
    let ok = true;
    try {
      await page.waitForFunction(() => document.getElementById('fieldsEditorCard').style.display === 'flex', null, { timeout: 600000 });
    } catch (e) { ok = false; }
    const secs = +((Date.now() - t0) / 1000).toFixed(1);
    const fields = ok ? await page.$$eval('#fieldsListContainer .field-row', rows => rows.map(r => ({
      key: r.querySelector('.fld-key').value, val: r.querySelector('.fld-val').value, missing: r.classList.contains('field-missing') }))) : [];
    const conf = ok ? await page.$eval('#confidenceVal', e => e.textContent) : '';
    const texts = await page.evaluate(() => window.__ocrTexts || []);
    const fallback = logs.some(l => l.includes('OCR online falhou'));
    const passes = Math.max(0, texts.length - 1);
    const g = k => (fields.find(x => x.key === k) || {}).val || '-';
    const nota = gabarito && gabarito[f] ? grade(fields, gabarito[f]) : null;
    results.push({ file: f, ok, secs, fallback, conf, passes, fields, nota, texts, logs: logs.slice(0, 30) });
    const tag = nota ? `  [valor=${nota.valor} data=${nota.data} estab=${nota.estab}]` : '';
    console.log(`${f}  ${secs}s  tentativas=${passes}${fallback ? ' FALLBACK' : ''}  Valor=${g('Valor')}  Data=${g('Data')}  Hora=${g('Hora')}  Estab=${g('Estabelecimento').slice(0, 40)}${tag}`);
    fs.writeFileSync(out, JSON.stringify(results, null, 1));
    await page.close();
  }
  await browser.close();
  server.close();

  if (blocked.size) console.log('\nPedidos para fora bloqueados (o app não pode depender deles):\n  ' + [...blocked].join('\n  '));
  if (gabarito) {
    const count = (k, v) => results.filter(r => r.nota && r.nota[k] === v).length;
    console.log('\nResumo (fotos com gabarito: ' + results.filter(r => r.nota).length + ')');
    console.log('| Campo | Certo | Vazio | Errado |');
    console.log('|---|---|---|---|');
    for (const k of ['valor', 'data']) console.log(`| ${k} | ${count(k, 'certo')} | ${count(k, 'vazio')} | ${count(k, 'errado')} |`);
    console.log(`| estab | ${count('estab', 'certo')} | - | ${count('estab', 'nao')} |`);
  }
  console.log('\nResultado completo em ' + out);
})().catch(e => { console.error(e); process.exit(1); });
