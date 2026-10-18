/* formatos/pdf.js — PDF, até 10 páginas. Página que já traz o texto (PDF gerado
   por sistema: fatura, extrato, nota, laudo) é lida direto, sem OCR e sem erro
   de leitura; página escaneada vira imagem para o OCR. PDF com senha pede a
   senha à pessoa. Usa o pdf.js da pasta libs/pdfjs/ (versão legacy, que roda
   em celular mais velho). */
(function (L) {
  'use strict';
  const MAX_PAGINAS = 10;
  let pdfjs = null;

  // As palavras da página em linhas, de cima para baixo e da esquerda para a direita
  async function textoDaPagina(page) {
    const { items } = await page.getTextContent();
    const linhas = [];
    items.filter(i => i.str && i.str.trim()).forEach(i => {
      const x = i.transform[4], y = i.transform[5], h = Math.abs(i.transform[3]) || 10;
      let l = linhas.find(q => Math.abs(q.y - y) < h * 0.5);
      if (!l) linhas.push(l = { y, partes: [] });
      l.partes.push({ x, s: i.str });
    });
    return linhas.sort((a, b) => b.y - a.y)
      .map(l => l.partes.sort((a, b) => a.x - b.x).map(p => p.s).join(' ').replace(/\s+/g, ' ').trim())
      .join('\n');
  }

  // PDF com senha (fatura e extrato de banco costumam ter): pedirSenha(nome,
  // errou) pergunta à pessoa e devolve a senha, ou nada para pular o arquivo.
  // A senha só abre o arquivo agora: não é guardada em lugar nenhum.
  async function abrirDocumento(arquivo, pedirSenha) {
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    let password;
    for (;;) {
      try {
        return await pdfjs.getDocument({
          data: bytes.slice(),   // o pdf.js fica com os bytes: cada tentativa leva uma cópia
          password,
          standardFontDataUrl: L.url('libs/pdfjs/standard_fonts/'),
          wasmUrl: L.url('libs/pdfjs/wasm/')
        }).promise;
      } catch (err) {
        if (!err || err.name !== 'PasswordException') throw err;
        password = pedirSenha ? await pedirSenha(arquivo.name, err.code === pdfjs.PasswordResponses.INCORRECT_PASSWORD) : null;
        if (!password) throw Object.assign(new Error('PDF com senha'), { motivo: 'o PDF tem senha; sem ela não dá para abrir' });
      }
    }
  }

  L.formatos.pdf = async (arquivo, opcoes = {}) => {
    if (!pdfjs) {
      pdfjs = await import(L.url('libs/pdfjs/pdf.min.mjs'));
      pdfjs.GlobalWorkerOptions.workerSrc = L.url('libs/pdfjs/pdf.worker.min.mjs');
    }
    const doc = await abrirDocumento(arquivo, opcoes.pedirSenha);
    const fontes = [];
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGINAS); n++) {
      const page = await doc.getPage(n);
      const texto = await textoDaPagina(page);
      if (texto.replace(/[^0-9A-Za-zÀ-ÿ]/g, '').length >= 20) { fontes.push({ parte: 'Página ' + n, texto }); continue; }
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(4, 2200 / Math.max(base.width, base.height)) });
      const c = document.createElement('canvas');
      c.width = Math.round(viewport.width); c.height = Math.round(viewport.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      fontes.push({ parte: 'Página ' + n, img: c });
    }
    if (doc.numPages > MAX_PAGINAS) fontes.aviso = `o PDF tem ${doc.numPages} páginas; li as ${MAX_PAGINAS} primeiras`;
    return fontes;
  };
})(window.Leitura);
