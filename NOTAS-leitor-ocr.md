# Leitor de Comprovantes (OCR) — notas para quem for mexer

Arquivo: `index.html` (antes era `leitor-ocr.html` no repositório FeatureTesting). Lê a foto da via do cliente de maquininha de cartão e preenche os campos (Estabelecimento, CNPJ, Valor, Data, Hora, Bandeira, Modalidade, Terminal, NSU/DOC, Autorização, AID, Via). Os comprovantes salvos ficam no `localStorage` do navegador (chave `comprovantes`).

**O valor é o campo mais importante.** Foi a razão das últimas mudanças.

## Como a leitura funciona

O motor é o Tesseract.js 5.1.1 em português (`por`, modelo `4.0.0_best_int`). Ele fica na pasta `tesseract/` do próprio repositório, e não mais no jsDelivr: `tesseract.min.js`, `worker.min.js`, os dois núcleos `tesseract-core-simd-lstm.wasm.js` e `tesseract-core-lstm.wasm.js` (o navegador escolhe o que suporta) e `por.traineddata.gz`. São exatamente os arquivos que o app baixava do jsDelivr antes, conferidos byte a byte. O `index.html` aponta para eles com endereços absolutos (`OCR_BASE`), porque o motor roda num worker em blob e caminhos relativos não funcionam lá.

1. `estimateAngles(img)` mede a inclinação do comprovante. Ela marca a tinta com um limiar local, projeta a tinta em ângulos de -87° a +87° (passo de 3°) e escolhe o ângulo em que as linhas de texto ficam mais nítidas. Cada ponto é dividido entre as duas linhas vizinhas; sem isso, os ângulos diagonais (±45°) ganhavam sempre por engano.
2. `buildOcrCanvas(img, ângulo, binarizar, largura)`:
   - gira a foto no ângulo pedido (qualquer ângulo, não só 90°);
   - acha o papel como a maior área clara da foto e recorta;
   - amplia até a largura pedida (no máximo 3×);
   - opcionalmente aplica limiar adaptativo (Bradley, janela = largura/32, T = 0,15).
3. Antes de ler, o app pergunta **o que é a foto** (pop-up `askDocType`, com o último tipo usado sugerido). Os tipos estão em `DOC_TYPES`: cada um diz quais campos são vitais (`vitais`), que palavras denunciam o tipo (`sinais`), que palavras acompanham o valor (`palavras`) e que linhas nunca têm o valor (`ignorar`: itens, tributos, gorjeta, troco, parcela...). Hoje existem: comprovante de maquininha (`cartao`), nota fiscal/cupom (`nfce`), conta de restaurante (`conta`), texto livre (`livre`) e "não sei, descobrir" (`auto`, que escolhe pelos `sinais` e cai em `livre` com menos de 3 sinais). Para ensinar um tipo novo basta uma entrada nessa tabela.
4. `executeOCR()` faz até 4 leituras da mesma foto e **só aceita o valor quando duas leituras concordam**:
   1. endireitada (inclinação medida em `cropPaper`, que recorta o bloco de texto ou o papel antes de medir), em tons de cinza, largura 1000
   2. como foi fotografada, em tons de cinza, largura 1000
   3. endireitada, em tons de cinza, largura 1400
   4. endireitada, preto e branco, largura 1000

   Leituras repetidas são descartadas. Para na primeira concordância, ou depois de 20 segundos com pelo menos duas leituras. Tipos sem valor (texto livre) fazem uma leitura só.

   **Foto de lado, de cabeça para baixo ou papel que o app não achou:** quando a primeira leitura sai com menos de 8 palavras confiáveis (`goodWords`), entra o modo de recuperação. Ele lê, numa cópia de 900 px, o bloco de texto (`findTextBox`: marcas de tinta do tamanho de letras, agrupadas numa grade; cai no papel `findPaperBox` se não achar) em até 8 posições: a inclinação medida e seus três giros de 90°, mais os quatro giros "secos" para o caso de a inclinação estar errada. Fica com a posição em que o motor leu mais palavras confiáveis (para assim que uma dá 12 ou mais, ou depois de 12 segundos), recorta pelas caixas das palavras lidas (`textRegion`) e refaz as leituras normais nesse recorte, ampliando até 4×. Quando nenhuma posição lê e o bloco de texto é pequeno na foto, o aviso pede para fotografar mais de perto.

   **Fundo da foto:** em tons de cinza, cada pixel é comparado com a média da vizinhança (janela = largura/32): mesa escura ou fundo azul viram branco e só a tinta fica escura. Sem isso o Tesseract tomava o comprovante rosa sobre fundo azul por uma figura e devolvia nada, mesmo com o recorte perfeito.
