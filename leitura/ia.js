/* =====================================================================
   leitura/ia.js — ler a foto com uma IA online (nível C), pela chave da pessoa.
   A leitura no aparelho vem sempre primeiro; a IA é um extra, só com
   internet e só quando a pessoa escolhe (botão "Ler com IA", ou a opção de
   Ajustes para usar sozinho quando o valor fica vazio ou em dúvida).
   O que sai do aparelho: a foto do papel (reduzida) e o pedido em texto.
   Nada mais: nem o histórico, nem outros campos, nem a chave de outro provedor.
   Chaves: no mesmo cofre dos outros apps SolverONE (o módulo comum DGO.ia
   guarda em localStorage 'dgo:global:chaves-ia', na mesma origem
   solverone.com.br), então a chave colada em qualquer app vale em todos.
   Provedores: Gemini (Google, grátis, lê imagens) e Claude (Anthropic, pago
   por uso). Modelo: escolhido na lista que a chave aceita e guardado; se o
   provedor aposentar o modelo, o app escolhe outro sozinho.
   O valor que a IA lê nunca entra sozinho: vira uma sugestão de um toque
   (regra do app: antes vazio do que errado). Os outros campos entram só
   onde estava vazio, marcados como lidos pela IA.
   ===================================================================== */
(function (L) {
  'use strict';
  const CHAVES = 'dgo:global:chaves-ia', POR_USO = 'dgo:global:ia-por-uso', MODELOS = 'dgo:global:ia-modelos';
  const SOZINHA = 'leitor_ia_sozinha';     // 'sim' = usa a IA sozinho quando o valor fica vazio ou em dúvida
  const AVISADO = 'leitor_ia_avisado';     // 'sim' = a pessoa já viu o aviso e pediu para não perguntar de novo (documentos comuns e de dinheiro)
  const ESPERA = 45000;                    // ms: a IA não pode segurar a tela para sempre
  const LADO = 1600;                       // px: a foto vai reduzida (basta para ler, e pesa menos)

  const ler = (k, padrao) => { try { const v = JSON.parse(localStorage.getItem(k)); return v === null || v === undefined ? padrao : v; } catch (e) { return padrao; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem espaço: segue */ } };
  const texto = v => (v === null || v === undefined) ? '' : String(v).trim();

  // O pedido: os campos que o app usa, em JSON, e a ordem de nunca inventar
  const PEDIDO = 'Você lê fotos de documentos financeiros brasileiros: via do cliente de maquininha de cartão, cupom fiscal (NFC-e, SAT, DANFE), conta de restaurante, comprovante de Pix ou transferência, boleto, extrato. '
    + 'Leia a imagem e responda SOMENTE com um JSON (sem texto fora dele) com estes campos; use null no que não estiver legível e NUNCA invente um número: '
    + '{"tipo": "cartao|nfce|conta|transferencia|boleto|extrato|livre", "estabelecimento": "nome da loja como está impresso", "cnpj": "14 dígitos do CNPJ da loja", '
    + '"valor": número em reais do total pago (na via de cartão, o VALOR da transação; no cupom, o VALOR A PAGAR depois do desconto; na conta, o total), '
    + '"data": "dd/mm/aaaa", "hora": "hh:mm", "bandeira": "VISA|MASTERCARD|ELO|AMEX|HIPERCARD|outra", "cartao_final": "4 últimos dígitos do cartão", '
    + '"modalidade": "crédito à vista|débito|crédito parcelado Nx|pix", "autorizacao": "código de autorização", "nsu": "NSU ou DOC", '
    + '"produtos": [{"descricao": "", "qtd": número, "unidade": "UN|kg", "preco": número unitário, "valor": número}] (só em cupom fiscal; [] se não houver), '
    + '"observacao": "o que ficou ilegível"}. Números com ponto decimal, sem R$. Se a imagem não for um documento desses, responda {"tipo": "livre"} e os outros campos null.';

  // Erro com a explicação para a pessoa
  function falha(codigo, status, detalhe) { const e = new Error(codigo); e.codigo = codigo; e.status = status; e.detalhe = detalhe; return e; }
  async function conferir(r) {
    if (r.ok) return;
    let corpo = ''; try { corpo = await r.text(); } catch (e) { /* sem corpo */ }
    if (r.status === 401 || r.status === 403 || (r.status === 400 && /API[_ ]KEY|api key|invalid.*key|key.*invalid/i.test(corpo))) throw falha('chave-recusada', r.status, corpo);
    if (r.status === 404) throw falha('modelo-sumiu', r.status, corpo);
    if (r.status === 429 || (r.status === 402)) throw falha('sem-cota', r.status, corpo);
    if (r.status >= 500) throw falha('fora-do-ar', r.status, corpo);
    throw falha('recusou', r.status, corpo);
  }
  const versao = id => +((String(id).match(/(\d+(?:\.\d+)?)/) || [])[1] || 0);

  const PROVEDORES = {
    gemini: {
      nome: 'Gemini (Google)', empresa: 'Google', gratis: true, onde: 'https://aistudio.google.com/apikey', prefixo: /^(AIza|AQ\.)/,
      custo: 'Grátis (plano do AI Studio, sem cartão), com um limite de pedidos por dia.',
      passos: ['Entre com a sua conta do Google.', 'Toque em "Create API key" (criar chave).', 'Toque em "Copy" (copiar) e volte para cá.'],
      async listar(chave) {
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': chave }, credentials: 'omit' });
        await conferir(r);
        const j = await r.json();
        return (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => String(m.name || '').replace(/^models\//, ''));
      },
      // O Flash mais novo que não seja uma variante (lite, imagem, voz, ao vivo); sem Flash, o Pro mais novo
      escolher(ids) {
        const limpo = ids.filter(id => !/lite|image|tts|live|audio|embed|native|robot|computer|exp\b/i.test(id));
        const por = re => limpo.filter(id => re.test(id)).sort((a, b) => versao(b) - versao(a) || a.length - b.length)[0];
        return por(/flash/i) || por(/pro/i) || limpo[0] || ids[0] || '';
      },
      async chamar(chave, modelo, jpeg, sinal) {
        const corpo = { contents: [{ role: 'user', parts: [{ text: PEDIDO }, { inline_data: { mime_type: 'image/jpeg', data: jpeg } }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 2048 } };
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`,
          { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave }, body: JSON.stringify(corpo), signal: sinal, credentials: 'omit' });
        await conferir(r);
        const j = await r.json();
        const c = j.candidates && j.candidates[0];
        return ((c && c.content && c.content.parts) || []).map(p => p.text || '').join('');
      }
    },
    anthropic: {
      nome: 'Claude (Anthropic)', empresa: 'Anthropic', gratis: false, onde: 'https://console.anthropic.com/settings/keys', prefixo: /^sk-ant-/,
      custo: 'Pago por uso, com crédito comprado antes (console.anthropic.com → Billing). Cada comprovante custa centavos de dólar.',
      passos: ['Entre com a sua conta (e-mail ou Google).', 'Toque em "Create Key" (criar chave) e dê um nome, por exemplo "SolverONE".', 'Toque em "Copy Key" (copiar; ela aparece uma vez só) e volte para cá.'],
      cabecalhos(chave) { return { 'x-api-key': chave, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }; },
      async listar(chave) {
        const r = await fetch('https://api.anthropic.com/v1/models?limit=100', { headers: this.cabecalhos(chave), credentials: 'omit' });
        await conferir(r);
        const j = await r.json();
        return (j.data || []).map(m => m.id);   // o mais novo vem primeiro
      },
      // Sonnet (equilíbrio entre preço e leitura); sem ele, Haiku (mais barato); sem os dois, o primeiro
      escolher(ids) { return ids.find(id => /sonnet/i.test(id)) || ids.find(id => /haiku/i.test(id)) || ids[0] || ''; },
      async chamar(chave, modelo, jpeg, sinal) {
        const corpo = { model: modelo, max_tokens: 2048, temperature: 0,
          messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg } }, { type: 'text', text: PEDIDO }] }] };
        const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, this.cabecalhos(chave)), body: JSON.stringify(corpo), signal: sinal, credentials: 'omit' });
        await conferir(r);
        const j = await r.json();
        return (j.content || []).map(c => c.text || '').join('');
      }
    }
  };
  const ORDEM = ['gemini', 'anthropic'];   // o grátis primeiro

  /* ---------- chaves e escolhas ---------- */
  const chaves = () => ler(CHAVES, {}) || {};
  const chave = prov => texto(chaves()[prov]);
  const modelos = () => ler(MODELOS, {}) || {};
  const comChave = () => ORDEM.filter(p => chave(p));
  // O provedor que lê fotos: o escolhido em "usar esta" (se tem chave), senão o primeiro com chave
  const provedorAtual = () => { const e = (ler(POR_USO, {}) || {}).visao; return e && chave(e) ? e : comChave()[0] || ''; };

  // Guarda a chave depois de testá-la de verdade (lista os modelos que ela aceita) e escolhe o modelo
  async function guardarChave(prov, valor) {
    const pr = PROVEDORES[prov];
    const c = texto(valor).replace(/\s+/g, '');
    if (!pr) throw falha('provedor-desconhecido');
    if (!c) throw falha('vazia');
    if (!pr.prefixo.test(c) || c.length < 20) throw falha('formato');
    if (navigator.onLine === false) throw falha('sem-internet');
    const ids = await pr.listar(c);
    const modelo = pr.escolher(ids);
    if (!modelo) throw falha('sem-modelo');
    gravar(CHAVES, Object.assign(chaves(), { [prov]: c }));
    gravar(MODELOS, Object.assign(modelos(), { [prov]: modelo }));
    return modelo;
  }
  function apagarChave(prov) {
    const c = chaves(); delete c[prov]; gravar(CHAVES, c);
    const m = modelos(); delete m[prov]; gravar(MODELOS, m);
  }
  const usarPara = prov => gravar(POR_USO, Object.assign(ler(POR_USO, {}) || {}, { visao: prov }));

  /* ---------- a foto ---------- */
  // A foto reduzida, em JPEG, só o conteúdo (base64)
  function jpegDe(img) {
    const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
    const s = Math.min(1, LADO / Math.max(w0, h0));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w0 * s)); c.height = Math.max(1, Math.round(h0 * s));
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85).split(',')[1];
  }

  /* ---------- a resposta ---------- */
  const numero = v => {
    if (typeof v === 'number') return isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
    const s = texto(v).replace(/[^\d,.-]/g, '');
    if (!s) return null;
    const n = parseFloat(/,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''));
    return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
  };
  const dataDe = v => {
    const s = texto(v);
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (!m) return '';
    const d = +m[1], mes = +m[2], ano = m[3].length === 2 ? '20' + m[3] : m[3];
    return d >= 1 && d <= 31 && mes >= 1 && mes <= 12 ? `${String(d).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}` : '';
  };
  const horaDe = v => { const m = texto(v).match(/^(\d{1,2})[:h](\d{2})/); return m && +m[1] < 24 && +m[2] < 60 ? `${String(+m[1]).padStart(2, '0')}:${m[2]}` : ''; };

  // O JSON da IA nos campos do app: { fields, valor, produtos, tipo, observacao }
  function entender(bruto) {
    let j;
    try { j = JSON.parse(String(bruto).replace(/^[\s\S]*?(\{)/, '$1').replace(/\}[^}]*$/, '}')); } catch (e) { throw falha('resposta-ilegivel', 0, String(bruto).slice(0, 200)); }
    if (!j || typeof j !== 'object') throw falha('resposta-ilegivel');
    const fields = [];
    const poe = (key, val) => { if (val) fields.push({ key, val }); };
    poe('Estabelecimento', texto(j.estabelecimento || j.loja));
    const cnpj = texto(j.cnpj).replace(/\D/g, '');
    if (cnpj.length === 14 && (!L.cnpjValido || L.cnpjValido(cnpj))) poe('CNPJ', `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`);
    poe('Data', dataDe(j.data));
    poe('Hora', horaDe(j.hora));
    poe('Bandeira', texto(j.bandeira).toUpperCase().replace(/^OUTRA$/, ''));
    const fim = texto(j.cartao_final || j.cartao).replace(/\D/g, '').slice(-4);
    if (fim.length === 4) poe('Cartão', 'final ' + fim);
    poe('Modalidade', texto(j.modalidade));
    poe('Autorização', texto(j.autorizacao));
    poe('NSU/DOC', texto(j.nsu));
    const produtos = Array.isArray(j.produtos) ? j.produtos.map(p => ({ descricao: texto(p && p.descricao), qtd: numero(p && p.qtd) || 1, unidade: /kg/i.test(texto(p && p.unidade)) ? 'kg' : 'UN', precoUnit: numero(p && (p.preco || p.precoUnit)), valor: numero(p && p.valor), conferido: false, ia: true }))
      .filter(p => p.descricao && p.valor !== null) : [];
    const tipo = texto(j.tipo);
    return { fields, valor: numero(j.valor), produtos, tipo: L.catalogo && L.catalogo.tipo(tipo) ? tipo : '', observacao: texto(j.observacao) };
  }

  /* ---------- ler ---------- */
  // Lê a foto com o provedor escolhido. Modelo aposentado: escolhe outro e tenta de novo uma vez.
  async function lerFoto(img, opcoes = {}) {
    const prov = opcoes.provedor || provedorAtual();
    const pr = PROVEDORES[prov];
    if (!pr || !chave(prov)) throw falha('sem-chave');
    if (navigator.onLine === false) throw falha('sem-internet');
    const jpeg = jpegDe(img);
    let modelo = modelos()[prov];
    const aborta = typeof AbortController === 'function' ? new AbortController() : null;
    const tempo = aborta && setTimeout(() => aborta.abort(), ESPERA);
    try {
      if (!modelo) { modelo = pr.escolher(await pr.listar(chave(prov))); gravar(MODELOS, Object.assign(modelos(), { [prov]: modelo })); }
      let bruto;
      try { bruto = await pr.chamar(chave(prov), modelo, jpeg, aborta && aborta.signal); }
      catch (e) {
        if (e.codigo !== 'modelo-sumiu') throw e;
        modelo = pr.escolher(await pr.listar(chave(prov)));
        gravar(MODELOS, Object.assign(modelos(), { [prov]: modelo }));
        bruto = await pr.chamar(chave(prov), modelo, jpeg, aborta && aborta.signal);
      }
      return Object.assign(entender(bruto), { provedor: prov, modelo });
    } catch (e) {
      if (e && e.name === 'AbortError') throw falha('demorou');
      if (e && !e.codigo) throw falha('sem-resposta', 0, e.message);
      throw e;
    } finally { if (tempo) clearTimeout(tempo); }
  }

  // Junta o que a IA leu ao resultado do papel. Campos: só onde estava vazio
  // (marcados ia: true). Valor: nunca entra sozinho; vira sugestão (um toque)
  // quando faltava, ou quando a leitura e a IA discordam. Produtos: só quando
  // o papel não tinha nenhum. Tipo: vira dica quando o papel ficou sem tipo.
  function aplicar(papel, lido, atuais) {
    const r = papel.result;
    const fields = (atuais || r.fields).map(f => Object.assign({}, f));
    const ordem = L.texto.CAMPOS;
    let novos = 0;
    lido.fields.forEach(f => {
      const ja = fields.find(x => x.key === f.key);
      if (ja && ja.val) return;
      if (ja) { ja.val = f.val; ja.ia = true; ja.missing = false; novos++; return; }
      const at = fields.findIndex(x => ordem.indexOf(x.key) > ordem.indexOf(f.key) || (ordem.indexOf(x.key) === -1 && ordem.indexOf(f.key) !== -1));
      fields.splice(at === -1 ? fields.length : at, 0, { key: f.key, val: f.val, ia: true });
      novos++;
    });
    r.fields = fields;
    const ia = { provedor: lido.provedor, modelo: lido.modelo, campos: novos, valor: lido.valor, observacao: lido.observacao };
    const campoValor = fields.find(f => f.key === 'Valor');
    const atual = campoValor && campoValor.val ? numero(campoValor.val) : r.valor;
    if (lido.valor !== null && r.expectsValue) {
      if (atual !== null && Math.abs(atual - lido.valor) < 0.005) ia.concorda = true;
      else ia.sugestao = lido.valor;
    }
    if (lido.produtos.length && !(r.produtos || []).length && L.tipo(papel.tipo).produtos) {
      r.produtos = lido.produtos; r.produtosConferido = false; r.produtosIA = true;
    }
    if (lido.tipo && lido.tipo !== 'livre' && lido.tipo !== papel.tipo && (papel.tipo === 'livre' || !r.hint)) r.hint = lido.tipo;
    r.ia = ia;
    return ia;
  }

  // A explicação de um erro, em linguagem de gente
  function explicar(e) {
    const prov = PROVEDORES[provedorAtual()] || {};
    const nome = prov.nome || 'a IA';
    switch (e && e.codigo) {
      case 'sem-chave': return 'Falta a chave da IA. Abra Ajustes → Ler com IA e cole uma.';
      case 'vazia': return 'Cole a chave no campo antes de salvar.';
      case 'formato': return 'Isso não parece uma chave deste provedor. Copie a chave inteira, sem espaços.';
      case 'chave-recusada': return `${nome} recusou a chave. Confira se ela foi copiada inteira ou crie outra no site.`;
      case 'sem-cota': return `${nome} avisou que a cota (ou o crédito) acabou por agora. Tente mais tarde ou use outra chave.`;
      case 'fora-do-ar': return `${nome} está fora do ar neste momento. Tente de novo daqui a pouco.`;
      case 'modelo-sumiu': case 'sem-modelo': return `${nome} não ofereceu um modelo para esta chave. Confira a conta no site do provedor.`;
      case 'sem-internet': return 'Sem internet agora. A IA precisa de internet; a leitura no aparelho continua funcionando.';
      case 'demorou': return `${nome} demorou demais para responder. Tente de novo.`;
      case 'resposta-ilegivel': return `${nome} respondeu de um jeito que não entendi. Tente de novo.`;
      case 'sem-resposta': return `Não consegui falar com ${nome} (bloqueio da rede ou do navegador). Confira a internet e tente de novo.`;
      default: return `${nome} recusou o pedido${e && e.status ? ' (erro ' + e.status + ')' : ''}. Tente de novo.`;
    }
  }

  // A pessoa precisa confirmar o envio? Sempre para saúde, documento pessoal e
  // rosto; para os outros, até ela pedir para não perguntar mais
  const precisaPerguntar = tipo => { const p = L.tipo(tipo).privacidade; return p === 'saude' || p === 'pessoal' || p === 'biometrico' || ler(AVISADO, '') !== 'sim'; };

  L.ia = {
    provedores: () => ORDEM.map(p => ({ id: p, nome: PROVEDORES[p].nome, empresa: PROVEDORES[p].empresa, gratis: PROVEDORES[p].gratis, onde: PROVEDORES[p].onde, custo: PROVEDORES[p].custo, passos: PROVEDORES[p].passos, temChave: !!chave(p), modelo: modelos()[p] || '' })),
    temChave: () => comChave().length > 0,
    provedorAtual, usarPara, guardarChave, apagarChave, lerFoto, aplicar, explicar, precisaPerguntar, entender, jpegDe,
    naoPerguntarMais: () => gravar(AVISADO, 'sim'),
    sozinha: () => ler(SOZINHA, '') === 'sim',
    ligarSozinha: sim => gravar(SOZINHA, sim ? 'sim' : 'nao')
  };
})(window.Leitura);
