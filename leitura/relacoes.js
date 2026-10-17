/* =====================================================================
   leitura/relacoes.js — o que um papel tem a ver com outro, na mesma leitura
   - Mesma compra: a via do cartão e a nota fiscal da mesma compra.
   - Pagamento dividido: vias de cartão que pagaram partes de uma conta (você
     pagou uma parte, outra pessoa pagou outra, e a conta tem o total).
   - Minha parte: o cartão da própria pessoa, reconhecido pelos 4 últimos
     dígitos, guardados só neste aparelho quando ela toca em "É meu".
   Só liga papéis com valor confirmado: na dúvida, nada é ligado.
   ===================================================================== */
(function (L) {
  'use strict';
  const CHAVES = ['Mesma compra', 'Pago em partes', 'Parte da conta', 'Quem pagou', 'Minha parte'];
  const MEUS = 'leitor_meus_cartoes';

  L.meusCartoes = () => {
    try { const v = JSON.parse(localStorage.getItem(MEUS)); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  };
  L.guardarMeusCartoes = lista => { try { localStorage.setItem(MEUS, JSON.stringify(lista)); } catch (e) { /* sem espaço: segue sem guardar */ } };
  L.marcarCartaoMeu = final => { const v = L.meusCartoes(); if (!v.includes(final)) { v.push(final); L.guardarMeusCartoes(v); } };

  // A relation field goes to the result and to what the person already edited
  const add = (list, i, key, val) => {
    list[i].result.fields.push({ key, val });
    if (list[i].edited) list[i].edited.push({ key, val });
  };

  // Two papers with the same confirmed amount (and no different date) are
  // the same purchase on two papers: the card receipt and the nota fiscal
  function linkSamePurchase(list) {
    const pairs = [];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i].result, b = list[j].result;
      if (a.valor === null || a.valor !== b.valor) continue;
      const da = (a.fields.find(f => f.key === 'Data') || {}).val, db = (b.fields.find(f => f.key === 'Data') || {}).val;
      if (da && db && da !== db) continue;
      add(list, i, 'Mesma compra', `papel ${j + 1}`);
      add(list, j, 'Mesma compra', `papel ${i + 1}`);
      pairs.push([i + 1, j + 1]);
    }
    return pairs;
  }

  const campo = (p, key) => (p.result.fields.find(f => f.key === key) || {}).val || '';
  const centavos = v => Math.round(v * 100);
  const brl = c => L.texto.formatBRL(c / 100);
  // What the paper looks like by its text (a slip read with the "conta" button
  // still looks like a card slip)
  const papelDe = p => { const d = p.result.debug && p.result.debug.detected; return d && d !== 'livre' ? d : p.tipo; };

  // Pagamento dividido. Uma conta (ou nota) e:
  // 1. duas ou mais vias de cartão que, somadas, dão o total exato; ou
  // 2. sendo a única conta da leitura, vias do mesmo dia (data lida nas duas)
  //    que somam menos que o total: o resto foi pago por outra pessoa ou de
  //    outro jeito (dinheiro, Pix, outra via que não está na foto).
  function splitPayments(list, linked) {
    const idx = list.map((p, i) => i).filter(i => list[i].result.valor !== null && !linked.has(i));
    const bills = idx.filter(i => ['conta', 'nfce'].includes(papelDe(list[i])));
    const slips = idx.filter(i => papelDe(list[i]) === 'cartao');
    const day = i => campo(list[i], 'Data');
    const used = new Set();
    const out = [];
    bills.forEach(b => {
      const total = centavos(list[b].result.valor);
      const cand = slips.filter(s => !used.has(s) && centavos(list[s].result.valor) < total && (!day(s) || !day(b) || day(s) === day(b)));
      const sum = sel => sel.reduce((t, s) => t + centavos(list[s].result.valor), 0);
      let chosen = null;
      for (let m = 1; m < (1 << cand.length) && cand.length <= 12 && !chosen; m++) {
        const sel = cand.filter((s, k) => m & (1 << k));
        if (sel.length >= 2 && sum(sel) === total) chosen = sel;
      }
      if (!chosen && bills.length === 1) {
        const sameDay = cand.filter(s => day(s) && day(s) === day(b));
        if (sameDay.length && sum(sameDay) < total) chosen = sameDay;
      }
      if (chosen) {
        chosen.forEach(s => used.add(s));
        out.push({ conta: b, vias: chosen, falta: total - sum(chosen) });
      }
    });
    return out;
  }

  // Liga os papéis de uma leitura. Pode ser chamada de novo (ex.: depois de "É
  // meu"): os campos de relação são refeitos do zero.
  L.relacionar = list => {
    list.forEach(p => [p.result.fields, p.edited].forEach(fs => {
      if (fs) for (let k = fs.length - 1; k >= 0; k--) if (CHAVES.includes(fs[k].key)) fs.splice(k, 1);
    }));
    const pares = linkSamePurchase(list);
    const divisoes = splitPayments(list, new Set(pares.flat().map(n => n - 1)));
    const nome = i => list[i].label || `papel ${i + 1}`;
    const meus = L.meusCartoes();
    const final = i => (campo(list[i], 'Cartão').match(/\d{4}$/) || [])[0];
    const meu = i => !!final(i) && meus.includes(final(i));
    divisoes.forEach(d => {
      const partes = d.vias.map(s => `${nome(s)} ${brl(centavos(list[s].result.valor))}`).join(' + ');
      add(list, d.conta, 'Pago em partes', partes + (d.falta ? ` · faltam ${brl(d.falta)} (outra pessoa ou outro pagamento)` : ''));
      d.vias.forEach(s => add(list, s, 'Parte da conta', `${nome(d.conta)}, total ${brl(centavos(list[d.conta].result.valor))}`));
      const minha = d.vias.filter(meu).reduce((t, s) => t + centavos(list[s].result.valor), 0);
      if (minha) add(list, d.conta, 'Minha parte', brl(minha));
    });
    // Quem pagou só aparece depois que a pessoa disse qual cartão é dela
    if (meus.length) list.forEach((p, i) => { if (final(i)) add(list, i, 'Quem pagou', meu(i) ? 'Você' : 'Outra pessoa'); });
    return { pares, divisoes };
  };
})(window.Leitura);
