# Um só motor de leitura para todos os apps (estratégia, 9/10/2026)

Escrito para o Marcelo, em resposta a "tenho várias frentes mexendo em câmera e OCR ao mesmo tempo; quero um produto de ponta, modular, que os apps filhos copiem". Vale como combinado entre os chats de cada app.

## 1. O problema, visto no código de hoje

Quatro leitores de foto diferentes, cada um numa frente, cada um refazendo o que o outro já resolveu:

| Onde | O que tem de bom | O que falta |
|---|---|---|
| **leitor-ocr** (este repositório) | Leitura medida foto a foto (gabarito, 0 valor errado), tipo de documento, vários papéis, mesma compra, QR/código de barras, PDF, sem internet | Câmera ao vivo só no computador; nenhum leitor de rótulo ou laudo |
| **HyperNutry** (`js/v-scan.js`, `js/ocr.js`, `js/ia-visao.js`) | A melhor câmera: escolhe a lente principal, foco contínuo, foca onde toca, lanterna, trocar câmera, foto em resolução cheia; leitores de rótulo nutricional e bioimpedância; IA de visão pela chave da pessoa (cofre `DGO.ia`) | Leitura sem medição; motor OCR genérico; cada melhoria da câmera custou três versões (0.4.2, 0.4.3, 0.4.4) |
| **OmniLife ONE** (`index.html`) | Pergunta antes de baixar coisa pesada (`Net.askHeavy`) | Câmera em 640×480 (não dá para ler letra pequena); Tesseract do CDN (precisa de internet) |
| **Módulo comum `diretrizes.js`** (DGO 1.3.1, mestre no RootifyONE) | Já é copiado idêntico para todos os apps; cofre de chaves de IA; regra Wi-Fi/dados | Seção de OCR genérica (lê texto, não entende documento); desligada no HyperNutry |

Resultado: a mesma correção é paga três vezes (em tokens e em bugs), e nenhum app tem o melhor de todos.

## 2. A proposta: o "Módulo de Leitura SolverONE"

Um módulo único, no mesmo espírito do `diretrizes.js` (copiado idêntico para cada app, versionado, com um arquivo de configuração por app), **cuidado em um só lugar: este repositório**, que já é o laboratório (fotos de teste, gabaritos, roteiros de medição, notas de decisão).

- O módulo **não** entra dentro do `diretrizes.js`: ele já tem 5.580 linhas e cuida de outra coisa (idioma, login, anúncios, cofre). O módulo de leitura usa o que o `diretrizes.js` oferece (o cofre `DGO.ia` para a IA online, a regra de rede) e a seção de OCR do `diretrizes.js` é aposentada quando os apps migrarem (no chat do RootifyONE, depois).
- O app `index.html` deste repositório vira o **app de referência**: usa o módulo exatamente como um app filho usaria. Se funciona aqui, funciona lá.

### As camadas do módulo (uma pasta `leitura/`, sem build, arquivos simples)

| Arquivo | Faz | Vem de |
|---|---|---|
| `leitura/captura.js` | Câmera que foca (lente principal, foco contínuo, toque para focar, lanterna, trocar câmera, foto em resolução cheia), aviso de **foto desfocada** antes de ler, várias fotos, PDF, câmera do computador | HyperNutry (câmera) + leitor-ocr (arquivos, PDF) |
| `leitura/imagem.js` | Achar os papéis na foto, endireitar, limpar fundo, recortar | leitor-ocr |
| `leitura/ocr.js` | O motor de texto (Tesseract hospedado), as várias leituras e a concordância entre elas; **trocável** por um motor melhor sem mexer no resto | leitor-ocr |
| `leitura/codigos.js` | QR e código de barras: leitor nativo do aparelho quando existe (rápido) e ZXing/jsQR quando não (iPhone) | HyperNutry + leitor-ocr |
| `leitura/texto.js` | Entender texto: valor, data, CNPJ, chave da nota, estabelecimento, números com unidade (g, mg, kcal), impresso ou à mão | leitor-ocr + HyperNutry |
| `leitores/*.js` | Um arquivo por tipo de documento: cartão, nota fiscal, conta, livre, **rótulo nutricional, bioimpedância** (do HyperNutry), depois boleto, receita, laudo, documento, escola... Cada um com seus sinais de detecção, campos e pasta de gabarito | leitor-ocr + HyperNutry |
| `leitura/online.js` | Opcional: "tentar com a IA" pela chave da pessoa, pelo cofre `DGO.ia` (mesmo padrão do `ia-visao.js`); nunca por padrão em documento pessoal ou de saúde; resultado marcado "lido na nuvem" | HyperNutry |
| `leitura/ui.js` | Telas prontas, opcionais: pop-up do tipo, vários papéis, abas, campos para conferir, tela da câmera | leitor-ocr |
| `leitura.js` | A porta de entrada: `Leitura.iniciar(config)`, `Leitura.ler(foto, { tipo })`, `Leitura.abrirCamera()`; `leitura/VERSAO` e `leitura/versoes.json` (mesmo padrão dos apps); `leitura/LEIA-ME.md` de 2 páginas com o passo a passo de copiar | novo |

Os pacotes pesados continuam nas pastas `tesseract/` e `libs/` (pdf.js, ZXing, jsQR), copiadas junto.

### Como um app filho usa

