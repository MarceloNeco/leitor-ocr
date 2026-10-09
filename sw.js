// Guarda o app inteiro neste aparelho, para abrir e ler sem internet.
// VERSAO precisa acompanhar APP_VERSION no index.html: é a mudança dela que
// faz o navegador baixar a versão nova e jogar a antiga fora
// (testes/medir.js e testes/offline.js avisam quando as duas diferem).
const VERSAO = '0.6.0';
const CACHE = 'leitor-ocr-' + VERSAO;
const ARQUIVOS = [
  './',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './index.html',
  './libs/jsQR.js',
  './libs/pdfjs/pdf.min.mjs',
  './libs/pdfjs/pdf.worker.min.mjs',
  './libs/pdfjs/standard_fonts/FoxitDingbats.pfb',
  './libs/pdfjs/standard_fonts/FoxitFixed.pfb',
  './libs/pdfjs/standard_fonts/FoxitFixedBold.pfb',
  './libs/pdfjs/standard_fonts/FoxitFixedBoldItalic.pfb',
  './libs/pdfjs/standard_fonts/FoxitFixedItalic.pfb',
  './libs/pdfjs/standard_fonts/FoxitSerif.pfb',
  './libs/pdfjs/standard_fonts/FoxitSerifBold.pfb',
  './libs/pdfjs/standard_fonts/FoxitSerifBoldItalic.pfb',
  './libs/pdfjs/standard_fonts/FoxitSerifItalic.pfb',
  './libs/pdfjs/standard_fonts/FoxitSymbol.pfb',
  './libs/pdfjs/standard_fonts/LiberationSans-Bold.ttf',
  './libs/pdfjs/standard_fonts/LiberationSans-BoldItalic.ttf',
  './libs/pdfjs/standard_fonts/LiberationSans-Italic.ttf',
  './libs/pdfjs/standard_fonts/LiberationSans-Regular.ttf',
  './libs/pdfjs/wasm/jbig2.wasm',
  './libs/pdfjs/wasm/openjpeg.wasm',
  './libs/pdfjs/wasm/qcms_bg.wasm',
  './libs/zxing.min.js',
  './manifest.webmanifest',
  './tesseract/por.traineddata.gz',
  './tesseract/tesseract-core-lstm.wasm.js',
  './tesseract/tesseract-core-simd-lstm.wasm.js',
  './tesseract/tesseract.min.js',
  './tesseract/worker.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Tudo que é do app sai da cópia guardada; só o que não está nela vai à rede
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req)));
});
