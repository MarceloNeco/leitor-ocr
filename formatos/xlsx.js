/* formatos/xlsx.js — planilha do Excel (.xlsx): cada aba vira uma tabela.
   Datas guardadas como número (46310) voltam a ser 15/10/2026. Precisa de
   formatos/zip.js. */
(function (L) {
  'use strict';
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const filhos = (el, nome) => Array.from(el.getElementsByTagNameNS(NS, nome));
  const coluna = ref => { let n = 0; for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const FORMATOS_DATA = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
  const dataDoExcel = n => {
    const d = new Date(Math.round((n - 25569) * 86400000));
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  };

  L.formatos.xlsx = async arquivo => {
    const zip = await L.abrirZip(arquivo);
    const ler = async nome => { const t = await zip.ler(nome); return t ? L.xml(t) : null; };

    const textos = [];
    const ss = await ler('xl/sharedStrings.xml');
    if (ss) filhos(ss, 'si').forEach(si => textos.push(filhos(si, 't').map(x => x.textContent).join('')));

    // Quais estilos de célula são data
    const ehData = [];
    const st = await ler('xl/styles.xml');
    if (st) {
      const proprios = {};
      filhos(st, 'numFmt').forEach(f => { proprios[f.getAttribute('numFmtId')] = /[dy]/i.test((f.getAttribute('formatCode') || '').replace(/\[[^\]]*\]|"[^"]*"/g, '')); });
      const xfs = filhos(st, 'cellXfs')[0];
      if (xfs) filhos(xfs, 'xf').forEach((xf, i) => { const id = +xf.getAttribute('numFmtId'); ehData[i] = FORMATOS_DATA.has(id) || !!proprios[id]; });
    }

    const alvo = {};
    const rels = await ler('xl/_rels/workbook.xml.rels');
    if (rels) Array.from(rels.getElementsByTagName('Relationship')).forEach(r => { alvo[r.getAttribute('Id')] = r.getAttribute('Target'); });
    const livro = await ler('xl/workbook.xml');
    const fontes = [];
    for (const aba of livro ? filhos(livro, 'sheet') : []) {
      const caminho = (alvo[aba.getAttributeNS(REL, 'id')] || '').replace(/^\/?(xl\/)?/, 'xl/');
      const doc = caminho && await ler(caminho);
      if (!doc) continue;
      const linhas = filhos(doc, 'row').map(row => {
        const linha = [];
        filhos(row, 'c').forEach(c => {
          const t = c.getAttribute('t'), v = (filhos(c, 'v')[0] || {}).textContent;
          let val = '';
          if (t === 's') val = textos[+v] || '';
          else if (t === 'inlineStr') val = filhos(c, 't').map(x => x.textContent).join('');
          else if (t === 'str' || t === 'e') val = v || '';
          else if (t === 'b') val = v === '1' ? 'VERDADEIRO' : 'FALSO';
          else if (v !== undefined && v !== '') val = ehData[+c.getAttribute('s')] ? dataDoExcel(+v) : +v;
          const ref = c.getAttribute('r');
          linha[ref ? coluna(ref) : linha.length] = val;
        });
        return Array.from(linha, x => (x === undefined ? '' : x));
      }).filter(l => l.some(x => x !== ''));
      if (linhas.length) fontes.push({ parte: 'Aba ' + aba.getAttribute('name'), linhas });
    }
    if (!fontes.length) throw Object.assign(new Error('planilha vazia'), { motivo: 'a planilha está vazia' });
    return fontes;
  };
})(window.Leitura);
