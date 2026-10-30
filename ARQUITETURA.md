# Leitor OCR — arquitetura (leia antes de mexer)

Briefing para qualquer pessoa ou IA. O Leitor OCR é duas coisas:

1. **O motor de leitura SolverONE** (`leitura.js` + pastas `leitura/`, `leitores/`, `formatos/`): lê fotos e arquivos no próprio aparelho e devolve os campos de cada documento. É feito para ser **copiado** pelos outros apps (MoneyTRIO, HyperNutry, OmniLife...). A cópia mestre mora aqui; nos outros apps, essas pastas são idênticas e não se editam (pedido de mudança vem para cá).
2. **O app de referência** (`index.html`): as telas do leitor de comprovantes. Ele usa o motor exatamente como um app filho usaria, só pelas funções `Leitura.*`.

JavaScript, HTML e CSS puros, sem framework e sem build. Nada é buscado na internet: o motor de OCR, os leitores de código e o leitor de PDF estão no repositório. Dados só no aparelho (`localStorage`).

## Ideia central: capacidades por demanda

O motor não é um pacote único. Cada capacidade mora em arquivos próprios e só carrega quando um documento precisa dela; as partes pesadas só **baixam** na primeira vez em que são usadas (ou quando a pessoa toca em "Guardar tudo", em Ajustes) e ficam guardadas no aparelho.

| Capacidade | Arquivos | Carrega quando | Pesado (baixa no 1º uso) |
|---|---|---|---|
| Entender texto (valor, data, CNPJ, chave, estabelecimento, tipo) | `leitura/texto.js` | sempre (página) | — |
| Relações entre papéis (mesma compra, pagamento dividido, minha parte) | `leitura/relacoes.js` | sempre | — |
| Ler texto em foto (OCR) | `leitura/foto.js` | primeira foto | `tesseract/` (9,4 MB) |
| QR code e código de barras | `leitura/codigos.js` | primeira foto | `libs/zxing.min.js`, `libs/jsQR.js` (0,6 MB) |
| PDF (texto direto ou página como foto) | `formatos/pdf.js` | primeiro PDF | `libs/pdfjs/` (1,8 MB + fontes) |
| TXT | `formatos/texto.js` | primeiro .txt | — |
| CSV | `formatos/csv.js` | primeiro .csv | — |
| OFX (extrato/fatura do banco) | `formatos/ofx.js` | primeiro .ofx | — |
| Planilha Excel (XLSX) | `formatos/zip.js` + `formatos/xlsx.js` | primeiro .xlsx | — (usa o descompactador do navegador) |
| Word (DOCX) | `formatos/zip.js` + `formatos/docx.js` | primeiro .docx | — |
| Ler com IA online, pela chave da pessoa (Gemini, Claude) | `leitura/ia.js` | sempre (página) | — |
| Visor de 7 segmentos, tabela por posição, rosto | — | ainda não existem | listadas no catálogo como `futuro` |

A lista oficial está em `leitura/catalogo.js` (`capacidades`). O `sw.js` guarda o básico na primeira visita e as pastas `tesseract/` e `libs/` só ao passar por elas, numa cópia (`dgo-leitor-ocr-pesado-1`) que atravessa as atualizações sem baixar tudo de novo.

## Mapa dos arquivos

