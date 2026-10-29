/* =====================================================================
   leitura/foto.js — ler texto em foto (OCR). Só carrega na primeira foto.
   Endireita a foto (e cada papel recortado dela), acha os papéis, limpa o
   fundo, faz as várias leituras com o Tesseract.js (pasta tesseract/, que só
   baixa na primeira vez) e lê à parte o valor em letra grande.
   Usa leitura/texto.js para saber se as leituras concordam.
   ===================================================================== */
(function (L) {
  'use strict';
  const { detectDocType, decidirValor, goodWords } = L.texto;

  // The OCR engine (Tesseract.js 5.1.1), its worker, core and the Portuguese
  // language file live in the site's own tesseract/ folder, so reading no
  // longer depends on jsDelivr. Absolute URLs are required because the
  // engine runs inside a blob worker, where relative paths do not resolve.
  const OCR_BASE = L.url('tesseract/');

  // Dynamic loader for Tesseract.js if not already present
  async function loadTesseractLibrary() {
    if (!window.Tesseract) await L.carregarScript('tesseract/tesseract.min.js');
    return window.Tesseract;
  }

  // How tilted the text lines are: the angle (degrees, -90 < a <= 90, the
  // way the lines run in the picture) at which the ink of the letter-sized
  // marks makes the sharpest stripes. Only those marks count: creases,
  // shadows and logos are big marks, and they fooled the old measure, taken
  // on the whole picture, on crumpled slips (78° on a slip lying straight).
  // The ink is measured on cells of a third of a letter: at that size the
  // gaps between letters vanish and the rows become solid stripes, while
  // the gaps between the lines stay (on a receipt the letters line up in
  // columns too, and at full size the columns could win). "razao" says how
  // much better that angle is than its perpendicular.
  function anguloLinhas(src) {
    // on a small copy of a whole photo the letters are 2 or 3 pixels tall and
    // break into bits: the copy grows until they are about 8 pixels tall
    let grade = letterGrid(src, 500);
    if (grade.alturaLetra < 6 && Math.max(src.width, src.height) > 500) grade = letterGrid(src, Math.min(2000, Math.round(500 * 8 / Math.max(1, grade.alturaLetra))));
    const { label, letterLike, alturaLetra: h, sw, sh } = grade;
    const cell = Math.max(1, Math.round(h / 3));
    const gw = Math.ceil(sw / cell), gh = Math.ceil(sh / cell);
    const dens = new Float32Array(gw * gh);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { const id = label[y * sw + x]; if (id >= 0 && letterLike[id]) dens[Math.floor(y / cell) * gw + Math.floor(x / cell)] += 1; }
    const pix = [];
    for (let i = 0; i < dens.length; i++) if (dens[i]) pix.push([i % gw + 0.5, Math.floor(i / gw) + 0.5, dens[i] / (cell * cell)]);
    if (pix.length < 30) return { a: 0, razao: 0 };
    const diag = Math.ceil(Math.hypot(gw, gh));
    // the ink per line at this angle, and how much it jumps from line to
    // line: many sharp jumps means the lines of text are level
    const nitidez = a => {
      const ar = a * Math.PI / 180, sa = Math.sin(ar), ca = Math.cos(ar);
      const prof = new Float32Array(diag + 2);
      for (const [x, y, w] of pix) {
        // spread each cell between the two nearest lines, otherwise
        // diagonal angles produce a false striped pattern
        const yy = -x * sa + y * ca + diag / 2, y0 = Math.floor(yy);
        if (y0 < 0 || y0 >= diag) continue;
        const f = yy - y0;
        prof[y0] += w * (1 - f);
        prof[y0 + 1] += w * f;
      }
      let e = 0;
      for (let i = 1; i <= diag; i++) { const d = prof[i] - prof[i - 1]; e += d * d; }
      return e;
    };
    let best = { a: 0, e: -1 };
    for (let a = -90; a < 90; a += 2) { const e = nitidez(a); if (e > best.e) best = { a, e }; }
    for (let a = best.a - 1.5; a <= best.a + 1.5; a += 0.5) { const e = nitidez(a); if (e > best.e) best = { a, e }; }
    return { a: best.a, razao: best.e / Math.max(1, nitidez(best.a + 90)) };
  }

  // A phone screenshot in dark mode: light letters on a dark screen. It has
  // the shape of a phone screen (tall and thin) and is dark on average; a
  // photo of a receipt in poor light is not one (it keeps its paper crop and
  // its dark ink)
  function telaEscura(img) {
    if (img.cutOut) return false;
    if (img._telaEscura !== undefined) return img._telaEscura;
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    let escura = false;
    if (w && h && Math.max(w, h) / Math.min(w, h) >= 1.9) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(100 * w / Math.max(w, h)));
      c.height = Math.max(1, Math.round(100 * h / Math.max(w, h)));
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let total = 0;
      for (let i = 0; i < d.length; i += 4) total += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      escura = total / (d.length / 4) < 90;
    }
    img._telaEscura = escura;
    return escura;
  }

  // Builds a high-resolution image just for OCR: finds the receipt paper,
  // crops it, enlarges the text and turns it into clean black-on-white.
  function buildOcrCanvas(img, rotation = 0, binarize = false, targetW = 1000, region = null) {
    const tela = telaEscura(img);
    const MAX_SRC = 3000;
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    const s = Math.min(1, MAX_SRC / Math.max(w, h));
    w = Math.round(w * s);
    h = Math.round(h * s);

    // Rotation by any angle (not only 90°), enlarging the canvas so nothing is cut off
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const src = document.createElement('canvas');
    src.width = Math.round(w * cos + h * sin);
    src.height = Math.round(w * sin + h * cos);
    const sctx = src.getContext('2d');
    sctx.fillStyle = '#808080';
    sctx.fillRect(0, 0, src.width, src.height);
    sctx.translate(src.width / 2, src.height / 2);
    sctx.rotate(rad);
    sctx.drawImage(img, -w / 2, -h / 2, w, h);

    // Region to read: the one asked for (in the rotated frame), the block of
    // small ink marks that looks like text ('ink'), the whole picture ('all':
    // a paper already cut out of a photo with several), else the paper
    if (region === 'ink') region = findTextBox(src) || findPaperBox(src, tela);
    if (region === 'all') region = { cx: 0, cy: 0, cw: src.width, ch: src.height };
    const { cx, cy, cw, ch } = region || findPaperBox(src, tela);

    // 2. Crop and resize so the receipt text has a size Tesseract reads well
    const scale = Math.min(region ? 4 : 3, targetW / cw);
    const out = document.createElement('canvas');
    out.width = Math.round(cw * scale);
    out.height = Math.round(ch * scale);
    out.frame = { cx, cy, cw, ch, scale, width: src.width, height: src.height };   // to map word boxes back
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(src, cx, cy, cw, ch, 0, 0, out.width, out.height);

    // 3. Grayscale + local (adaptive) threshold: handles shadows and faded thermal print
    const od = octx.getImageData(0, 0, out.width, out.height);
    const d = od.data;
    const W = out.width, H = out.height;
    const g = new Float32Array(W * H);
    for (let i = 0; i < g.length; i++) {
      g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    }
    // Tesseract reads dark ink on light paper: a dark screenshot is inverted
    if (tela) for (let i = 0; i < g.length; i++) g[i] = 255 - g[i];
    // Local mean of the gray level: the paper and the table around it. In
    // gray mode every pixel is measured against it, so a dark table or a
    // blue background turns white and only the ink stays dark (Tesseract
    // takes a big dark area for a picture and reads nothing). In black and
    // white mode it is the adaptive threshold (Bradley).
    const integ = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) {
      let row = 0;
      for (let x = 0; x < W; x++) {
        row += g[y * W + x];
        integ[(y + 1) * (W + 1) + x + 1] = integ[y * (W + 1) + x + 1] + row;
      }
    }
    const r = Math.max(8, Math.round(W / 32));
    const T = 0.15;
    for (let y = 0; y < H; y++) {
      const ya = Math.max(0, y - r), yb = Math.min(H, y + r + 1);
      for (let x = 0; x < W; x++) {
        const xa = Math.max(0, x - r), xb = Math.min(W, x + r + 1);
        const area = (xb - xa) * (yb - ya);
        const mean = (integ[yb * (W + 1) + xb] - integ[ya * (W + 1) + xb] - integ[yb * (W + 1) + xa] + integ[ya * (W + 1) + xa]) / area;
        const v = g[y * W + x];
        if (binarize) {
          g[y * W + x] = v < mean * (1 - T) ? 0 : 255;
        } else {
          const ratio = v / (mean + 1);
          g[y * W + x] = ratio >= 1 ? 255 : Math.round(255 * ratio * ratio);
        }
      }
    }
    for (let i = 0; i < g.length; i++) {
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = g[i];
    }
    octx.putImageData(od, 0, 0);
    return out;
  }

  // Finds the paper in a photo (or canvas): the largest bright area on a
  // small copy. Returns the box to crop, or the whole image when no paper
  // stands out.
  function findPaperBox(src, tela = false) {
    // A dark screenshot is not paper on a table: the whole image is read, or
    // the notifications below the brightest one are cut off
    if (tela) return { cx: 0, cy: 0, cw: src.width, ch: src.height };
    const SMALL = 300;
    const k = Math.min(1, SMALL / Math.max(src.width, src.height));
    const sw = Math.max(1, Math.round(src.width * k));
    const sh = Math.max(1, Math.round(src.height * k));
    const small = document.createElement('canvas');
    small.width = sw;
    small.height = sh;
    const smctx = small.getContext('2d');
    smctx.drawImage(src, 0, 0, sw, sh);
    const sd = smctx.getImageData(0, 0, sw, sh).data;
    const gray = new Uint8Array(sw * sh);
    for (let i = 0; i < gray.length; i++) {
      gray[i] = 0.299 * sd[i * 4] + 0.587 * sd[i * 4 + 1] + 0.114 * sd[i * 4 + 2];
    }
    const otsu = (from) => {
      const hist = new Array(256).fill(0);
      let n = 0;
      for (const g of gray) if (g >= from) { hist[g]++; n++; }
      let sum = 0;
      for (let t = 0; t < 256; t++) sum += t * hist[t];
      let sumB = 0, wB = 0, best = 0, thr = from;
      for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (!wB || wB === n) continue;
        sumB += t * hist[t];
        const mB = sumB / wB, mF = (sum - sumB) / (n - wB);
        const between = wB * (n - wB) * (mB - mF) * (mB - mF);
        if (between > best) { best = between; thr = t; }
      }
      return thr;
    };
    const largestBlob = (thr) => {
      const seen = new Uint8Array(sw * sh);
      let bestBox = null, bestArea = 0;
      const stack = [];
      for (let start = 0; start < gray.length; start++) {
        if (seen[start] || gray[start] <= thr) continue;
        let area = 0, x0 = sw, y0 = sh, x1 = 0, y1 = 0;
        seen[start] = 1;
        stack.push(start);
        while (stack.length) {
          const p = stack.pop();
          const x = p % sw, y = (p - x) / sw;
          area++;
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
          const nb = [x > 0 ? p - 1 : -1, x < sw - 1 ? p + 1 : -1, y > 0 ? p - sw : -1, y < sh - 1 ? p + sw : -1];
          for (const q of nb) {
            if (q >= 0 && !seen[q] && gray[q] > thr) { seen[q] = 1; stack.push(q); }
          }
        }
        if (area > bestArea) { bestArea = area; bestBox = { x0, y0, x1, y1 }; }
      }
      return { box: bestBox, frac: bestArea / (sw * sh) };
    };
    // Try progressively brighter cut-offs until the paper separates from the table
    let blob = largestBlob(otsu(0));
    for (let i = 0; i < 3 && blob.frac > 0.6; i++) {
      blob = largestBlob(otsu(otsu(0) + 1 + i * 8));
    }
    let cx = 0, cy = 0, cw = src.width, ch = src.height;
    if (blob.box && blob.frac > 0.02 && blob.frac < 0.9) {
      const pad = 0.02 * Math.max(sw, sh);
      const bx0 = Math.max(0, blob.box.x0 - pad), by0 = Math.max(0, blob.box.y0 - pad);
      const bx1 = Math.min(sw, blob.box.x1 + 1 + pad), by1 = Math.min(sh, blob.box.y1 + 1 + pad);
      cx = Math.round(bx0 / k);
      cy = Math.round(by0 / k);
      cw = Math.round((bx1 - bx0) / k);
      ch = Math.round((by1 - by0) / k);
    }
    return { cx, cy, cw, ch };
  }

  // Finds every paper in the photo: the bright blobs on a small copy, each
  // big enough to be a receipt and with text on it. Papers lying against
  // each other come out as one blob; when its text has a blank band across
  // it (the margins of two papers), the blob is cut along the widest band,
  // both ways, until none is left. Papers lying on top of each other stay
  // together. Returns the boxes in the image's own pixels, top to bottom
  // and left to right; the person confirms before they are read apart.
  function findPapers(img) {
    const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
    const SMALL = 400;
    const k = Math.min(1, SMALL / Math.max(w0, h0));
    const sw = Math.max(1, Math.round(w0 * k)), sh = Math.max(1, Math.round(h0 * k));
    const small = document.createElement('canvas');
    small.width = sw; small.height = sh;
    const ctx = small.getContext('2d');
    ctx.drawImage(img, 0, 0, sw, sh);
    const d = ctx.getImageData(0, 0, sw, sh).data;
    const gray = new Uint8Array(sw * sh);
    for (let i = 0; i < gray.length; i++) gray[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    const otsu = (from) => {
      const hist = new Array(256).fill(0);
      let n = 0;
      for (const g of gray) if (g >= from) { hist[g]++; n++; }
      let sum = 0;
      for (let t = 0; t < 256; t++) sum += t * hist[t];
      let sumB = 0, wB = 0, best = 0, thr = from;
      for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (!wB || wB === n) continue;
        sumB += t * hist[t];
        const mB = sumB / wB, mF = (sum - sumB) / (n - wB);
        const between = wB * (n - wB) * (mB - mF) * (mB - mF);
        if (between > best) { best = between; thr = t; }
      }
      return thr;
    };
    const blobs = (thr) => {
      const seen = new Uint8Array(sw * sh);
      const out = [];
      const stack = [];
      for (let start = 0; start < gray.length; start++) {
        if (seen[start] || gray[start] <= thr) continue;
        let area = 0, x0 = sw, y0 = sh, x1 = 0, y1 = 0;
        seen[start] = 1; stack.push(start);
        while (stack.length) {
          const p = stack.pop();
          const x = p % sw, y = (p - x) / sw;
          area++;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          const nb = [x > 0 ? p - 1 : -1, x < sw - 1 ? p + 1 : -1, y > 0 ? p - sw : -1, y < sh - 1 ? p + sw : -1];
          for (const q of nb) if (q >= 0 && !seen[q] && gray[q] > thr) { seen[q] = 1; stack.push(q); }
        }
        out.push({ area, x0, y0, x1, y1, frac: area / (sw * sh), fill: area / ((x1 - x0 + 1) * (y1 - y0 + 1)) });
      }
      return out.sort((a, b) => b.area - a.area);
    };
    // Brighter and brighter cut-offs until the biggest blob is a paper, not the whole table
    let thr = otsu(0), found = blobs(thr);
    for (let i = 0; i < 3 && found.length && found[0].frac > 0.6; i++) {
      thr = otsu(otsu(0) + 1 + i * 8);
      found = blobs(thr);
    }
    const papers = found.filter(b => b.frac >= 0.008 && b.frac < 0.9 && b.fill >= 0.35 && (b.x1 - b.x0) >= 0.06 * sw && (b.y1 - b.y0) >= 0.06 * sh);
    // A small blob inside a bigger one is a bright patch of that paper, not another paper
    const inside = (a, b) => a.x0 >= b.x0 - 2 && a.y0 >= b.y0 - 2 && a.x1 <= b.x1 + 2 && a.y1 <= b.y1 + 2;
    const kept = papers.filter((a, i) => !papers.some((b, j) => j < i && inside(a, b)));

    // Letters on a grid (same small size, so the cells line up with the blobs)
    const { count, gw, gh, CELL } = letterGrid(small, SMALL);
    const toCells = b => ({ x0: Math.floor(b.x0 / CELL), y0: Math.floor(b.y0 / CELL), x1: Math.floor(b.x1 / CELL), y1: Math.floor(b.y1 / CELL) });
    const letters = c => { let n = 0; for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) n += count[y * gw + x] || 0; return n; };
    const rows = c => { let n = 0; for (let y = c.y0; y <= c.y1; y++) { let m = 0; for (let x = c.x0; x <= c.x1; x++) if ((count[y * gw + x] || 0) >= 2) m++; if (m >= 2) n++; } return n; };
    const hasText = c => letters(c) >= 15 && rows(c) >= 3;   // a few lines of text, not a stripe of light or a loose corner
    const trim = c => {
      let x0 = gw, y0 = gh, x1 = -1, y1 = -1;
      for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) if ((count[y * gw + x] || 0) >= 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return x1 < 0 ? null : { x0, y0, x1, y1 };
    };
    const G = Math.max(3, Math.round(0.06 * Math.max(gw, gh)));
    const cut = (c, depth) => {
      const t = trim(c);
      if (!t || letters(t) < 15) return [];
      if (depth >= 4) return [t];
      const colHas = [], rowHas = [];
      for (let x = t.x0; x <= t.x1; x++) { let h = false; for (let y = t.y0; y <= t.y1; y++) if ((count[y * gw + x] || 0) >= 2) { h = true; break; } colHas.push(h); }
      for (let y = t.y0; y <= t.y1; y++) { let h = false; for (let x = t.x0; x <= t.x1; x++) if ((count[y * gw + x] || 0) >= 2) { h = true; break; } rowHas.push(h); }
      const widest = (has) => {
        let best = null, start = -1;
        for (let i = 0; i <= has.length; i++) {
          if (i < has.length && !has[i]) { if (start < 0) start = i; continue; }
          if (start >= 0) { const len = i - start; if (start > 0 && i < has.length && len >= G && (!best || len > best.len)) best = { start, end: i - 1, len }; start = -1; }
        }
        return best;
      };
      const vc = widest(colHas), hc = widest(rowHas);
      if (!vc && !hc) return [t];
      if (vc && (!hc || vc.len >= hc.len)) {
        const a = t.x0 + vc.start, b = t.x0 + vc.end;
        return [...cut({ x0: t.x0, y0: t.y0, x1: a - 1, y1: t.y1 }, depth + 1), ...cut({ x0: b + 1, y0: t.y0, x1: t.x1, y1: t.y1 }, depth + 1)];
      }
      const a = t.y0 + hc.start, b = t.y0 + hc.end;
      return [...cut({ x0: t.x0, y0: t.y0, x1: t.x1, y1: a - 1 }, depth + 1), ...cut({ x0: t.x0, y0: b + 1, x1: t.x1, y1: t.y1 }, depth + 1)];
    };

    const boxes = [];
    kept.forEach(b => {
      const c = toCells(b);
      if (!hasText(c)) return;
      const parts = (b.fill >= 0.85 ? [] : cut(c, 0)).filter(hasText);   // one neat paper is never cut
      if (parts.length <= 1) { boxes.push({ x0: b.x0, y0: b.y0, x1: b.x1 + 1, y1: b.y1 + 1 }); return; }
      parts.forEach(t => boxes.push({ x0: t.x0 * CELL - CELL, y0: t.y0 * CELL - CELL, x1: (t.x1 + 2) * CELL, y1: (t.y1 + 2) * CELL }));
    });
    // Dark bands printed across a bill split its paper into stacked strips: glue back
    // pieces that nearly touch and line up on both sides
    const near = 0.012 * Math.max(sw, sh);
    for (let i = 0; i < boxes.length; i++) for (let j = boxes.length - 1; j > i; j--) {
      const a = boxes[i], b = boxes[j];
      const W = Math.max(a.x1 - a.x0, b.x1 - b.x0), H = Math.max(a.y1 - a.y0, b.y1 - b.y0);
      const stacked = Math.max(a.y0 - b.y1, b.y0 - a.y1) <= near && Math.abs(a.x0 - b.x0) <= 0.1 * W && Math.abs(a.x1 - b.x1) <= 0.1 * W;
      const beside = Math.max(a.x0 - b.x1, b.x0 - a.x1) <= near && Math.abs(a.y0 - b.y0) <= 0.1 * H && Math.abs(a.y1 - b.y1) <= 0.1 * H;
      if (!stacked && !beside) continue;
      boxes[i] = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
      boxes.splice(j, 1); j = boxes.length;   // the glued box may now touch another piece
    }
    const pad = 0.015 * Math.max(sw, sh);
    const out = boxes.map(b => {
      const bx0 = Math.max(0, b.x0 - pad), by0 = Math.max(0, b.y0 - pad);
      const bx1 = Math.min(sw, b.x1 + pad), by1 = Math.min(sh, b.y1 + pad);
      return { cx: Math.round(bx0 / k), cy: Math.round(by0 / k), cw: Math.round((bx1 - bx0) / k), ch: Math.round((by1 - by0) / k) };
    });
    out.sort((a, b) => (Math.abs(a.cy - b.cy) < 0.15 * h0 ? a.cx - b.cx : a.cy - b.cy));
    return out;
  }

  // Letter-sized ink marks counted on a coarse grid: the raw material of
  // findTextBox (where the text is), findPapers (how many papers),
  // anguloLinhas (how tilted the text is) and faixasGrandes (the big
  // digits). Also returns the marks (box, area, center), which mark each
  // pixel belongs to, which marks are letter-sized and their typical
  // height, in the small copy's pixels (k = its scale).
  function letterGrid(src, SMALL = 400) {
    const k = Math.min(1, SMALL / Math.max(src.width, src.height));
    const sw = Math.max(1, Math.round(src.width * k)), sh = Math.max(1, Math.round(src.height * k));
    const small = document.createElement('canvas');
    small.width = sw; small.height = sh;
    const ctx = small.getContext('2d');
    ctx.drawImage(src, 0, 0, sw, sh);
    const d = ctx.getImageData(0, 0, sw, sh).data;
    const g = new Float32Array(sw * sh);
    for (let i = 0; i < g.length; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    // ink = clearly darker than its neighborhood
    const integ = new Float64Array((sw + 1) * (sh + 1));
    for (let y = 0; y < sh; y++) {
      let row = 0;
      for (let x = 0; x < sw; x++) { row += g[y * sw + x]; integ[(y + 1) * (sw + 1) + x + 1] = integ[y * (sw + 1) + x + 1] + row; }
    }
    const r = Math.max(5, Math.round(sw / 30));
    const ink = new Uint8Array(sw * sh);
    for (let y = 0; y < sh; y++) {
      const ya = Math.max(0, y - r), yb = Math.min(sh, y + r + 1);
      for (let x = 0; x < sw; x++) {
        const xa = Math.max(0, x - r), xb = Math.min(sw, x + r + 1);
        const area = (xb - xa) * (yb - ya);
        const sum = integ[yb * (sw + 1) + xb] - integ[ya * (sw + 1) + xb] - integ[yb * (sw + 1) + xa] + integ[ya * (sw + 1) + xa];
        ink[y * sw + x] = g[y * sw + x] * area < sum * 0.82 ? 1 : 0;
      }
    }
    // connected marks; keep the letter-sized ones
    const label = new Int32Array(sw * sh).fill(-1);
    const marks = [];
    const stack = [];
    for (let start = 0; start < ink.length; start++) {
      if (!ink[start] || label[start] >= 0) continue;
      const id = marks.length;
      let area = 0, x0 = sw, y0 = sh, x1 = 0, y1 = 0, sx = 0, sy = 0;
      label[start] = id; stack.push(start);
      while (stack.length) {
        const p = stack.pop();
        const x = p % sw, y = (p - x) / sw;
        area++; sx += x; sy += y;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        const nb = [x > 0 ? p - 1 : -1, x < sw - 1 ? p + 1 : -1, y > 0 ? p - sw : -1, y < sh - 1 ? p + sw : -1];
        for (const q of nb) if (q >= 0 && ink[q] && label[q] < 0) { label[q] = id; stack.push(q); }
      }
      marks.push({ area, x0, y0, x1, y1, cx: sx / area, cy: sy / area });
    }
    const letterLike = marks.map(m => m.area >= 2 && m.area <= 400 && (m.x1 - m.x0) < 30 && (m.y1 - m.y0) < 30);
    // coarse grid: cells with a few letter-sized marks are text
    const CELL = 10;
    const gw = Math.ceil(sw / CELL), gh = Math.ceil(sh / CELL);
    const cells = new Uint8Array(gw * gh);
    const count = new Uint16Array(gw * gh);
    marks.forEach((m, i) => {
      if (!letterLike[i]) return;
      const gx = Math.floor((m.x0 + m.x1) / 2 / CELL), gy = Math.floor((m.y0 + m.y1) / 2 / CELL);
      count[gy * gw + gx]++;
    });
    const alturas = marks.filter((m, i) => letterLike[i]).map(m => m.y1 - m.y0 + 1).sort((a, b) => a - b);
    return { count, gw, gh, CELL, k, sw, sh, marks, label, letterLike, alturaLetra: alturas[Math.floor(alturas.length / 2)] || 1 };
  }

  // Bands of big digits: the marks much taller than the typical letter,
  // lined up side by side (the amount of a card slip or a restaurant bill,
  // but also a logo). marks and k come from letterGrid; the bands come back
  // in the canvas's own pixels: [{ x0, y0, x1, y1, h, n }].
  function faixasGrandes(marks, k) {
    const alt = m => m.y1 - m.y0 + 1, larg = m => m.x1 - m.x0 + 1;
    const tx = marks.filter(m => m.area >= 4 && alt(m) >= 5 && alt(m) <= 120 && larg(m) <= 160);
    if (tx.length < 10) return [];
    const hs = tx.map(alt).sort((a, b) => a - b), med = hs[Math.floor(hs.length / 2)];
    const tall = tx.filter(m => alt(m) >= 1.7 * med && alt(m) <= 7 * med && larg(m) >= 0.25 * alt(m)).sort((a, b) => a.x0 - b.x0);
    const grupos = [];
    tall.forEach(m => {
      const h = alt(m);
      const g = grupos.find(G => m.x0 - G.x1 <= 1.6 * Math.max(G.h, h) && Math.min(G.y1, m.y1) - Math.max(G.y0, m.y0) >= 0.5 * Math.min(G.h, h));
      if (g) { g.x1 = Math.max(g.x1, m.x1); g.y0 = Math.min(g.y0, m.y0); g.y1 = Math.max(g.y1, m.y1); g.h = g.y1 - g.y0 + 1; g.n++; }
      else grupos.push({ x0: m.x0, x1: m.x1, y0: m.y0, y1: m.y1, h, n: 1 });
    });
    return grupos.filter(g => g.n >= 3 || (g.n === 2 && g.x1 - g.x0 >= 2 * g.h)).map(g => ({ x0: g.x0 / k, y0: g.y0 / k, x1: g.x1 / k, y1: g.y1 / k, h: g.h / k, n: g.n }));
  }

  // One band cut out of the canvas: only the marks inside the band stay (the
  // lines above and below, and the paper's edge, are blanked), then it is
  // enlarged to alvoH pixels of height with a white margin around, the way
  // the engine reads a lone line best. null when nothing is inside.
  function recorteFaixa(canvas, marks, k, g, alvoH) {
    const h = g.y1 - g.y0 + 1, pad = Math.max(4, 0.15 * h);
    const X0 = g.x0 - 1.3 * h, X1 = g.x1 + 0.4 * h, Y0 = g.y0 - pad, Y1 = g.y1 + pad;
    const dentro = marks.map(m => ({ x0: m.x0 / k, y0: m.y0 / k, x1: (m.x1 + 1) / k, y1: (m.y1 + 1) / k }))
      .filter(m => m.x0 >= X0 && m.x1 <= X1 && m.y0 >= Y0 && m.y1 <= Y1);
    if (!dentro.length) return null;
    const x0 = Math.max(0, Math.floor(Math.min(...dentro.map(m => m.x0)) - 2)), y0 = Math.max(0, Math.floor(Math.min(...dentro.map(m => m.y0)) - 2));
    const x1 = Math.min(canvas.width, Math.ceil(Math.max(...dentro.map(m => m.x1)) + 2)), y1 = Math.min(canvas.height, Math.ceil(Math.max(...dentro.map(m => m.y1)) + 2));
    if (x1 - x0 < 8 || y1 - y0 < 8) return null;
    const faixa = document.createElement('canvas');
    faixa.width = x1 - x0; faixa.height = y1 - y0;
    const fctx = faixa.getContext('2d');
    fctx.fillStyle = '#fff'; fctx.fillRect(0, 0, faixa.width, faixa.height);
    dentro.forEach(m => fctx.drawImage(canvas, m.x0 - 1, m.y0 - 1, m.x1 - m.x0 + 2, m.y1 - m.y0 + 2, m.x0 - 1 - x0, m.y0 - 1 - y0, m.x1 - m.x0 + 2, m.y1 - m.y0 + 2));
    const s = alvoH / faixa.height, margem = Math.round(0.4 * alvoH);
    const out = document.createElement('canvas');
    out.width = Math.round(faixa.width * s) + 2 * margem; out.height = alvoH + 2 * margem;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, out.height);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(faixa, margem, margem, Math.round(faixa.width * s), alvoH);
    return out;
  }

  // Two symbols that look the same cannot be two different digits: the
  // thermal print fills the "0" and the engine reads "8" for one of them
  // (34,08 for 34,00), with full confidence. Compares the ink of each pair
  // of digits the engine found in the crop; false when a pair looks alike
  // (85% or more) but was read as different digits.
  function digitosCoerentes(crop, symbols) {
    const ctx = crop.getContext('2d');
    const W = 10, H = 14;
    const vetor = b => {
      const w = Math.max(1, b.x1 - b.x0), h = Math.max(1, b.y1 - b.y0);
      const d = ctx.getImageData(b.x0, b.y0, w, h).data;
      const v = new Float32Array(W * H), n = new Float32Array(W * H);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const k = Math.floor(y * H / h) * W + Math.floor(x * W / w);
        v[k] += d[(y * w + x) * 4] < 128 ? 1 : 0;
        n[k]++;
      }
      for (let k = 0; k < v.length; k++) v[k] /= n[k] || 1;
      return v;
    };
    const digitos = symbols.filter(s => /^\d$/.test(s.text) && s.bbox).map(s => ({ t: s.text, v: vetor(s.bbox) }));
    for (let i = 0; i < digitos.length; i++) for (let j = i + 1; j < digitos.length; j++) {
      if (digitos[i].t === digitos[j].t) continue;
      let dif = 0;
      for (let k = 0; k < W * H; k++) dif += Math.abs(digitos[i].v[k] - digitos[j].v[k]);
      if (1 - dif / (W * H) >= 0.85) return false;
    }
    return true;
  }

  // The amount in big letters. The regular readings skip the double-height
  // digits of card slips ("R$36,00") and restaurant bills, or get one digit
  // wrong (23,09 for 23,00): here each band of tall marks is cut out on its
  // own, cleaned of the lines around it, enlarged and read as a single line
  // at four sizes (the "R$" comes out as "6" at one size and right at the
  // others, so the sizes vote). A band without a digit at the first size is
  // a logo or a label and is left alone. Returns [{ valor, vezes, conf,
  // duvida }] per amount read, the one read most often first (duvida: some
  // reading of it had two alike symbols as different digits, see
  // digitosCoerentes); texto.js decides what it is worth.
  async function lerValorGrande(img, worker, rot, region) {
    const reg = region || (img.cutOut ? 'all' : null);
    const bin = buildOcrCanvas(img, rot, true, 1400, reg);
    const { marks, k } = letterGrid(bin, 1400);
    const faixas = faixasGrandes(marks, k);
    if (!faixas.length) return [];
    const cinza = buildOcrCanvas(img, rot, false, 1400, reg);
    const lidos = new Map();
    await worker.setParameters({ tessedit_pageseg_mode: '7' });   // one line of text
    try {
      for (const g of faixas.slice(0, 4)) {
        for (const [alvo, fonte] of [[48, cinza], [56, bin], [64, cinza], [80, cinza]]) {
          const recorte = recorteFaixa(fonte, marks, k, g, alvo);
          if (!recorte) break;
          const res = await worker.recognize(recorte);
          const texto = String(res.data.text || '');
          if (!/\d/.test(texto)) break;
          const m = texto.match(/(\d{1,3}(?:[.,]\d{3})*|\d+)\s?[.,]\s?(\d{2})(?!\d)/);
          if (!m) continue;
          const valor = parseFloat(m[1].replace(/[.,]/g, '') + '.' + m[2]);
          if (!(valor > 0 && valor < 100000)) continue;
          const v = lidos.get(valor) || { valor, vezes: 0, conf: 0, duvida: false };
          v.vezes++;
          v.conf = Math.max(v.conf, res.data.confidence || 0);
          if (!digitosCoerentes(recorte, res.data.symbols || [])) v.duvida = true;
          lidos.set(valor, v);
        }
      }
    } finally {
      await worker.setParameters({ tessedit_pageseg_mode: '6' });   // back to the engine's default (one block)
    }
    return [...lidos.values()].sort((a, b) => b.vezes - a.vezes || b.conf - a.conf);
  }

  function findTextBox(src, SMALL = 400) {
    const { count, gw, gh, CELL, k } = letterGrid(src, SMALL);
    const cells = new Uint8Array(gw * gh);
    const text = [];
    for (let i = 0; i < cells.length; i++) if (count[i] >= 2) text.push({ x: i % gw, y: Math.floor(i / gw), n: count[i] });
    if (text.length < 4) return null;
    // keep the cells near the middle of the text, drop stray ones far away
    const med = a => { const b = a.slice().sort((p, q) => p - q); return b[Math.floor(b.length / 2)]; };
    const mx = med(text.map(c => c.x)), my = med(text.map(c => c.y));
    const dist = text.map(c => Math.hypot(c.x - mx, c.y - my));
    const limit = Math.max(3 * med(dist), 4);
    const kept = text.filter((c, i) => dist[i] <= limit);
    const best = { letters: kept.reduce((a, c) => a + c.n, 0), x0: Math.min(...kept.map(c => c.x)), y0: Math.min(...kept.map(c => c.y)), x1: Math.max(...kept.map(c => c.x)), y1: Math.max(...kept.map(c => c.y)) };
    if (best.letters < 15) return null;
    const pad = CELL;
    const cx = Math.max(0, Math.round((best.x0 * CELL - pad) / k)), cy = Math.max(0, Math.round((best.y0 * CELL - pad) / k));
    const cw = Math.min(src.width - cx, Math.round(((best.x1 + 1) * CELL + pad) / k) - cx);
    const ch = Math.min(src.height - cy, Math.round(((best.y1 + 1) * CELL + pad) / k) - cy);
    return { cx, cy, cw, ch, letters: best.letters };
  }

  // The photo cut down to the paper, so the tilt is measured on the
  // receipt's own text and not on the table around it (a dark screenshot
  // is inverted first: the tilt is measured on ink, not on light letters)
  function cropPaper(img) {
    const MAX = 2000;
    let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const s = Math.min(1, MAX / Math.max(w, h));
    w = Math.round(w * s); h = Math.round(h * s);
    const src = document.createElement('canvas');
    src.width = w; src.height = h;
    const sctx = src.getContext('2d');
    sctx.drawImage(img, 0, 0, w, h);
    if (telaEscura(img)) {
      const od = sctx.getImageData(0, 0, w, h), d = od.data;
      for (let i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; }
      sctx.putImageData(od, 0, 0);
    }
    const { cx, cy, cw, ch } = findTextBox(src) || findPaperBox(src);
    const out = document.createElement('canvas');
    out.width = cw; out.height = ch;
    out.getContext('2d').drawImage(src, cx, cy, cw, ch, 0, 0, cw, ch);
    return out;
  }

  // A paper cut out of the photo, in full resolution
  function cropBox(img, box) {
    const c = document.createElement('canvas');
    c.width = box.cw; c.height = box.ch;
    c.getContext('2d').drawImage(img, box.cx, box.cy, box.cw, box.ch, 0, 0, box.cw, box.ch);
    return c;
  }

  // Where the text is, from the word boxes of a reading: the box around the
  // confident words, ignoring stray ones far from the rest, with a margin.
  // Returned in the rotated frame of that reading, ready for buildOcrCanvas.
  function textRegion(reading) {
    const f = reading.frame;
    let ws = (reading.words || []).filter(w => w.confidence >= 50 && w.text && w.text.replace(/[^0-9A-Za-zÀ-ÿ]/g, '').length >= 2 && w.bbox);
    if (ws.length < 3) return null;
    const cxs = ws.map(w => (w.bbox.x0 + w.bbox.x1) / 2), cys = ws.map(w => (w.bbox.y0 + w.bbox.y1) / 2);
    const med = a => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
    const mx = med(cxs), my = med(cys);
    const dist = ws.map((w, i) => Math.hypot(cxs[i] - mx, cys[i] - my));
    const limit = Math.max(3 * med(dist), 80);
    ws = ws.filter((w, i) => dist[i] <= limit);
    let x0 = Math.min(...ws.map(w => w.bbox.x0)), y0 = Math.min(...ws.map(w => w.bbox.y0));
    let x1 = Math.max(...ws.map(w => w.bbox.x1)), y1 = Math.max(...ws.map(w => w.bbox.y1));
    const pad = Math.max(20, 0.08 * Math.max(x1 - x0, y1 - y0));
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    // back to the rotated frame
    const cx = Math.max(0, Math.round(f.cx + x0 / f.scale)), cy = Math.max(0, Math.round(f.cy + y0 / f.scale));
    const cw = Math.min(f.width - cx, Math.round((x1 - x0) / f.scale)), ch = Math.min(f.height - cy, Math.round((y1 - y0) / f.scale));
    if (cw < 40 || ch < 40) return null;
    return { cx, cy, cw, ch };
  }

  // Reads one paper (the photo, or one paper cut out of it): several
  // readings, the search for the right position when the first comes out
  // bad, and the QR codes and barcodes. tipoPedido is the type chosen in the
  // pop-up ('auto' to find out); aviso(text) tells the screen what is going on.
  // Returns { readings, tipo, codes, tilt, grandes }.
  async function readPaper(img, worker, rotation, label, tipoPedido, aviso) {
    let readings = [];
    let tipo = tipoPedido;
    const read = async (rot, bin, size, region = null) => {
      // A paper cut out of a photo with several is already just the paper:
      // looking for the paper again inside it cut slips in half (the dark
      // box around the amount split the bright area)
      const canvas = buildOcrCanvas(img, rot, bin, size, region || (img.cutOut ? 'all' : null));
      const res = await worker.recognize(canvas);
      const f = canvas.frame;
      const lines = (res.data.lines || []).map(l => ({ text: (l.text || '').trim(), conf: l.confidence || 0 })).filter(l => l.text);
      return { text: res.data.text || '', conf: res.data.confidence || 0, words: res.data.words || [], lines, rot, bin, size, region: { cx: f.cx, cy: f.cy, cw: f.cw, ch: f.ch }, frame: f };
    };
    let started = Date.now();

    // Straighten the photo automatically: the app measures how tilted the
    // receipt is instead of assuming it was photographed square (the lines
    // run at +a, so the picture is turned by -a). A paper cut out of a photo
    // with several can lie any way, and the measure is trusted. A whole
    // photo is almost always upright, and the measure can be fooled by the
    // table around the paper: only a small tilt is trusted, and a big one
    // waits its turn among the positions tried below.
    const tilt = anguloLinhas(cropPaper(img));
    const medida = rotation - tilt.a;
    let base = img.cutOut || Math.abs(tilt.a) <= 20 ? medida : rotation;
    readings.push(await read(base, false, 1000));

    // Sideways or upside-down photo, or paper the app failed to find: the
    // first reading comes out as gibberish. Then read the whole frame in
    // every position (the measured tilt and its quarter turns, plus the
    // plain quarter turns in case the tilt was misjudged), keep the
    // position the engine reads with confidence, and crop to where the
    // confident words are. An upside-down receipt can still yield a few
    // dozen "words" the engine trusts, all of them nonsense that no reader
    // recognizes: a paper of no known type is also tried the other way up.
    let region = null;
    const nonsense = tipoPedido === 'auto' && goodWords(readings[0]) < 40 && detectDocType(readings) === 'livre';
    if (goodWords(readings[0]) < 8 || nonsense) {
      aviso(label + 'Procurando a posição certa...');
      let best = null;
      const near = (a, b) => Math.abs(((a - b) % 360 + 540) % 360 - 180) < 6;
      const probes = (nonsense ? [base + 180, base] : [base, base + 180]).concat([base + 90, base - 90, medida, medida + 180, rotation, rotation + 90, rotation + 180, rotation + 270])
        .filter((r, i, all) => all.findIndex(q => near(q, r)) === i);
      const probing = Date.now();
      for (const rot of probes) {
        const probe = await read(rot, false, 900, 'ink');
        const q = goodWords(probe);
        if (!best || q > best.q) best = { rot, q, probe };
        if (q >= 12 || Date.now() - probing > 12000) break;   // bom o bastante, ou já demorou
      }
      if (best && best.q > goodWords(readings[0]) + 2) {
        base = best.rot;
        region = textRegion(best.probe) || best.probe.region;
        readings = [region === best.probe.region ? best.probe : await read(base, false, 1000, region)];
        started = Date.now();   // the time limit below counts from the first good reading
      }
    }

    // The amount in big letters, read on its own (lerValorGrande): the
    // regular readings skip it or get a digit wrong. Only on a paper that
    // has an amount, or one read so badly that it may be a slip.
    let grandes = [];
    const querValor = t => L.tipo(t).vitais.includes('Valor');
    if (querValor(tipoPedido === 'auto' ? detectDocType(readings) : tipoPedido) || (tipoPedido === 'auto' && goodWords(readings[0]) < 15)) {
      aviso(label + 'Lendo o valor em letra grande...');
      grandes = await lerValorGrande(img, worker, base, region);
    }

    // More readings of the same photo: as photographed, larger, with
    // reinforced contrast. The amount is only accepted when two readings
    // agree on it (see decidirValor), so a money document gets at least
    // two readings, and so does a type whose reader takes transactions out
    // of the text (notification screenshot); free text stops at the first.
    const done = p => readings.some(r => r.rot === p[0] && r.bin === p[1] && r.size === p[2]);
    const passes = [[rotation, false, 1000, null], [base, false, 1400, region], [base, true, 1000, region]].filter(p => !done(p));
    let next = 0;
    while (true) {
      tipo = tipoPedido === 'auto' ? detectDocType(readings, grandes) : tipoPedido;
      const def = L.tipo(tipo), wantsValue = def.vitais.includes('Valor');
      if (!wantsValue && (readings.length >= 2 || (tipoPedido !== 'auto' && !def.itens))) break;
      if (wantsValue && decidirValor(readings, tipo, grandes).valor !== null) break;
      if (next >= passes.length) break;
      if (readings.length >= 2 && Date.now() - started > 20000) break;   // não prender a pessoa
      aviso(label + 'Conferindo com outra leitura...');
      readings.push(await read(...passes[next++]));
    }

    aviso(label + 'Procurando QR code e código de barras...');
    const codes = img._presetText ? [] : await L.lerCodigos(img);
    return { readings, tipo, codes, tilt: tilt.a, grandes };
  }


  // Reads every photo (and every paper cut out of a photo) with one OCR
  // worker. fontes: [{ img, nome, boxes }]; o: { tipo, rotacao, aviso, progresso }.
  async function lerFotos(fontes, o) {
    const T = await loadTesseractLibrary();
    o.aviso('Lendo caracteres...');
    const worker = await T.createWorker('por', 1, {
      workerPath: OCR_BASE + 'worker.min.js',
      corePath: OCR_BASE,
      langPath: OCR_BASE,
      logger: m => { if (m.status === 'recognizing text') o.progresso(Math.round((m.progress || 0) * 100)); }
    });
    const list = [];
    try {
      for (const src of fontes) {
        const boxes = src.boxes || [null];
        for (let i = 0; i < boxes.length; i++) {
          const label = src.nome ? src.nome + (src.boxes ? ` · papel ${i + 1}` : '') : (src.boxes ? `Papel ${i + 1}` : '');
          o.aviso(`Lendo ${label || 'o papel'}...`);
          const img = boxes[i] ? Object.assign(cropBox(src.img, boxes[i]), { cutOut: true }) : src.img;
          const paper = await readPaper(img, worker, o.rotacao, label ? label + ': ' : '', o.tipo, o.aviso);
          list.push(Object.assign(paper, { label, img: src.img, fonte: src }));
        }
      }
    } finally {
      await worker.terminate();
    }
    return list;
  }

  // One quick reading, only to guess the type (Leitura.espiar)
  async function espiar(img) {
    const T = await loadTesseractLibrary();
    const worker = await T.createWorker('por', 1, { workerPath: OCR_BASE + 'worker.min.js', corePath: OCR_BASE, langPath: OCR_BASE });
    try {
      const res = await worker.recognize(buildOcrCanvas(img, -anguloLinhas(cropPaper(img)).a, false, 800));
      return detectDocType([{ text: res.data.text || '' }]);
    } finally {
      await worker.terminate();
    }
  }

  L.foto = { espiar, anguloLinhas, buildOcrCanvas, findPaperBox, findPapers, letterGrid, findTextBox, cropPaper, cropBox, textRegion, faixasGrandes, recorteFaixa, lerValorGrande, readPaper };
  L.lerFotos = lerFotos;
})(window.Leitura);
