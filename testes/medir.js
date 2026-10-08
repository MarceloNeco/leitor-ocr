// Mede a leitura do app numa pasta de fotos, sem celular.
//
//   node testes/medir.js /caminho/da/pasta-de-fotos [foto1.jpg foto2.jpg ...]
//
// Abre o index.html num Chromium invisível (Playwright), envia cada foto pelo
// botão "Galeria" e lê os campos que apareceram na tela. Nada sai para a
// internet: todo pedido fora do servidor local é bloqueado e listado.
//
// Se a pasta tiver um gabarito.json, imprime a tabela certo/incerto/vazio/errado:
//   { "foto.jpg": { "tipo": "cartao", "valores": ["558,80"], "datas": ["08/10/2026"],
//                   "estab": "ALMANARA", "obs": "..." } }
// "tipo" é o botão escolhido no pop-up (cartao, nfce, conta, livre ou auto;
// sem tipo, usa auto). TIPO=auto no ambiente força "auto" em todas.
// "valores" vazio quer dizer que o papel não tem valor (pedido médico, etc.):
// aí o certo é o campo ficar vazio. "estab" pode ser uma lista.
// "incerto" = o app não bateu o martelo e ofereceu botões com os valores lidos;
// conta como "incerto-ok" quando o certo estava entre eles.
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

function grade(fields, chips, expected) {
  const g = k => (fields.find(f => f.key === k) || {}).val || '';
  const valores = list(expected.valores).map(money), datas = list(expected.datas), estabs = list(expected.estab).filter(Boolean);
  const v = money(g('Valor')), d = g('Data'), e = norm(g('Estabelecimento'));
  const judge = (read, ok) => ok.length === 0 ? (read ? 'errado' : 'certo') : (!read ? 'vazio' : ok.includes(read) ? 'certo' : 'errado');
  let valor = judge(v, valores);
  if (valor === 'vazio' && chips.length) valor = chips.some(c => valores.includes(money(c))) ? 'incerto-ok' : 'incerto';
  return {
    valor,
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
    const tipo = process.env.TIPO || (gabarito && gabarito[f] && gabarito[f].tipo) || 'auto';
    const t0 = Date.now();
    await page.setInputFiles('#fileInputGallery', path.join(PHOTOS, f));
    let ok = true;
    try {
      // the app asks what the photo is; answer with the type from the gabarito
      await page.waitForSelector('#docTypeDialog[open]', { timeout: 30000 });
      await page.click(`#docTypeDialog button[data-tipo="${tipo}"]`);
      await page.waitForFunction(() => document.getElementById('fieldsEditorCard').style.display === 'flex', null, { timeout: 600000 });
    } catch (e) { ok = false; logs.push('harness: ' + e.message); }
    const secs = +((Date.now() - t0) / 1000).toFixed(1);
    const fields = ok ? await page.$$eval('#fieldsListContainer .field-row', rows => rows.map(r => ({
      key: r.querySelector('.fld-key').value, val: r.querySelector('.fld-val').value, missing: r.classList.contains('field-missing') }))) : [];
    const chips = ok ? await page.$$eval('.valor-chip', els => els.map(e => e.textContent)) : [];
    const conf = ok ? await page.$eval('#confidenceVal', e => e.textContent) : '';
    const debug = (await page.evaluate(() => window.ocrDebug || null)) || {};
    const texts = (debug.readings || []).map(r => r.text);
    const fallback = logs.some(l => l.includes('OCR falhou'));
    const passes = texts.length;
    const g = k => (fields.find(x => x.key === k) || {}).val || '-';
    const nota = gabarito && gabarito[f] ? grade(fields, chips, gabarito[f]) : null;
    const kind = debug.textKind ? `${debug.textKind.label} (${debug.textKind.good}%)` : '';
    const sinais = debug.sinais ? ` sinais=${debug.sinais.nfce}/${debug.sinais.cartao}/${debug.sinais.conta}` : '';
    const rots = (debug.readings || []).map(r => `${r.rot}${r.bin ? 'pb' : ''}${r.region ? 'rec' : ''}:${r.good}`).join(',') + (debug.tilt !== undefined ? ` incl=${debug.tilt}` : '');
    results.push({ file: f, ok, secs, fallback, conf, passes, tipoEscolhido: tipo, tipoLido: debug.tipo, detectado: debug.detected, textKind: debug.textKind, chips, fields, nota, readings: debug.readings, logs: logs.slice(0, 30) });
    const tag = nota ? `  [valor=${nota.valor} data=${nota.data} estab=${nota.estab}]` : '';
    console.log(`${f}  ${secs}s  leituras=${passes}${rots ? ' [' + rots + ']' : ''}${fallback ? ' FALLBACK' : ''}  tipo=${tipo}>${debug.tipo || '?'}${sinais}  Valor=${g('Valor')}${chips.length ? ' opções=' + chips.join('|') : ''}  Data=${g('Data')}  Hora=${g('Hora')}  Estab=${g('Estabelecimento').slice(0, 30)}  ${kind}${tag}`);
    fs.writeFileSync(out, JSON.stringify(results, null, 1));
    await page.close();
  }
  await browser.close();
  server.close();

  if (blocked.size) console.log('\nPedidos para fora bloqueados (o app não pode depender deles):\n  ' + [...blocked].join('\n  '));
  if (gabarito) {
    const count = (k, v) => results.filter(r => r.nota && r.nota[k] === v).length;
    console.log('\nResumo (fotos com gabarito: ' + results.filter(r => r.nota).length + ')');
    console.log('| Campo | Certo | Incerto, certo entre as opções | Incerto | Vazio | Errado |');
    console.log('|---|---|---|---|---|---|');
    console.log(`| valor | ${count('valor', 'certo')} | ${count('valor', 'incerto-ok')} | ${count('valor', 'incerto')} | ${count('valor', 'vazio')} | ${count('valor', 'errado')} |`);
    console.log(`| data | ${count('data', 'certo')} | - | - | ${count('data', 'vazio')} | ${count('data', 'errado')} |`);
    console.log(`| estab | ${count('estab', 'certo')} | - | - | - | ${count('estab', 'nao')} |`);
    const secs = results.reduce((a, r) => a + r.secs, 0) / Math.max(1, results.length);
    console.log(`Tempo médio por foto: ${secs.toFixed(1)}s`);
  }
  console.log('\nResultado completo em ' + out);
})().catch(e => { console.error(e); process.exit(1); });