| Arquivo | O que faz |
|---|---|
| `leitura.js` | Porta de entrada (global `Leitura`): carregar capacidades sob demanda, registro de leitores, `abrir`, `acharPapeis`, `ler`, `lerArquivo`, `resultado`, e o app certo de cada documento (`espiar`, `ondeLer`, `appsDoTipo`). |
| `leitura/catalogo.js` | Capacidades, formatos de arquivo aceitos (e os recusados com o motivo), **todas as famílias e tipos de documento** com o leitor de cada um, o que vão precisar e a classe de privacidade. |
| `leitura/texto.js` | Campos a partir do texto (`parseDocument`, `findMoney`, `parseChave`, `pickEstablishment`), tipo pelo texto (`detectDocType`), valor confirmado (`agreedValue`) e o resultado de um papel (`buildResult`). |
| `leitura/foto.js` | Inclinação pelos centros das letras (`anguloLinhas`), papéis na foto (`findPapers`), recorte, limpeza do fundo, as várias leituras com o Tesseract em cada posição (`readPaper`, `lerFotos`) e o valor em letra grande lido à parte (`lerValorGrande`). |
| `leitura/codigos.js` | `readCodes`: QR e códigos de barras (ZXing + jsQR). |
| `leitura/relacoes.js` | `Leitura.relacionar(papeis)`: mesma compra (a nota e a via do cartão; o canhoto e o aviso do banco), aviso repetido em dois prints, pagamento dividido, quem pagou e "minha parte" (cartões da pessoa pelos 4 últimos dígitos, em `localStorage` `leitor_meus_cartoes`). |
| `leitura/estabelecimentos.js` | Quem é a loja: `Leitura.estabelecimento({ razao, cnpj, cabecalho })` pela raiz do CNPJ na base, `Leitura.categoriaDe(descricao)` e o nome corrigido pela pessoa (`localStorage` `leitor_nomes_estabelecimentos`). Com internet, `Leitura.consultarCnpj(cnpj)` pergunta à consulta pública de CNPJ quem é a loja fora da base (resposta em `localStorage` `leitor_cnpj_consultados`; `Leitura.consultaCnpjLigada()` / `ligarConsultaCnpj(sim)` é a chave de Ajustes; `Leitura.categoriaDoCnae(cnae)` é a tabela atividade → categoria). Ver "Lojas". |
| `dados/estabelecimentos.json` | A base de lojas: raiz do CNPJ, razão social, nome fantasia e categoria das redes comuns (dado público). |
| `leitura/ia.js` | Ler a foto com uma IA online (nível C): `Leitura.ia.provedores()`, `guardarChave(prov, chave)` (testa na lista de modelos e guarda no cofre comum `dgo:global:chaves-ia`), `provedorAtual()`, `lerFoto(img)` (Gemini ou Claude, pedido em JSON), `aplicar(papel, lido, atuais)` (campos só onde estava vazio; valor vira sugestão), `explicar(erro)`, `precisaPerguntar(tipo)`, `sozinha()`. Ver "Ler com IA". |
| `leitores/*.js` | Um arquivo por tipo de documento que já tem leitor próprio: `cartao`, `nfce` (também o total do DANFE, conferido pela soma da nota, e os produtos do cupom; ver "Produtos da nota"), `conta`, `transferencia` (Pix, TED), `boleto` (valor e vencimento da linha digitável, conferidos pelos dígitos verificadores; as partes do valor; o valor pago no comprovante), `arrecadacao` (conta de luz, água, gás, telefone, imposto e multa pelo código de 48 números), `extrato` (o **leitor de lançamentos**: um só para extrato, fatura e print de notificação, de qualquer banco; ver "Lançamentos"). |
| `formatos/*.js` | Um arquivo por tipo de arquivo. |
| `index.html` | Telas: capturar, abas dos papéis, campos para conferir, histórico, exportar, ajustes. Janelas: `detailDialog`, `confirmDialog`, `docTypeDialog`, `cameraDialog`, `papersDialog`, `passwordDialog` (todas `<dialog>` nativo). |
| `sw.js` | Uso sem internet. `VERSAO` acompanha `APP_VERSION` do `index.html`. Arquivo novo do app entra em `ARQUIVOS`. A versão nova assume na hora (skipWaiting + clients.claim); a tela mostra a faixa "Nova versão pronta" (Atualizar / Depois) quando ela assume (`controllerchange`), nunca na primeira visita, e espera a leitura em andamento terminar. |
| `testes/medir.js` | Mede a leitura em fotos reais (fora do repositório) contra um gabarito. |
| `testes/offline.js` | Testa sem dados pessoais: uso sem internet, partes pesadas por demanda, PDF (com senha também), TXT, CSV, OFX, XLSX, DOCX, várias fotos, pagamento dividido, lançamentos de extratos, fatura e print de mentira, loja pela base e produtos de um cupom de mentira, prints com aviso repetido e o canhoto da mesma compra, câmera, faixa de versão nova. |
| `NOTAS-leitor-ocr.md` | Como a leitura funciona, por que cada decisão foi tomada, os números de cada etapa e as pendências. |
| `ESTRATEGIA-leitura.md`, `PEDIDOS.md` | O plano do motor único para todos os apps e os pedidos que chegam dos outros apps. |

## O caminho de um documento

