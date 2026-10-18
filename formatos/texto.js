/* formatos/texto.js — arquivo de texto (.txt): o texto pronto, sem OCR. Texto
   que é uma tabela com ";" (extrato que o banco exporta como .txt) vem também
   em linhas e colunas, para virar lançamentos como um CSV. */
Leitura.formatos.texto = async arquivo => {
  const texto = (await Leitura.textoDoArquivo(arquivo)).replace(/^\uFEFF/, '');
  const linhas = texto.split(/\r?\n/).filter(l => l.trim());
  const n = linhas.length ? linhas[0].split(';').length : 0;
  const tabela = n >= 3 && linhas.filter(l => l.split(';').length === n).length >= 0.8 * linhas.length;
  return [tabela ? { texto, linhas: linhas.map(l => l.split(';').map(c => c.trim())) } : { texto }];
};
