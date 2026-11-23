/* leitores/os-oficina.js — ordem de serviço de oficina de carro (funilaria,
   pintura, martelinho, mecânica), em foto ou PDF. Pedido 37 (23/11/2026).

   Lê uma vez só e devolve duas partes, além dos campos da tela:
   - result.operacional (OmniLifeONE, "Vida do carro"): oficina, OS, datas de
     emissão, entrada e retirada, km, prazo, veículo (sem a placa), serviços
     (código, descrição, valor, peça da carroceria, tipo e posição), peças
     (ligadas ao serviço pelo código "A3.1" → "A3"), totais conferidos,
     situação (serviço feito ou orçamento), garantia e recorrência (quando o
     papel diz), categoria;
   - result.financeiro (MoneyTRIO): o valor que vale, parcelas, forma de
     pagamento, data, categoria, veículo, e o lançamento no formato dos apps.
   O valor que vale é o "VALOR FECHADO" do rodapé (ou o comprovante do cartão
   grampeado na mesma foto); a tabela (serviços + peças) é só o orçamento.
   Conta que não fecha, item que faltou ou rodapé não lido: o app pede outra
   foto e diz o que fazer (mais perto, mais luz, papel esticado, sem sombra).
   Privacidade: nome, telefone, CPF e endereço do cliente, a placa e o número
   do cartão nunca viram campo, e a foto deste tipo não vai para a IA (semIA). */