5. `parseDocument(texto, tipo)` extrai os campos e `findMoney` lista os candidatos a valor:
   - linhas com palavras de `ignorar` são puladas inteiras;
   - antes de procurar, apaga CNPJ, datas, horas e número de cartão (`****9458`);
   - corrige leituras erradas de "R$" (RS, R5, H$, K$...) e aceita "$" (recibos americanos) e vírgula de milhar ("7,050,00");
   - dá pontos a cada número com cara de dinheiro: +4 se vem depois de "R$", +3 se a linha tem uma palavra de `palavras` (TOTAL, VALOR PAGO, CRÉDITO... "1otal" e "T0TAL" contam), +1 se o mesmo número aparece em mais de uma linha; em caso de empate ganha o maior;
   - **um número sem "R$" e sem palavra-chave nunca vira valor** (era a maior fonte de valores errados);
   - "R$35096" (vírgula perdida) só vale com palavra-chave na linha, e ainda precisa de outra leitura concordando.
   - Data: só datas reais (dia 1-31, mês 1-12; documentos de dinheiro entre 2010 e o ano que vem), a mais repetida entre todas as leituras. Hora: só com ":" ou "H", de preferência na mesma linha da data, a mais repetida entre as leituras.
6. `finishReading(leituras, tipo)` decide: valor confirmado (duas leituras iguais), **incerto** (leituras discordaram ou só uma achou: o campo fica vazio e os valores lidos viram botões para tocar) ou não lido. O selo no alto diz qual dos três aconteceu, em vez da porcentagem antiga. Também rotula a foto como texto impresso, com partes à mão/apagadas ou parecendo escrito à mão, pela proporção de palavras em que o motor confiou (`classifyTextKind`): é só um aviso, a pessoa confirma. O botão "Trocar tipo" reaproveita as leituras sem ler de novo, e quando o texto parece outro tipo aparece "Parece ser: ...".
7. **Estabelecimento** (`pickEstablishment`): olha as linhas de todas as leituras com a confiança que o motor deu a cada uma (`res.data.lines`). Ganha a linha confiável que parece nome de empresa (LTDA, RESTAURANTE, POSTO, DROGARIA...), vem depois de "COMPRA" (Stone) ou divide a linha com o CNPJ (o CNPJ é tirado e o resto fica). Descarta endereço, cidade/UF, bandeira de cartão, rótulos (VIA CLIENTE, DANFE, PROTOCOLO, ORDER, CASHIER...), linhas com preço e linhas em que a maioria das palavras não parece palavra.
8. **Chave de acesso** (`parseChave`): 44 dígitos em grupos de 4, com dígito verificador (módulo 11). Quando a leitura passa na conferência, dela saem o CNPJ, o número da nota e o mês de emissão; a data lida só fica se for desse mês, senão troca por outra data lida que seja, ou fica vazia. A chave também pode vir do QR code.
9. **QR code e código de barras** (`readCodes`): ZXing (todos os formatos) e jsQR (só QR, aguenta melhor foto), guardados em `libs/`. Roda depois do OCR, em até quatro tentativas (2000 px e 1300 px, em pé e de lado), parando na primeira que lê ou em uns 2,5 segundos. O que lê vira campo "QR code" ou "Código de barras".
10. `renderFieldsEditor()` mostra **sempre** o campo Valor nos tipos de dinheiro. Quando não foi confirmado, ele fica vazio, em vermelho, com "Não detectado — digite aqui". O vermelho some quando a pessoa digita ou toca num dos botões de valor.

Cada comprovante salvo guarda o `tipo`, e o histórico mostra o tipo no cartão. No console do navegador, `window.ocrDebug` tem as leituras, os candidatos e os sinais de tipo da última foto.

## Decisões tomadas (e por quê)

