/* =====================================================================
   leitura/estabelecimentos.js — quem é a loja.
   A raiz do CNPJ (os 8 primeiros números, iguais em todas as lojas da mesma
   empresa) diz a rede: nome fantasia e categoria, pela base
   dados/estabelecimentos.json (dado público; um dia ela vem do RootifyONE,
   "Conteúdo dos apps", e os outros apps a leem por este mesmo caminho).
   Sem CNPJ, a descrição de um lançamento ("IFD*LOJA", "UBER *TRIP") acha a
   rede pelos nomes dela. Rede desconhecida fica sem categoria: nada é
   chutado. O nome que a pessoa corrige para um CNPJ fica guardado só neste
   aparelho (localStorage) e vale da próxima vez.
   ===================================================================== */
(function (L) {
  'use strict';
  const NOMES = 'leitor_nomes_estabelecimentos';
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

  const corrigidos = () => { try { return JSON.parse(localStorage.getItem(NOMES)) || {}; } catch (e) { return {}; } };

  // A loja de um papel: { razao, fantasia?, categoria?, cnpj?, cnpjRaiz?, filial? }.
  // Rede conhecida: a razão social é a da base (exata), não a lida na foto;
  // a marca sai do cabeçalho do cupom quando a empresa tem mais de uma.
  L.estabelecimento = ({ razao = '', cnpj = '', cabecalho = '' } = {}) => {
    const c = cnpjValido(cnpj);
    const e = { razao };
    if (c) Object.assign(e, { cnpj: formata(c), cnpjRaiz: c.slice(0, 8), filial: c.slice(8, 12) });
    const rede = c ? base.find(b => b.cnpjRaiz === c.slice(0, 8)) : daDescricao(razao);
    if (rede) {
      const marca = rede.marcasRe.find(m => m.re.test(sem(cabecalho)));
      Object.assign(e, { razao: c ? rede.razao : razao, fantasia: marca ? marca.fantasia : rede.fantasia, categoria: rede.categoria });
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
    try { localStorage.setItem(NOMES, JSON.stringify(v)); } catch (e) { /* sem espaço: segue sem guardar */ }
  };

  L.cnpjValido = cnpjValido;
})(window.Leitura);
