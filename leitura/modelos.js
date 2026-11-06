/* =====================================================================
   leitura/modelos.js — leitura por MODELO (template), sem IA.
   Um modelo é só dados (dados/modelos.json; ver MODELOS.md): as palavras
   que denunciam o documento (sinais), a "impressão" do layout (rótulos
   fixos que devem estar lá), os campos por âncora (rótulo → valor na mesma
   linha, na linha de baixo ou na coluna), uma tabela de itens e as
   conferências (soma que fecha, dígito verificador, campo vital presente).
   O motor interpreta o modelo; documento novo = modelo novo, não código.
   Vale para texto exato (PDF com texto, TXT, DOCX). Quando os sinais batem
   mas um campo vital some ou a conta não fecha, o modelo "falhou": o app
   avisa que o documento mudou de formato (e conta a falha no aparelho).
   Modelos da pessoa (ensinados no aparelho) têm preferência sobre os do
   catálogo e ficam em localStorage. Nada de dado pessoal num modelo.
   ===================================================================== */
(function (L) {
  'use strict';
  const PESSOAIS = 'leitor_modelos_pessoais';   // modelos ensinados neste aparelho
  const FALHAS = 'leitor_modelos_falhas';       // { id: vezes } — quantas vezes cada modelo falhou aqui
  let catalogo = [], carregando = null;

  const sem = s => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ \t]+/g, ' ');
  const ler = (k, padrao) => { try { return JSON.parse(localStorage.getItem(k)) || padrao; } catch (e) { return padrao; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem espaço: segue */ } };

  // O catálogo é lido uma vez (o sw.js guarda o arquivo no aparelho; um dia ele vem do RootifyONE)
  L.carregarModelos = () => carregando || (carregando = fetch(L.url('dados/modelos.json'))
    .then(r => r.ok ? r.json() : { modelos: [] })
    .then(d => { catalogo = (d.modelos || []).filter(m => m && m.id); })
    .catch(() => { carregando = null; }));

  /* ---------- o que se pega de um trecho ---------- */
  const DINHEIRO = /(?:R\$\s?)?-?\d{1,3}(?:\.\d{3})*,\d{2}(?!\d)/g;
  const DATA = /\b\d{2}\/\d{2}\/\d{4}\b/g;
  const CNPJ = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g;
  const centavos = v => { const n = parseFloat(String(v).replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.')); return isFinite(n) ? Math.round(n * 100) / 100 : null; };
  // pega: dinheiro | data | cnpj | numero | texto | regex:<expressão com um grupo>
  function pegar(trecho, pega, indice) {
    const t = String(trecho || '');
    const ultimo = (lista, i) => lista.length ? lista[i === undefined || i < 0 ? lista.length + (i === undefined ? -1 : i) : Math.min(i, lista.length - 1)] : null;
    if (pega === 'dinheiro') { const v = ultimo(t.match(DINHEIRO) || [], indice); return v === null ? null : centavos(v); }
    if (pega === 'data') return ultimo(t.match(DATA) || [], indice);
    if (pega === 'cnpj') { const v = (t.match(CNPJ) || []).map(c => c.replace(/\D/g, '')).find(c => !L.cnpjValido || L.cnpjValido(c)); return v ? `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12)}` : null; }
    if (pega === 'numero') { const v = ultimo(t.match(/\d[\d.]*,?\d*/g) || [], indice); return v === null ? null : v; }
    if (pega && pega.startsWith('regex:')) { const m = t.match(new RegExp(pega.slice(6), 'i')); return m ? (m[1] !== undefined ? m[1] : m[0]).trim() : null; }
    const texto = t.replace(/^[\s:.-]+|[\s:.-]+$/g, '').trim();   // texto: o resto, sem os dois-pontos
    return texto || null;
  }

  /* ---------- campos por âncora ---------- */
  // linhas: [{ t: texto normalizado, o: texto original, p: posições da linha ou null }]
  function linhasDe(reading) {
    const orig = String(reading.text || '').split('\n');
    const pos = reading.posicoes && reading.posicoes.length === orig.length ? reading.posicoes : null;
    return orig.map((o, i) => ({ o, t: sem(o), p: pos ? pos[i] : null }));
  }
  const acharAncora = (linhas, campo) => {
    const re = new RegExp(campo.ancora, 'i');
    const todas = linhas.map((l, i) => re.test(l.t) ? i : -1).filter(i => i >= 0);
    if (!todas.length) return -1;
    const n = campo.n === undefined ? 1 : campo.n;
    return n < 0 ? todas[todas.length + n] || todas[0] : todas[Math.min(n, todas.length) - 1];
  };
  // O valor de um campo: na mesma linha (depois da âncora), na linha de baixo
  // (até `ate` linhas, a primeira que tem algo do tipo) ou na coluna da
  // âncora (pelas posições do PDF: o pedaço de uma linha de baixo que fica
  // embaixo do rótulo, como nos boletos)
  function valorDoCampo(linhas, campo) {
    const i = acharAncora(linhas, campo);
    if (i < 0) return { valor: null, onde: -1 };
    const onde = campo.onde || 'mesma-linha', ate = campo.ate || 3;
    if (onde === 'mesma-linha') {   // inteira: a linha toda (quando a âncora é o próprio começo do valor)
      const re = new RegExp('^.*?' + campo.ancora, 'i'), mt = linhas[i].t.match(re);
      // o rótulo é tirado do original; se ele só bate no texto normalizado (acento), o resto vem de lá
      const depois = campo.inteira ? linhas[i].o : re.test(linhas[i].o) ? linhas[i].o.replace(re, '') : mt ? linhas[i].t.slice(mt[0].length) : linhas[i].o;
      return { valor: pegar(depois, campo.pega, campo.indice), onde: i };
    }
    if (onde === 'coluna' && linhas[i].p) {
      const re = new RegExp(campo.ancora, 'i');
      const rot = linhas[i].p.find(x => re.test(sem(x.s)));
      if (rot) {
        for (let j = i + 1; j <= i + ate && j < linhas.length; j++) {
          const pedacos = (linhas[j].p || []).filter(x => x.x1 > rot.x0 - 0.01 && x.x0 < rot.x1 + 0.08);
          const v = pedacos.length ? pegar(pedacos.map(x => x.s).join(' '), campo.pega, campo.indice) : null;
          if (v !== null) return { valor: v, onde: j };
        }
      }
    }
    for (let j = i + 1; j <= i + ate && j < linhas.length; j++) {   // linha-abaixo (e a reserva da coluna sem posições)
      const v = pegar(linhas[j].o, campo.pega, campo.indice);
      if (v !== null) return { valor: v, onde: j };
    }
    return { valor: null, onde: i };
  }

  /* ---------- tabela de itens ---------- */
  // Entre inicio e fim, cada linha vira um item pelas colunas declaradas:
  // ['data', 'texto', 'dinheiro', 'dinheiro'] → a data no começo, os valores no
  // fim (da direita para a esquerda) e o texto no meio
  // Data sem ano ("30/09", como nas faturas de cartão): o ano vem do campo `anoDe`
  // (o vencimento); se a data ficar depois dele, é do ano anterior
  const comAno = (d, ref) => {
    if (!/^\d{2}\/\d{2}$/.test(d)) return d;
    const m = String(ref || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!m) return null;
    const [dd, mm] = d.split('/');
    const ano = +m[3] - (mm + dd > m[2] + m[1] ? 1 : 0);
    return `${dd}/${mm}/${ano}`;
  };
  function tabelaDe(linhas, tab, campos) {
    const ini = tab.inicio ? linhas.findIndex(l => new RegExp(tab.inicio, 'i').test(l.t)) : -1;
    const fimRe = tab.fim ? new RegExp(tab.fim, 'i') : null;
    const itens = [];
    for (let i = ini + 1; i < linhas.length; i++) {
      if (fimRe && fimRe.test(linhas[i].t)) break;
      let resto = linhas[i].o.trim();
      const item = {};
      const cols = tab.colunas, nomes = tab.nomes || cols;
      let ok = true;
      // da direita: os valores
      for (let k = cols.length - 1; k >= 0 && cols[k] !== 'texto'; k--) {
        const m = resto.match(cols[k] === 'dinheiro' ? /(?:R\$\s?)?-?\d{1,3}(?:\.\d{3})*,\d{2}\s*$/ : cols[k] === 'data' ? /\d{2}\/\d{2}(?:\/\d{4})?\s*$/ : /\S+\s*$/);
        if (!m) { ok = false; break; }
        item[nomes[k]] = cols[k] === 'dinheiro' ? centavos(m[0]) : m[0].trim();
        resto = resto.slice(0, m.index).trim();
      }
      if (!ok) continue;
      // da esquerda: até o texto
      for (let k = 0; k < cols.length && cols[k] !== 'texto'; k++) {
        if (item[nomes[k]] !== undefined) break;
        const m = resto.match(cols[k] === 'data' ? /^\d{2}\/\d{2}(?:\/\d{4})?(?!\d)/ : cols[k] === 'dinheiro' ? /^(?:R\$\s?)?-?\d{1,3}(?:\.\d{3})*,\d{2}/ : /^\S+/);
        if (!m) { ok = false; break; }
        item[nomes[k]] = cols[k] === 'dinheiro' ? centavos(m[0]) : m[0].trim();
        resto = resto.slice(m[0].length).trim();
      }
      if (!ok) continue;
      const kt = cols.indexOf('texto');
      if (kt >= 0) item[nomes[kt]] = resto;
      if (tab.anoDe) cols.forEach((c, k) => { if (c === 'data') item[nomes[k]] = comAno(item[nomes[k]], campos && campos[tab.anoDe]); });
      itens.push(item);
    }
    return itens;
  }
  // Classes dos itens: { "consorcio": "<regex>", "anuidade": "<regex>", ... } na ordem;
  // a primeira que bate na descrição dá a classe; sem nenhuma, "outros". A
  // divisão (total e quantos por classe) é o que o app usa para repartir um débito
  function classificar(itens, classes) {
    const divisao = {};
    itens.forEach(it => {
      const d = sem(it.descricao || it.texto || '');
      const [classe] = Object.entries(classes).find(([, re]) => new RegExp(re, 'i').test(d)) || ['outros'];
      it.classe = classe;
      const v = typeof it.valor === 'number' ? it.valor : 0;
      divisao[classe] = divisao[classe] || { total: 0, quantos: 0 };
      divisao[classe].total = Math.round((divisao[classe].total + v) * 100) / 100;
      divisao[classe].quantos++;
    });
    return divisao;
  }

  /* ---------- conferências ---------- */
  // soma: { tipo: 'soma', de: ['Valor bruto', '-Desconto'], igual: 'Valor' }; igual: { tipo: 'igual', a: 'X', b: 'Y' };
  // presente: { tipo: 'presente', campos: [...] }; cnpj: { tipo: 'cnpj', campo: 'CNPJ' }; itens: { tipo: 'soma-itens', coluna: 'valor', igual: 'Total' }
  function conferir(regra, campos, itens) {
    const num = k => { const v = campos[k]; return typeof v === 'number' ? v : v === null || v === undefined ? null : centavos(String(v)); };
    switch (regra.tipo) {
      case 'soma': {
        let s = 0;
        for (const termo of regra.de) { const neg = termo.startsWith('-'); const v = num(neg ? termo.slice(1) : termo); if (v === null) return regra.opcional ? true : false; s += neg ? -v : v; }
        const alvo = num(regra.igual);
        return alvo !== null && Math.abs(s - alvo) < 0.011;
      }
      case 'igual': { const a = campos[regra.a], b = campos[regra.b]; return a !== null && a !== undefined && String(a) === String(b); }
      case 'presente': return regra.campos.every(k => campos[k] !== null && campos[k] !== undefined && campos[k] !== '');
      case 'cnpj': return !!(campos[regra.campo] && L.cnpjValido && L.cnpjValido(campos[regra.campo]));
      case 'ultimo-item': { const it = (itens || [])[(itens || []).length - 1], alvo = num(regra.igual); if (!it || alvo === null) return !!regra.opcional; return typeof it[regra.coluna] === 'number' && Math.abs(it[regra.coluna] - alvo) < 0.011; }
      case 'soma-itens': {   // somente: 'positivos' | 'negativos'; mais: campos somados junto ('-X' subtrai)
        const alvo = num(regra.igual); if (alvo === null) return !!regra.opcional;
        const vale = v => typeof v === 'number' && (regra.somente !== 'positivos' || v > 0) && (regra.somente !== 'negativos' || v < 0);
        let s = (itens || []).reduce((t, it) => t + (vale(it[regra.coluna]) ? it[regra.coluna] : 0), 0);
        for (const termo of regra.mais || []) { const neg = termo.startsWith('-'); const v = num(neg ? termo.slice(1) : termo); if (v === null) return !!regra.opcional; s += neg ? -v : v; }
        return Math.abs(s - alvo) < 0.011; }
      default: return true;
    }
  }

  /* ---------- reconhecer e aplicar ---------- */
  const ativos = () => ler(PESSOAIS, []).concat(catalogo).filter(m => !m.aposentado && (!m.validoAte || m.validoAte >= new Date().toISOString().slice(0, 10)));
  // A "impressão": que fração dos rótulos fixos do modelo está no texto (0 a 1)
  const impressaoDe = (m, t) => { const r = m.impressao || []; return r.length ? r.filter(x => new RegExp(x, 'i').test(t)).length / r.length : 1; };
  // O modelo que reconhece o texto: todos os sinais batem, nenhum "exclui" bate;
  // empate pela impressão do layout e depois pela quantidade de sinais
  function reconhecer(texto, tipoPedido) {
    const t = sem(texto);
    const candidatos = ativos().filter(m => (m.sinais || []).length && m.sinais.every(s => new RegExp(s, 'i').test(t)) && !(m.exclui || []).some(s => new RegExp(s, 'i').test(t)))
      .filter(m => !tipoPedido || tipoPedido === 'auto' || !m.tipo || m.tipo === tipoPedido)
      .map(m => ({ m, impressao: impressaoDe(m, t) }))
      .sort((a, b) => b.impressao - a.impressao || (b.m.sinais.length - a.m.sinais.length) || (ler(PESSOAIS, []).includes(a.m) ? -1 : 1));
    return candidatos[0] || null;
  }

  // Aplica o modelo a uma leitura exata: { fields, campos, itens, conferido, falhas, impressao, modelo }
  function aplicar(m, reading, impressao) {
    const linhas = linhasDe(reading);
    const campos = {}, fields = [];
    for (const [nome, campo] of Object.entries(m.campos || {})) {
      const { valor } = valorDoCampo(linhas, campo);
      campos[nome] = valor;
      if (valor !== null) fields.push({ key: nome, val: campo.pega === 'dinheiro' ? L.texto.formatBRL(valor) : String(valor) });
    }
    const itens = m.tabela ? tabelaDe(linhas, m.tabela, campos) : null;
    const divisao = itens && itens.length && m.classes ? classificar(itens, m.classes) : null;
    const falhas = [];
    (m.vitais || []).forEach(k => { if (campos[k] === null || campos[k] === undefined) falhas.push(`o campo "${k}" não foi achado`); });
    (m.conferencias || []).forEach(c => { if (!conferir(c, campos, itens)) falhas.push(c.nome || (c.tipo === 'soma' ? `a soma de ${c.de.join(' ')} não fecha com ${c.igual}` : c.tipo === 'soma-itens' ? `os itens não somam ${c.igual}` : `a conferência "${c.tipo}" falhou`)); });
    if (m.tabela && m.tabela.minimo && (!itens || itens.length < m.tabela.minimo)) falhas.push('a tabela de itens não foi achada');
    return { modelo: { id: m.id, versao: m.versao || 1, nome: (m.nome && m.nome.pt) || m.id, tipo: m.tipo || null }, fields, campos, itens: itens && itens.length ? itens : null, divisao, conferido: !falhas.length, falhas, impressao };
  }

  // O que a tela mostra e o que vai para o papel
  function aplicarEm(reading, tipoPedido) {
    const r = reconhecer(reading.text, tipoPedido);
    if (!r) return null;
    const aplicado = aplicar(r.m, reading, r.impressao);
    // layout muito diferente do esperado: o documento mudou (sinais iguais, rótulos sumiram)
    if (r.impressao < (r.m.impressaoMinima || 0.6)) aplicado.falhas.unshift('o layout mudou: ' + Math.round(r.impressao * 100) + '% dos rótulos esperados');
    aplicado.conferido = !aplicado.falhas.length;
    if (!aplicado.conferido) { const f = ler(FALHAS, {}); f[r.m.id] = (f[r.m.id] || 0) + 1; gravar(FALHAS, f); }
    return aplicado;
  }

  // Esqueleto de um texto: o layout fica, os dados somem. Dígitos viram 0
  // (valores, datas, CPF, CNPJ, códigos), e-mails viram X, e o que vem depois
  // de um rótulo de pessoa (nome, aluno, cliente, titular, sacado, pagador...)
  // vira X. Os rótulos do documento ficam, porque são eles que fazem o modelo.
  const ROTULO_PESSOA = /^(.*?\b(?:NOME(?: COMPLETO)?|ALUNO|CLIENTE|TITULAR|SACADO|PAGADOR|PORTADOR|SEGURADO|CONDUTOR|RESPONS[AÁ]VEL|BENEFICI[AÁ]RIO|FAVORECIDO|RECEBEDOR|EMPREGADOR|CONTRATANTE|CONTRATADO|CPF|RG)\s*:?\s*)(.+)$/i;
  // depois do nome, o próximo rótulo do documento ("Matrícula", "CPF:", "Data") fica como está
  const OUTRO_ROTULO = /^(?:MATR[IÍ]CULA|CPF|RG|CNPJ|DATA|VALOR|VENCIMENTO|NASCIMENTO|E-?MAIL|TEL|FONE|CELULAR|ENDERE[CÇ]O|RUA|AV|CEP|CIDADE|UF|CURSO|S[EÉ]RIE|TURMA|CONTA|AG[EÊ]NCIA|CART[AÃ]O|BANCO|PLANO|APOLICE|AP[OÓ]LICE)\b|.+:$/i;
  function esqueleto(texto) {
    return String(texto || '').split('\n').map(l => {
      let s = l.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, 'XXX@XXX.XXX');
      const m = s.match(ROTULO_PESSOA);
      if (m && !/^\s*[\d.\/-]+\s*$/.test(m[2])) {
        const partes = m[2].split(/(\s+)/);
        let parou = false;
        s = m[1] + partes.map(p => { if (parou || !p.trim()) return p; if (OUTRO_ROTULO.test(p)) { parou = true; return p; } return p.replace(/[A-Za-zÀ-ÿ]/g, 'X'); }).join('');
      }
      return s.replace(/\d/g, '0');
    }).join('\n');
  }

  L.modelos = {
    lista: () => ativos().map(m => ({ id: m.id, versao: m.versao || 1, nome: (m.nome && m.nome.pt) || m.id, tipo: m.tipo || null, pessoal: ler(PESSOAIS, []).some(p => p.id === m.id) })),
    reconhecer: (texto, tipo) => { const r = reconhecer(texto, tipo); return r ? { id: r.m.id, impressao: r.impressao } : null; },
    aplicarEm,
    // Modelos ensinados neste aparelho: têm preferência; o mesmo id substitui
    adicionar: m => { if (!m || !m.id) return; const v = ler(PESSOAIS, []).filter(p => p.id !== m.id); v.unshift(m); gravar(PESSOAIS, v); },
    remover: id => gravar(PESSOAIS, ler(PESSOAIS, []).filter(p => p.id !== id)),
    falhas: () => ler(FALHAS, {}),
    esqueleto
  };
  L.esqueleto = esqueleto;
})(window.Leitura);