- **Campo vazio em vermelho é melhor que valor errado.** Tentativas extras com giros de 90° e ampliação maior chegaram a ler R$ 64,00 e R$ 36.020,00 num comprovante de R$ 84,00. Foram retiradas.
- **Duas leituras precisam concordar.** Uma leitura sozinha errava dígito ("R$ 711,61" num papel de R$ 71,61) com toda a cara de certa. Exigir concordância custa tempo (a foto fácil leva 2 leituras em vez de 1), mas zerou os valores errados. Quando as leituras discordam, mostrar os valores lidos como botões é melhor que escolher um: a pessoa decide com um toque.
- **O tipo do documento manda na leitura.** Numa nota fiscal, o número ao lado de "Tributos" ou de um item nunca é o total; num pedido médico não existe valor. Perguntar o tipo antes de ler deixa o app esperar os campos certos e ignorar o resto.
- **Fundo neutralizado antes de ler.** O comprovante da Atlas Estacionamentos (rosa sobre azul) saía vazio em qualquer modo de segmentação de página, e lido direito em preto e branco: o problema era o Tesseract tratar a área escura como figura. Comparar cada pixel com a média da vizinhança resolve sem o custo de binarizar tudo, e de quebra a DrogaRaia passou a ler R$ 71,61 certo.
- **Giro descoberto pelo próprio motor.** Medir a inclinação pela projeção da tinta não distingue 0° de 180° nem acerta em mesa com letras gravadas; contar palavras confiáveis em cada posição distingue. Só roda quando a primeira leitura sai ruim, para não encarecer a foto normal.
- **Nome do estabelecimento pela confiança do motor, não pela posição.** A primeira linha da foto costuma ser lixo (borda, mesa, cabeçalho do papel); a linha que o motor leu com confiança e tem cara de nome é bem mais segura. As linhas vêm com a confiança do próprio Tesseract.
- **Chave de acesso conferida pelo dígito verificador.** Uma chave lida com erro é descartada em vez de contaminar CNPJ e número da nota; a que passa serve para validar o mês da data.
- **Duas leituras iguais só confirmam se foram processadas diferente** (outro tamanho, giro ou preto e branco). Dois recortes do mesmo tamanho repetiam o mesmo erro de dígito ("57,57" num cupom de 57,52) e se "confirmavam".
- **As leituras foram escolhidas por teste, não por chute.** Uma grade de 20 combinações (5 ângulos × cinza/preto e branco × largura 1000/1400) em 6 fotos reais mostrou que só as três primeiras acertam algum valor; a largura 1400 voltou como terceira leitura porque serve de segunda opinião para confirmar o valor (5 fotos passaram de incerto a confirmado com ela).
- **Os 3 botões de exemplo** (Posto Ipiranga, Pizzaria Bella, Drogasil) continuam funcionando e servem de teste rápido; entram como comprovante de maquininha sem passar pelo pop-up.

## Resultado nos testes (6 fotos reais, recebidas pelo WhatsApp e por isso comprimidas)

| Comprovante | Resultado |
|---|---|
| Getnet R$ 694,95 | certo |
| Laranjinha/Itaú R$ 332,22 | certo |
| iFood Pago R$ 350,96 | certo |
| Cielo R$ 4,20 (muito apagado, amassado, foto girada ~120°) | não lido → campo vermelho |
| Auto Posto Cergal R$ 194,35 (reflexo e dobra em cima do valor) | não lido → campo vermelho |
| Estacionamento R$ 84,00 (impressão muito clara) | não lido → campo vermelho |

Antes dessas mudanças só o Getnet saía certo. O Cielo não foi lido em nenhuma das 20 combinações, mesmo com a imagem na posição certa: ampliados, os traços se juntam em manchas.

As fotos **não estão no repositório**, porque têm dados pessoais e o repositório é público. Se precisar testar com fotos reais, peça ao Marcelo que mande na conversa e não as grave no repositório.

## Como testar sem celular

Tudo roda num Chromium invisível, sem internet:

```
node testes/medir.js /pasta/com/as/fotos            # todas as fotos da pasta
node testes/medir.js /pasta/com/as/fotos f05.jpeg   # só uma
```

Precisa de Node e do Playwright com Chromium (no ambiente do Claude já vem instalado). O script sobe um servidor local com o repositório, abre o `index.html`, envia cada foto pelo botão Galeria e lê os campos que apareceram na tela. Qualquer pedido para fora do servidor local é bloqueado e listado no fim: se o app tentar buscar algo na internet, aparece ali.

Se a pasta tiver um `gabarito.json`, o script imprime a tabela certo/vazio/errado (formato explicado no começo do `testes/medir.js`). As fotos, o gabarito e o `_resultado.json` (que tem o texto lido) ficam **fora do repositório**, porque têm dados pessoais.

## Resultado nos testes (17 fotos reais pelo WhatsApp, 8/10/2026)

Conjunto novo, com mais tipos de papel: 2 pedidos médicos (sem valor), 4 notas fiscais NFC-e, 1 conferência de conta de restaurante, 3 fotos com vários comprovantes juntos, 4 comprovantes girados ou de cabeça para baixo e o resto comprovantes de maquininha normais. Medição com o app da etapa 1 (antes de qualquer mudança na leitura):

| Campo | Certo | Vazio | Errado |
|---|---|---|---|
| Valor | 6 | 6 | 5 |
| Data | 8 | 6 | 3 |
| Estabelecimento | 1 | - | 12 |

Os 2 pedidos médicos saíram vazios, que é o certo, e estão contados nos 6 certos do valor. Os 5 valores errados eram o problema principal: linha de tributos ("R$ 0,00") e preço de item lidos como total numa nota fiscal, item de conta lido como total, e dígito a mais ("711,61" num papel de 71,61).

## Resultado da etapa 2 (36 fotos, 8/10/2026)