1. `Leitura.abrir(arquivos, aviso, pedirSenha)` → **fontes**. Cada foto, página de PDF, aba de planilha ou texto vira uma fonte: `{ nome, img }` (ler como foto), `{ nome, texto }` (texto pronto), `{ nome, linhas }` (tabela) ou `{ nome, itens, info }` (lançamentos de OFX). Arquivo que não abre volta em `recusados`, com o motivo, sem atrapalhar os outros. PDF com senha (fatura e extrato de banco costumam ter): o motor chama `pedirSenha(nome, errou)`, que o app responde com a senha digitada (ou nada, para pular o arquivo); a senha só abre o arquivo naquele momento e não é guardada. Sem `pedirSenha`, o PDF com senha volta em `recusados`.
2. A tela pergunta o tipo (o OFX já diz que é extrato ou fatura) e, em foto, se há vários papéis (`Leitura.acharPapeis`).
3. `Leitura.ler(fontes, { tipo, aviso, progresso })` → **papéis**, um por documento, cada um com `result` (`fields`, `valor`, `candidates`, `status`, `itens`...). Foto passa pelo OCR (cada papel endireitado sozinho; várias leituras; o valor só vale quando duas leituras diferentes concordam, ou quando a faixa do valor em letra grande, lida à parte, foi lida igual em dois tamanhos sem dúvida; quando as duas discordam, as opções vão para a pessoa). Texto de arquivo é exato: uma leitura basta. Lançamentos (`result.itens`, no formato da seção "Lançamentos") vêm do arquivo (OFX, CSV, planilha) ou do texto lido (extrato, fatura e print), pelo leitor de lançamentos.
4. `Leitura.relacionar(papeis)` acrescenta os campos de relação.

## Detecção automática da categoria e do tipo

- **Tipo de arquivo**: pela extensão e pelo tipo que o navegador informa (`L.formatoDe`); formato antigo é recusado com o motivo.
- **Tipo de documento** ("Não sei, descobrir", `detectDocType` em `leitura/texto.js`): primeiro os leitores de dinheiro (cartão, nota, conta), pelos `sinais` de cada um, porque são eles que leem o valor; se nenhum reconhece o papel, os outros tipos do catálogo, pelas palavras de `SINAIS` em `leitura/catalogo.js` (3 ou mais no texto; ganha o que tiver mais). O tipo descoberto vem com a categoria ("Saúde › Pedido de exame") e já fica no registro, mesmo antes de o tipo ter leitor próprio (aí ele é lido como texto livre).
- **Boleto e conta com código**: uma linha digitável (47 números) ou um código de barras (44) cujos dígitos verificadores conferem é boleto, antes de tudo; o código de arrecadação (48 números, começa com 8) diz pelo 2º número se é conta de consumo, imposto ou multa. O valor (e, no boleto, o vencimento e o banco) sai do código, não do texto em volta. Comprovante de pagamento de boleto mostra o valor pago; o do boleto fica em outro campo.
- **Documento de contas** (`forte` no catálogo: fatura, extrato, prestação de contas do condomínio, Imposto de Renda, investimento, seguro): fala de crédito e débito como um comprovante; com 6 ou mais sinais dele, ganha dos leitores de dinheiro (o de mais sinais). Num PDF de várias páginas, o tipo vem do texto de todas as páginas juntas, e as páginas com texto de um documento de contas viram um papel só (o total fica numa página e as compras em outras).
- **Arquivo que já diz o que é**: OFX (e OFC 1.06) é extrato ou fatura, uma aba por conta ou moeda, com o símbolo da moeda (US$, €...), nunca "R$" para outra moeda; CSV, planilha e TXT com ";" e colunas de data e valor viram lançamentos.
- A pessoa sempre confere e pode trocar o tipo; quando o texto parece outro tipo, aparece "Parece ser: ...".

## Documento no app certo

Cada família do catálogo (ou tipo) diz qual app da SolverONE cuida dela (`apps` em `leitura/catalogo.js`): dinheiro → MoneyTRIO; saúde e esteira → RiseONE; alimentos → HyperNutry; bioimpedância e dieta → RiseONE e HyperNutry; documentos pessoais, escola, casa e carro, prints e recados → OmniLifeONE. O Leitor OCR aceita todos.

No app filho, antes da leitura completa:

```js
Leitura.app = 'hypernutry';                      // quem é este app
const tipo = await Leitura.espiar(fonte);        // uma leitura só, ~2 s (arquivo: na hora)
const outro = Leitura.ondeLer(tipo);             // null = é deste app, ou não dá para saber
if (outro) avisar(outro.texto + ' Ler aqui mesmo?', outro.apps[0].url);
```

