/* formatos/zip.js — abre um .zip com o descompactador do próprio navegador
   (DecompressionStream). Os arquivos .xlsx e .docx são zips de arquivos XML:
   assim eles abrem sem nenhuma biblioteca a mais. */
(function (L) {
  'use strict';

  L.abrirZip = async arquivo => {
    const buf = new Uint8Array(await arquivo.arrayBuffer());
    const dv = new DataView(buf.buffer);
    // O índice do zip fica no fim do arquivo
    let fim = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65600); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { fim = i; break; }
    }
    if (fim < 0) throw Object.assign(new Error('não é zip'), { motivo: 'o arquivo está danificado ou não é desse tipo' });
    const entradas = {};
    let p = dv.getUint32(fim + 16, true);
    for (let k = dv.getUint16(fim + 10, true); k > 0 && dv.getUint32(p, true) === 0x02014b50; k--) {
      const nLen = dv.getUint16(p + 28, true), xLen = dv.getUint16(p + 30, true), cLen = dv.getUint16(p + 32, true);
      const nome = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nLen));
      entradas[nome] = { metodo: dv.getUint16(p + 10, true), tamanho: dv.getUint32(p + 20, true), local: dv.getUint32(p + 42, true) };
      p += 46 + nLen + xLen + cLen;
    }
    // Um arquivo de dentro do zip, como texto (null se não existir)
    const ler = async nome => {
      const e = entradas[nome];
      if (!e) return null;
      const ini = e.local + 30 + dv.getUint16(e.local + 26, true) + dv.getUint16(e.local + 28, true);
      const dados = buf.subarray(ini, ini + e.tamanho);
      if (e.metodo === 0) return new TextDecoder().decode(dados);
      if (e.metodo !== 8 || typeof DecompressionStream === 'undefined') {
        throw Object.assign(new Error('sem descompactador'), { motivo: 'este navegador não abre esse arquivo; salve como PDF ou CSV' });
      }
      const fluxo = new Blob([dados]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new TextDecoder().decode(await new Response(fluxo).arrayBuffer());
    };
    return { nomes: Object.keys(entradas), ler };
  };

  L.xml = texto => new DOMParser().parseFromString(texto, 'application/xml');
})(window.Leitura);
