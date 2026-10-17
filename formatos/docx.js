/* formatos/docx.js — documento do Word (.docx): o texto, parágrafo por
   parágrafo; cada linha de tabela vira uma linha. Precisa de formatos/zip.js. */
(function (L) {
  'use strict';
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  const texto = el => {
    let s = '';
    const andar = n => {
      for (const c of n.childNodes) {
        if (c.nodeType !== 1) continue;
        if (c.localName === 't') s += c.textContent;
        else if (c.localName === 'tab') s += '\t';
        else if (c.localName === 'br') s += '\n';
        else andar(c);
      }
    };
    andar(el);
    return s;
  };

  L.formatos.docx = async arquivo => {
    const zip = await L.abrirZip(arquivo);
    const xml = await zip.ler('word/document.xml');
    const corpo = xml && L.xml(xml).getElementsByTagNameNS(W, 'body')[0];
    if (!corpo) throw Object.assign(new Error('docx sem texto'), { motivo: 'o documento não tem texto' });
    const linhas = [];
    for (const el of Array.from(corpo.childNodes)) {
      if (el.localName === 'p') linhas.push(texto(el));
      else if (el.localName === 'tbl') {
        Array.from(el.getElementsByTagNameNS(W, 'tr')).forEach(tr => {
          linhas.push(Array.from(tr.getElementsByTagNameNS(W, 'tc'), tc => texto(tc).trim()).join('  '));
        });
      }
    }
    return [{ texto: linhas.join('\n') }];
  };
})(window.Leitura);
