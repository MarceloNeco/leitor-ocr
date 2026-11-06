# MODELOS.md — leitura de documentos por modelo (template), sem IA

Pedido do Marcelo em 06/11/2026 (vindo do chat do MoneyTRIO): um leitor de arquivos compartilhado por todos os
apps SolverONE, orientado a **modelos** e sem depender de IA. Mora no motor de leitura (`leitura.js`,
`leitura/modelos.js`, `dados/modelos.json`), não dentro de cada app. Este arquivo é a especificação; o
`ARQUITETURA.md` diz onde cada coisa fica no código.

## 1. A ideia em uma frase

Um **modelo é só dados** (JSON): diz como reconhecer um documento conhecido (a fatura do cartão Porto, o
extrato do FGTS, o boleto da escola...) e onde está cada campo. O motor interpreta o modelo. Documento novo
ou layout que mudou = modelo novo ou atualizado **em um lugar só**, e todos os apps daquele tipo de
documento recebem a mudança. Nada de código novo por documento.

## 2. Benchmark curto: como os outros fazem

| Ferramenta | Como funciona | O que vale copiar |
|---|---|---|
| **invoice2data** (código aberto, Python) | Um modelo por fornecedor em YAML/JSON: `keywords` (regex que precisam **todos** bater para o modelo valer), `exclude_keywords` (se bater, não é este modelo), um regex por campo (ou uma lista, para quando o texto muda), opções (formato de data, moeda), e um bloco `lines` com `start`/`end` para a tabela de itens. Trabalha no texto extraído do PDF. | Exatamente o nosso desenho: sinais que precisam todos bater, "exclui", campos por regex, tabela entre início e fim. Copiamos também a regra "todo modelo tem campos obrigatórios". |
| **Camelot / Tabula** (código aberto) | Tabelas de PDF. Modo *lattice*: acha as linhas desenhadas da grade. Modo *stream*: sem grade, acha as colunas pelos espaços em branco entre as palavras, usando a **posição de cada palavra** na página. | O modo *stream*: o nosso `formatos/pdf.js` já guarda a posição (x0, x1) de cada pedaço de cada linha; o campo `onde: "coluna"` e as tabelas usam isso. |
| **Docparser / Parseur** (pagos) | A pessoa sobe uma amostra, **desenha zonas** em volta dos campos e amarra cada zona a um rótulo (âncora) ou padrão. Regras por posição fixa quebram quando o layout muda; regras por âncora aguentam melhor. Tabelas são uma regra à parte. | A âncora: rótulo → valor na mesma linha, na linha de baixo ou na coluna. E o "ensinar" tocando nos campos (o plano de criar modelo pelo usuário). Evitamos posição fixa como regra principal. |
| **Mindee, AWS Textract, Google Document AI** (IA, pagos) | Modelos prontos (fatura, recibo) e modelos treinados com amostras. Cada campo vem com um **grau de confiança**; o cliente define limites para aprovar sozinho ou mandar para conferência humana. | A confiança por campo e a regra "abaixo disso, conferir": aqui ela vem das **conferências** (soma que fecha, dígito verificador, campo vital presente) e não de uma probabilidade. E o caminho com IA fica só como ajuda opcional, com a chave da pessoa. |

Fontes: README e tutorial do invoice2data (github.com/m3nu/invoice2data e invoice2data.readthedocs.io),
documentação do Camelot (camelot-py.readthedocs.io, "How it works"), ajuda do Docparser (help.docparser.com,
"parsing rules") e comparações Parseur × Docparser (parseur.com), documentação do Mindee (docs.mindee.com,
"confidence score"). Consultadas em 06/11/2026.

## 3. O formato do modelo (versão 1)

Um arquivo `dados/modelos.json` com `{ "versao": 1, "modelos": [ ... ] }`. Cada modelo:

| Campo | O que é |
|---|---|
| `id` | Nome único, em letras minúsculas e hífens (`escola-boleto-matricula`). Nunca muda. |
| `versao` | Número que sobe a cada mudança no modelo. |
| `nome` | `{ "pt": "...", "en": "..." }`, o que a pessoa vê ("Lido pelo modelo ..."). |
| `tipo` | Um tipo do catálogo (`leitura/catalogo.js`): diz a família, o app dono e a classe de privacidade. Com "Não sei, descobrir", o tipo do modelo vence. |
| `apps` | Opcional; o catálogo já diz. |
| `sinais` | Lista de regex (sem acento, maiúsculas): **todos** precisam bater no texto para o modelo valer. |
| `exclui` | Lista de regex: se **um** bater, não é este modelo. |
| `impressao` | Rótulos fixos que o layout tem ("ALUNO", "VENCIMENTO", "VALOR BRUTO"...). A fração presente (0 a 1) é a **impressão do layout**; abaixo de `impressaoMinima` (padrão 0,6) o motor avisa que o documento mudou. Entre dois modelos que batem, ganha a maior impressão. |
| `campos` | `{ "Nome do campo": { ancora, onde, pega, n, indice, ate, inteira } }`, na ordem em que aparecem na tela. |
| `tabela` | Opcional: `{ inicio, fim, colunas, nomes, minimo, anoDe }` para a lista de itens (lançamentos, etapas). |
| `classes` | Opcional: `{ "nome": "<regex>", ... }`, em ordem; dá a `classe` de cada item e a `divisao` por classe (abaixo). |
| `vitais` | Campos que não podem faltar; faltando, o modelo "falhou". |
| `conferencias` | Lista de regras (abaixo). Qualquer uma falhando, o modelo "falhou". |
| `amostra` | Caminho da amostra-esqueleto em `dados/amostras/` (texto do pdf.js, dígitos → 0, nomes → X). |
| `aposentado`, `validoAte`, `substitui` | Ciclo de vida (seção 5). |

**Um campo** (`campos`):

- `ancora`: regex do rótulo, testado linha a linha no texto normalizado (maiúsculas, sem acento).
- `n`: qual ocorrência da âncora (1 = primeira, padrão; -1 = última).
- `onde`: `mesma-linha` (o valor depois do rótulo; com `inteira: true`, a linha toda), `linha-abaixo` (a
  primeira das `ate` linhas seguintes, padrão 3, que tem algo do tipo pedido) ou `coluna` (pelas posições do
  PDF: o pedaço de uma linha de baixo que fica embaixo do rótulo, como "Vencimento" num boleto; sem
  posições, cai em `linha-abaixo`).
- `pega`: `dinheiro` (vira número), `data` (dd/mm/aaaa), `cnpj` (só com os dígitos verificadores certos),
  `numero`, `texto` (o resto da linha, sem os dois-pontos) ou `regex:<expressão>` (o primeiro grupo).
- `indice`: qual valor do tipo no trecho (0 = primeiro; padrão: o último).

**A tabela** (`tabela`): da linha depois de `inicio` até a linha que bate com `fim`; cada linha vira um item
pelas `colunas` na ordem (`data`, `texto`, `dinheiro`, `numero`): os valores saem da direita para a esquerda,
a data da esquerda, e o que sobra é o `texto`. Linha que não tem a forma é pulada. `nomes` dá o nome de cada
coluna no item; com `data`, `descricao` e `valor`, os itens viram lançamentos no formato combinado dos apps
(ver `ARQUITETURA.md`, "Lançamentos"). Com `anoDe: "Vencimento"`, uma data sem ano ("30/09", como nas faturas de
cartão) ganha o ano desse campo, ou o anterior quando ficaria depois dele (fatura de janeiro com compras de dezembro).

**As classes** (`classes`): `{ "consorcio": "\\bCONSORCIO\\b", "anuidade": "\\bANUIDADE\\b", ... }`. A primeira regex
que bate na descrição (maiúsculas, sem acento) dá a `classe` do item; sem nenhuma, `outros`. O resultado traz
`divisao`: `{ classe: { total, quantos } }`. É com isso que um app reparte um débito (as 7 cartas de consórcio da
fatura Porto são 7 itens `consorcio`, na ordem impressa); o que fazer com cada classe é decisão do app.

**As conferências** (`conferencias`):

| `tipo` | Regra |
|---|---|
| `soma` | `de` (campos; `-X` subtrai) tem que dar `igual` (1 centavo de folga). |
| `igual` | o campo `a` igual ao `b`. |
| `presente` | os `campos` não podem estar vazios. |
| `cnpj` | o `campo` tem os dígitos verificadores certos. |
| `soma-itens` | a `coluna` dos itens somada tem que dar `igual`. `somente: "positivos"` (ou `"negativos"`) soma só esses; `mais: ["Saldo anterior", "-X"]` soma campos junto. |
| `ultimo-item` | a `coluna` do último item tem que ser `igual` (o saldo no fim do extrato). |

