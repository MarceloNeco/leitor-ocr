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
   - leitores: os leitores prontos, na ordem em que o tipo é procurado no texto.

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

  // t(id, nome em português, nome em inglês, extras)
  const t = (id, pt, en, x = {}) => Object.assign({ id, pt, en }, x);
  const familias = [
    { id: 'dinheiro', pt: 'Dinheiro e compras', en: 'Money and purchases', privacidade: 'financeiro', tipos: [
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
    { id: 'saude', pt: 'Saúde', en: 'Health', privacidade: 'saude', tipos: [
      t('receita-medica', 'Receita médica ou de tratamento', 'Prescription', { precisa: ['foto'] }),
      t('pedido-exame', 'Pedido de exame', 'Test request', { precisa: ['foto'] }),
      t('resultado-exame', 'Resultado de exame ou laudo médico', 'Test result or medical report', { precisa: ['foto', 'pdf', 'tabela'] }),
      t('exame-imagem', 'Exame de imagem', 'Imaging exam', { precisa: ['foto', 'pdf'] }),
      t('bioimpedancia', 'Bioimpedância', 'Body composition (bioimpedance)', { precisa: ['foto', 'tabela'] }),
      t('vacina', 'Cartão de vacina', 'Vaccination card', { precisa: ['foto', 'tabela'] }),
      t('atestado', 'Atestado', 'Medical certificate', { precisa: ['foto'] }),
      t('dieta', 'Dieta ou plano alimentar', 'Diet plan', { precisa: ['foto', 'pdf'] })
    ] },
    { id: 'alimentos', pt: 'Alimentos e produtos', en: 'Food and products', tipos: [
      t('nutricional', 'Informação nutricional', 'Nutrition facts', { precisa: ['foto', 'tabela'] }),
      t('ingredientes', 'Ingredientes', 'Ingredients', { precisa: ['foto'] }),
      t('rotulo', 'Rótulo e marca de produto', 'Product label and brand', { precisa: ['foto', 'codigos'] }),
      t('garrafa', 'Garrafa (vinho, cerveja, destilado, refrigerante, suco)', 'Bottle label', { precisa: ['foto', 'codigos'] }),
      t('cardapio', 'Cardápio', 'Menu', { precisa: ['foto'] }),
      t('receita-culinaria', 'Receita culinária', 'Recipe', { precisa: ['foto'] }),
      t('alimento', 'Foto de comida (que alimento é)', 'Food photo (what food it is)', { precisa: ['ia'] })
    ] },
    { id: 'documentos', pt: 'Documentos pessoais', en: 'Personal documents', privacidade: 'pessoal', tipos: [
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
      t('cartao-credito', 'Cartão de crédito (só os 4 últimos dígitos ficam)', 'Credit card (only the last 4 digits are kept)', { precisa: ['foto'], privacidade: 'financeiro' })
    ] },
    { id: 'escola', pt: 'Escola', en: 'School', tipos: [
      t('boletim', 'Boletim escolar', 'Report card', { precisa: ['foto', 'pdf', 'tabela'] }),
      t('grade', 'Grade de horários', 'Class schedule', { precisa: ['foto', 'tabela'] }),
      t('calendario-provas', 'Calendário de provas', 'Exam calendar', { precisa: ['foto', 'tabela'] }),
      t('agenda', 'Agenda ou recado da escola', 'School planner or note', { precisa: ['foto'] })
    ] },
    { id: 'casa', pt: 'Casa, carro e academia', en: 'Home, car and gym', tipos: [
      t('etiqueta', 'Etiqueta de equipamento (fabricante, modelo, série)', 'Equipment tag', { precisa: ['foto', 'codigos'] }),
      t('manual', 'Manual', 'Manual', { precisa: ['foto', 'pdf'] }),
      t('odometro', 'Quilometragem do carro', 'Car odometer', { precisa: ['foto', 'visor'] }),
      t('esteira', 'Esteira ou bicicleta (distância, tempo)', 'Treadmill or bike display', { precisa: ['foto', 'visor'] }),
      t('placa', 'Placa de rua ou de estabelecimento', 'Street or shop sign', { precisa: ['foto'] }),
      t('garagem', 'Mapa de garagem', 'Parking map', { precisa: ['foto'] }),
      t('regras', 'Regras da casa ou aviso', 'House rules or notice', { precisa: ['foto'] })
    ] },
    { id: 'telas', pt: 'Telas e mensagens', en: 'Screens and messages', tipos: [
      t('notificacao', 'Print de notificação (compra, banco)', 'Notification screenshot', { precisa: ['foto'], privacidade: 'financeiro' }),
      t('print', 'Print de tela', 'Screenshot', { precisa: ['foto'] }),
      t('email', 'E-mail', 'E-mail', { precisa: ['foto', 'pdf', 'texto'] }),
      t('recado', 'Recado ou bilhete', 'Note', { precisa: ['foto'] })
    ] },
    { id: 'pessoas', pt: 'Pessoas', en: 'People', privacidade: 'biometrico', tipos: [
      t('rosto', 'Rosto (reconhecer a pessoa)', 'Face (recognize the person)', { precisa: ['rosto'] })
    ] },
    { id: 'outros', pt: 'Outros', en: 'Other', tipos: [
      t('livre', 'Outro (texto livre)', 'Other (free text)', { precisa: ['foto'] })
    ] }
  ];

  const tipos = { auto: t('auto', 'Não sei, descobrir', 'I don’t know, find out', { familia: 'auto' }) };
  familias.forEach(f => f.tipos.forEach(x => {
    x.familia = f.id;
    if (!x.privacidade && f.privacidade) x.privacidade = f.privacidade;
    tipos[x.id] = x;
  }));

  L.catalogo = {
    capacidades, formatos, familias,
    leitores: ['nfce', 'cartao', 'conta', 'extrato'],
    tipo: id => tipos[id]
  };
})(window.Leitura);
