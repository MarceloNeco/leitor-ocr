// Mede a leitura do app numa pasta de fotos, sem celular.
//
//   node testes/medir.js /caminho/da/pasta-de-fotos [foto1.jpg foto2.jpg ...]
//
// Abre o index.html num Chromium invisível (Playwright), envia cada foto (ou
// arquivo: PDF, OFX, CSV, XLSX, DOCX, TXT) pelo botão "Fotos ou PDF" e lê os
// campos que apareceram na tela. Nada sai para a
// internet: todo pedido fora do servidor local é bloqueado e listado.
//
// Se a pasta tiver um gabarito.json, imprime a tabela certo/incerto/vazio/errado:
//   { "foto.jpg": { "tipo": "cartao", "valores": ["558,80"], "datas": ["08/10/2026"],
//                   "estab": "ALMANARA", "obs": "..." } }
// "tipo" é o botão escolhido no pop-up (cartao, nfce, conta, livre ou auto;
// sem tipo, usa auto). TIPO=auto no ambiente força "auto" em todas.
// "papeis" é quantos papéis há na foto (sem o campo, 1). Quando o app
// pergunta "ler separados?", o script responde como uma pessoa que sabe o
// que fotografou: sim se há mais de um papel, "é um papel só" se não.
// Cada papel vira uma linha da tabela; o resumo conta as fotos com a
// quantidade certa e as em que o app perguntou sem precisar.
// "valores" vazio quer dizer que o papel não tem valor (pedido médico, etc.):
// aí o certo é o campo ficar vazio. "estab" pode ser uma lista.
// "incerto" = o app não bateu o martelo e ofereceu botões com os valores lidos;
// conta como "incerto-ok" quando o certo estava entre eles.
// "tipoEsperado" (lista de ids do catálogo) mede a detecção automática: com
// "tipo": "auto", conta as fotos em que o tipo descoberto está na lista.
// Campo sem "valores", "datas" ou "estab" no gabarito não recebe nota.
// "lancamentos" (lista de valores, ex.: ["-250,80", "1.250,00"]) mede os
// lançamentos lidos (extrato, fatura, print de notificação): certos, que
// faltaram e lidos a mais.
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

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.mjs': 'application/javascript', '.json': 'application/json',
  '.gz': 'application/gzip', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
  '.pfb': 'application/octet-stream', '.ttf': 'font/ttf', '.pdf': 'application/pdf' };

// sw.js guarda uma cópia do app no celular; a versão dele tem que ser a do index.html
function checkVersions() {
  const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(REPO, 'sw.js'), 'utf8');
  const a = (html.match(/APP_VERSION = '([^']+)'/) || [])[1], b = (sw.match(/VERSAO = '([^']+)'/) || [])[1];
  if (a !== b) console.log(`ATENÇÃO: index.html diz v${a} e sw.js diz v${b}; os dois precisam ser iguais, senão o celular fica com a versão antiga.`);
}

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
  let valor = expected.valores === undefined ? '-' : judge(v, valores);
  if (valor === 'vazio' && chips.length) valor = chips.some(c => valores.includes(money(c))) ? 'incerto-ok' : 'incerto';
  return {
    valor,
    data: expected.datas === undefined ? '-' : judge(d, datas),
    estab: estabs.length === 0 ? '-' : (estabs.some(x => e.includes(norm(x))) ? 'certo' : 'nao')
  };
}