`ondeLer` só avisa quando o tipo foi reconhecido: na dúvida (texto livre), não atrapalha. Medido nas 52 fotos de 17/10 como se fosse o HyperNutry: avisou em 15 dos 37 documentos de outros apps, sempre com o app certo, e em nenhum dos 14 documentos do próprio HyperNutry.

## Ensinar um tipo novo de documento

1. Ver se ele já está em `leitura/catalogo.js` (quase todos estão, ainda sem leitor, mas já com as palavras que o denunciam em `SINAIS`). Sem leitor, ele é lido como texto livre e o registro já guarda o tipo.
2. Criar `leitores/<id>.js` chamando `Leitura.registrarLeitor({...})` com:
   - `id`, `vitais` (campos que ficam em vermelho quando faltam, ex. `['Valor']`);
   - `sinais` (regex com `/g`: palavras que denunciam o tipo; 3 ou mais = é esse tipo), `palavras` (o que acompanha o valor), `ignorar` (linhas que nunca têm o valor);
   - `campos(textUpper, fieldsMap)` para campos só dele (ex.: o cartão tem bandeira, NSU, final do cartão);
   - `exato(readings, codes)` → `{ valor, campos, itens?, status }` quando o valor pode ser conferido (código com dígito verificador no `boleto` e na `arrecadacao`; soma da nota no `nfce`): esse valor ganha do texto; `soCodigo: true` no leitor impede de tirar o valor do texto quando o código não vem;
   - ou `daTabela(linhas)` e `resultado(papel)` quando o documento é uma lista (ex.: `extrato`);
   - documento que é uma lista de lançamentos (extrato, fatura, carteira digital, print) não ganha leitor próprio: usa `leitor: 'extrato'`, o leitor de lançamentos (ver "Lançamentos").
3. No catálogo: `leitor: '<id>'` no tipo e o id em `leitores` (a ordem é a da detecção).
4. Pôr o `<script src="leitores/<id>.js">` no `index.html` e o arquivo na lista do `sw.js`.
5. Medir com fotos reais e gabarito (`testes/medir.js`) antes e depois, e contar o resultado numa tabela.

## Lançamentos: um leitor só e um formato só

**Um leitor para todo extrato e fatura** (`leitores/extrato.js`): conta corrente, poupança, cartão de crédito e carteira digital, de qualquer banco, em PDF com texto, PDF escaneado, foto ou print de notificação. Não existe código nem arquivo por banco.

- **Pelo jeito das linhas.** Um lançamento é data + descrição + valor + sinal. Datas "dd/mm", "dd/mm/aaaa", "12 out"; valores com ou sem R$, com ou sem ponto de milhar (e "1,234.56" em conta em dólar). O sinal vem de D/C, de + e −, de parênteses, das colunas de débito e crédito ou, sem nada escrito, do costume do papel (quando só a saída tem sinal, sem sinal é entrada) e das palavras (pagamento, estorno, compra, crédito). O valor pode estar na linha da data, na de cima ou na de baixo; a descrição, na mesma linha ou nas vizinhas (o histórico em cima e o detalhe embaixo). Em PDF com texto, o `formatos/pdf.js` entrega também onde fica cada pedaço da linha (`posicoes`): por ela o leitor acha a coluna de débito e a de crédito, e lê a fatura impressa em duas colunas uma coluna de cada vez (o que também dá o cartão de cada compra). Na foto, as duas leituras são alinhadas: o lançamento lido igual nas duas fica confirmado, o lido com valor diferente fica de fora, e linha com duas colunas misturadas não entra.
- **Dica de banco é só dado.** A tabela `DICAS` diz, para um banco, as palavras do cabeçalho, onde fica o histórico e como ele marca o sinal. Sem dica que bata, o leitor faz igual: a dica só desempata o que o papel não deixa claro.
- **A soma confere, não esconde.** Extrato: o saldo de antes mais os lançamentos tem que dar o saldo depois do último. Fatura: os lançamentos dão um total impresso (as compras, os lançamentos de um cartão) ou o saldo da fatura anterior mais os lançamentos dá o total. Sinal em dúvida ("LOJA - 75,00") e encargo sem data (IOF) entram do jeito que fecha a soma. Quando nada fecha, os lançamentos aparecem assim mesmo, com `conferido: false` e o aviso "a soma não fecha com o saldo (diferença de R$ X)", para a pessoa corrigir na tela. O valor principal do papel segue a regra do projeto: vazio em vermelho antes de errado.
- **Nada inventado.** Sem nenhum lançamento confiável, a tela mostra o texto lido e diz numa frase por quê ("Não achei lançamentos: nenhuma linha começa com uma data").
- **Pagamento e estorno do mesmo valor no mesmo dia** não somem nem se juntam: os dois ficam, com `anulado: true` (a tela mostra riscado). O app que importa (MoneyTRIO) decide se esconde.

