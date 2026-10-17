/* =====================================================================
   leitura/catalogo.js — o que o motor de leitura sabe (e vai saber) ler

   - capacidades: o que o motor sabe fazer, cada uma em arquivos próprios que só
     carregam quando usados; "pesados" são os arquivos grandes, que só baixam (e
     ficam guardados no aparelho) na primeira vez em que são usados. Uma lista
     dentro da lista são alternativas: o aparelho usa uma delas.
   - formatos: que capacidade abre cada tipo de arquivo.
   - familias: todos os tipos de documento, em grupos. Cada tipo diz qual leitor
     o lê (pasta leitores/); tipo sem leitor ainda é lido como texto livre, mas
     já guarda o tipo escolhido. "precisa" lista as capacidades que o leitor
     dele vai usar; "privacidade" diz o cuidado que o dado pede (financeiro,
     saude, pessoal, biometrico): dado de saúde, documento pessoal e rosto
     nunca saem do aparelho sem a pessoa escolher.
   - apps: o app da SolverONE que cuida de cada família (ou tipo), para o app que
     está lendo avisar quando o documento é de outro (ex.: extrato no HyperNutry
     → MoneyTRIO). O Leitor OCR aceita todos.
   - leitores: os leitores prontos, na ordem em que o tipo é procurado no texto.
   - SINAIS: as palavras que denunciam cada tipo sem leitor próprio, para a
     detecção automática da categoria e do tipo.

   Para ensinar um tipo novo: criar leitores/<id>.js (ver ARQUITETURA.md),
   pôr "leitor: '<id>'" no tipo aqui e o id em "leitores".
   ===================================================================== */
