/* =====================================================================
   leitura/codigos.js — QR code e código de barras. Só carrega quando uma foto
   é lida; o ZXing e o jsQR (pasta libs/) só baixam na primeira vez.
   ===================================================================== */
(function (L) {
  'use strict';

  // Reads the QR codes and barcodes in the photo: ZXing on the full frame,
  // jsQR as a second try for QR codes, then ZXing on the frame turned
  // sideways for barcodes printed up and down. Stops at the first find or
  // after about two seconds.
  async function readCodes(img) {
    try {
      if (!window.ZXing) await L.carregarScript('libs/zxing.min.js');
      if (!window.jsQR) await L.carregarScript('libs/jsQR.js');
    } catch (err) { console.warn(err); return []; }
    const hints = new Map();
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
    const reader = new ZXing.MultiFormatReader();
    reader.setHints(hints);
    const draw = (maxW, rot) => {
      const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
      const s = Math.min(1, maxW / w0);
      const w = Math.round(w0 * s), h = Math.round(h0 * s);
      const c = document.createElement('canvas');
      c.width = rot ? h : w; c.height = rot ? w : h;
      const x = c.getContext('2d');
      x.translate(c.width / 2, c.height / 2);
      x.rotate(rot * Math.PI / 180);
      x.drawImage(img, -w / 2, -h / 2, w, h);
      return c;
    };
    const found = [];
    const started = Date.now();
    for (const [maxW, rot, lib] of [[2000, 0, 'zxing'], [2000, 0, 'jsqr'], [1300, 0, 'zxing'], [1300, 90, 'zxing']]) {
      const c = draw(maxW, rot);
      try {
        if (lib === 'zxing') {
          const r = reader.decode(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(c))));
          found.push({ format: ZXing.BarcodeFormat[r.getBarcodeFormat()], text: r.getText() });
        } else {
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height);
          const r = jsQR(d.data, c.width, c.height, { inversionAttempts: 'dontInvert' });
          if (r && r.data) found.push({ format: 'QR_CODE', text: r.data });
        }
      } catch (err) { /* nothing found in this try */ }
      if (found.length || Date.now() - started > 2500) break;
    }
    return found;
  }

  L.codigos = { readCodes };
})(window.Leitura);
