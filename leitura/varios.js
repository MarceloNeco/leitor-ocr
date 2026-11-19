/* leitura/varios.js — vários canhotos numa foto, um item por canhoto (pedido 35).
   Para o MoneyTRIO conferir com o banco: um contrato estável (ARQUITETURA.md, "Vários canhotos
   numa foto"). Usa o que o motor já faz: achar os papéis (leitura/foto.js), ler cada um
   (Leitura.ler) e ligar a mesma compra (leitura/relacoes.js). Sem internet e sem IA.

     const itens = await Leitura.lerVarios(arquivo, { aviso, progresso });
     // [{ arquivo, papel, documento, valor, opcoes, data, hora, loja, cnpj, bandeira, tipo,
     //    parcelas, final, nsu, aut, doc, mesmaCompra, confianca: { valor, data, ... } }] */
(function (L) {
  'use strict';

  const so = s => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  // Quantas leituras do papel trazem este pedaço de texto: 2 ou mais é "alta", 1 é "media"
  function vezes(readings, alvo) {
    const a = so(alvo);
    if (!a) return 0;
    return readings.filter(r => so(r.text).includes(a)).length;
  }
  const nivel = n => (n >= 2 ? 'alta' : n === 1 ? 'media' : null);

  // "Crédito à Vista", "Crédito Parcelado", "Débito", "Pix" → 'credito', 'debito', 'pix'
  const tipoDe = mod => !mod ? null : /D[EÉ]BITO/i.test(mod) ? 'debito' : /PIX/i.test(mod) ? 'pix' : /CR[EÉ]DITO/i.test(mod) ? 'credito' : null;

  // Parcelas, só no canhoto de maquininha e só pela palavra: "Parcelas: 10", "PARCELADO EM 3X"; à vista
  // é 1. ("1,000 UN X 0,15" num cupom não é parcela: o "N X" solto dava 8 parcelas num cupom de feira)
  function parcelasDe(texto, mod, documento) {
    if (documento !== 'cartao') return null;
    const t = String(texto || '').toUpperCase();
    const m = t.match(/PARCELA[S]?\s*[:.]?\s*(\d{1,2})\b/) || t.match(/PARC\w*\s+(?:EM\s+)?(\d{1,2})\s?X\b/);
    if (m && +m[1] >= 2 && +m[1] <= 24) return +m[1];
    if (/[AÀ]\s?VISTA/.test(t) || (mod && /Vista/i.test(mod))) return 1;
    return null;
  }

  // Uma compra não é de depois de amanhã nem de mais de 5 anos atrás (papel térmico não dura tanto):
  // "29/11/2026" num ticket de 18/11 e "04/11/2020" num canhoto de 2026 eram erros de leitura. O
  // motor só aplica a regra dos 5 anos aos papéis de dinheiro que ele reconheceu; aqui vale para todos
  function dataPossivel(d) {
    const m = String(d || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const t = new Date(+m[3], +m[2] - 1, +m[1]).getTime(), agora = Date.now();
    return t > agora + 2 * 86400000 || t < agora - 5 * 366 * 86400000 ? null : d;
  }

  // Um papel lido (Leitura.ler) no formato do contrato
  function item(p, i) {
    const r = p.result || {}, rs = p.readings || [];
    const g = k => { const f = (r.fields || []).find(x => x.key === k); return f ? f.val : null; };
    const todo = rs.map(x => x.text).join('\n');
    const mod = g('Modalidade');
    const fim = (g('Cartão') || '').match(/(\d{4})$/);
    const T = todo.toUpperCase();
    const nsu = (T.match(/\bNSU\s*[:.=]?\s*(\d{4,})/) || [])[1] || null;
    const doc = (T.match(/\bDOC\w*\s*[:.=]?\s*(\d{4,})/) || [])[1] || null;
    const e = r.estabelecimento || {};
    const loja = e.fantasia || e.razao || g('Estabelecimento');
    const cnpj = e.cnpj || g('CNPJ');
    const valor = typeof r.valor === 'number' ? r.valor : null;
    const parcelas = parcelasDe(todo, mod, p.tipo);
    const out = {
      arquivo: p.fonte && (p.fonte.arquivo || p.fonte.nome) || null,
      papel: i + 1,
      documento: p.tipo || null,
      valor,
      // na dúvida o valor fica vazio; os valores lidos vão aqui, para a pessoa escolher
      opcoes: valor === null ? (r.candidates || []).filter(n => typeof n === 'number') : [],
      data: dataPossivel(g('Data')), hora: g('Hora'),
      loja: loja || null, cnpj: cnpj || null,
      bandeira: g('Bandeira'),
      tipo: tipoDe(mod),
      parcelas,
      final: fim ? fim[1] : null,
      nsu, aut: g('Autorização'), doc,
      mesmaCompra: (g('Mesma compra') || '').match(/papel (\d+)/) ? +g('Mesma compra').match(/papel (\d+)/)[1] : null
    };
    // confiança de cada campo: o valor pela regra do motor (duas leituras que concordam, código ou
    // soma conferida); os outros por quantas leituras do papel trazem o que saiu; o CNPJ, pelos
    // dígitos verificadores (só sai da leitura quando conferem)
    out.confianca = {
      valor: valor !== null ? 'alta' : out.opcoes.length ? 'baixa' : null,
      data: out.data ? nivel(vezes(rs, out.data)) || 'media' : null,
      hora: out.hora ? nivel(vezes(rs, out.hora)) || 'media' : null,
      loja: out.loja ? (e.fantasia ? 'alta' : nivel(vezes(rs, out.loja)) || 'baixa') : null,
      cnpj: out.cnpj ? (L.cnpjValido && L.cnpjValido(out.cnpj) ? 'alta' : 'baixa') : null,
      bandeira: out.bandeira ? nivel(vezes(rs, out.bandeira === 'MASTERCARD' ? 'MASTER' : out.bandeira)) || 'media' : null,
      tipo: out.tipo ? nivel(vezes(rs, out.tipo === 'debito' ? 'DEBITO' : out.tipo === 'pix' ? 'PIX' : 'CREDITO')) || 'media' : null,
      parcelas: out.parcelas !== null ? (out.parcelas === 1 ? nivel(vezes(rs, 'VISTA')) || 'media' : nivel(vezes(rs, String(out.parcelas))) || 'media') : null,
      final: out.final ? nivel(vezes(rs, out.final)) || 'media' : null,
      nsu: out.nsu || out.aut || out.doc ? nivel(vezes(rs, out.nsu || out.aut || out.doc)) || 'media' : null
    };
    return out;
  }

  // arquivos: um File, uma lista de Files ou um FileList (fotos, PDF...)
  L.lerVarios = async (arquivos, opcoes = {}) => {
    const o = Object.assign({ aviso: () => {}, progresso: () => {}, pedirSenha: null }, opcoes);
    const lista = arquivos && typeof arquivos.length === 'number' && !(arquivos instanceof Blob) ? [...arquivos] : [arquivos];
    const { fontes } = await L.abrir(lista, o.aviso, o.pedirSenha);
    for (const f of fontes) {
      if (!f.img) continue;
      o.aviso('Procurando os papéis na foto...');
      const caixas = await L.acharPapeis(f.img);
      f.boxes = caixas.length >= 2 ? caixas : null;
    }
    const papeis = await L.ler(fontes, { tipo: 'auto', aviso: o.aviso, progresso: o.progresso });
    if (L.relacionar) L.relacionar(papeis);
    return papeis.map(item);
  };
  L.lerVarios.item = item;   // para os testes e para quem já tem os papéis lidos
  // versão do formato de saída (ARQUITETURA.md): só muda com aviso lá, e quem chama pode conferir
  L.lerVarios.contrato = 1;
})(window.Leitura);