(function (L) {
  'use strict';

  const capacidades = {
    foto: { pt: 'Ler texto em foto (OCR)', en: 'Read text in photos (OCR)', modulos: ['leitura/foto.js'],
      pesados: ['tesseract/tesseract.min.js', 'tesseract/worker.min.js', ['tesseract/tesseract-core-simd-lstm.wasm.js', 'tesseract/tesseract-core-lstm.wasm.js'], 'tesseract/por.traineddata.gz'], mb: 9.4 },
    codigos: { pt: 'QR code e código de barras', en: 'QR codes and barcodes', modulos: ['leitura/codigos.js'],
      pesados: ['libs/zxing.min.js', 'libs/jsQR.js'], mb: 0.6 },
    pdf: { pt: 'Abrir PDF', en: 'Open PDF', modulos: ['formatos/pdf.js'],
      pesados: ['libs/pdfjs/pdf.min.mjs', 'libs/pdfjs/pdf.worker.min.mjs'], mb: 1.8 },
    texto: { pt: 'Abrir texto (TXT)', en: 'Open text (TXT)', modulos: ['formatos/texto.js'] },
    csv: { pt: 'Abrir CSV', en: 'Open CSV', modulos: ['formatos/csv.js'] },
    ofx: { pt: 'Abrir extrato OFX', en: 'Open OFX statement', modulos: ['formatos/ofx.js'] },
    planilha: { pt: 'Abrir planilha Excel (XLSX)', en: 'Open Excel sheet (XLSX)', modulos: ['formatos/zip.js', 'formatos/xlsx.js'] },
    word: { pt: 'Abrir documento Word (DOCX)', en: 'Open Word document (DOCX)', modulos: ['formatos/zip.js', 'formatos/docx.js'] },
    // Ainda não existem: cada tipo já diz do que vai precisar
    visor: { pt: 'Números de visor (esteira, bicicleta, painel do carro)', en: 'Display digits (treadmill, bike, car dashboard)', futuro: true },
    tabela: { pt: 'Tabela pela posição das palavras (grade, boletim, extrato em foto)', en: 'Tables from word positions', futuro: true },
    ia: { pt: 'Ler com IA online, pela chave da pessoa', en: 'Read with online AI, with the person’s key', futuro: true },
    rosto: { pt: 'Reconhecer rosto', en: 'Face recognition', futuro: true }
  };

  const formatos = [
    { id: 'imagem', ext: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif', 'avif'], mime: /^image\// },
    { id: 'pdf', ext: ['pdf'], mime: /^application\/pdf$/, capacidade: 'pdf' },
    { id: 'texto', ext: ['txt', 'text', 'md', 'log'], mime: /^text\/plain$/, capacidade: 'texto' },
    { id: 'csv', ext: ['csv', 'tsv'], mime: /^text\/(csv|tab-separated-values)$/, capacidade: 'csv' },
    { id: 'ofx', ext: ['ofx', 'qfx'], capacidade: 'ofx' },
    { id: 'xlsx', ext: ['xlsx', 'xlsm'], mime: /spreadsheetml/, capacidade: 'planilha' },
    { id: 'docx', ext: ['docx'], mime: /wordprocessingml/, capacidade: 'word' },
    // Formatos antigos: dizer como resolver em vez de falhar calado
    { id: 'xls', ext: ['xls'], recusa: 'planilha no formato antigo (.xls): salve como .xlsx ou .csv' },
    { id: 'doc', ext: ['doc'], recusa: 'documento no formato antigo (.doc): salve como .docx ou PDF' }
  ];

  // Os apps da SolverONE que recebem documentos (endereço: solverone.com.br/<pasta>/)
  const apps = {
    moneytrio: { nome: 'MoneyTRIO', pasta: 'investify-me' },
    riseone: { nome: 'RiseONE', pasta: 'rise-one' },
    hypernutry: { nome: 'HyperNutry', pasta: 'hypernutry' },
    omnilife: { nome: 'OmniLifeONE', pasta: 'omnilife-one' }
  };

  // t(id, nome em português, nome em inglês, extras)
  const t = (id, pt, en, x = {}) => Object.assign({ id, pt, en }, x);
  const familias = [
    { id: 'dinheiro', pt: 'Dinheiro e compras', en: 'Money and purchases', privacidade: 'financeiro', apps: ['moneytrio'], tipos: [
      t('cartao', 'Comprovante de maquininha', 'Card receipt', { leitor: 'cartao', precisa: ['foto'] }),
      t('nfce', 'Nota fiscal / cupom', 'Invoice / receipt', { leitor: 'nfce', precisa: ['foto', 'codigos'] }),
      t('conta', 'Conta de restaurante', 'Restaurant bill', { leitor: 'conta', precisa: ['foto'] }),
      t('extrato', 'Extrato bancário', 'Bank statement', { leitor: 'extrato', precisa: ['ofx', 'csv', 'planilha', 'pdf', 'tabela'] }),
      t('fatura', 'Fatura de cartão de crédito', 'Credit card bill', { leitor: 'extrato', precisa: ['ofx', 'csv', 'planilha', 'pdf', 'tabela'] }),
      t('boleto', 'Boleto', 'Bank slip (boleto)', { precisa: ['foto', 'codigos'] }),
      t('consumo', 'Conta de luz, água, gás ou internet', 'Utility bill', { precisa: ['foto', 'codigos', 'pdf'] }),
      t('imposto', 'Imposto ou taxa (IPVA, IPTU, IRPF, ITBI)', 'Tax or fee', { precisa: ['foto', 'codigos', 'pdf'] }),
      t('multa', 'Multa', 'Traffic fine', { precisa: ['foto', 'codigos'] }),
      t('orcamento', 'Orçamento', 'Quote', { precisa: ['foto', 'pdf'] }),
      t('recibo', 'Recibo', 'Receipt (handwritten or simple)', { precisa: ['foto'] }),
      t('investimento', 'Histórico de investimentos', 'Investment history', { precisa: ['pdf', 'planilha', 'tabela'] }),
      t('ingresso', 'Ingresso ou ticket', 'Ticket', { precisa: ['foto', 'codigos'] })
    ] },
    { id: 'saude', pt: 'Saúde', en: 'Health', privacidade: 'saude', apps: ['riseone'], tipos: [
      t('receita-medica', 'Receita médica ou de tratamento', 'Prescription', { precisa: ['foto'] }),
      t('pedido-exame', 'Pedido de exame', 'Test request', { precisa: ['foto'] }),
      t('resultado-exame', 'Resultado de exame ou laudo médico', 'Test result or medical report', { precisa: ['foto', 'pdf', 'tabela'] }),
      t('exame-imagem', 'Exame de imagem', 'Imaging exam', { precisa: ['foto', 'pdf'] }),
      t('bioimpedancia', 'Bioimpedância', 'Body composition (bioimpedance)', { apps: ['riseone', 'hypernutry'], precisa: ['foto', 'tabela'] }),
      t('vacina', 'Cartão de vacina', 'Vaccination card', { precisa: ['foto', 'tabela'] }),
      t('atestado', 'Atestado', 'Medical certificate', { precisa: ['foto'] }),
      t('dieta', 'Dieta ou plano alimentar', 'Diet plan', { apps: ['riseone', 'hypernutry'], precisa: ['foto', 'pdf'] })
    ] },
    { id: 'alimentos', pt: 'Alimentos e produtos', en: 'Food and products', apps: ['hypernutry'], tipos: [
      t('nutricional', 'Informação nutricional', 'Nutrition facts', { precisa: ['foto', 'tabela'] }),
      t('ingredientes', 'Ingredientes', 'Ingredients', { precisa: ['foto'] }),
      t('rotulo', 'Rótulo e marca de produto', 'Product label and brand', { precisa: ['foto', 'codigos'] }),
      t('garrafa', 'Garrafa (vinho, cerveja, destilado, refrigerante, suco)', 'Bottle label', { precisa: ['foto', 'codigos'] }),
      t('cardapio', 'Cardápio', 'Menu', { precisa: ['foto'] }),
      t('receita-culinaria', 'Receita culinária', 'Recipe', { precisa: ['foto'] }),
      t('alimento', 'Foto de comida (que alimento é)', 'Food photo (what food it is)', { precisa: ['ia'] })
    ] },
    { id: 'documentos', pt: 'Documentos pessoais', en: 'Personal documents', privacidade: 'pessoal', apps: ['omnilife'], tipos: [
      t('rg', 'RG / carteira de identidade', 'ID card', { precisa: ['foto'] }),
      t('cpf', 'CPF', 'CPF (tax ID)', { precisa: ['foto'] }),
      t('cnh', 'CNH / carteira de motorista', 'Driver’s license', { precisa: ['foto', 'codigos'] }),
      t('ctps', 'Carteira de trabalho', 'Work card', { precisa: ['foto'] }),
      t('titulo-eleitor', 'Título de eleitor', 'Voter card', { precisa: ['foto', 'codigos'] }),
      t('passaporte', 'Passaporte ou visto', 'Passport or visa', { precisa: ['foto'] }),
      t('certidao-nascimento', 'Certidão de nascimento', 'Birth certificate', { precisa: ['foto', 'pdf'] }),
      t('certidao-casamento', 'Certidão de casamento', 'Marriage certificate', { precisa: ['foto', 'pdf'] }),
      t('escritura', 'Escritura', 'Deed', { precisa: ['foto', 'pdf'] }),
      t('diploma', 'Diploma ou certificado', 'Diploma or certificate', { precisa: ['foto', 'pdf'] }),
      t('carta', 'Carta', 'Letter', { precisa: ['foto', 'pdf', 'word'] }),
      t('laudo-tecnico', 'Laudo técnico', 'Technical report', { precisa: ['foto', 'pdf', 'word'] }),
      t('cartao-credito', 'Cartão de crédito (só os 4 últimos dígitos ficam)', 'Credit card (only the last 4 digits are kept)', { apps: ['moneytrio'], precisa: ['foto'], privacidade: 'financeiro' })
    ] },
    { id: 'escola', pt: 'Escola', en: 'School', apps: ['omnilife'], tipos: [
      t('boletim', 'Boletim escolar', 'Report card', { precisa: ['foto', 'pdf', 'tabela'] }),
      t('grade', 'Grade de horários', 'Class schedule', { precisa: ['foto', 'tabela'] }),
      t('calendario-provas', 'Calendário de provas', 'Exam calendar', { precisa: ['foto', 'tabela'] }),
      t('agenda', 'Agenda ou recado da escola', 'School planner or note', { precisa: ['foto'] })
    ] },
    { id: 'casa', pt: 'Casa, carro e academia', en: 'Home, car and gym', apps: ['omnilife'], tipos: [
      t('etiqueta', 'Etiqueta de equipamento (fabricante, modelo, série)', 'Equipment tag', { precisa: ['foto', 'codigos'] }),
      t('manual', 'Manual', 'Manual', { precisa: ['foto', 'pdf'] }),
      t('odometro', 'Quilometragem do carro', 'Car odometer', { precisa: ['foto', 'visor'] }),
      t('esteira', 'Esteira ou bicicleta (distância, tempo)', 'Treadmill or bike display', { apps: ['riseone'], precisa: ['foto', 'visor'] }),
      t('placa', 'Placa de rua ou de estabelecimento', 'Street or shop sign', { precisa: ['foto'] }),
      t('garagem', 'Mapa de garagem', 'Parking map', { precisa: ['foto'] }),
      t('regras', 'Regras da casa ou aviso', 'House rules or notice', { precisa: ['foto'] })
    ] },
    { id: 'telas', pt: 'Telas e mensagens', en: 'Screens and messages', apps: ['omnilife'], tipos: [
      t('notificacao', 'Print de notificação (compra, banco)', 'Notification screenshot', { apps: ['moneytrio'], precisa: ['foto'], privacidade: 'financeiro' }),
      t('print', 'Print de tela', 'Screenshot', { precisa: ['foto'] }),
      t('email', 'E-mail', 'E-mail', { precisa: ['foto', 'pdf', 'texto'] }),
      t('recado', 'Recado ou bilhete', 'Note', { precisa: ['foto'] })
    ] },
    { id: 'pessoas', pt: 'Pessoas', en: 'People', privacidade: 'biometrico', apps: ['omnilife'], tipos: [
      t('rosto', 'Rosto (reconhecer a pessoa)', 'Face (recognize the person)', { precisa: ['rosto'] })
    ] },
    { id: 'outros', pt: 'Outros', en: 'Other', tipos: [
      t('livre', 'Outro (texto livre)', 'Other (free text)', { precisa: ['foto'] })
    ] }
  ];

  // Palavras que denunciam cada tipo que ainda não tem leitor próprio, para o
  // "Não sei, descobrir" acertar a categoria e o tipo. Três ou mais no texto =
  // é esse tipo (ganha o que tiver mais). Os leitores de dinheiro (cartão, nota,
  // conta) são procurados antes e têm a vez, porque eles leem o valor.
  const SINAIS = {
    boleto: /LINHA DIGIT[AÁ]VEL|BENEFICI[AÁ]RIO|NOSSO N[UÚ]MERO|PAG[AÁ]VEL (?:EM|PREFERENCIAL)|C[OÓ]D(?:IGO)?\.? DO BANCO|VENCIMENTO|CEDENTE|SACADO|AUTENTICA[CÇ][AÃ]O MEC|FICHA DE COMPENSA|RECIBO DO PAGADOR/g,
    consumo: /\bENEL\b|SABESP|COMG[AÁ]S|CONSIGAZ|\bCPFL\b|CEMIG|COPEL|CELESC|ULTRAGAZ|\bKWH\b|CONSUMO|LEITURA (?:ATUAL|ANTERIOR)|MEDIDOR|BANDEIRA TARIF|FATURA DE (?:ENERGIA|[AÁ]GUA|G[AÁ]S)|CONTA DE (?:LUZ|[AÁ]GUA|G[AÁ]S)|BANDA LARGA|FIBRA [OÓ]PTICA/g,
    imposto: /\bIPVA\b|\bIPTU\b|\bIRPF\b|\bITBI\b|\bDARF\b|\bGARE\b|GUIA DE (?:RECOLHIMENTO|ARRECADA)|SECRETARIA DA FAZENDA|EXERC[IÍ]CIO|IMPOSTO|LAN[CÇ]AMENTO TRIBUT|RENAVAM/g,
    multa: /AUTO DE INFRA[CÇ][AÃ]O|NOTIFICA[CÇ][AÃ]O DE (?:AUTUA|PENALIDADE)|INFRA[CÇ][AÃ]O|RENAINF|ENQUADRAMENTO|VELOCIDADE (?:MEDIDA|PERMITIDA|CONSIDERADA)|RADAR|PONTOS NA CNH|\bAIT\b/g,
    orcamento: /OR[CÇ]AMENTO|PROPOSTA|VALIDADE DA PROPOSTA|PRAZO DE ENTREGA|CONDI[CÇ][OÕ]ES DE PAGAMENTO|M[AÃ]O DE OBRA/g,
    recibo: /\bRECIBO\b|RECEBI(?:EMOS)? DE|A IMPORT[AÂ]NCIA DE|REFERENTE A|POR SER VERDADE|QUITA[CÇ][AÃ]O/g,
    investimento: /INVESTIMENTO|RENDIMENTO|APLICA[CÇ][AÃ]O|RESGATE|\bCDB\b|\bLCI\b|\bLCA\b|TESOURO DIRETO|RENTABILIDADE|COTAS?\b/g,
    ingresso: /INGRESSO|MEIA[- ]ENTRADA|\bSETOR\b|ASSENTO|CADEIRA|PORT[AÃ]O|ARQUIBANCADA|CAMAROTE|\bTICKET|EVENTO|ID DO INGRESSO/g,
    extrato: /EXTRATO|SALDO (?:ANTERIOR|DO DIA|DISPON[IÍ]VEL)|LAN[CÇ]AMENTOS|AG[EÊ]NCIA|CONTA CORRENTE|PIX (?:ENVIADO|RECEBIDO)|ESTORNO|TRANSFER[EÊ]NCIA/g,
    fatura: /FATURA|PAGAMENTO M[IÍ]NIMO|LIMITE (?:DISPON|TOTAL)|ANUIDADE|MELHOR DIA DE COMPRA|COMPRAS PARCELADAS|ENCARGOS|TOTAL DA FATURA/g,
    'receita-medica': /RECEITU[AÁ]RIO|RECEITA M[EÉ]DICA|PRESCRI[CÇ][AÃ]O|NOME DO PACIENTE|\bPACIENTE\b|\bCRM\b|\bRQE\b|USO (?:ORAL|CONT[IÍ]NUO|T[OÓ]PICO|INTERNO|EXTERNO)|POSOLOGIA|\bTOMAR\b|COMPRIMIDOS?|C[AÁ]PSULAS?|\bGOTAS\b|AO DIA|EM \d+ HORAS|MANIPULA/g,
    'pedido-exame': /SOLICITO|SOLICITA[CÇ][AÃ]O DE EXAME|PEDIDO DE EXAME|HEMOGRAMA|GLICEMIA|COLESTEROL|TRIGLICER|CREATININA|\bTSH\b|\bT4 LIVRE|URINA|ULTRASS(?:OM|ONOGRAFIA)|TOMOGRAFIA|RESSON[AÂ]NCIA|ELETROCARDIOGRAMA|ECOCARDIOGRAMA|INDICA[CÇ][AÃ]O CL[IÍ]NICA|FERRITINA|VITAMINA|\bTGO\b|\bTGP\b|ENDOSCOPIA/g,
    'resultado-exame': /VALORES? DE REFER[EÊ]NCIA|\bRESULTADO|M[EÉ]TODO:|MATERIAL:|LIBERADO|COLETAD|\bMG\/DL\b|\bG\/DL\b|\bU\/L\b|\/MM[3³]|\bNG\/ML\b|ASSINATURA ELETR|LABORAT[OÓ]RIO/g,
    'exame-imagem': /ULTRASSONOGRAFIA|RADIOGRAFIA|MAMOGRAFIA|DENSITOMETRIA|IMPRESS[AÃ]O DIAGN|ACHADOS|CONCLUS[AÃ]O:|T[EÉ]CNICA:|EXAME REALIZADO/g,
    bioimpedancia: /INBODY|BIOIMPED[AÂ]NCIA|COMPOSI[CÇ][AÃ]O CORPORAL|MASSA (?:MUSCULAR|MAGRA|DE GORDURA)|GORDURA (?:CORPORAL|VISCERAL)|[AÁ]GUA CORPORAL|TAXA METAB|\bIMC\b|PERCENTUAL DE GORDURA|MASSA ESQUEL/g,
    vacina: /VACINA|IMUNIZA|\bDOSE\b|REFOR[CÇ]O|CADERNETA|\bBCG\b|HEPATITE|TR[IÍ]PLICE|INFLUENZA|FEBRE AMARELA/g,
    atestado: /\bATESTO\b|ATESTADO|AFASTAMENTO|REPOUSO|COMPARECEU|ESTEVE SOB|PARA FINS DE/g,
    dieta: /\bDIETA\b|PLANO ALIMENTAR|CAF[EÉ] DA MANH[AÃ]|ALMO[CÇ]O|JANTAR|LANCHE|\bCEIA\b|COLA[CÇ][AÃ]O|NUTRICIONISTA|\bCRN\b/g,
    nutricional: /INFORMA[CÇ](?:[AÃ]O|[OÕ]ES) NUTRICIONA|NUTRITION FACTS|VALOR ENERG|POR[CÇ][AÃ]O|CARBOIDRATO|PROTE[IÍ]NA|GORDURAS? (?:TOTA|SATURA|TRANS)|FIBRAS? ALIMENTAR|S[OÓ]DIO|A[CÇ][UÚ]CARES|%\s?V\.?D|\bKCAL\b|VALORES DI[AÁ]RIOS/g,
    ingredientes: /INGREDIENTES|\bCONT[EÉ]M\b|AL[EÉ]RGIC|GL[UÚ]TEN|LACTOSE|PODE CONTER|CONSERVANTE|ACIDULANTE|AROMATIZANTE|ESPESSANTE|EMULSIFICANTE|CORANTE/g,
    rotulo: /\bLOTE\b|VALIDADE|FABRICA[DÇ]|IND[UÚ]STRIA BRASILEIRA|PESO L[IÍ]QUIDO|\bSAC\b|0800|CONSERVAR|MANTER EM|EMBALAGEM|\bNET WT|\bPESO\b/g,
    garrafa: /CERVEJA|\bBEER\b|\bLAGER\b|PILSEN|\bIPA\b|\bVINHO\b|\bWINE\b|\bSAFRA\b|\bTINTO\b|ESPUMANTE|TEOR ALCO|% ?VOL|\bVODKA|WHISK|\bGIN\b|CACHA[CÇ]A|REFRIGERANTE|\bSUCO\b|\bCALS?\b|SEM GL[UÚ]TEN/g,
    cardapio: /CARD[AÁ]PIO|\bMENU\b|ENTRADAS|PRATOS? PRINCIPA|SOBREMESAS?|BEBIDAS|ACOMPANHAMENTO|SERVE \d|COUVERT/g,
    'receita-culinaria': /MODO DE PREPARO|X[IÍ]CARAS?|COLHER(?:ES)? DE|PITADA|PREAQUE|\bASSE\b|\bMEXA\b|TEMPO DE PREPARO|RENDIMENTO:/g,
    rg: /REGISTRO GERAL|CARTEIRA DE IDENTIDADE|C[EÉ]DULA DE IDENTIDADE|FILIA[CÇ][AÃ]O|NATURALIDADE|DATA DE EXPEDI|SECRETARIA DA SEGURAN|INSTITUTO DE IDENTIFICA|DOC\.? ORIGEM/g,
    cpf: /CADASTRO DE PESSOAS? F[IÍ]SICAS?|COMPROVANTE DE INSCRI[CÇ][AÃ]O|SITUA[CÇ][AÃ]O CADASTRAL|N[UÚ]MERO DE INSCRI/g,
    cnh: /CARTEIRA NACIONAL DE HABILITA|HABILITA[CÇ][AÃ]O|DOC\.? IDENTIDADE|[OÓ]RG\.? EMISSOR|DATA EMISS[AÃ]O|UF DE NASCIMENTO|ASSINATURA DO EMISSOR|PERMISS[AÃ]O|CAT\.? HAB|1[ªA] HABILITA|DETRAN|RENACH|DEPARTAMENTO (?:NACIONAL|ESTADUAL) DE TR[AÂ]NSITO|V[AÁ]LIDA EM TODO|ASSINATURA DO PORTADOR/g,
    ctps: /CARTEIRA DE TRABALHO|PREVID[EÊ]NCIA SOCIAL|CONTRATO DE TRABALHO|EMPREGADOR|\bCTPS\b|ADMISS[AÃ]O|REMUNERA[CÇ][AÃ]O/g,
    'titulo-eleitor': /T[IÍ]TULO ELEITORAL|T[IÍ]TULO DE ELEITOR|JUSTI[CÇ]A ELEITORAL|\bZONA\b|\bSE[CÇ][AÃ]O\b|ELEITOR/g,
    passaporte: /PASSAPORTE|PASSPORT|NATIONALITY|DATE OF (?:BIRTH|ISSUE|EXPIRY)|\bVISTO\b|P<BRA|AUTHORITY|SURNAME|GIVEN NAMES/g,
    'certidao-nascimento': /CERTID[AÃ]O DE NASCIMENTO|REGISTRO CIVIL|NASCIMENTO|GENITOR|\bAV[OÓ]S\b|CART[OÓ]RIO|OFICIAL DE REGISTRO|DECLARANTE/g,
    'certidao-casamento': /CERTID[AÃ]O DE CASAMENTO|CASAMENTO|C[OÔ]NJUGE|REGIME DE BENS|NUBENTES/g,
    escritura: /ESCRITURA|TABELI[AÃ]O|OUTORGANTE|OUTORGAD|COMPRA E VENDA|LAVRAD|\bLIVRO\b|MATR[IÍ]CULA DO IM/g,
    diploma: /DIPLOMA|CERTIFICA(?:DO|MOS)|CONFERE (?:O|A) |CONCLUS[AÃ]O DO CURSO|CARGA HOR[AÁ]RIA|UNIVERSIDADE|FACULDADE|\bREITOR/g,
    carta: /PREZAD[OA]|ATENCIOSAMENTE|CORDIALMENTE|ABRA[CÇ]OS|SAUDA[CÇ][OÕ]ES|ASSUNTO:|\bREF\.?:/g,
    'laudo-tecnico': /LAUDO T[EÉ]CNICO|VISTORIA|INSPE[CÇ][AÃ]O|ENGENHEIR|\bCREA\b|\bART\b|PARECER|N[AÃ]O CONFORMIDADE|RESPONS[AÁ]VEL T[EÉ]CNICO/g,
    'cartao-credito': /\b\d{4}\s\d{4}\s\d{4}\s\d{4}\b|VALID (?:THRU|UNTIL)|V[AÁ]LIDO AT[EÉ]|MEMBER SINCE|PLATINUM|INFINITE|CONTACTLESS/g,
    boletim: /BOLETIM|BIMESTRE|TRIMESTRE|M[EÉ]DIA FINAL|\bFALTAS\b|FREQU[EÊ]NCIA|DISCIPLINA|COMPONENTE CURRICULAR|RECUPERA[CÇ][AÃ]O|CONCEITO/g,
    grade: /HOR[AÁ]RIO|SEGUNDA|TER[CÇ]A|QUARTA|QUINTA|SEXTA|INTERVALO|RECREIO|\bAULAS?\b|\bTURMA\b/g,
    'calendario-provas': /CALEND[AÁ]RIO|\bPROVAS?\b|AVALIA[CÇ](?:[AÃ]O|[OÕ]ES)|SIMULADO|ENTREGA DE TRABALHO|BIMESTRAL/g,
    agenda: /\bAGENDA\b|SENHORES PAIS|RESPONS[AÁ]VEIS|COMUNICADO|AUTORIZA[CÇ][AÃ]O PARA|PASSEIO|REUNI[AÃ]O DE PAIS|\bALUN[OA]/g,
    etiqueta: /MODEL(?:O|E)?\b|\bS\/N\b|SERIAL|N[ºO°]? DE S[EÉ]RIE|FABRICANTE|MANUFACTUR|MADE IN|FABRICADO|VOLTAGEM|\bHZ\b|POT[EÊ]NCIA|INMETRO|ANATEL|\bIMEI\b|PART N/g,
    manual: /\bMANUAL\b|INSTRU[CÇ][OÕ]ES|ATEN[CÇ][AÃ]O:|INSTALA[CÇ][AÃ]O|GARANTIA|SOLU[CÇ][AÃ]O DE PROBLEMAS|ESPECIFICA[CÇ][OÕ]ES|CAP[IÍ]TULO/g,
    odometro: /ODOM|HOD[OÔ]METRO|\bTRIP\b|\bODO\b|AUTONOMIA|COMBUST[IÍ]VEL|\bRPM\b|\bKM\/L\b/g,
    esteira: /LIFE ?FITNESS|TECHNOGYM|PRECOR|MOVEMENT|ESTEIRA|TREADMILL|SPEED|VELOCIDADE|INCLIN|DIST[AÂ]NCIA|DISTANCE|CALORI|\bPACE\b|HEART|CARD[IÍ]ACA|\bBPM\b|WORKOUT|\bMETS?\b|\bLEVEL\b|ELAPSED|WEIGHT|PROGRAM/g,
    // endereço (rua, avenida) aparece em quase todo documento: não denuncia placa
    placa: /RODOVIA|PROIBIDO|\bSA[IÍ]DA\b|HOR[AÁ]RIO DE FUNCIONAMENTO|\bABERTO\b|\bFECHADO\b|\bPARE\b|SENTIDO|\bKM \d/g,
    garagem: /GARAGEM|\bVAGAS?\b|SUBSOLO|PAVIMENTO|\bBLOCO\b|ELEVADOR|RAMPA/g,
    regras: /\bREGRAS\b|[EÉ] PROIBIDO|N[AÃ]O [EÉ] PERMITIDO|OBRIGAT[OÓ]RIO|HOR[AÁ]RIO DE SIL[EÊ]NCIO|CONDOM[IÍ]NIO|REGULAMENTO|\bAVISO\b/g,
    notificacao: /COMPRA APROVADA|NOTIFICA[CÇ]|MARCAR COMO LIDA|\bRESPONDER\b|\bAGORA\b|\bAPAGAR\b|LIMPAR TUDO|MENSAGENS|VOC[EÊ] (?:USOU|RECEBEU|PAGOU|ATINGIU)|CONTROLE DE GASTOS|RECARGA APROVADA/g,
    print: /SOLVERONE|HTTPS?:|WWW\.|\.COM(?:\.BR)?\b|BUSCAR|PESQUISAR|COMPARTILHAR|PATROCINADO|SAIBA MAIS|DIGITE|TOQUE (?:NA|NO|EM)/g,
    email: /\bDE:|\bPARA:|ASSUNTO:|\bCC:|ENCAMINHAR|RESPONDER A TODOS|\bFROM:|\bSUBJECT:|@[A-Z0-9.-]+\.[A-Z]{2,}/g,
    recado: /\bRECADO\b|\bBILHETE\b|LEMBRETE|N[AÃ]O ESQUECER|LIGAR PARA/g
  };

  const tipos = { auto: t('auto', 'Não sei, descobrir', 'I don’t know, find out', { familia: 'auto' }) };
  familias.forEach(f => f.tipos.forEach(x => {
    x.familia = f.id;
    if (!x.privacidade && f.privacidade) x.privacidade = f.privacidade;
    if (!x.apps && f.apps) x.apps = f.apps;
    if (SINAIS[x.id]) x.sinais = SINAIS[x.id];
    tipos[x.id] = x;
  }));

  L.catalogo = {
    capacidades, formatos, familias, apps,
    leitores: ['nfce', 'cartao', 'conta', 'extrato'],
    tipo: id => tipos[id],
    familia: id => familias.find(f => f.id === id),
    // Tipos reconhecidos pelos sinais do catálogo (os leitores de dinheiro têm os próprios)
    comSinais: () => Object.values(tipos).filter(x => x.sinais)
  };
})(window.Leitura);
