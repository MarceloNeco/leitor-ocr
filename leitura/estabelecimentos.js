/* =====================================================================
   leitura/estabelecimentos.js — quem é a loja.
   A raiz do CNPJ (os 8 primeiros números, iguais em todas as lojas da mesma
   empresa) diz a rede: nome fantasia e categoria, pela base
   dados/estabelecimentos.json (dado público; um dia ela vem do RootifyONE,
   "Conteúdo dos apps", e os outros apps a leem por este mesmo caminho).
   Loja fora da base: com internet, o app consulta o CNPJ nos dados abertos
   da Receita Federal (minhareceita.org; se falhar, brasilapi.com.br) e pega
   a razão social exata, o nome fantasia e a atividade (CNAE), que vira a
   categoria pela tabela abaixo. Só o CNPJ da loja sai do aparelho; a
   resposta fica guardada (localStorage) e vale sem internet da próxima vez.
   A pessoa desliga a consulta em Ajustes. Sem internet, nada muda.
   Sem CNPJ, a descrição de um lançamento ("IFD*LOJA", "UBER *TRIP") acha a
   rede pelos nomes dela. Rede desconhecida fica sem categoria: nada é
   chutado. O nome que a pessoa corrige para um CNPJ fica guardado só neste
   aparelho (localStorage) e vale da próxima vez.
   ===================================================================== */