1. Copia as pastas `leitura/`, `leitores/`, `tesseract/` e `libs/` (não carrega da internet: funciona sem conexão e sem problema de origem). O módulo traz a lista dos seus arquivos para o `sw.js` do app.
2. Põe `<script src="leitura.js">` e um `leitura-config.js` de 10 linhas (quais leitores ligar, tipo padrão, textos).
3. Chama `Leitura.ler(foto, { tipo: 'cartao' })` e recebe os campos prontos (ou usa as telas do `leitura/ui.js`).
4. No `CLAUDE.md` do app entra a regra: **"pasta leitura/ é do leitor-ocr, idêntica em todos os apps, não editar aqui; pedido de mudança vai para o chat do leitor-ocr"** (a mesma regra que o `diretrizes.js` já tem).

## 3. Regras de trabalho para gastar menos (tokens e retrabalho)

1. **Um chat dono de câmera e leitura: este.** Os outros chats não corrigem câmera nem OCR; registram o pedido. Foi o paralelismo que custou três versões de câmera no HyperNutry e uma câmera de 640 px no OmniLife.
2. **Pedidos chegam em `PEDIDOS.md` aqui** (você cola o que cada app precisa, uma linha por pedido); eu ordeno por valor e medição.
3. **Cada entrega sai com uma nota "para o chat do app"** (`para-o-chat-do-HyperNutry.txt`, como você já faz entre OmniLife e MoneyTrio): quais pastas copiar, as 5 linhas de código, como testar. O chat do app faz a troca em minutos e abre o PR dele.
4. **Nada muda na leitura sem medir antes e depois**, com a mesma tabela de sempre. As fotos ficam fora dos repositórios, numa pasta por tipo de documento; essa coleção é o que faz o motor ficar melhor que os concorrentes, porque cada melhoria é provada.
5. **Os chats dos apps leem só o `leitura/LEIA-ME.md`**, não o motor. As decisões ficam nas `NOTAS` daqui.
6. **Migração um app por vez, no chat dele, um PR por app**, só depois de o módulo estar medido aqui. Nunca em dois chats ao mesmo tempo (é onde nascem os conflitos).

## 4. O que faz o motor ser "de ponta" (em ordem de ganho)

1. **A foto**: 80% do erro de leitura nasce na câmera. Lente certa, foco, aviso de desfoque e guia de enquadramento antes de ler.
2. **Entender o documento**, não só o texto: tipo detectado, campo vital conferido por duas leituras, vazio em vermelho em vez de valor errado, vários papéis, mesma compra. Já está aqui, medido.
3. **IA online como ajuda, não como base**: pela chave da pessoa, só com um toque, com as regras de privacidade. Resolve as fotos difíceis sem depender de internet para o resto.
4. **Motor de texto trocável**: hoje Tesseract; experiência marcada para testar um motor de rede neural no navegador (PaddleOCR/RapidOCR via ONNX, 10 a 15 MB), que costuma ler muito melhor foto de cupom. Entra só se a tabela de medição mostrar ganho.
5. **Código de barras nativo** com reserva ZXing (resolve a pendência do iPhone do HyperNutry).
6. **Aprender com as correções**: o que a pessoa corrige nos campos pode virar, com um toque e só nas suas fotos, um item de gabarito novo. A coleção cresce sozinha.

## 5. Próximos passos (ordem proposta)

| Etapa | Onde | O que | Como se mede |
|---|---|---|---|
| 8 | leitor-ocr | Separar o `index.html` em `leitura.js` + `leitura/` + `leitores/`; `LEIA-ME.md`, `VERSAO` 1.0.0; o app de referência passa a usar o módulo | As 37 fotos e o `testes/offline.js` dão o mesmo resultado de antes |
| 9 | leitor-ocr | Trazer a câmera do HyperNutry para `leitura/captura.js` (lente, foco, lanterna, foto cheia) + aviso de desfoque + código de barras nativo | Fotos tiradas pela tela nova, medidas no celular por você; nada piora nas 37 |
| 10 | chat do HyperNutry | Trocar `v-scan.js`/`ocr.js` pelo módulo; os leitores de rótulo e laudo viram `leitores/rotulo.js` e `leitores/bioimpedancia.js` (medidos aqui com fotos de rótulo) | Nota "para o chat do HyperNutry" + PR lá |
| 11 | chat do MoneyTRIO | Foto de comprovante vira gasto (leitores cartão, nota, conta já prontos); entrega pela ponte `ecossistema.ponte.v1` ou direto | Nota "para o chat do MoneyTrio" + PR lá |
| 12 | leitor-ocr | `leitura/online.js` pelo cofre `DGO.ia`, com as regras de privacidade | Fotos difíceis (vazio/incerto) viram certo com a IA, sem valor errado novo |
| 13 | chat do OmniLife ONE, depois RootifyONE | Trocar a câmera de 640 px e o Tesseract do CDN pelo módulo; aposentar a seção de OCR do `diretrizes.js` | PR em cada um |
| 14+ | leitor-ocr | Novos leitores por valor: boleto/conta pela linha digitável, receita, laudo, documento, escola, etiqueta, garrafa...; experiência do motor neural | Gabarito por tipo |

## 6. Decisões que são suas (responda com um "ok" ou mude)

1. O módulo mora **neste repositório** (não dentro do `diretrizes.js`/RootifyONE). Recomendo sim.
2. Os apps **copiam as pastas** (não carregam de solverone.com.br/leitor-ocr/). Recomendo copiar: funciona sem internet e sem problema de origem; custo é 13 MB por app.
3. Ordem de migração: **HyperNutry primeiro** (a câmera dele é a melhor e a dor está lá), depois MoneyTRIO. Se o dinheiro for mais urgente, inverte.