**O lançamento**: o mesmo formato para todo tipo de documento e todo app. Os campos de antes (`data`, `descricao`, `valor`) não mudaram; os outros são acréscimos.

| Campo | O que é |
|---|---|
| `data` | "dd/mm/aaaa". Na compra parcelada, o dia da compra |
| `hora` | "hh:mm", quando o papel diz (print de notificação) |
| `descricao` | como está no papel |
| `valor` | número com sinal: negativo é saída, positivo é entrada |
| `moeda` | "BRL", "USD", "EUR"... |
| `entrada` | `true` quando o dinheiro entra (`valor > 0`) |
| `tipo` | "compra", "pagamento", "estorno", "encargo", "anuidade", "transferencia" ou "outro" (pelas palavras) |
| `parcela` | `{ n, de }` na compra parcelada ("3/10" → `{ n: 3, de: 10 }`) |
| `cartaoFinal` | os últimos números do cartão (fatura e print), nunca o número inteiro |
| `categoria` | a categoria da loja pela base ("Mercado", "Transporte"...), só quando a descrição tem o nome de uma rede conhecida; senão o campo não vem (nada chutado) |
| `repetido` | o papel onde o mesmo aviso já está (dois prints que se cobrem): este não conta de novo |
| `mesmaCompra` | o papel do canhoto do cartão da mesma compra (mesmo valor e dia, hora perto ou o mesmo cartão): a compra conta uma vez |
| `conferido` | `true` quando a soma fechou com o saldo ou o total impresso, ou quando veio de arquivo de dados do banco (OFX, CSV, planilha); `false` = a pessoa confere |
| `anulado` | `true` no pagamento e no estorno do mesmo valor no mesmo dia |
| `origem` | `{ papel, pagina?, linha? }`: o papel (nome do arquivo ou da aba), a página do PDF e a linha |

```js
{ data: '10/08/2026', descricao: 'LOJA DE MOVEIS EXEMPLO 3/10', valor: -250, moeda: 'BRL', entrada: false, tipo: 'compra',
  parcela: { n: 3, de: 10 }, cartaoFinal: '0001', conferido: true, origem: { papel: 'fatura.pdf', pagina: 1, linha: 8 } }
```

No papel: `result.itens` (a lista), `result.conferido` e, quando a soma não fecha, `result.diferenca` (em reais).

## Produtos da nota

O cupom fiscal (NFC-e, SAT) traz os produtos, um por linha ou com a quantidade e o peso na linha de baixo ("0,500 kg X 19,90"), e às vezes o "desconto sobre item" na linha seguinte. **Produto não é lançamento**: o papel continua com um valor só (o valor a pagar); a lista é detalhe da compra.

| Campo | O que é |
|---|---|
| `codigo` | o código do produto (barras ou interno), quando lido |
| `descricao` | como está no cupom |
| `qtd` | quantidade (peso em kg no produto pesado) |
| `unidade` | "UN", "kg", "LT"... |
| `precoUnit` | preço da unidade (ou do kg) |
| `desconto` | o desconto do item, em reais, quando há |
| `valor` | o valor do item, antes do desconto |
| `conferido` | `true` só quando a soma dos itens menos os descontos dá o "valor a pagar" impresso; `false` = a tela mostra a lista para conferir |

```js
{ codigo: '2000000000015', descricao: 'QUEIJO EXEMPLO FATIADO', qtd: 0.5, unidade: 'kg', precoUnit: 19.9, valor: 9.95, conferido: true }
```

No papel: `result.produtos` (a lista), `result.produtosConferido` e, quando não fecha, `result.produtosDiferenca` (em reais: o valor a pagar menos a soma). Quando a soma fecha, ela também confirma o valor do papel ("Valor conferido pela soma dos produtos"). Na foto, cada produto vale pela conta do próprio cupom (quantidade × preço = valor) ou pelo que duas leituras leram igual; o que fica em dúvida não entra. A tela mostra "12 produtos" fechado embaixo dos campos, e o registro salvo guarda a lista.