(function (L) {
  'use strict';
  const up = s => String(s || '').toUpperCase();

  // "R$ 1.200,00", "R$400.00", "R$26417" (separador perdido), "RS 50,00" → número
  const DINHEIRO = /(?:R\s?[$S5§]|RS)\s?(\d{1,3}(?:[.,]\d{3})+[.,]\d{2}|\d{1,6}[.,]\d{2}|\d{3,7})(?!\d)/g;
  function numero(s) {
    const t = String(s || '').replace(/\s/g, '');
    let m = t.match(/^(\d{1,3}(?:[.,]\d{3})*)[.,](\d{2})$/);
    if (m) return parseFloat(m[1].replace(/[.,]/g, '') + '.' + m[2]);
    m = t.match(/^(\d+)[.,](\d{2})$/);
    if (m) return parseFloat(m[1] + '.' + m[2]);
    if (/^\d{3,7}$/.test(t)) return parseInt(t, 10) / 100;
    return null;
  }
  // "6.500", "6500", "6.500,00" (o valor fechado, escrito em reais inteiros ou com centavos)
  const reais = s => /^\d{1,3}(?:\.\d{3})+$/.test(s) ? parseInt(s.replace(/\./g, ''), 10) : /^\d{1,6}$/.test(s) ? parseInt(s, 10) : numero(s);
  const dinheiros = linha => [...up(linha).matchAll(DINHEIRO)].map(m => numero(m[1])).filter(v => v !== null);
  const soma = lista => Math.round(lista.reduce((t, v) => t + (v || 0), 0) * 100) / 100;
  const igual = (a, b) => a !== null && b !== null && a !== undefined && b !== undefined && Math.abs(a - b) < 0.011;
  const brl = v => L.texto.formatBRL(v);

  // O código do item ("A1", "A13", "A3.1"), com as trocas que a foto faz: "AL" (A1), "AB" (A8), "AI0" (A10), "AIZ" (A12), "AT.1" (A7.1)
  const MAPA = { I: '1', L: '1', Z: '2', S: '5', O: '0', B: '8', T: '7', G: '6', D: '0', Q: '0' };
  const numCod = s => { const d = [...s].map(c => /\d/.test(c) ? c : MAPA[c] || '').join(''); return /^\d{1,2}$/.test(d) ? parseInt(d, 10) : null; };
  const COD = /^.{0,6}?A\s?([0-9ILZSOBTGDQ]{1,2})(?:\s?[.,]\s?(\d))?(?:\s*[-–—+.:]\s*|\s+)(.*)$/;
  // A descrição: a sequência de palavras em maiúsculas depois do código (o resto da linha é ruído e o valor)
  const PALAVRA = /^[A-ZÀ-Ú][A-ZÀ-Ú\/\-]+[.,:]?$|^[EAO]$/;
  function descricaoDe(resto) {
    const toks = resto.trim().split(/\s+/), out = [];
    for (const t of toks) { if (!PALAVRA.test(t)) break; out.push(t); }
    return out.join(' ').replace(/[.,:]+$/, '').trim();
  }

  /* ---------- classificação dos itens (peça da carroceria, tipo do serviço, posição) ---------- */
  const PECAS = [[/\bFRISO/, 'friso'], [/MOLDURA/, 'moldura'], [/PRESILHA/, 'presilha'], [/POLAINA/, 'polaina'], [/V[AÃ]O DE RODA/, 'vão de roda'],
    [/LATERAL/, 'lateral'], [/\bPORTA\b/, 'porta'], [/CAP[OÔ]\b/, 'capô'], [/PARA-?\s?LAMA|PARALAMA/, 'para-lama'], [/PARA-?\s?CHOQUE|PARACHOQUE/, 'para-choque'],
    [/\bTETO\b/, 'teto'], [/PARA-?\s?BRISA|PARABRISA/, 'para-brisa'], [/RETROVISOR/, 'retrovisor'], [/FAROL|FAR[OÓ]IS/, 'farol'], [/LANTERNA/, 'lanterna'],
    [/\bVIDRO/, 'vidro'], [/\bRODA\b/, 'roda'], [/PNEU/, 'pneu'], [/FREIO|PASTILHA|DISCO/, 'freio'], [/SUSPENS|AMORTECEDOR/, 'suspensão'], [/EMBREAGEM/, 'embreagem'],
    [/BATERIA/, 'bateria'], [/\b[OÓ]LEO\b|FILTRO/, 'óleo e filtros'], [/MOTOR/, 'motor'], [/PORTA-?\s?MALAS?|TAMPA TRASEIRA/, 'porta-malas'], [/GRADE/, 'grade'], [/ESTEPE/, 'estepe']];
  const TIPOS = [[/MARTELINHO/, 'martelinho'], [/RECUPERAR|PINTAR|PINTURA|FUNILARIA/, 'pintura'], [/TROCAR|TROCA\b|SUBSTITU/, 'troca'], [/POLIR|POLIMENTO/, 'polimento'],
    [/ALINHAMENTO|BALANCEAMENTO|GEOMETRIA/, 'alinhamento'], [/REVIS/, 'revisão'], [/HIGIENIZA|LAVAGEM|LIMPEZA/, 'limpeza'], [/INSTALA/, 'instalação'], [/REPARO|CONSERT|RECUPERA/, 'reparo']];
  const peca = d => (PECAS.find(([re]) => re.test(d)) || [])[1] || null;
  const tipo = d => (TIPOS.find(([re]) => re.test(d)) || [])[1] || 'outro';
  function posicao(d) {
    const a = (d.match(/DIANTEIR[AO]|TRASEIR[AO]/) || [])[0], b = (d.match(/DIREIT[AO]|ESQUERD[AO]/) || [])[0];
    return a || b ? [a, b].filter(Boolean).join(' ').toLowerCase() : null;
  }
  const FABRICANTES = /^(JEEP|FIAT|VW|VOLKSWAGEN|CHEVROLET|GM|FORD|TOYOTA|HONDA|HYUNDAI|RENAULT|NISSAN|PEUGEOT|CITRO[EË]N|BMW|MERCEDES(?:-BENZ)?|AUDI|KIA|MITSUBISHI|CAOA|CHERY|BYD|VOLVO|LAND ROVER|JAC|SUZUKI|SUBARU|RAM|DODGE|MINI|PORSCHE|LEXUS|TROLLER|GWM|HAVAL|JAGUAR|YAMAHA|KAWASAKI)$/;
  const CORES = /^(PRET[AO]|BRANC[AO]|PRATA|CINZA|VERMELH[AO]|AZUL|VERDE|AMAREL[AO]|MARROM|BEGE|DOURAD[AO]|LARANJA|ROX[AO]|VINHO|GRAFITE|CHUMBO)$/;

  /* ---------- o que uma leitura (um texto) diz ---------- */
  function analisar(T) {
    const linhas = T.split('\n').map(l => l.trim()).filter(Boolean);   // sem as linhas vazias que o OCR põe entre blocos: o valor fica na linha de baixo do rótulo
    const acha = re => { for (const l of linhas) { const m = l.match(re); if (m) return m; } return null; };
    const r = { servicos: [], pecas: [], totais: {}, fechado: null, comprovante: null, veiculo: {} };

    // cabeçalho
    r.cnpj = (T.match(/\d{2}[.\s]{0,2}\d{3}[.\s]{0,2}\d{3}\s?\/\s?\d{4}\s?-?\s?\d{2}/g) || []).find(c => L.cnpjValido && L.cnpjValido(c)) || null;
    if (r.cnpj) r.cnpj = r.cnpj.replace(/\D/g, '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    const nome = acha(/\bOFICINA\s+((?:[A-ZÀ-Ú]{2,}\s?){1,3})/);
    if (nome && !/^(?:N[AÃ]O|DE|DO|DA|SE|E)\b/.test(nome[1])) r.oficina = ('OFICINA ' + nome[1]).replace(/\s+(?:LTDA|ME|EIRELI|EPP)\b.*$/, '').trim();
    r.sistema = /\bT?ONMOTOR\b/.test(T) ? 'onmotor' : null;
    const os = acha(/(?:ORDEM DE SERVI[CÇ]O|\bO\.?S\.?)\s*(?:N[ºO°]?\.?)?\s*[:.]?\s*(\d{3,8})\b/);
    r.os = os ? os[1] : null;
    r.via = /\b[VM]IA (?:DO )?CLIENTE/.test(T) ? 'cliente' : null;
    const em = acha(/EMISS[AÃ]O\s*:?\s*(\d{2}\/\d{2}\/\d{4})(?:\s*[AÀ]S?\s*(\d{1,2}:\d{2}))?/);
    if (em) { r.emissao = em[1]; r.hora = em[2] || null; }
    const DATA = /(\d{2}\/\d{2}\/\d{4})(?:\s*[AÀ]S?\s*(\d{1,2}:\d{2}))?/g;
    const iEnt = linhas.findIndex(l => /DATA DE ENTRADA/.test(l));
    if (iEnt >= 0) {
      const datas = [...linhas.slice(iEnt + 1, iEnt + 3).join(' ').matchAll(DATA)].map(m => m[1] + (m[2] ? ' ' + m[2] : ''));
      r.entrada = datas[0] || null; r.retirada = datas[1] || null;
    }
    const ent = acha(/\bENTRADA\s*:\s*(\d{2}\/\d{2}\/\d{4}(?:\s*[AÀ]S?\s*\d{1,2}:\d{2})?)/), ret = acha(/\bRETIRADA\s*:\s*(\d{2}\/\d{2}\/\d{4}(?:\s*[AÀ]S?\s*\d{1,2}:\d{2})?)/);
    if (ent) r.entrada = ent[1]; if (ret) r.retirada = ret[1];
    const km = acha(/\bKM\s*:?\s*(\d{1,3}(?:\.\d{3})+|\d{3,7})\b/);
    r.km = km ? parseInt(km[1].replace(/\./g, ''), 10) : null;
    if (r.km === null) {   // "Tanque KM ... Cor" e os valores na linha de baixo: um número solto de 3 a 7 algarismos
      const iKm = linhas.findIndex(l => /\bKM\b/.test(l) && /TANQUE|DIRE[CÇ][AÃ]O|C[AÂ]MBIO/.test(l));
      if (iKm >= 0) { const m = (linhas[iKm + 1] || '').replace(/\d{2}\/\d{2}\/\d{4}|\d{1,2}:\d{2}|\d+\s?%/g, ' ').match(/(?:^|\s)(\d{1,3}(?:\.\d{3})+|\d{3,7})(?=\s|$)/); if (m) r.km = parseInt(m[1].replace(/\./g, ''), 10); }
    }
    const iPrazo = linhas.findIndex(l => /PRAZO/.test(l));
    const prazo = iPrazo >= 0 && linhas.slice(iPrazo, iPrazo + 3).join(' ').match(/(\d{1,2})\s*DIAS?\s*([UÚ]TEIS)?/);
    r.prazo = prazo ? `${parseInt(prazo[1], 10)} dia${+prazo[1] > 1 ? 's' : ''}${prazo[2] ? ' úteis' : ''}` : null;
    const gar = acha(/GARANTIA[^\n]{0,40}?(\d{1,3})\s*(DIAS?|MESES|M[EÊ]S|ANOS?)/);
    r.garantia = gar ? `${gar[1]} ${gar[2].toLowerCase()}` : null;
    const rec = acha(/(?:PR[OÓ]XIM[AO]\s+(?:REVIS[AÃ]O|TROCA)|RETORNO)[^\n]{0,30}?(\d{2}\/\d{2}\/\d{4}|\d{1,3}(?:\.\d{3})+\s?KM|\d{3,7}\s?KM)/);
    r.recorrencia = rec ? rec[1] : null;
    const iDiag = linhas.findIndex(l => /^\W*DIAGN[OÓ]STICO\b/.test(l));
    if (iDiag >= 0) { const d = (linhas[iDiag].replace(/^\W*DIAGN[OÓ]STICO\s*:?\s*/, '') + ' ' + (/INFORMA[CÇ]|SERVI/.test(linhas[iDiag + 1] || '') ? '' : linhas[iDiag + 1] || '')).replace(/[^A-ZÀ-Ú0-9 ,.\/-]/g, ' ').replace(/\s+/g, ' ').trim(); if (d.length >= 6) r.diagnostico = d; }

    // veículo: a linha de rótulos "Placa Fabricante Modelo Ano ..." e os valores na de baixo (a placa não fica)
    const iVe = linhas.findIndex(l => /FABRICANTE|\bMARCA\b/.test(l) && /MODELO/.test(l));
    if (iVe >= 0) {
      let toks = (linhas[iVe + 1] || '').split(/\s+/).filter(t => t && t !== '=');
      if (/^\W*PLACA/.test(linhas[iVe]) && toks.length) toks = toks.slice(1);   // a placa é o primeiro valor: fora
      const linha = toks.join(' ');
      const kFab = toks.findIndex(t => FABRICANTES.test(t));
      const kAno = toks.findIndex(t => /\d{4}/.test(t));
      if (kFab >= 0) r.veiculo.fabricante = toks[kFab];
      const modelo = toks.slice(kFab >= 0 ? kFab + 1 : 0, kAno > 0 ? kAno : undefined).filter(t => /^[A-ZÀ-Ú][A-ZÀ-Ú0-9.\-]*$/.test(t)).join(' ');
      if (modelo && kFab >= 0) r.veiculo.modelo = modelo;
      const ano = linha.match(/\b((?:19|20)\d{2})\s?\/?\s?((?:19|20)\d{2})?\b/);
      if (ano) r.veiculo.ano = ano[2] ? `${ano[1]}/${ano[2]}` : ano[1];
      const depois = kAno >= 0 ? toks.slice(kAno + 1).join(' ') : linha;
      const motor = depois.match(/\b(\d)[.,](\d)\b/) || depois.match(/\b([1-9])(\d)\b/);
      if (motor) r.veiculo.motor = `${motor[1]}.${motor[2]}`;
      const comb = linha.match(/FLEX|GASOLINA|DIESEL|ETANOL|[AÁ]LCOOL|EL[EÉ]TRICO|H[IÍ]BRIDO|GNV/);
      if (comb) r.veiculo.combustivel = comb[0].charAt(0) + comb[0].slice(1).toLowerCase();
    }
    const iCor = linhas.findIndex(l => /\bCOR\b/.test(l) && /TANQUE|C[AÂ]MBIO|\bKM\b|DIRE[CÇ][AÃ]O/.test(l));
    const cor = (iCor >= 0 ? (linhas[iCor + 1] || '').split(/\s+/) : []).find(t => CORES.test(t)) || (acha(/\bCOR\s*:\s*([A-ZÀ-Ú]+)/) || [])[1];
    if (cor && CORES.test(cor)) r.veiculo.cor = cor.toLowerCase();

    // serviços ("A1 - RECUPERAR/PINTAR LATERAL TRASEIRA DIREITA ... R$ 900,00") e peças ("A3.1 - MOLDURA ... 1,00 UN R$ 500,00 R$ 500,00")
    linhas.forEach((l, i) => {
      const m = l.match(COD);
      if (!m) return;
      const n = numCod(m[1]);
      if (n === null || n > 60) return;
      const valores = dinheiros(m[3]);
      if (!valores.length) { const fim = m[3].match(/(\d{1,3}(?:\.\d{3})*,\d{2})\s*$/); if (fim) valores.push(numero(fim[1])); }
      if (!valores.length) return;
      const descricao = descricaoDe(m[3]);
      if (descricao.length < 3) return;
      if (m[2] !== undefined) {
        const resto = m[3].slice(m[3].indexOf(descricao) + descricao.length);
        const q = resto.match(/(\d{1,3}(?:[.,]\d{1,2})?)\s?(UN|PC|P[CÇ]S?|KG|LT?|M|JG|CX|PAR)\b/);
        const total = valores[valores.length - 1], unitario = valores.length > 1 ? valores[valores.length - 2] : total;
        let qtd = q ? parseFloat(q[1].replace(',', '.')) : 1;
        if (unitario > 0 && Math.abs(qtd * unitario - total) > 0.011 && igual(Math.round(total / unitario * 100) / 100, Math.round(total / unitario))) qtd = Math.round(total / unitario);   // "100UN" lido sem a vírgula
        r.pecas.push({ codigo: `A${n}.${m[2]}`, servico: `A${n}`, descricao, qtd, unidade: q ? q[2] : 'UN', unitario, total, linha: i });
      } else r.servicos.push({ codigo: `A${n}`, n, descricao, valor: valores[valores.length - 1], linha: i });
    });
    const tot = (re, l) => { const m = l.match(re); return m ? numero(m[1]) : null; };
    linhas.forEach(l => {
      const s = tot(/TOTAL\s*(?:DE\s*|DOS\s*)?SERVI\S*\s*:?\s*(?:R\s?[$S5§]|RS)?\s?(\d[\d.,]*)/, l), p = tot(/TOTAL\s*(?:DE\s*|DAS\s*)?PE[CÇ]A\S*\s*:?\s*(?:R\s?[$S5§]|RS)?\s?(\d[\d.,]*)/, l),
        t = tot(/VALOR\s*TOTAL\s*(?:DA\s*OS|GERAL)?\s*:?\s*(?:R\s?[$S5§]|RS)?\s?(\d[\d.,]*)/, l);
      if (s !== null && r.totais.servicos === undefined) r.totais.servicos = s;
      if (p !== null && r.totais.pecas === undefined) r.totais.pecas = p;
      if (t !== null && r.totais.tabela === undefined) r.totais.tabela = t;
    });
    // o rodapé que vale: "VALOR FECHADO PARA ESTE ORÇAMENTO EM 6.500 EM 5X SEM JUROS"
    // ("EM:6:500 EM SX" quando a foto troca o ponto por dois-pontos e o 5 por S)
    const fe = acha(/VALOR\s*FECHADO[^\n]*?(?:R\s?\$\s?)?(\d{1,3}(?:[.:]\d{3})+(?:,\d{2})?|\d{3,6}(?:,\d{2})?)(.*)$/);
    if (fe) { const v = reais(fe[1].replace(/:/g, '.')); const px = fe[2].match(/EM\s*([0-9S]{1,2})\s?X/) || fe[2].match(/([0-9S]{1,2})\s?X\s*(?:SEM|S\/|COM)\s*JUROS/); if (v) r.fechado = { valor: v, parcelas: px ? parseInt(px[1].replace(/S/g, '5'), 10) : null }; }
    // o comprovante do cartão grampeado na mesma foto: "CRÉDITO R$ 6.500,00", "5X SEM JUROS DE R$ 1.300,00"
    const iComp = linhas.findIndex(l => /^\W*(?:CR[EÉ]DITO|D[EÉ]BITO)\b/.test(l) && dinheiros(l).length);
    if (iComp >= 0) {
      const v = dinheiros(linhas[iComp])[0];
      const px = linhas.slice(iComp, iComp + 3).join(' ').match(/(\d{1,2})\s?X\s*(?:SEM|S\/|COM)\s*JUROS\s*(?:DE\s*)?(?:R\s?\$\s?)?(\d[\d.,]*)?/);
      const data = [...linhas.slice(Math.max(0, iComp - 8), iComp).join(' ').matchAll(/\b(\d{2}\/\d{2}\/\d{4})\b/g)].map(m => m[1]).pop() || null;
      r.comprovante = { valor: v, modalidade: /D[EÉ]BITO/.test(linhas[iComp]) ? 'cartão de débito' : 'cartão de crédito', parcelas: px ? parseInt(px[1], 10) : null, parcela: px && px[2] ? numero(px[2]) : null, data };
    }
    r.pago = /\bPAGO\b|QUITAD|\bPIX\b.*(?:RECEBIDO|EFETUADO)/.test(T);
    r.funilaria = /FUNILARIA|PINTURA|MARTELINHO/.test(T);
    return r;
  }

  // O que denuncia a OS (contado por tipo de sinal, não por repetição): 3 ou mais,
  // sendo ao menos um da estrutura (seções, totais, datas), e é ela. Uma conta de
  // restaurante também fala em "serviço" e "total"; o canhoto de uma oficina diz
  // "oficina" e "funilaria", mas não tem seções nem "data de entrada".
  const ESTRUTURA = [/ORDEM DE SERVI/, /\bO\.?S\.?\s*(?:N[ºO°]?\.?)?\s*[:.]?\s*\d{3,}/, /DIAGN[OÓ]STICO/, /INFORMA[CÇ][OÕ]ES DE (?:SERVI|PE[CÇ])/, /SERVI[CÇ]O\S{0,3}\)/, /PE[CÇ]A\S{0,3}\)/,
    /TOTAL\s*(?:DE\s*)?SERVI/, /TOTAL\s*(?:DE\s*)?PE[CÇ]A/, /DATA DE (?:ENTRADA|RETIRADA)/, /PRAZO PARA REPARO/, /M[AÃ]O DE OBRA/, /VALOR FECHADO/, /RECUPERAR\/PINTAR/];
  const OUTROS = [/OFICINA/, /FUNILARIA/, /MARTELINHO/, /MEC[AÂ]NICA/, /\bT?ONMOTOR\b/, /REVIS[AÃ]O/, /TROCA DE [OÓ]LEO/, /ALINHAMENTO|BALANCEAMENTO/, /\bKM\b.*C[AÂ]MBIO|C[AÂ]MBIO.*\bKM\b/];
  function reconhece(texto) {
    const T = up(texto);
    const e = ESTRUTURA.filter(re => re.test(T)).length, o = OUTROS.filter(re => re.test(T)).length;
    return e >= 1 && e + o >= 3;
  }

  /* ---------- juntar as leituras e montar o resultado ---------- */
  function exato(readings) {
    const lidas = readings.map(r => analisar(up(r.text)));
    const primeiro = k => { for (const l of lidas) { const v = k.split('.').reduce((o, p) => o && o[p], l); if (v !== null && v !== undefined && v !== '') return v; } return null; };
    const confere = l => {
      const okS = l.servicos.length > 0 && igual(soma(l.servicos.map(s => s.valor)), l.totais.servicos);
      const okP = l.pecas.length ? igual(soma(l.pecas.map(p => p.total)), l.totais.pecas) : l.totais.pecas === undefined || l.totais.pecas === 0;
      const okT = l.totais.tabela === undefined || igual((l.totais.servicos || 0) + (l.totais.pecas || 0), l.totais.tabela);
      return okS && okP && okT;
    };
    // a leitura das tabelas: a que fecha a conta; senão, a que leu mais itens
    const melhor = lidas.slice().sort((a, b) => (confere(b) - confere(a)) || ((b.servicos.length + b.pecas.length) - (a.servicos.length + a.pecas.length)))[0];
    const totais = { servicos: primeiro('totais.servicos'), pecas: primeiro('totais.pecas'), tabela: primeiro('totais.tabela') };
    Object.assign(totais, melhor.totais);
    const servicos = melhor.servicos, pecas = melhor.pecas;
    const somaS = soma(servicos.map(s => s.valor)), somaP = soma(pecas.map(p => p.total));
    const okS = servicos.length > 0 && igual(somaS, totais.servicos), okP = pecas.length ? igual(somaP, totais.pecas) : (totais.pecas === null || totais.pecas === 0);
    const okT = totais.tabela === null || igual((okS ? totais.servicos : somaS) + (okP ? totais.pecas || 0 : somaP), totais.tabela);
    const conferido = okS && okP && okT;
    const problemas = [];
    if (!servicos.length) problemas.push('não achei a lista de serviços');
    else {
      const ns = servicos.map(s => s.n), faltam = [];
      for (let k = 1; k <= Math.max(...ns); k++) if (!ns.includes(k)) faltam.push('A' + k);
      if (faltam.length) problemas.push(`faltou o item ${faltam.join(', ')}`);
      if (new Set(ns).size !== ns.length) problemas.push('um item saiu duas vezes');
      if (totais.servicos === null) problemas.push('não achei o total dos serviços');
      else if (!okS) problemas.push(`os serviços somam ${brl(somaS)} e o papel diz ${brl(totais.servicos)}`);
      if (pecas.length && totais.pecas !== null && !okP) problemas.push(`as peças somam ${brl(somaP)} e o papel diz ${brl(totais.pecas)}`);
      if (!okT) problemas.push('serviços mais peças não dão o valor total');
    }

    // O valor que vale: o rodapé "VALOR FECHADO" (lido em 2 leituras, ou igual ao
    // comprovante do cartão na mesma foto); senão o comprovante; senão a tabela
    // vira só uma opção (orçamento). Rodapé lido uma vez só fica como opção.
    const fechados = lidas.map(l => l.fechado).filter(Boolean), comprovante = primeiro('comprovante');
    const vezes = v => fechados.filter(f => igual(f.valor, v)).length;
    const fechado = fechados.slice().sort((a, b) => vezes(b.valor) - vezes(a.valor))[0] || null;
    const totalTabela = totais.tabela !== null ? totais.tabela : (servicos.length ? Math.round((somaS + somaP) * 100) / 100 : null);
    let valor = null, fonte = null, candidatos = [], status = '';
    if (fechado && comprovante && !igual(fechado.valor, comprovante.valor)) { candidatos = [fechado.valor, comprovante.valor]; status = 'O valor fechado e o comprovante do cartão não batem: toque no certo'; }
    else if (fechado && (vezes(fechado.valor) >= 2 || (comprovante && igual(fechado.valor, comprovante.valor)))) { valor = fechado.valor; fonte = 'fechado'; status = 'Valor fechado no rodapé' + (comprovante ? ', igual ao comprovante do cartão' : ', lido duas vezes'); }
    else if (fechado) { candidatos = [fechado.valor].concat(totalTabela !== null && !igual(totalTabela, fechado.valor) ? [totalTabela] : []); status = `Valor fechado lido uma vez só (${brl(fechado.valor)}): toque para confirmar`; }
    else if (comprovante) { valor = comprovante.valor; fonte = 'comprovante'; status = 'Valor do comprovante do cartão'; }
    else if (totalTabela !== null) { candidatos = [totalTabela]; status = `Orçamento de ${brl(totalTabela)} na tabela; sem valor fechado nem pagamento`; }
    // as parcelas do rodapé podem ter saído em outra leitura do mesmo valor ("EM 5X")
    const parcelas = (fechado && ((fechados.find(f => igual(f.valor, fechado.valor) && f.parcelas) || {}).parcelas)) || (comprovante && comprovante.parcelas) || null;
    const parcela = (comprovante && comprovante.parcela) || (parcelas && valor ? Math.round(valor / parcelas * 100) / 100 : null);
    const feito = !!(fechado || comprovante || primeiro('pago'));

    // uma foto em que a tabela não saiu inteira ou a conta não fecha: pedir outra, com o que fazer
    const pedirFoto = problemas.length ? { motivo: problemas.join('; '), dicas: ['chegue mais perto', 'mais luz', 'estique o papel', 'sem sombra'] } : null;

    const veiculo = {};
    ['fabricante', 'modelo', 'ano', 'motor', 'combustivel', 'cor'].forEach(k => { const v = primeiro('veiculo.' + k); if (v) veiculo[k] = v; });
    const nomeVeiculo = [veiculo.fabricante, veiculo.modelo, veiculo.ano, veiculo.motor, veiculo.combustivel, veiculo.cor].filter(Boolean).join(' ');
    const categoria = primeiro('funilaria') || servicos.some(s => ['pintura', 'martelinho'].includes(tipo(s.descricao))) ? 'Funilaria e pintura'
      : servicos.some(s => ['revisão', 'alinhamento', 'troca', 'reparo'].includes(tipo(s.descricao))) ? 'Mecânica' : 'Oficina';
    const oficina = primeiro('oficina'), cnpj = primeiro('cnpj'), os = primeiro('os'), emissao = primeiro('emissao');

    const operacional = {
      oficina: { nome: oficina, cnpj, sistema: primeiro('sistema') },
      os, via: primeiro('via'), emissao: emissao ? emissao + (primeiro('hora') ? ' ' + primeiro('hora') : '') : null, entrada: primeiro('entrada'), retirada: primeiro('retirada'),
      km: primeiro('km'), prazo: primeiro('prazo'), veiculo, diagnostico: primeiro('diagnostico'),
      servicos: servicos.map(s => ({ codigo: s.codigo, descricao: s.descricao, valor: s.valor, peca: peca(s.descricao), tipo: tipo(s.descricao), posicao: posicao(s.descricao) })),
      pecas: pecas.map(p => ({ codigo: p.codigo, servico: p.servico, descricao: p.descricao, qtd: p.qtd, unidade: p.unidade, unitario: p.unitario, total: p.total, peca: peca(p.descricao) })),
      totais: { servicos: totais.servicos, pecas: totais.pecas, tabela: totalTabela, conferido },
      situacao: feito ? 'feito' : 'orcamento', garantia: primeiro('garantia'), recorrencia: primeiro('recorrencia'), categoria
    };
    const dataPagamento = (comprovante && comprovante.data) || emissao || null;
    const financeiro = {
      valor, fonte, parcelas, parcela, forma: comprovante ? comprovante.modalidade : fechado && fechado.parcelas ? 'cartão de crédito' : null, data: dataPagamento,
      categoria: 'Veículo › ' + categoria, veiculo: nomeVeiculo || null, estabelecimento: oficina, cnpj, os, situacao: feito ? 'pago' : 'orcamento',
      lancamento: valor !== null && L.leitores.extrato ? L.leitores.extrato.contrato({ data: dataPagamento || '', descricao: `${oficina || 'OFICINA'}${os ? ' (OS ' + os + ')' : ''} - ${categoria.toLowerCase()}`, valor: -valor, parcela: parcelas ? { n: 1, de: parcelas } : undefined }, { tipo: 'os_oficina', conferido: fonte === 'fechado', papel: '' }) : null
    };

    // os campos da tela (nunca o cliente, a placa ou o cartão)
    const campos = {};
    if (oficina) campos.Estabelecimento = oficina;
    if (cnpj) campos.CNPJ = cnpj;
    campos.Categoria = 'Veículo › ' + categoria;
    if (os) campos.OS = os;
    if (emissao) campos.Data = emissao;
    if (primeiro('hora')) campos.Hora = primeiro('hora');
    if (operacional.entrada) campos.Entrada = operacional.entrada;
    if (operacional.retirada) campos.Retirada = operacional.retirada;
    if (operacional.km !== null) campos.KM = String(operacional.km);
    if (operacional.prazo) campos.Prazo = operacional.prazo;
    if (nomeVeiculo) campos['Veículo'] = nomeVeiculo;
    if (servicos.length) campos['Serviços'] = `${servicos.length} (${brl(totais.servicos !== null ? totais.servicos : somaS)})`;
    if (pecas.length) campos['Peças'] = `${pecas.length} (${brl(totais.pecas !== null ? totais.pecas : somaP)})`;
    if (totalTabela !== null) campos['Total da tabela'] = brl(totalTabela) + (conferido ? ' (conferido)' : '');
    if (parcelas || comprovante) campos.Pagamento = [comprovante ? comprovante.modalidade : 'cartão', parcelas ? `${parcelas}x` + (parcela ? ` de ${brl(parcela)}` : '') : null].filter(Boolean).join(', ');
    campos['Situação'] = feito ? 'serviço feito' : 'orçamento';
    if (operacional.garantia) campos.Garantia = operacional.garantia;
    if (primeiro('sistema')) campos.Sistema = primeiro('sistema');

    // a tela mostra serviços e peças na tabela de produtos
    const produtos = servicos.map(s => ({ descricao: `${s.codigo} · ${s.descricao}`, qtd: 1, unidade: 'serviço', precoUnit: s.valor, valor: s.valor }))
      .concat(pecas.map(p => ({ descricao: `${p.codigo} · ${p.descricao}`, qtd: p.qtd, unidade: p.unidade, precoUnit: p.unitario, valor: p.total })));
    const resumo = servicos.length ? `${servicos.length} serviço${servicos.length > 1 ? 's' : ''} (${brl(totais.servicos !== null ? totais.servicos : somaS)})${pecas.length ? ` e ${pecas.length} peça${pecas.length > 1 ? 's' : ''} (${brl(totais.pecas !== null ? totais.pecas : somaP)})` : ''}`
      + (totalTabela !== null ? `: a tabela soma ${brl(totalTabela)}${conferido ? ', conferido' : ' (confira: a conta não fecha)'}` : '') + (valor !== null && fonte === 'fechado' ? `; valor fechado ${brl(valor)}` : '') : '';

    return { valor, campos, status, semTexto: true,
      ajustar(r) {
        if (!oficina) r.fields = r.fields.filter(f => f.key !== 'Estabelecimento');   // sem o nome lido, melhor nada que lixo
        if (!cnpj) r.fields = r.fields.filter(f => f.key !== 'CNPJ');   // o CNPJ só com os dígitos verificadores certos (o "STONEID" do canhoto não é CNPJ)
        if (valor === null && candidatos.length) r.candidates = candidatos;
        if (valor === null && status) r.status = { cls: 'warn', text: status };
        Object.assign(r, { operacional, financeiro, produtos, produtosConferido: conferido, produtosResumo: resumo });
        if (pedirFoto) r.pedirFoto = pedirFoto;
      } };
  }

  // A faixa do papel que vale uma releitura mais de perto (leitura/foto.js chama
  // faixa(readings, k) até ela devolver nada): o rodapé, do "prazo" para baixo,
  // onde fica o "valor fechado" marcado com marca-texto; só até ele ter sido lido
  // duas vezes. A faixa precisa ser estreita (numa faixa alta a marca-texto some)
  // e em tons de cinza (em preto e branco ela vira um borrão); como a leitura
  // varia com o corte, até três tentativas: pelo rótulo "prazo", e do ponto de
  // 72% da altura para baixo, em dois tamanhos. A faixa vai até o fim da foto, não
  // da caixa do papel: a caixa medida com o papel meio torto cortava o rodapé.
  // Medido na OS real.
  function faixa(readings, k = 0) {
    const vezes = readings.filter(r => /VALOR\s*FECHADO/i.test(r.text || '')).length;
    if (vezes >= 2 || k > 2 || !readings.some(r => /TOTAL\s*(?:DE\s*)?SERVI|VALOR\s*TOTAL/i.test(r.text || ''))) return null;
    const r = readings.find(x => x.frame && x.words);
    if (!r) return null;
    const f = r.frame;
    if (k === 0) {
      const ws = r.words.filter(w => w.bbox && /^(?:PRAZO|FORMA|PAGAMENTO)/i.test(w.text || ''));
      const y = ws.length ? Math.min(...ws.map(w => w.bbox.y0)) : null;
      const y0 = y !== null ? Math.max(0, f.cy + y / f.scale - 0.02 * f.ch) : f.cy + 0.7 * f.ch, ch = f.height - y0;
      if (ch < 0.08 * f.ch) return faixa(readings, 1);
      return { rot: r.rot, region: { cx: f.cx, cy: y0, cw: f.cw, ch }, largura: 4000 };
    }
    const cy = f.cy + 0.72 * f.ch;
    return { rot: 0, region: { cx: f.cx, cy, cw: f.cw, ch: f.height - cy }, largura: k === 1 ? 2400 : 4000 };
  }

  L.registrarLeitor({
    id: 'os-oficina',
    vitais: ['Valor'],
    soCodigo: true,   // o valor só pelo rodapé ou pelo comprovante (exato), nunca por um número solto do texto
    palavras: /VALOR TOTAL|VALOR FECHADO/,
    ignorar: /^.{0,6}?A\s?[0-9ILZSOBTGDQ]{1,2}(?:\s?[.,]\s?\d)?(?:\s*[-–—+.:]|\s)|\bUN\b|TOTAL\s*(?:DE\s*)?SERVI|TOTAL\s*(?:DE\s*)?PE[CÇ]A|LIMITE|SALDO/,
    reconhece, exato, faixa, analisar
  });
})(window.Leitura);