As 17 acima mais 19 originais do celular: comprovantes Stone e InfinitePay, conta de gás e de luz, DANFE, NFC-e de farmácia, 6 cupons americanos (dois com gorjeta à mão), cartão de vacina, recibo manuscrito, comprovante de comparecimento preenchido à mão, receita impressa e uma redação à mão. Tipo escolhido no pop-up como a pessoa escolheria:

| Campo | Certo | Incerto, certo entre as opções | Incerto | Vazio | Errado |
|---|---|---|---|---|---|
| Valor | 16 | 4 | 5 | 11 | 0 |
| Data | 25 | - | - | 7 | 4 |
| Estabelecimento | 5 | - | - | - | 21 |

Com "não sei, descobrir" em todas, o app acertou o tipo em 27 das 36 e o valor ficou: 16 certos, 3 + 4 incertos, 13 vazios, 0 errados. Tempo médio por foto no servidor de teste: 9.0 s (no celular, espere o dobro ou o triplo).

O que ainda fica vazio ou incerto: fotos giradas de lado ou de cabeça para baixo (etapa 3), papéis pequenos numa foto grande e fotos com vários comprovantes (etapa 5), conta de luz e de gás com o valor numa coluna separada do rótulo (leitor próprio de contas) e a nota com pouca luz. Nenhum valor errado é mostrado como certo.

## Resultado da etapa 3 (37 fotos, 8/10/2026)

As mesmas da etapa 2 mais a caixa de sabonete de cabeça para baixo. Tipo escolhido no pop-up:

| Campo | Certo | Incerto, certo entre as opções | Incerto | Vazio | Errado |
|---|---|---|---|---|---|
| Valor | 24 | 5 | 1 | 7 | 0 |
| Data | 26 | - | - | 7 | 4 |
| Estabelecimento | 3 | - | - | - | 23 |

Tempo médio por foto no servidor de teste: 12.7 s. Passaram a ler ou a confirmar: o Stone girado de lado (original do celular), o Stone da Atlas (fundo azul), a caixa de sabonete de cabeça para baixo, a conta de gás, o InfinitePay, a DrogaRaia (agora R$ 71,61 certo), a Drogaria São Paulo e os cupons da Shell, IHOP e Five Guys. O tempo médio subiu porque as fotos difíceis passam pelo modo de recuperação; as fáceis continuam em 2 a 4 segundos. Continuam vazios os quatro comprovantes girados do WhatsApp (f10, f11, f14, f15): com 960 px de largura e o papel ocupando um terço da foto, as letras têm 5 a 7 px e nenhuma posição lê; são o caso de pedir a foto original ou mais de perto.

## Resultado da etapa 4 (37 fotos, 8/10/2026)

Mesmo conjunto da etapa 3. Tipo escolhido no pop-up:

| Campo | Certo | Incerto, certo entre as opções | Incerto | Vazio | Errado |
|---|---|---|---|---|---|
| Valor | 24 | 5 | 1 | 7 | 0 |
| Data | 27 | - | - | 7 | 3 |
| Estabelecimento | 8 | - | - | - | 18 |

Estabelecimento passou de 3 para 8 certos entre as 26 fotos com gabarito de nome. QR code ou código de barras lidos em 3 fotos do conjunto (o conjunto tem poucos códigos; em testes à parte, 6 de 13 fotos com código foram lidas: QR em tela, QR e EAN em caixa de produto, QR em etiqueta de peça, EAN em pote de iogurte fotografado de lado; falham o QR de NFC-e em papel térmico amassado, o código de barras ITF da conta de gás e o Code 128 do DANFE). Tempo médio por foto: 13.4 s.

## Pendências conhecidas (ninguém pediu ainda)

- **Estabelecimento:** quando o motor não lê nenhuma linha com confiança, o nome sai embaralhado ou vazio; o lixo antes do nome ("E CARRDEENNAS FENIX ENVIDRACAMENTO LTDA") ainda não é cortado.
- **Códigos em papel térmico:** o QR da NFC-e amassada e os códigos de barras finos (ITF da conta de gás, Code 128 do DANFE) não leem nas fotos atuais; uma foto mais de perto, só do código, resolve.
- **Conta de luz e de gás:** o valor fica numa coluna separada do rótulo "Total a pagar", então as regras por linha não acham; a linha digitável do código de barras carrega o valor e resolve isso (leitor próprio de contas).
- **Rótulo impresso/à mão:** é calculado pela confiança do motor por palavra. Foto escura de texto impresso também sai como "parece escrito à mão ou apagado"; por isso o rótulo diz "ou apagado" e não decide nada sozinho.
- **Vários papéis na mesma foto:** sai só um valor (etapa 5).
- **Fotos pequenas do WhatsApp com o papel longe:** não há o que ler; o app avisa "tire mais de perto".

Resolvidas na etapa 2: hora pegando o ano ("26:13"), selo de confiança mentindo, Autorização pegando "POSTO".