(function (L) {
  'use strict';
  const NOMES = 'leitor_nomes_estabelecimentos';
  const CONSULTAS = 'leitor_cnpj_consultados';   // o que a Receita respondeu, por CNPJ
  const LIGADA = 'leitor_consulta_cnpj';          // 'nao' = a pessoa desligou a consulta
  let base = [], carregando = null;

  // A base é lida uma vez, na primeira leitura (o sw.js guarda o arquivo no aparelho)
  L.carregarEstabelecimentos = () => carregando || (carregando = fetch(L.url('dados/estabelecimentos.json'))
    .then(r => r.ok ? r.json() : { estabelecimentos: [] })
    .then(d => {
      base = (d.estabelecimentos || []).map(e => Object.assign({}, e, {
        nomesRe: (e.nomes || []).map(n => new RegExp(n)),
        marcasRe: (e.marcas || []).map(m => ({ fantasia: m.fantasia, re: new RegExp(m.texto) }))
      }));
    })
    .catch(() => { carregando = null; }));

  const sem = s => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // CNPJ com os dois dígitos verificadores certos ("47.508.411/0001-56" →
  // "47508411000156"), ou '' (número lido errado não vale)
  function cnpjValido(texto) {
    const d = String(texto || '').replace(/\D/g, '');
    if (d.length !== 14 || /^(\d)\1+$/.test(d)) return '';
    const dv = n => {
      let s = 0, p = n - 7;
      for (let i = 0; i < n; i++) { s += +d[i] * p--; if (p < 2) p = 9; }
      return s % 11 < 2 ? 0 : 11 - s % 11;
    };
    return dv(12) === +d[12] && dv(13) === +d[13] ? d : '';
  }
  const formata = d => `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;

  // A rede pelos nomes dela numa descrição, ou null
  const daDescricao = texto => { const t = sem(texto); return t ? base.find(b => b.nomesRe.some(re => re.test(t))) || null : null; };

  const lerJson = chave => { try { return JSON.parse(localStorage.getItem(chave)) || {}; } catch (e) { return {}; } };
  const guardarJson = (chave, v) => { try { localStorage.setItem(chave, JSON.stringify(v)); } catch (e) { /* sem espaço: segue sem guardar */ } };
  const corrigidos = () => lerJson(NOMES);
  const consultados = () => lerJson(CONSULTAS);

  /* ---------- Consulta do CNPJ nos dados abertos da Receita ---------- */

  // A atividade principal (CNAE) diz a categoria da loja. Só os primeiros
  // números do código (grupo da atividade); atividade fora da lista fica sem
  // categoria, com a descrição oficial no lugar: nada é chutado.
  const CATEGORIAS = [
    [/^47(11|12|22|23|24|29)/, 'Mercado'],          // super e minimercados, açougue, bebidas, hortifruti, outros alimentos
    [/^4721/, 'Padaria'],
    [/^473/, 'Combustível'],
    [/^4784/, 'Gás'],
    [/^47(71|73)/, 'Farmácia'],                     // farmácias e artigos médicos
    [/^4772/, 'Perfumaria'],
    [/^474/, 'Material de construção'],
    [/^47(81|82|83)/, 'Roupas e calçados'],
    [/^4789004|^7500/, 'Pet'],                       // pet shop e veterinário
    [/^47/, 'Loja'],                                 // o resto do comércio varejista
    [/^56(11|12|20)/, 'Restaurante e lanchonete'],   // restaurantes, bares, lanchonetes, ambulantes, marmitas
    [/^55/, 'Hospedagem'],
    [/^5223/, 'Estacionamento'],
    [/^5221/, 'Pedágio'],
    [/^49(12|21|22|23|24|29|50)|^51(11|12)/, 'Transporte'],   // ônibus, metrô, táxi, fretamento, avião
    [/^45/, 'Carro e moto'],                         // concessionária, oficina, peças
    [/^86|^87/, 'Saúde'],                            // hospitais, clínicas, laboratórios, asilos
    [/^85/, 'Educação'],
    [/^9601/, 'Lavanderia'],
    [/^9602/, 'Beleza'],
    [/^9313/, 'Academia'],
    [/^351/, 'Energia'],
    [/^3520/, 'Gás'],
    [/^36/, 'Água'],
    [/^61/, 'Telefone e internet']
  ];
  const categoriaDoCnae = cnae => (CATEGORIAS.find(([re]) => re.test(String(cnae || ''))) || [])[1] || '';

  const SERVICOS = [c => 'https://minhareceita.org/' + c, c => 'https://brasilapi.com.br/api/cnpj/v1/' + c];
  const ESPERA = 8000;   // ms: a consulta não pode segurar a leitura

  L.consultaCnpjLigada = () => { try { return localStorage.getItem(LIGADA) !== 'nao'; } catch (e) { return true; } };
  L.ligarConsultaCnpj = sim => { try { localStorage.setItem(LIGADA, sim ? 'sim' : 'nao'); } catch (e) { /* segue */ } };

  // Pergunta à Receita quem é o CNPJ, se ainda não se sabe (rede da base,
  // consulta já guardada, consulta desligada, sem internet). Devolve a
  // resposta nova, ou null quando não há nada novo; falha de rede não é
  // guardada (da próxima vez tenta de novo). Só o CNPJ sai do aparelho.
  L.consultarCnpj = async cnpj => {
    const c = cnpjValido(cnpj);
    if (!c || !L.consultaCnpjLigada() || base.some(b => b.cnpjRaiz === c.slice(0, 8)) || consultados()[c] || navigator.onLine === false) return null;
    for (const servico of SERVICOS) {
      const aborta = typeof AbortController === 'function' ? new AbortController() : null;
      const tempo = aborta && setTimeout(() => aborta.abort(), ESPERA);
      try {
        const r = await fetch(servico(c), { mode: 'cors', credentials: 'omit', signal: aborta ? aborta.signal : undefined });
        if (r.status === 404) {
          const nada = { semDados: true, quando: new Date().toISOString() };
          guardarJson(CONSULTAS, Object.assign(consultados(), { [c]: nada }));
          return null;
        }
        if (!r.ok) continue;
        const d = await r.json();
        if (!d || !d.razao_social) continue;
        // a razão social de um MEI é o nome da pessoa seguido do CPF (mascarado,
        // "***12345***", nos dados abertos): o número nunca aparece no app
        const dados = { razao: String(d.razao_social).replace(/\s*(\*+\d+\*+|\b\d{11}\b)\s*/g, ' ').trim(), fantasia: String(d.nome_fantasia || '').trim(), cnae: String(d.cnae_fiscal || ''),
          atividade: String(d.cnae_fiscal_descricao || '').trim(), quando: new Date().toISOString() };
        guardarJson(CONSULTAS, Object.assign(consultados(), { [c]: dados }));
        return dados;
      } catch (e) {
        // sem resposta (bloqueio, tempo esgotado, serviço fora): o próximo serviço
      } finally { if (tempo) clearTimeout(tempo); }
    }
    return null;
  };

  // A loja de um papel: { razao, fantasia?, categoria?, atividade?, cnpj?, cnpjRaiz?, filial? }.
  // Rede conhecida: a razão social é a da base (exata), não a lida na foto;
  // a marca sai do cabeçalho do cupom quando a empresa tem mais de uma.
  // Loja consultada na Receita: razão social exata, nome fantasia quando a
  // empresa registrou um, e a categoria pela atividade.
  L.estabelecimento = ({ razao = '', cnpj = '', cabecalho = '' } = {}) => {
    const c = cnpjValido(cnpj);
    const e = { razao };
    if (c) Object.assign(e, { cnpj: formata(c), cnpjRaiz: c.slice(0, 8), filial: c.slice(8, 12) });
    const rede = c ? base.find(b => b.cnpjRaiz === c.slice(0, 8)) : daDescricao(razao);
    const receita = c && !rede ? consultados()[c] : null;
    if (rede) {
      const marca = rede.marcasRe.find(m => m.re.test(sem(cabecalho)));
      Object.assign(e, { razao: c ? rede.razao : razao, fantasia: marca ? marca.fantasia : rede.fantasia, categoria: rede.categoria });
    } else if (receita && receita.razao) {
      e.razao = receita.razao;
      if (receita.fantasia) e.fantasia = receita.fantasia;
      const categoria = categoriaDoCnae(receita.cnae);
      if (categoria) e.categoria = categoria; else if (receita.atividade) e.atividade = receita.atividade;
    }
    const meu = c && corrigidos()[c];
    if (meu) e.fantasia = meu;
    return e;
  };

  // A categoria de um lançamento pela descrição ("IFD*LOJA" → Delivery), ou ''
  L.categoriaDe = descricao => (daDescricao(descricao) || {}).categoria || '';

  // A pessoa corrigiu o nome da loja deste CNPJ: vale da próxima vez, neste aparelho
  L.lembrarNomeEstabelecimento = (cnpj, nome) => {
    const c = cnpjValido(cnpj);
    if (!c) return;
    const v = corrigidos();
    if (nome) v[c] = nome; else delete v[c];
    guardarJson(NOMES, v);
  };

  L.cnpjValido = cnpjValido;
  L.categoriaDoCnae = categoriaDoCnae;
})(window.Leitura);