`opcional: true` numa regra faz ela passar quando falta o campo que ela usa. `nome` é a frase que a pessoa vê
quando a regra falha ("bruto menos desconto não dá o valor a pagar").

Exemplo (o boleto da matrícula, encurtado):

```json
{ "id": "escola-boleto-matricula", "versao": 1, "tipo": "boleto",
  "nome": { "pt": "Boleto da matrícula (escola)" },
  "sinais": ["PARCELA DA ANUIDADE", "VALOR A PAGAR", "VENCIMENTO"],
  "impressao": ["\\bALUNO\\b", "MATR[IÍ]CULA", "VALOR BRUTO", "BENEFICI[AÁ]RIO", "VENCIMENTO"],
  "campos": {
    "Valor bruto": { "ancora": "PARCELA DA ANUIDADE", "n": -1, "onde": "linha-abaixo", "pega": "dinheiro", "indice": 0 },
    "Desconto":    { "ancora": "PARCELA DA ANUIDADE", "n": -1, "onde": "linha-abaixo", "pega": "dinheiro", "indice": 1 },
    "Valor":       { "ancora": "PARCELA DA ANUIDADE", "n": -1, "onde": "linha-abaixo", "pega": "dinheiro", "indice": 2 },
    "Vencimento":  { "ancora": "^VENCIMENTO", "onde": "coluna", "pega": "data" } },
  "vitais": ["Valor", "Vencimento"],
  "conferencias": [{ "tipo": "soma", "de": ["Valor bruto", "-Desconto"], "igual": "Valor", "nome": "bruto menos desconto não dá o valor a pagar" }] }
```

## 4. Como o motor usa o modelo

1. **Reconhecer**: ao ler um arquivo com texto (PDF com texto, TXT, DOCX, CSV, planilha), as páginas do
   mesmo arquivo são juntadas (um PDF = um documento) e o texto é comparado com os modelos ativos: valem os
   que têm todos os `sinais` e nenhum `exclui`; empate pela impressão do layout, depois pela quantidade de
   sinais, depois o modelo ensinado no aparelho. Com um tipo escolhido pela pessoa, só valem modelos desse tipo.
2. **Ler**: cada campo pela âncora; a tabela; as conferências. O resultado do papel mostra os campos do
   modelo primeiro (o que a leitura comum achou só completa com o resumo dos lançamentos), e a situação diz
   `Lido pelo modelo "X": conferido` ou `Modelo "X": <o que falhou>`.
3. **Falhou**: campo vital vazio, conferência que não fecha ou impressão do layout abaixo do mínimo. O app
   avisa "o documento parece ter mudado de formato", **o valor não entra sozinho** (vira opção para a pessoa
   conferir: antes vazio do que errado), e a falha é contada no aparelho (`leitor_modelos_falhas`, por `id`),
   para um dia o RootifyONE somar as falhas por modelo.
4. **Foto**: por enquanto os modelos valem só para texto exato. Na foto (OCR) o texto tem erros; a leitura de
   foto continua pelos leitores de hoje e é medida à parte (canhotos e exames), e nada disto mexe nela.

## 5. Ciclo de vida

- **Adicionar**: um modelo novo entra no catálogo com `versao: 1` e a sua amostra-esqueleto.
- **Substituir**: layout mudou → o mesmo `id`, `versao` + 1, campos ajustados, amostra nova. O `id` nunca muda,
  porque os apps guardam `{ id, versao }` no que leram.
- **Aposentar**: `aposentado: true` (ou `validoAte: "aaaa-mm-dd"`): o modelo fica no arquivo (histórico) mas
  não é usado. Ex.: um banco em que a pessoa fechou a conta.
- **De onde vem**: hoje `dados/modelos.json` no repositório do leitor (o `sw.js` guarda no aparelho: funciona
  sem internet). Depois, o catálogo publicado pelo RootifyONE (`solverone-dados/modelos.json`, como os outros
  arquivos master), com a cópia local como reserva. Formato igual; muda só a fonte.