(async () => {
  const server = await serveRepo();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const gabaritoFile = path.join(PHOTOS, 'gabarito.json');
  const gabarito = fs.existsSync(gabaritoFile) ? JSON.parse(fs.readFileSync(gabaritoFile, 'utf8')) : null;
  const files = ONLY.length ? ONLY : fs.readdirSync(PHOTOS).filter(f => /\.(jpe?g|png|pdf|ofx|ofc|csv|xlsx|docx|txt)$/i.test(f) && !f.startsWith('_')).sort();
  checkVersions();

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
    const expectedPapers = (gabarito && gabarito[f] && gabarito[f].papeis) || 1;
    const t0 = Date.now();
    await page.setInputFiles('#fileInputGallery', path.join(PHOTOS, f));
    let ok = true, askedPapers = 0;
    try {
      // the app asks what the photo is (a file that says it, like OFX, goes
      // straight to the reading); answer with the type from the gabarito
      await page.waitForFunction(() => document.getElementById('docTypeDialog').open || document.getElementById('fieldsEditorCard').style.display === 'flex', null, { timeout: 30000 });
      if (await page.$eval('#docTypeDialog', d => d.open)) await page.click(`#docTypeDialog button[data-tipo="${tipo}"]`);
      // then it may ask whether to read several papers apart: answer as the gabarito says
      await page.waitForFunction(() => document.getElementById('papersDialog').open || document.getElementById('fieldsEditorCard').style.display === 'flex', null, { timeout: 600000 });
      if (await page.$eval('#papersDialog', d => d.open)) {
        askedPapers = +(await page.$eval('#papersDialogTitle', e => (e.textContent.match(/\d+/) || [0])[0]));
        await page.click(expectedPapers > 1 ? '#btnPapersMany' : '#btnPapersOne');
        await page.waitForFunction(() => document.getElementById('fieldsEditorCard').style.display === 'flex', null, { timeout: 900000 });
      }
    } catch (e) { ok = false; logs.push('harness: ' + e.message); }
    const secs = +((Date.now() - t0) / 1000).toFixed(1);
    const fallback = logs.some(l => l.includes('OCR falhou'));
    const nTabs = ok ? await page.$$eval('#paperTabs .paper-tab', els => els.filter(e => e.offsetParent !== null).length) : 0;
    const papersFound = Math.max(1, nTabs);
    for (let pi = 0; pi < papersFound; pi++) {
      if (nTabs > 1) { await page.click(`#paperTabs .paper-tab:nth-child(${pi + 1})`); }
      const fields = ok ? await page.$$eval('#fieldsListContainer .field-row', rows => rows.map(r => ({
        key: r.querySelector('.fld-key').value, val: r.querySelector('.fld-val').value, missing: r.classList.contains('field-missing') }))) : [];
      const chips = ok ? await page.$$eval('.valor-chip', els => els.map(e => e.textContent)) : [];
      const itens = ok ? await page.$$eval('.items-table tbody tr', trs => trs.filter(t => t.offsetParent !== null).map(t => [...t.children].map(c => c.textContent))) : [];
      const lanc = gabarito && gabarito[f] && gabarito[f].lancamentos ? (() => {
        const falta = list(gabarito[f].lancamentos).map(money), lidos = itens.map(i => money(i[2]));
        let certos = 0;
        const mais = lidos.filter(v => { const k = falta.indexOf(v); if (k < 0) return true; falta.splice(k, 1); certos++; return false; });
        return { certos, faltam: falta.length, aMais: mais.length };
      })() : null;
      const conf = ok ? await page.$eval('#confidenceVal', e => e.textContent) : '';
      const debug = (await page.evaluate(() => window.ocrDebug || null)) || {};
      const texts = (debug.readings || []).map(r => r.text);
      const passes = texts.length;
      const g = k => (fields.find(x => x.key === k) || {}).val || '-';
      const notaG = gabarito && gabarito[f] ? grade(fields, chips, gabarito[f]) : null;
      const kind = debug.textKind ? `${debug.textKind.label} (${debug.textKind.good}%)` : '';
      const codes = (debug.codes || []).map(c => `${c.format}:${c.text.slice(0, 30)}`).join(';');
      const nota = g('Nota');
      const sinais = debug.sinais ? ` sinais=${debug.sinais.nfce}/${debug.sinais.cartao}/${debug.sinais.conta}` : '';
      const rots = (debug.readings || []).map(r => `${r.rot}${r.bin ? 'pb' : ''}${r.region ? 'rec' : ''}:${r.good}`).join(',') + (debug.tilt !== undefined ? ` incl=${debug.tilt}` : '');
      const label = papersFound > 1 ? `${f} [papel ${pi + 1}/${papersFound}]` : f;
      results.push({ file: f, papel: pi + 1, papeis: papersFound, papeisEsperados: expectedPapers, papeisPerguntados: askedPapers, ok, secs, fallback, conf, passes, tipoEscolhido: tipo, tipoLido: debug.tipo, detectado: debug.detected, textKind: debug.textKind, chips, fields, itens, lanc, nota: notaG, codes: debug.codes, readings: debug.readings, logs: logs.slice(0, 30) });
      const tag = (notaG ? `  [valor=${notaG.valor} data=${notaG.data} estab=${notaG.estab}]` : '')
        + (itens.length ? `  lançamentos=${itens.length} (${conf})` : '') + (lanc ? `  [lançamentos certos=${lanc.certos} faltam=${lanc.faltam} a mais=${lanc.aMais}]` : '');
      const same = g('Mesma compra');
      console.log(`${label}  ${pi === 0 ? secs + 's' : ''}  leituras=${passes}${rots ? ' [' + rots + ']' : ''}${fallback ? ' FALLBACK' : ''}  tipo=${tipo}>${debug.tipo || '?'}${sinais}  Valor=${g('Valor')}${chips.length ? ' opções=' + chips.join('|') : ''}  Data=${g('Data')}  Hora=${g('Hora')}  Estab=${g('Estabelecimento').slice(0, 30)}${nota !== '-' ? '  Nota=' + nota : ''}${codes ? '  codigo=' + codes : ''}${same !== '-' ? '  mesma-compra=' + same : ''}  ${kind}${tag}`);
    }
    if (papersFound !== expectedPapers || askedPapers) console.log(`   papéis: encontrados ${papersFound}, esperados ${expectedPapers}${askedPapers ? ' (perguntou por ' + askedPapers + ')' : ''}`);
    fs.writeFileSync(out, JSON.stringify(results, null, 1));
    await page.close();
  }
  await browser.close();
  server.close();

  if (blocked.size) console.log('\nPedidos para fora bloqueados (o app não pode depender deles):\n  ' + [...blocked].join('\n  '));
  if (gabarito) {
    const count = (k, v) => results.filter(r => r.nota && r.nota[k] === v).length;
    const photos = [...new Set(results.map(r => r.file))];
    const rightCount = photos.filter(f => { const r = results.find(x => x.file === f); return r.papeis === r.papeisEsperados; }).length;
    console.log('\nResumo (fotos com gabarito: ' + photos.filter(f => results.find(x => x.file === f).nota).length + ', papéis lidos: ' + results.filter(r => r.nota).length + ')');
    const askedWrong = photos.filter(f => { const r = results.find(x => x.file === f); return r.papeisEsperados === 1 && r.papeisPerguntados; }).length;
    console.log(`Fotos com a quantidade certa de papéis: ${rightCount} de ${photos.length}; perguntou sem precisar em ${askedWrong}`);
    console.log('| Campo | Certo | Incerto, certo entre as opções | Incerto | Vazio | Errado |');
    console.log('|---|---|---|---|---|---|');
    console.log(`| valor | ${count('valor', 'certo')} | ${count('valor', 'incerto-ok')} | ${count('valor', 'incerto')} | ${count('valor', 'vazio')} | ${count('valor', 'errado')} |`);
    console.log(`| data | ${count('data', 'certo')} | - | - | ${count('data', 'vazio')} | ${count('data', 'errado')} |`);
    console.log(`| estab | ${count('estab', 'certo')} | - | - | - | ${count('estab', 'nao')} |`);
    const comLanc = results.filter(r => r.lanc);
    if (comLanc.length) {
      const soma = k => comLanc.reduce((a, r) => a + r.lanc[k], 0);
      console.log(`Lançamentos: ${soma('certos')} certos, ${soma('faltam')} faltaram, ${soma('aMais')} lidos a mais (${comLanc.length} papéis)`);
    }
    const firsts = results.filter(r => r.papel === 1);
    const comTipo = firsts.filter(r => gabarito[r.file] && gabarito[r.file].tipoEsperado);
    if (comTipo.length) {
      const certos = comTipo.filter(r => gabarito[r.file].tipoEsperado.includes(r.tipoLido));
      console.log(`Tipo descoberto certo: ${certos.length} de ${comTipo.length} fotos`);
      comTipo.filter(r => !certos.includes(r)).forEach(r => console.log(`   ${r.file}: descobriu ${r.tipoLido}, esperado ${gabarito[r.file].tipoEsperado.join(' ou ')}`));
    }
    const secs = firsts.reduce((a, r) => a + r.secs, 0) / Math.max(1, firsts.length);
    console.log(`Tempo médio por foto: ${secs.toFixed(1)}s`);
  }
  console.log('\nResultado completo em ' + out);
})().catch(e => { console.error(e); process.exit(1); });
