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
3. `executeOCR()` faz até 4 tentativas e **para na primeira que encontra o valor**:
   1. endireitada, em tons de cinza, largura 1000
   2. como foi fotografada, em tons de cinza, largura 1000
   3. endireitada, preto e branco, largura 1000
   4. de cabeça para baixo, preto e branco, largura 1000

   As tentativas repetidas são descartadas, então quando o ângulo detectado é 0 sobram três.
4. `parseReceiptText(texto)` extrai os campos. Para o valor:
   - antes de procurar, apaga CNPJ, datas, horas e número de cartão (`****9458`);
   - corrige leituras erradas de "R$" (RS, R5, H$, K$...);
   - dá pontos a cada número com cara de dinheiro: +4 se vem depois de "R$", +2 se a linha tem VALOR, TOTAL, APROVAD, VENDA, CREDITO, DEBITO, PAGAR ou PAGO; em caso de empate ganha o maior;
   - entende "R$35096" (vírgula perdida) como R$ 350,96.
5. `renderFieldsEditor()` mostra **sempre** o campo Valor. Quando não foi lido, ele fica vazio, em vermelho, com "Não detectado — digite aqui". O vermelho some quando a pessoa digita, e o aviso no rodapé pede para digitar o valor.

## Decisões tomadas (e por quê)

- **Campo vazio em vermelho é melhor que valor errado.** Tentativas extras com giros de 90° e ampliação maior chegaram a ler R$ 64,00 e R$ 36.020,00 num comprovante de R$ 84,00. Foram retiradas.
- **As tentativas foram escolhidas por teste, não por chute.** Uma grade de 20 combinações (5 ângulos × cinza/preto e branco × largura 1000/1400) em 6 fotos reais mostrou que só as três primeiras tentativas acima acertam algum valor.
- **Os 4 botões de exemplo** (Posto Ipiranga, Pizzaria Bella, Drogasil) continuam funcionando e servem de teste rápido.

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

Conjunto novo, com mais tipos de papel: 2 pedidos médicos (sem valor), 4 notas fiscais NFC-e, 1 conferência de conta de restaurante, 3 fotos com vários comprovantes juntos, 4 comprovantes girados ou de cabeça para baixo e o resto comprovantes de maquininha normais. Medição com o app desta versão (antes de qualquer mudança na leitura):

| Campo | Certo | Vazio | Errado |
|---|---|---|---|
| Valor | 6 | 6 | 5 |
| Data | 8 | 6 | 3 |
| Estabelecimento | 1 | - | 12 |

Os 2 pedidos médicos saíram vazios, que é o certo, e estão contados nos 6 certos do valor. Os 5 valores errados são o problema principal: linha de tributos ("R$ 0,00") e preço de item lidos como total numa nota fiscal, item de conta lido como total, e dígito a mais ("711,61" num papel de 71,61). Os vazios são as fotos giradas, a nota com pouca luz e as fotos com vários papéis.

## Pendências conhecidas (ninguém pediu ainda)

- **Hora:** às vezes pega o ano mais a hora. Em "12/06/26 13:24:24" saiu "26:13".
- **Confiança:** o selo verde continua mostrando "88% de confiança" mesmo quando nada foi lido, o que contradiz o alerta vermelho.
- **Estabelecimento:** costuma sair embaralhado, porque ele usa a primeira linha do texto quando não acha LTDA, POSTO etc.
- **Autorização:** a expressão pega "POSTO" (de AUTO POSTO) ou "RIZACAO" (de AUTORIZACAO) em vez do número.