- **Modelos da pessoa** (ensinados no aparelho, `Leitura.modelos.adicionar`): ficam em `localStorage`
  (`leitor_modelos_pessoais`), têm preferência sobre o catálogo, valem só para aquela família. A tela de
  "ensinar" (tocar nos campos) ainda não existe: é a próxima etapa.
- **Subir para todos**: decisão do dono (depois): só com o OK dele, ou sozinho depois de passar em amostras
  de 2 famílias diferentes.

## 6. Privacidade e amostras (LGPD)

- **Nenhum dado pessoal num modelo**: só regras (rótulos, posições, tipos). Nunca um nome, valor, CPF ou
  número de conta.
- **Amostra = esqueleto**: o texto que o próprio motor tira do PDF (`pdf.js`; nunca o `pdftotext`, que
  quebra as linhas de outro jeito e já fez um boleto passar no teste e falhar no app), com os **dígitos
  trocados por 0** (valores, datas, CPF, CNPJ, códigos) e os **nomes de pessoas trocados por X** (o que vem
  depois de "Nome", "Aluno", "Cliente", "Titular", "Sacado", "Pagador", "Beneficiário"...; e-mails viram
  `XXX@XXX.XXX`). Os rótulos ficam, porque são eles que fazem o modelo. `Leitura.esqueleto(texto)` gera isso
  no aparelho; a pessoa confere antes de o esqueleto sair.
- O esqueleto é o que vai para fora quando a pessoa pede ajuda (RootifyONE, IA com a chave dela, ou o serviço
  pago de um dia): nunca o documento.
- Documentos de **saúde, pessoais e de rosto** (classes do catálogo) seguem a regra de sempre: nada sai sem a
  pessoa escolher, e a IA pergunta a cada vez.

## 7. Quem pode publicar

| Quem | O quê |
|---|---|
| **Dono (Marcelo), no RootifyONE** | Sobe o esqueleto, marca ou aprova os campos, testa nas amostras, publica para todos os apps do tipo. |
| **Usuário sem IA** | "Ensina" tocando nos campos do próprio documento; o modelo vale só para a família dele. |
| **Usuário com chave de IA** | A IA propõe o **modelo** (as regras, a partir do esqueleto); o motor aplica e precisa chegar ao mesmo resultado com as somas fechando; vale na hora para a família. A plataforma só recebe o modelo, sem valores, e só com o OK da pessoa. |
| **Serviço pago** (decisão do dono, depois) | Quem não tem IA sobe o esqueleto e recebe o modelo. Fica preparado como opção desligada no RootifyONE. |

## 8. Como criar um modelo hoje (sem a tela do RootifyONE)

1. Abra o documento no leitor (`solverone.com.br/leitor-ocr`), em "Não sei, descobrir". O texto que o motor
   tirou está em `window.ocrDebug.readings[0].text` (console do navegador) ou no campo "Texto" quando o
   documento cai em texto livre.
2. Gere o esqueleto: `Leitura.esqueleto(texto)`. Confira se não sobrou dado pessoal e salve em
   `dados/amostras/<id>.txt`.
3. Escreva o modelo em `dados/modelos.json` (seção 3): sinais (3 rótulos que só esse documento tem),
   impressão (6 a 8 rótulos fixos), campos por âncora, tabela, vitais, conferências.
4. Teste com um documento de mentira em `testes/offline.js` (item 16) e, com o documento real, no app.
5. Publique (pull request e merge). Os apps recebem o modelo na próxima abertura com internet.

## 9. Primeiros modelos (pela ordem do pedido) e o que falta

