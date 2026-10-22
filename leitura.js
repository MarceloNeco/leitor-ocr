/* =====================================================================
   leitura.js — Motor de leitura SolverONE · porta de entrada (global Leitura)

   Lê fotos e arquivos no próprio aparelho e devolve os campos de cada
   documento. Este arquivo é pequeno: o catálogo (leitura/catalogo.js) diz o
   que o motor sabe fazer, e cada capacidade pesada (ler foto, códigos, PDF,
   planilha...) mora num arquivo próprio que só carrega quando um documento
   precisa dela.

   A tela do app só fala com estas funções:
     const { fontes, recusados } = await Leitura.abrir(arquivos, aviso, pedirSenha);  // fotos, PDF (com senha também), TXT, CSV, OFX, XLSX, DOCX
     const caixas = await Leitura.acharPapeis(fonte.img);           // vários papéis na mesma foto
     const papeis = await Leitura.ler(fontes, { tipo: 'auto' });    // um papel por documento, com .result
     Leitura.relacionar(papeis);                                    // mesma compra, pagamento dividido
   Como usar em outro app: ARQUITETURA.md.
   ===================================================================== */
(function () {
  'use strict';
  const L = window.Leitura = window.Leitura || {};
  L.versao = '1.5.0';
  // O app que está usando o motor (ex.: 'hypernutry'), para L.ondeLer; o Leitor OCR aceita tudo
  L.app = L.app || null;

  // Os outros arquivos do motor são procurados a partir da pasta deste arquivo,
  // para o motor funcionar copiado para qualquer app
  L.base = new URL('.', document.currentScript.src).href;
  L.url = caminho => new URL(caminho, L.base).href;

  // Carrega um arquivo do motor uma vez só
  const pedidos = {};
  L.carregarScript = caminho => pedidos[caminho] || (pedidos[caminho] = new Promise((ok, erro) => {
    const s = document.createElement('script');
    s.src = L.url(caminho);
    s.onload = ok;
    s.onerror = () => { delete pedidos[caminho]; erro(new Error('Não carregou ' + caminho)); };
    document.head.appendChild(s);
  }));

  // Liga uma capacidade do catálogo (ex.: 'foto', 'pdf'): carrega os arquivos dela
  L.precisa = async id => {
    const c = id && L.catalogo.capacidades[id];
    for (const m of (c && c.modulos) || []) await L.carregarScript(m);
  };

  // Leitores: um por tipo de documento (pasta leitores/); cada um se registra ao carregar
  L.leitores = {};
  L.registrarLeitor = def => { L.leitores[def.id] = def; };

  // Tudo sobre um tipo: nome e família vêm do catálogo; o jeito de ler vem do
  // leitor dele. Tipo ainda sem leitor é lido como texto livre e guarda o nome.
  L.tipo = id => {
    const t = L.catalogo.tipo(id) || L.catalogo.tipo('livre');
    const leitor = L.leitores[t.leitor];
    return Object.assign({ vitais: [] }, leitor || {}, {
      id: t.id, nome: t.pt, familia: t.familia, leitor: leitor ? t.leitor : null, privacidade: t.privacidade || 'comum'
    });
  };

  // Leitores que reconhecem o próprio tipo pelo texto, na ordem do catálogo
  L.detectaveis = () => L.catalogo.leitores.filter(id => L.leitores[id] && L.leitores[id].sinais);

  /* ---------- Abrir arquivos ---------- */

  // id do formato → async (arquivo) => [partes]; os de fora da imagem vêm de formatos/*.js
  L.formatos = {};
  const extensao = nome => ((nome || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
  L.formatoDe = arquivo => {
    const ext = extensao(arquivo.name), mime = arquivo.type || '';
    return L.catalogo.formatos.find(f => f.ext.includes(ext)) || L.catalogo.formatos.find(f => f.mime && f.mime.test(mime));
  };

  // Texto de um arquivo: UTF-8; com caracteres quebrados, é Windows-1252 (o jeito
  // antigo de muitos bancos e sistemas brasileiros)
  L.textoDoArquivo = async arquivo => {
    const bytes = await arquivo.arrayBuffer();
    const utf8 = new TextDecoder('utf-8').decode(bytes);
    return utf8.includes('�') ? new TextDecoder('windows-1252').decode(bytes) : utf8;
  };

  L.formatos.imagem = arquivo => new Promise((ok, erro) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => ok([{ img }]);
      img.onerror = () => erro(new Error('imagem inválida'));
      img.src = e.target.result;
    };
    reader.onerror = () => erro(reader.error);
    reader.readAsDataURL(arquivo);
  });

  // Abre os arquivos escolhidos. Cada foto, página de PDF, aba de planilha ou
  // texto vira uma "fonte": { nome, img } para ler como foto, { nome, texto } para
  // texto pronto, { nome, linhas } para tabela e { nome, itens } para lançamentos.
  // Arquivo que o motor não abre vai para "recusados", com o motivo, sem
  // atrapalhar os outros. pedirSenha(nome, errou), se o app der, é chamada
  // quando um PDF tem senha e devolve a senha digitada (ou nada para pular).
  L.abrir = async (arquivos, aviso = () => {}, pedirSenha = null) => {
    const lista = Array.from(arquivos || []).filter(Boolean);
    const fontes = [], recusados = [];
    for (let i = 0; i < lista.length; i++) {
      const arquivo = lista[i], formato = L.formatoDe(arquivo);
      if (!formato || formato.recusa) {
        recusados.push({ nome: arquivo.name, motivo: formato ? formato.recusa : 'o leitor ainda não abre esse tipo de arquivo' });
        continue;
      }
      try {
        aviso(`Abrindo ${arquivo.name || 'o arquivo'}...`);
        await L.precisa(formato.capacidade);
        const partes = await L.formatos[formato.id](arquivo, { pedirSenha });
        partes.forEach(p => {
          p.arquivo = arquivo.name;
          p.formato = formato.id;
          // Nome da aba: "Foto 2", "Página 3", "Arquivo 2, página 1"
          if (lista.length > 1) p.nome = p.parte ? `Arquivo ${i + 1}, ${p.parte.charAt(0).toLowerCase()}${p.parte.slice(1)}` : `${formato.id === 'imagem' ? 'Foto' : 'Arquivo'} ${i + 1}`;
          else p.nome = p.parte && partes.length > 1 ? p.parte : '';
          fontes.push(p);
        });
        if (partes.aviso) recusados.push({ nome: arquivo.name, motivo: partes.aviso, parcial: true });
      } catch (err) {
        console.warn('Não abriu', arquivo.name, err);
        recusados.push({ nome: arquivo.name, motivo: err.motivo || 'não consegui abrir o arquivo' });
      }
    }
    return { fontes, recusados };
  };

  /* ---------- Ler ---------- */

  // Vários papéis na mesma foto: as caixas de cada um (leitura/foto.js)
  L.acharPapeis = async img => { await L.precisa('foto'); return L.foto.findPapers(img); };

  // QR code e código de barras de uma foto; sem o leitor de códigos, nada
  L.lerCodigos = async img => {
    try { await L.precisa('codigos'); } catch (err) { console.warn(err); return []; }
    return L.codigos.readCodes(img);
  };

  // Lê as fontes e devolve um papel por documento (cada papel recortado de uma
  // foto conta como um), já com o resultado em papel.result.
  // opcoes: tipo ('auto' ou um tipo do catálogo), rotacao (graus), aviso(texto),
  // progresso(0 a 100)
  L.ler = async (fontes, opcoes = {}) => {
    const o = Object.assign({ tipo: 'auto', rotacao: 0, aviso: () => {}, progresso: () => {} }, opcoes);
    if (L.carregarEstabelecimentos) await L.carregarEstabelecimentos();   // as redes conhecidas, para o nome da loja
    const fotos = fontes.filter(f => f.img);
    let lidas = [];
    if (fotos.length) {
      await L.precisa('foto');
      lidas = await L.lerFotos(fotos, o);
    }
    const papeis = [];
    fontes.forEach(f => {
      if (f.img) papeis.push(...lidas.filter(p => p.fonte === f));
      else papeis.push(L.lerArquivo(f, o.tipo));
    });
    // Um PDF de fatura, extrato ou informe é um documento só: o tipo vem do
    // texto de todas as páginas juntas (a página das compras de uma fatura,
    // sozinha, parece um extrato; a de simulação, um comprovante com valor).
    // A página com um boleto (valor conferido pelo código) continua boleto.
    if (o.tipo === 'auto') [...new Set(papeis.filter(p => p.fonte.formato === 'pdf').map(p => p.fonte.arquivo))].forEach(nome => {
      const paginas = papeis.filter(p => p.fonte.formato === 'pdf' && p.fonte.arquivo === nome);
      const tipo = paginas.length > 1 && L.texto.detectDocType(paginas.flatMap(p => p.readings));
      if (!tipo || L.tipo(tipo).leitor !== 'extrato') return;
      paginas.forEach(p => { const t = L.tipo(p.tipo); if (!(t.exato && t.exato(p.readings, p.codes))) p.tipo = tipo; });
    });
    // As páginas com texto de um PDF de fatura ou extrato viram um papel só:
    // o total fica numa página e as compras em outras
    const juntos = [];
    papeis.forEach(p => {
      const a = juntos[juntos.length - 1];
      const junta = q => q && q.fonte.formato === 'pdf' && q.fonte.texto && L.tipo(q.tipo).leitor === 'extrato';
      if (junta(a) && junta(p) && a.fonte.arquivo === p.fonte.arquivo && a.tipo === p.tipo) {
        const inicio = a.fonte.texto.split('\n').length;
        const fonte = Object.assign({}, a.fonte, {
          texto: a.fonte.texto + '\n' + p.fonte.texto, nome: a.fonte.nome.replace(/,? ?[Pp]ágina \d+$/, ''),
          posicoes: (a.fonte.posicoes || []).concat(p.fonte.posicoes || []),
          paginas: (a.fonte.paginas || [{ n: a.fonte.pagina, inicio: 0 }]).concat([{ n: p.fonte.pagina, inicio }])
        });
        juntos[juntos.length - 1] = L.lerArquivo(fonte, a.tipo);
      } else juntos.push(p);
    });
    juntos.forEach(p => { p.result = L.resultado(p); });
    return juntos;
  };

  // Fonte que já traz o texto (PDF digital, TXT, DOCX) ou uma tabela (CSV,
  // planilha, OFX): não precisa de OCR, e o texto é exato
  L.lerArquivo = (fonte, tipoPedido) => {
    const papel = { fonte, label: fonte.nome || '', codes: [] };
    const extrato = L.leitores.extrato;
    const querLancamentos = tipoPedido === 'auto' || L.tipo(tipoPedido).leitor === 'extrato';
    const itens = querLancamentos && extrato ? (fonte.itens || (fonte.linhas && extrato.daTabela(fonte.linhas))) : null;
    if (itens && itens.length) {
      return Object.assign(papel, { tipo: tipoPedido === 'auto' ? (fonte.tipoSugerido || 'extrato') : tipoPedido, itens, info: fonte.info || {}, readings: [] });
    }
    const texto = fonte.texto || (fonte.linhas || []).map(l => l.join('  ')).join('\n');
    const lines = texto.split('\n').map(t => ({ text: t.trim(), conf: 100 })).filter(l => l.text);
    // posicoes (PDF): onde fica cada pedaço de cada linha, para as colunas; paginas: onde começa cada página
    const reading = { text: texto, conf: 100, words: [], lines, exato: true, posicoes: fonte.posicoes, paginas: fonte.paginas || (fonte.pagina ? [{ n: fonte.pagina, inicio: 0 }] : undefined) };
    return Object.assign(papel, { readings: [reading], tipo: tipoPedido === 'auto' ? L.texto.detectDocType([reading]) : tipoPedido });
  };

  /* ---------- Documento no app certo ---------- */

  // Os apps da SolverONE que cuidam deste tipo de documento: [{ id, nome, url }]
  L.appsDoTipo = id => {
    const t = L.catalogo.tipo(id);
    return ((t && t.apps) || []).map(a => ({ id: a, nome: L.catalogo.apps[a].nome, url: `https://solverone.com.br/${L.catalogo.apps[a].pasta}/` }));
  };

  // Este documento é para o app que está lendo (L.app)? Se for, ou se não dá
  // para saber, null; se não for, para onde mandar e o aviso pronto, ex.:
  // "Isto parece Fatura de cartão de crédito (Dinheiro e compras). Ela fica no MoneyTRIO."
  L.ondeLer = (tipo, app = L.app) => {
    if (!app || !tipo || tipo === 'auto' || tipo === 'livre') return null;
    const apps = L.appsDoTipo(tipo);
    if (!apps.length || apps.some(a => a.id === app)) return null;
    const t = L.tipo(tipo), familia = L.catalogo.familia(t.familia);
    return { tipo, apps, texto: `Isto parece ${t.nome} (${familia ? familia.pt : 'outros'}). Fica no ${apps.map(a => a.nome).join(' ou ')}.` };
  };

  // Espiada rápida: o tipo mais provável com uma leitura só (foto) ou pelo
  // texto (arquivo), antes da leitura completa. Serve para o app avisar logo,
  // sem gastar a leitura inteira, quando o documento é de outro app.
  L.espiar = async fonte => {
    if (!fonte.img) return L.lerArquivo(fonte, 'auto').tipo;
    await L.precisa('foto');
    return L.foto.espiar(fonte.img);
  };

  // O resultado de um papel: campos, valor e situação (leitura/texto.js e leitores/).
  // Lançamentos vêm do arquivo (OFX, CSV, planilha) ou do texto lido (extrato,
  // fatura e print, pelo leitor de lançamentos); mudam se o tipo mudar.
  L.resultado = papel => {
    if (!papel.readings.length) return L.leitores.extrato.resultado(papel);
    const base = L.texto.buildResult(papel.readings, papel.tipo, papel.codes, papel.tilt);
    const leitor = L.leitores[L.tipo(papel.tipo).leitor];
    const lidos = leitor && leitor.itens ? leitor.itens(papel.readings, papel.tipo) : null;
    return lidos ? L.leitores.extrato.resultado(Object.assign({}, papel, { itens: lidos.itens }), base, lidos) : base;
  };
})();
