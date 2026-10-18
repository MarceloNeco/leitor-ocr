/* =====================================================================
   leitura/foto.js — ler texto em foto (OCR). Só carrega na primeira foto.
   Endireita a foto, acha os papéis, limpa o fundo e faz as várias leituras
   com o Tesseract.js (pasta tesseract/, que só baixa na primeira vez).
   Usa leitura/texto.js para saber se as leituras concordam.
   ===================================================================== */
(function (L) {
  'use strict';
  const { detectDocType, agreedValue, goodWords } = L.texto;

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

  // Discovers how tilted the receipt is in the photo. Text lines make
  // dark stripes; the angle where those stripes are sharpest is the right one.
  function estimateAngles(img) {
    const SIZE = 360;
    const w0 = img.naturalWidth || img.width;
    const h0 = img.naturalHeight || img.height;
    const s = Math.min(1, SIZE / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * s));
    const h = Math.max(1, Math.round(h0 * s));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;

    // Grayscale, then local threshold so only the printed ink stays
    const g = new Float32Array(w * h);
    for (let i = 0; i < g.length; i++) {
      g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    }
    const integ = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) {
        row += g[y * w + x];
        integ[(y + 1) * (w + 1) + x + 1] = integ[y * (w + 1) + x + 1] + row;
      }
    }
    const r = Math.max(6, Math.round(w / 12));
    const ink = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const ya = Math.max(0, y - r), yb = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const xa = Math.max(0, x - r), xb = Math.min(w, x + r + 1);
        const area = (xb - xa) * (yb - ya);
        const sum = integ[yb * (w + 1) + xb] - integ[ya * (w + 1) + xb] - integ[yb * (w + 1) + xa] + integ[ya * (w + 1) + xa];
        ink[y * w + x] = g[y * w + x] * area < sum * 0.9 ? 1 : 0;
      }
    }

    // For each candidate angle, count ink per line and measure how much
    // it jumps from line to line — many sharp jumps means the text is level
    const cx = w / 2, cy = h / 2;
    const diag = Math.ceil(Math.sqrt(w * w + h * h));
    const scores = [];
    for (let a = -87; a < 90; a += 3) {
      const ar = (a * Math.PI) / 180;
      const sa = Math.sin(ar), ca = Math.cos(ar);
      const prof = new Float32Array(diag + 2);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!ink[y * w + x]) continue;
          // spread each dot between the two nearest lines, otherwise
          // diagonal angles produce a false striped pattern
          const yy = -(x - cx) * sa + (y - cy) * ca + diag / 2;
          const y0 = Math.floor(yy);
          if (y0 < 0 || y0 >= diag) continue;
          const f = yy - y0;
          prof[y0] += 1 - f;
          prof[y0 + 1] += f;
        }
      }
      let score = 0;
      for (let i = 1; i <= diag; i++) {
        const dv = prof[i] - prof[i - 1];
        score += dv * dv;
      }
      scores.push({ a, score });
    }
    scores.sort((p, q) => q.score - p.score);

    // Keep the best angle plus one clearly different runner-up
    const out = [scores[0].a];
    for (const s2 of scores) {
      if (Math.abs(s2.a - out[0]) > 12 && Math.abs(Math.abs(s2.a - out[0]) - 180) > 12) {
        out.push(s2.a);
        break;
      }
    }
    return out;
  }

  // Builds a high-resolution image just for OCR: finds the receipt paper,
  // crops it, enlarges the text and turns it into clean black-on-white.
  function buildOcrCanvas(img, rotation = 0, binarize = false, targetW = 1000, region = null) {
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
    if (region === 'ink') region = findTextBox(src) || findPaperBox(src);
    if (region === 'all') region = { cx: 0, cy: 0, cw: src.width, ch: src.height };
    const { cx, cy, cw, ch } = region || findPaperBox(src);

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
  function findPaperBox(src) {
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
  // findTextBox (where the text is) and findPapers (how many papers)
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
      let area = 0, x0 = sw, y0 = sh, x1 = 0, y1 = 0;
      label[start] = id; stack.push(start);
      while (stack.length) {
        const p = stack.pop();
        const x = p % sw, y = (p - x) / sw;
        area++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        const nb = [x > 0 ? p - 1 : -1, x < sw - 1 ? p + 1 : -1, y > 0 ? p - sw : -1, y < sh - 1 ? p + sw : -1];
        for (const q of nb) if (q >= 0 && ink[q] && label[q] < 0) { label[q] = id; stack.push(q); }
      }
      marks.push({ area, x0, y0, x1, y1 });
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
    return { count, gw, gh, CELL, k, sw, sh };
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
  // receipt's own text and not on the table around it
  function cropPaper(img) {
    const MAX = 1500;
    let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const s = Math.min(1, MAX / Math.max(w, h));
    w = Math.round(w * s); h = Math.round(h * s);
    const src = document.createElement('canvas');
    src.width = w; src.height = h;
    src.getContext('2d').drawImage(img, 0, 0, w, h);
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
  // Returns { readings, tipo, codes, tilt }.
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
    const started = Date.now();

    // Straighten the photo automatically: the app measures how tilted the
    // receipt is instead of assuming it was photographed square
    const tilt = estimateAngles(cropPaper(img));
    let base = rotation + tilt[0];
    readings.push(await read(base, false, 1000));

    // Sideways or upside-down photo, or paper the app failed to find: the
    // first reading comes out as gibberish. Then read the whole frame in
    // every position (the measured tilt and its quarter turns, plus the
    // plain quarter turns in case the tilt was misjudged), keep the
    // position the engine reads with confidence, and crop to where the
    // confident words are.
    let region = null;
    if (goodWords(readings[0]) < 8) {
      aviso(label + 'Procurando a posição certa...');
      let best = null;
      const near = (a, b) => Math.abs(((a - b) % 360 + 540) % 360 - 180) < 6;
      const probes = [base, base + 180, base + 90, base - 90, rotation, rotation + 90, rotation + 180, rotation + 270]
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
      }
    }

    // More readings of the same photo: as photographed, larger, with
    // reinforced contrast. The amount is only accepted when two readings
    // agree on it (see agreedValue), so a money document gets at least
    // two readings, and so does a type whose reader takes transactions out
    // of the text (notification screenshot); free text stops at the first.
    const done = p => readings.some(r => r.rot === p[0] && r.bin === p[1] && r.size === p[2]);
    const passes = [[rotation, false, 1000, null], [base, false, 1400, region], [base, true, 1000, region]].filter(p => !done(p));
    let next = 0;
    while (true) {
      tipo = tipoPedido === 'auto' ? detectDocType(readings) : tipoPedido;
      const def = L.tipo(tipo), wantsValue = def.vitais.includes('Valor');
      if (!wantsValue && (readings.length >= 2 || (tipoPedido !== 'auto' && !def.itens))) break;
      if (wantsValue && agreedValue(readings, tipo) !== null) break;
      if (next >= passes.length) break;
      if (readings.length >= 2 && Date.now() - started > 20000) break;   // não prender a pessoa
      aviso(label + 'Conferindo com outra leitura...');
      readings.push(await read(...passes[next++]));
    }

    aviso(label + 'Procurando QR code e código de barras...');
    const codes = img._presetText ? [] : await L.lerCodigos(img);
    return { readings, tipo, codes, tilt: tilt[0] };
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
      const res = await worker.recognize(buildOcrCanvas(img, estimateAngles(cropPaper(img))[0], false, 800));
      return detectDocType([{ text: res.data.text || '' }]);
    } finally {
      await worker.terminate();
    }
  }

  L.foto = { espiar, estimateAngles, buildOcrCanvas, findPaperBox, findPapers, letterGrid, findTextBox, cropPaper, cropBox, textRegion, readPaper };
  L.lerFotos = lerFotos;
})(window.Leitura);