| # | Modelo | Situação |
|---|---|---|
| 1 | **Fatura do cartão Porto (PDF)**: cartas de consórcio por grupo e cota, seguro do carro, anuidade, crédito de pontos; a fatura só diz como **dividir** o débito automático do Itaú ("DEB AUTOR PORTOSEG"), sem duplicar; sem fatura no mês, vale a última divisão | **Feito na 0.9.1** (`porto-fatura-cartao`), a partir da fatura real (a amostra-esqueleto fica em `dados/amostras/`). Lê total, vencimento, pagamento mínimo, saldo anterior, pagamentos, despesas, fechamento da próxima e os lançamentos (data sem ano completada pelo vencimento); confere saldo anterior − pagamentos + despesas = total e compras = despesas. **A fatura não diz grupo nem cota**: as 7 cartas vêm como 7 itens da classe `consorcio`, na ordem impressa, e a `divisao` traz o total e a quantidade por classe (`consorcio`, `anuidade`, `seguro`, `pontos`, `pagamento`, `outros`); ligar cada parcela à cota (pelo valor, ou ensinado uma vez) e a regra "só divide o débito do Itaú; sem fatura, vale a última divisão" ficam no MoneyTRIO. As classes `seguro` e `pontos` foram previstas sem amostra (a fatura recebida não tinha seguro nem crédito de pontos): confirmar com uma fatura que os tenha. |
| 2 | Extrato do BS2 em PDF | Precisa da amostra. OFX e CSV já funcionam pelo leitor de lançamentos. |
| 3 | Contrato da escola + boleto da matrícula | **Feitos** (`escola-contrato`, `escola-boleto-matricula`), a partir das amostras-esqueleto do MoneyTRIO (`modulos/compromisso-de.js`, `teste/teste-contrato-fgts.js`). Os boletos das mensalidades entram quando houver amostra. |
| 4 | Extrato do FGTS (PDF) | **Feito** (`fgts-extrato`), a partir da amostra do MoneyTRIO (`modulos/fgts.js`). |
| 5 | Apólice de seguro do carro (OmniLifeONE) | **Travado pela amostra**: a apólice recebida (Porto, PDF de 19 páginas) não tem camada de texto (as letras são desenho vetorial, sem fonte): o pdf.js não tira nada e o app só a leria por OCR, página a página (10 páginas, minutos no celular). Modelo por texto só com um PDF que tenha texto (o "documento da apólice" do app ou do portal da seguradora costuma ter); por OCR fica como pendência (modelo tolerante a erros de leitura). O que o modelo vai tirar quando houver amostra: seguradora, apólice, item, vigência, veículo e placa, coberturas com LMI e prêmio, franquias, prêmio total, parcelas, telefones de assistência, corretor. |

## 10. Notas para os outros chats (eles não mexem em leitura; recebem daqui)

- **Para o chat do MoneyTRIO**: o motor de modelos está no leitor-ocr (`leitura/modelos.js`,
  `dados/modelos.json`). Quando o motor for copiado para o MoneyTRIO (PR próprio), `modulos/compromisso-de.js`
  (contrato e boleto da escola) e `modulos/fgts.js` (extrato do FGTS) passam a chamar
  `Leitura.ler(fontes, { tipo: 'auto' })` e a ler `papel.result.modelo` (`{ modelo: { id, versao, nome, tipo },
  fields, campos, itens | tabela, divisao, conferido, falhas }`), em vez dos regex próprios. A área única "Carregar
  arquivos" nasce daí: o motor descobre o tipo (modelo ou leitor) e devolve para onde mandar. A divisão da
  fatura Porto já vem no modelo `porto-fatura-cartao` (0.9.1): `result.modelo.divisao` (total e quantidade por
  classe) e `classe` em cada lançamento (`consorcio`, `anuidade`, `seguro`, `pontos`, `pagamento`, `outros`); a
  fatura não diz grupo nem cota, então ligar cada parcela de consórcio à cota (pelo valor, ou ensinado uma vez) e
  a regra "a fatura só divide o débito do Itaú (DEB AUTOR PORTOSEG); sem fatura no mês, vale a última divisão"
  ficam no app, não no modelo.
- **Para o chat do OmniLifeONE**: a apólice da Porto que chegou é um PDF sem camada de texto (seção 9, item 5):
  por enquanto o app a leria só por OCR, 10 páginas, lento. Quando houver um PDF com texto, o modelo sai; até lá,
  "Vida do carro" (notas e serviços por foto, com IA) pode usar a leitura por foto com IA que já existe no motor
  (`leitura/ia.js`, 0.8.0).
- **Para o chat do RootifyONE**: a tela "Modelos de documentos" (catálogo, amostras-esqueleto, testar,
  publicar em `solverone-dados/modelos.json`, aposentar, falhas por modelo, opção paga desligada) lê e escreve o
  formato da seção 3; o leitor já conta falhas por modelo no aparelho (`Leitura.modelos.falhas()`).

## 11. Decisões do dono que ficam para depois

- O serviço pago (esqueleto sobe, modelo volta).
- A regra de "subir sozinho para todos" (2 famílias ou o OK dele).
