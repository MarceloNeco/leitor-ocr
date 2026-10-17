/* formatos/csv.js — planilha em texto (.csv): linhas e colunas, com ; , tab ou |
   como separador e campos entre aspas. Extratos e faturas exportados pelo banco
   viram lançamentos no leitor de extrato (leitores/extrato.js). */
(function (L) {
  'use strict';

  function separar(texto) {
    const amostra = texto.split(/\r?\n/).slice(0, 10).join('\n');
    const sep = [';', ',', '\t', '|'].map(s => [s, amostra.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
    const linhas = [];
    let linha = [], cel = '', aspas = false;
    for (let i = 0; i < texto.length; i++) {
      const ch = texto[i];
      if (aspas) {
        if (ch !== '"') cel += ch;
        else if (texto[i + 1] === '"') { cel += '"'; i++; }
        else aspas = false;
      } else if (ch === '"') aspas = true;
      else if (ch === sep) { linha.push(cel); cel = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && texto[i + 1] === '\n') i++;
        linha.push(cel); linhas.push(linha); linha = []; cel = '';
      } else cel += ch;
    }
    if (cel || linha.length) { linha.push(cel); linhas.push(linha); }
    return linhas.map(l => l.map(c => c.trim())).filter(l => l.some(c => c));
  }

  L.formatos.csv = async arquivo => {
    const texto = (await L.textoDoArquivo(arquivo)).replace(/^﻿/, '');
    return [{ linhas: separar(texto), texto }];
  };
})(window.Leitura);
