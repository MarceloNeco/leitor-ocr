/* leitores/notificacao.js — print de notificação do celular (compra aprovada,
   Pix, débito, passagem de Tag): cada aviso com valor vira um lançamento, com
   data, hora e descrição, como num extrato. Um print com 4 compras dá 4
   lançamentos. A foto é lida duas vezes; quando as leituras discordam do valor
   de um aviso, ele fica de fora (o app avisa) em vez de entrar com valor errado. */
(function (L) {
  'use strict';
  // Onde começa cada aviso
  const INICIO = /COMPRA APROVADA|COMPRA (?:DE|NO VALOR DE) R|VOC[EÊ] (?:USOU|RECEBEU|PAGOU|FEZ|ENVIOU|TRANSFERIU)|DEBITAMOS|PIX (?:RECEBIDO|ENVIADO|REALIZADO|AGENDADO)|TRANSFER[EÊ]NCIA (?:RECEBIDA|ENVIADA|REALIZADA)|PAGAMENTO (?:APROVADO|REALIZADO|EFETUADO|RECEBIDO)|SAQUE (?:REALIZADO|APROVADO)|ESTORNO/gi;
  // "R$ 250,80", "RS 53,84" (o OCR lê o cifrão como S), "-R$1.116,06"
  const VALOR = /([+-]\s?)?R\s?[$S5]\s?(\d{1,3}(?:\.\d{3})*,\d{2})(?!\d)/gi;
  // "12/10" ou "12/10/2026", com a hora logo depois: "12/10, às 13h25", "12/10/2026 às 10:16"
  const DATA = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?(?![\d/])(?:,?\s*(?:[aà]s\s*)?(\d{1,2})\s?[h:]\s?(\d{2}))?/gi;
  const ENTRADA = /RECEB|ESTORNO|DEVOLU|DEVOLVID|REEMBOLSO|CASHBACK|DEP[OÓ]SITO|CR[EÉ]DITO EM CONTA/i;
  const NAO_E_LANCAMENTO = /LIMITE|SALDO|DISPON[IÍ]VEL/i;   // "limite disponível R$ 5.000,00"

  const limpa = s => s.replace(/[|;!«»“”"(){}[\]_=~^€]+/g, ' ').replace(/\s+/g, ' ').trim();
  // Restos do ícone e da borda do aviso que o OCR lê como letras soltas ("id h LOJA À ã")
  const semRestos = s => s.replace(/^(?:(?:\S|(?![A-Z]{2})\S{2})\s+)+/, '').replace(/(?:\s+\S)+$/, '');
  const curta = s => s.length <= 60 ? s : s.slice(0, 60).replace(/\s+\S*$/, '') + '…';

  // Aviso sem ano ("em 12/10"): o ano de hoje, ou o passado se a data ainda não chegou
  function ano(dia, mes) {
    const hoje = new Date(), a = hoje.getFullYear();
    return new Date(a, mes - 1, dia) > new Date(hoje.getTime() + 86400000) ? a - 1 : a;
  }

  // Os avisos de um texto lido: [{ data, hora, descricao, valor }]
  function avisos(texto) {
    const t = limpa(texto || '');
    const inicios = [...t.matchAll(INICIO)].map(m => m.index);
    const valores = [...t.matchAll(VALOR)].filter(m => !NAO_E_LANCAMENTO.test(t.slice(Math.max(0, m.index - 25), m.index)));
    const datas = s => [...s.matchAll(DATA)].filter(d => +d[1] >= 1 && +d[1] <= 31 && +d[2] >= 1 && +d[2] <= 12);
    return valores.map((m, k) => {
      // o aviso deste valor: do começo dele (ou do valor anterior) até o próximo aviso (ou o próximo valor)
      const ini = Math.max(k ? valores[k - 1].index + valores[k - 1][0].length : 0, ...inicios.filter(i => i <= m.index));
      const fim = Math.min(k + 1 < valores.length ? valores[k + 1].index : t.length, ...inicios.filter(i => i > m.index));
      const antes = t.slice(ini, m.index), depois = t.slice(m.index + m[0].length, fim);
      const d = datas(depois)[0] || datas(antes).pop();
      let data = '', hora = '';
      if (d) {
        const a = d[3] ? (d[3].length === 2 ? '20' + d[3] : d[3]) : ano(+d[1], +d[2]);
        data = `${d[1].padStart(2, '0')}/${d[2].padStart(2, '0')}/${a}`;
        if (d[4] && +d[4] <= 23 && +d[5] <= 59) hora = `${d[4].padStart(2, '0')}:${d[5]}`;
      }
      const loja = (antes.trim().match(/FINAL\s*\d{4}\d?\s*(?:\S\s+)?(.+?)\s+VALOR$/i) || [])[1]   // "final 1234 - LOJA valor R$"
        || (depois.match(/^\s*(?:APROVADA\s+)?(?:EM|DE|PARA|NO|NA)\s+(?:\S\s+)*?([A-Za-zÀ-ÿ*][^,.!;]{2,40}?)(?=\s+(?:NO DIA|PARA O|COM|EM \d|[AÀ]S \d)|[,.!;]|$)/i) || [])[1];   // "R$ 41,00 em SHOPPING X no dia", "de FULANO"
      const resto = (antes + ' ' + depois).replace(DATA, ' ').replace(/\b\d{1,2}[:h]\d{2}\b/g, ' ');
      const valor = parseFloat(m[2].replace(/\./g, '').replace(',', '.'));
      const sinal = m[1] ? (m[1].trim() === '-' ? -1 : 1) : (ENTRADA.test(antes + ' ' + depois) ? 1 : -1);
      return { data, hora, descricao: curta(loja ? semRestos(loja) : limpa(resto)), valor: sinal * valor };
    });
  }

  // Os lançamentos de todas as leituras da foto. O mesmo aviso (mesma data e
  // hora) com valores diferentes: fica o valor lido mais vezes; empate fica de fora.
  function itens(readings) {
    const votos = new Map();
    readings.forEach(r => {
      const vistos = new Set();
      avisos(r.text).forEach(i => {
        const k = `${i.data}|${i.hora}|${i.valor}`;
        if (vistos.has(k)) return;
        vistos.add(k);
        if (votos.has(k)) votos.get(k).vezes++; else votos.set(k, { item: i, vezes: 1 });
      });
    });
    const lista = [...votos.values()], fora = new Set(), momentos = {};
    let duvidas = 0;
    lista.forEach(v => { if (v.item.data && v.item.hora) (momentos[v.item.data + ' ' + v.item.hora] = momentos[v.item.data + ' ' + v.item.hora] || []).push(v); });
    Object.values(momentos).filter(g => g.length > 1).forEach(g => {
      g.sort((a, b) => b.vezes - a.vezes);
      if (g[0].vezes === g[1].vezes) { duvidas++; g.forEach(v => fora.add(v)); } else g.slice(1).forEach(v => fora.add(v));
    });
    const ficam = lista.filter(v => !fora.has(v));
    const quando = i => i.data ? i.data.split('/').reverse().join('') + i.hora : '9';
    ficam.sort((a, b) => quando(a.item) < quando(b.item) ? -1 : quando(a.item) > quando(b.item) ? 1 : 0);
    return { itens: ficam.map(v => v.item), duvidas, confirmados: ficam.filter(v => v.vezes > 1).length };
  }

  L.registrarLeitor({ id: 'notificacao', vitais: [], itens, avisos });
})(window.Leitura);
