// Guarda o app neste aparelho, para abrir e ler sem internet.
// VERSAO precisa acompanhar APP_VERSION no index.html: é a mudança dela que
// faz o navegador baixar a versão nova e jogar a antiga fora
// (testes/medir.js e testes/offline.js avisam quando as duas diferem).
const VERSAO = '0.7.8';
// Todos os apps do solverone.com.br dividem o mesmo endereço e, por isso, as mesmas
// cópias guardadas: o nome leva o app, e só as cópias deste app são apagadas.
const PREFIXO = 'dgo-leitor-ocr-';
const CACHE = PREFIXO + VERSAO;
// As partes pesadas (motor de OCR, leitor de PDF, leitores de código: pastas
// tesseract/ e libs/) não baixam sozinhas: ficam guardadas na primeira vez que
// são usadas, ou quando a pessoa toca em "Guardar tudo" (Ajustes). Moram numa
// cópia própria, que passa de uma versão para a outra sem baixar tudo de novo.
const CACHE_PESADO = PREFIXO + 'pesado-1';
const PASTAS_PESADAS = ['tesseract/', 'libs/'];
// O básico: telas e o motor de leitura sem as partes pesadas (arquivo novo do app entra aqui)
const ARQUIVOS = [
  './',
  './dados/estabelecimentos.json',
  './formatos/csv.js',
  './formatos/docx.js',
  './formatos/ofx.js',
  './formatos/pdf.js',
  './formatos/texto.js',
  './formatos/xlsx.js',
  './formatos/zip.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './index.html',
  './leitores/arrecadacao.js',
  './leitores/boleto.js',
  './leitores/cartao.js',
  './leitores/conta.js',
  './leitores/extrato.js',
  './leitores/nfce.js',
  './leitores/transferencia.js',
  './leitura.js',
  './leitura/catalogo.js',
  './leitura/codigos.js',
  './leitura/estabelecimentos.js',
  './leitura/foto.js',
  './leitura/relacoes.js',
  './leitura/texto.js',
  './manifest.webmanifest',
];

const pesado = url => PASTAS_PESADAS.some(p => url.startsWith(new URL(p, self.registration.scope).href));

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const pes = await caches.open(CACHE_PESADO);
    for (const k of await caches.keys()) {
      if (k === CACHE || k === CACHE_PESADO || !(k.startsWith(PREFIXO) || k.startsWith('leitor-ocr-'))) continue;
      // Cópia de uma versão antiga: o que for pesado passa para a cópia que fica
      const velho = await caches.open(k);
      for (const req of await velho.keys()) if (pesado(req.url)) await pes.put(req, await velho.match(req));
      await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

// Tudo que é do app sai da cópia guardada; o que não está nela vai à rede, e o
// que for pesado fica guardado ao passar
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && pesado(req.url)) await (await caches.open(CACHE_PESADO)).put(req, res.clone());
    return res;
  })());
});