## Lojas: a base de estabelecimentos

- **Razão social pelo papel.** É a primeira linha de texto do alto que não é endereço, bairro, cidade, CEP, telefone nem CNPJ; linha com SA, LTDA, CIA, EIRELI ou ME ganha.
- **Rede pela raiz do CNPJ.** Os 8 primeiros números do CNPJ são iguais em todas as lojas da mesma empresa. `dados/estabelecimentos.json` liga a raiz ao nome fantasia e à categoria (`{ cnpjRaiz, razao, fantasia, categoria, nomes?, marcas? }`; `nomes` acha a rede pela descrição de um lançamento, "IFD*LOJA"; `marcas` separa as marcas da mesma empresa pelo cabeçalho). Cada raiz foi conferida nos dados abertos de CNPJ da Receita Federal. O CNPJ só vale com os dois dígitos verificadores certos.
- **Na tela**: Estabelecimento mostra o nome fantasia quando a raiz é conhecida; a razão social fica em "Razão social" e a categoria em "Categoria". Loja fora da base fica com a razão lida, sem categoria: nada é chutado.
- **No papel**: `result.estabelecimento = { razao, fantasia?, categoria?, cnpj, cnpjRaiz, filial }`.
- **Com internet, loja fora da base (nível B, 0.7.8).** Depois de ler, `Leitura.ler` chama `Leitura.consultarCnpj` para cada papel com CNPJ válido que a base não conhece: pergunta a `minhareceita.org/<cnpj>` (dados abertos da Receita Federal; se não responder em 8 s, `brasilapi.com.br/api/cnpj/v1/<cnpj>`), guarda `{ razao, fantasia, cnae, atividade, quando }` em `localStorage` `leitor_cnpj_consultados` (ou `{ semDados: true }` quando não existe) e refaz o resultado do papel. `Leitura.estabelecimento` lê essa resposta guardada como lê a base: razão social exata; em `fantasia`, o nome fantasia registrado ou, sem ele, o nome impresso no papel quando não é a própria razão social (`mesmoNome`: a primeira palavra que identifica a loja aparece na razão oficial); categoria pela atividade (`Leitura.categoriaDoCnae`: tabela curta em `estabelecimentos.js`, por grupo do CNAE); atividade fora da tabela fica sem categoria e mostra a descrição oficial em "Atividade". Só o número do CNPJ sai do aparelho; sem internet, com a consulta desligada em Ajustes (`leitor_consulta_cnpj` = `nao`) ou sem resposta, nada muda. Falha de rede não é guardada (tenta na próxima leitura).
- **Nome corrigido.** Quando a pessoa corrige o nome da loja de um CNPJ e salva, o aparelho lembra (`localStorage` `leitor_nomes_estabelecimentos`, como `leitor_meus_cartoes`) e da próxima vez o nome dela aparece.
- **A nota no site da Sefaz.** O QR code de uma NFC-e é o endereço da página oficial da nota. `buildResult` põe esse endereço em `result.sefaz` (`Leitura.texto.linkSefaz`: só `http(s)` em domínio `.gov.br`; qualquer outro endereço impresso num papel é ignorado) e a tela mostra o botão "Ver a nota no site da Sefaz", que abre a página em outra aba (com internet). O app não lê os dados da página: a Sefaz bloqueia pedidos automáticos e o navegador não deixa um site ler a página de outro; isso exigiria um servidor.
- **Um dia no RootifyONE.** A base vai morar no RootifyONE ("Conteúdo dos apps"), editada lá e servida a todos os apps. Os outros apps leem pelo mesmo caminho: `Leitura.estabelecimento(...)` e `Leitura.categoriaDe(...)`; só muda de onde `Leitura.carregarEstabelecimentos` busca o arquivo.

**Copiar o motor para os outros apps fica para depois**: MoneyTRIO, HyperNutry e OmniLife recebem esta versão do motor cada um no seu próprio PR.

## Ler com IA (nível C, 0.8.0)

- **A leitura no aparelho vem sempre primeiro.** A IA é um extra: só em foto, só com internet e só com uma chave da pessoa. Sem chave, o botão não existe e nada sai do aparelho.
- **Cofre comum.** A chave fica em `localStorage` `dgo:global:chaves-ia` (`{ gemini, anthropic }`), o mesmo lugar que o módulo comum `DGO.ia` dos outros apps SolverONE usa; como todos moram na mesma origem, a chave colada em qualquer app vale em todos. `dgo:global:ia-por-uso` (`{ visao }`) diz qual provedor lê fotos quando há mais de uma chave; `dgo:global:ia-modelos` guarda o modelo escolhido por provedor. Nada disso entra no repositório.
- **Provedores.** `gemini` (Google, grátis, `x-goog-api-key`, `generateContent` com `responseMimeType: application/json`) e `anthropic` (Claude, pago, `/v1/messages` com `anthropic-dangerous-direct-browser-access: true`). Ao guardar a chave, o app lista os modelos que ela aceita e escolhe um (o Flash mais novo sem variante; no Claude, Sonnet, senão Haiku); modelo aposentado (404) é trocado sozinho.
- **O que sai.** A foto do papel reduzida a 1600 px em JPEG e o pedido em texto (os campos do app em JSON, com a ordem de usar `null` no ilegível e nunca inventar). Nunca o histórico, outros papéis ou a chave de outro provedor.
- **O que entra.** `Leitura.ia.aplicar`: cada campo da IA entra só onde estava vazio, com `ia: true` (a tela mostra a borda tracejada); o valor nunca entra sozinho: fica em `result.ia.sugestao` e a tela mostra o botão "Usar R$ X" (um toque), também quando a leitura do aparelho e a IA discordam; quando concordam, `result.ia.concorda`. Produtos só quando o papel não tinha nenhum (`result.produtosIA`); o tipo da IA vira dica (`result.hint`) quando o papel ficou sem tipo.
- **Consentimento.** `index.html` pergunta antes de mandar (diálogo `#iaDialog`, com "não perguntar de novo" para comprovantes e notas, guardado em `leitor_ia_avisado`); saúde, documento pessoal e rosto (classes do catálogo) perguntam sempre. A opção de Ajustes "usar a IA sozinho" (`leitor_ia_sozinha`) manda, sem perguntar, só os papéis de dinheiro que ficaram sem valor.
- **Erros** em linguagem de gente (`Leitura.ia.explicar`): chave recusada, cota ou crédito no fim, fora do ar, demorou (45 s), resposta ilegível, sem internet.
- **Vários papéis numa foto**: a IA recebe só o recorte do papel (`papel.box`, guardado por `lerFotos` em `leitura/foto.js`), não a foto inteira.
- **Ainda não**: a chamada da IA não entra no trabalho guardado (ver "Leitura que não cancela"); a resposta chega ao papel mesmo trocando de aba, mas uma página recarregada no meio perde a chamada.

## Abrir um formato novo de arquivo

Criar `formatos/<id>.js` com `Leitura.formatos.<id> = async arquivo => [partes]`, declarar a capacidade e o formato (extensões) no catálogo, pôr o arquivo no `sw.js` e um caso no `testes/offline.js`. Se precisar de biblioteca, ela vai para `libs/` (pesada: só baixa no uso).

## Usar o motor em outro app

1. Copiar sem alterar: `leitura.js`, `leitura/`, `leitores/` (só os leitores que o app usa), `formatos/`, `dados/` e as pastas pesadas que ele vai usar (`tesseract/` para foto, `libs/` para códigos e PDF).
2. Na página, antes do script do app:
   ```html
   <script src="leitura.js"></script>
   <script src="leitura/catalogo.js"></script>
   <script src="leitura/texto.js"></script>
   <script src="leitura/relacoes.js"></script>
   <script src="leitura/estabelecimentos.js"></script>
   <script src="leitura/ia.js"></script>
   <script src="leitores/cartao.js"></script>   <!-- um por leitor -->
   ```
3. No código do app:
   ```js
   const { fontes, recusados } = await Leitura.abrir(input.files, aviso, (nome, errou) => perguntarSenha(nome, errou));
   const papeis = await Leitura.ler(fontes, { tipo: 'auto', aviso: t => status.textContent = t });
   Leitura.relacionar(papeis);
   papeis.forEach(p => console.log(p.label, p.result.fields, p.result.valor));
   ```
4. No `sw.js` do app: os arquivos do motor na lista do básico; `tesseract/` e `libs/` guardados no primeiro uso (ver o `sw.js` daqui).
5. Atualizar: copiar de novo as pastas a partir daqui. `Leitura.versao` diz qual versão do motor o app tem.

## Leitura que não cancela (0.8.1, pedido 29)

A leitura de fotos leva minutos no celular, e o Android apaga a tela, congela ou descarta a página em segundo plano. A tela (`index.html`) não impede isso; ela faz o trabalho sobreviver:

- **Tela acesa**: `segurarTela()` pede `navigator.wakeLock.request('screen')` ao começar a ler e `soltarTela()` solta no fim; quando a aba volta a aparecer com a leitura em andamento, pede de novo (o navegador solta a trava ao esconder a aba). Sem suporte, segue sem.
- **Trabalho guardado**: `Trabalho` é uma chave só (`atual`) no IndexedDB `leitor-ocr`, loja `trabalho`: `{ estado: 'lendo' | 'pronto', arquivos: [File], tipo, rotacao, boxes, quando, papeis? }`. `startReading` grava `lendo` com os arquivos escolhidos (a foto da câmera do computador vira um arquivo antes); `lerAgora` grava `pronto` com os papéis (`papelGuardavel`: tudo menos a imagem, que volta do arquivo, e as palavras do OCR); `stashEdits` regrava o que a pessoa digitou; Salvar e Descartar apagam. Os comprovantes de exemplo não são guardados.
- **Retomar**: `retomarTrabalho()` ao abrir o app: um trabalho de hoje em `lendo` reabre os arquivos (`Leitura.abrir`), devolve as caixas dos papéis e chama `executeOCR()` ("Continuando a leitura que foi interrompida"); um `pronto` monta `papers` com os resultados guardados e mostra na hora, sem OCR ("A leitura terminou enquanto você estava fora"). Trabalho de mais de um dia é apagado.
- **Aviso antes de sair**: `beforeunload` só enquanto `lendo`.
- **Pílula de andamento** (`#pilulaLeitura`): aparece quando a leitura corre e a pessoa está em outra aba do app, com o texto do andamento; um toque volta para Capturar.

É a parte da leitura do módulo `Fundo` da diretriz SolverONE, sem a lista de trabalhos nem a notificação do sistema (regra zero: entram quando o dono pedir).

## Privacidade

- Tudo é lido no aparelho. Nada sai para a internet, com duas exceções que a pessoa controla em Ajustes: com internet, o **número do CNPJ** de uma loja fora da base vai para a consulta pública de CNPJ (dados abertos da Receita), para o app mostrar o nome e a categoria da loja (nunca a foto, o valor ou o cartão); e, só quando a pessoa manda (botão "Ler com IA" ou a opção "usar a IA sozinho"), **a foto do papel** vai para a IA da chave dela (Google ou Anthropic), com aviso antes.
- O catálogo marca a classe de cada tipo: `financeiro`, `saude`, `pessoal`, `biometrico`. Na leitura por IA online (capacidade `ia`), saúde, documento pessoal e rosto perguntam sempre antes de a foto sair, a cada vez; comprovantes e notas perguntam até a pessoa pedir para não perguntar mais.
- Cartão: só os 4 últimos dígitos são lidos e guardados.
- O repositório é público: nunca colocar foto real, número de cartão, CPF ou qualquer dado pessoal, nem em teste. Os testes geram material fictício.

## O que ainda não está aqui (diretriz SolverONE, regra zero: confirmar com o dono antes)

Dos níveis com internet (PEDIDOS.md, 28), o B (sem IA) está na 0.7.8: loja pelo CNPJ na Receita e o botão da nota na Sefaz (ler os dados da nota na Sefaz exigiria um servidor; o leitor de português mais preciso foi medido e descartado). O C (com IA) está na 0.8.0 (`leitura/ia.js`, seção "Ler com IA"); o app sempre funciona sem internet. o resto do módulo `Fundo` da diretriz (a leitura já segura a tela, continua e retoma: 0.8.1; faltam a lista de trabalhos, a chamada da IA guardada e o aviso do sistema com o app fechado), telas em PT e EN, `versoes.json` e novidades em Ajustes, `PENDENCIAS.md`, `janela.js` nas janelas, arrastar e soltar ou colar arquivo, compartilhar para o app (`share_target`), fila de arquivos com progresso e aviso de duplicado, medir a nitidez antes de aceitar a foto, preferência Wi-Fi/dados para baixar o pesado, código do app com "rede primeiro".
