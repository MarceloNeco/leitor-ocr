# Leitor de Comprovantes (OCR) — notas para quem for mexer

Arquivos: desde a 0.7.0 (etapa 8), o motor de leitura está em módulos (`leitura.js`, `leitura/`, `leitores/`, `formatos/`) e o `index.html` é só a tela; o mapa e o jeito de outro app usar o motor estão em `ARQUITETURA.md`. As funções citadas abaixo (`findPapers`, `readPaper`, `buildResult`...) continuam com o mesmo nome, cada uma no módulo do assunto. Antes era tudo no `index.html` (e antes ainda, `leitor-ocr.html` no repositório FeatureTesting). Lê a foto da via do cliente de maquininha de cartão e preenche os campos (Estabelecimento, CNPJ, Valor, Data, Hora, Bandeira, Modalidade, Terminal, NSU/DOC, Autorização, AID, Via). Os comprovantes salvos ficam no `localStorage` do navegador (chave `comprovantes`).

**O valor é o campo mais importante.** Foi a razão das últimas mudanças.

## Como a leitura funciona

O motor é o Tesseract.js 5.1.1 em português (`por`, modelo `4.0.0_best_int`). Ele fica na pasta `tesseract/` do próprio repositório, e não mais no jsDelivr: `tesseract.min.js`, `worker.min.js`, os dois núcleos `tesseract-core-simd-lstm.wasm.js` e `tesseract-core-lstm.wasm.js` (o navegador escolhe o que suporta) e `por.traineddata.gz`. São exatamente os arquivos que o app baixava do jsDelivr antes, conferidos byte a byte. O `leitura/foto.js` aponta para eles com endereços absolutos (`OCR_BASE`), porque o motor roda num worker em blob e caminhos relativos não funcionam lá.

1. `estimateAngles(img)` mede a inclinação do comprovante. Ela marca a tinta com um limiar local, projeta a tinta em ângulos de -87° a +87° (passo de 3°) e escolhe o ângulo em que as linhas de texto ficam mais nítidas. Cada ponto é dividido entre as duas linhas vizinhas; sem isso, os ângulos diagonais (±45°) ganhavam sempre por engano.
2. `buildOcrCanvas(img, ângulo, binarizar, largura)`:
   - gira a foto no ângulo pedido (qualquer ângulo, não só 90°);
   - acha o papel como a maior área clara da foto e recorta;
   - amplia até a largura pedida (no máximo 3×);
   - opcionalmente aplica limiar adaptativo (Bradley, janela = largura/32, T = 0,15).
3. Antes de ler, o app pergunta **o que é a foto** (pop-up `askDocType`, com o último tipo usado sugerido). Os tipos estão no catálogo (`leitura/catalogo.js`) e cada tipo com leitor próprio tem um arquivo em `leitores/` (antes era a tabela `DOC_TYPES`): cada um diz quais campos são vitais (`vitais`), que palavras denunciam o tipo (`sinais`), que palavras acompanham o valor (`palavras`) e que linhas nunca têm o valor (`ignorar`: itens, tributos, gorjeta, troco, parcela...). Hoje existem: comprovante de maquininha (`cartao`), nota fiscal/cupom (`nfce`), conta de restaurante (`conta`), texto livre (`livre`) e "não sei, descobrir" (`auto`, que escolhe pelos `sinais` e cai em `livre` com menos de 3 sinais). Para ensinar um tipo novo: um arquivo em `leitores/` (passo a passo no `ARQUITETURA.md`). Os outros 50 tipos do catálogo (boleto, receita, RG, boletim, rótulo, esteira...) já aparecem no pop-up em "Outros tipos" e são lidos como texto livre, guardando o tipo escolhido.
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
   - antes de procurar, apaga CNPJ, datas, horas e número de cartão (`****1234`);
   - corrige leituras erradas de "R$" (RS, R5, H$, K$...) e aceita "$" (recibos americanos) e vírgula de milhar ("7,050,00");
   - dá pontos a cada número com cara de dinheiro: +4 se vem depois de "R$", +3 se a linha tem uma palavra de `palavras` (TOTAL, VALOR PAGO, CRÉDITO... "1otal" e "T0TAL" contam), +1 se o mesmo número aparece em mais de uma linha; em caso de empate ganha o maior;
   - **um número sem "R$" e sem palavra-chave nunca vira valor** (era a maior fonte de valores errados);
   - "R$35096" (vírgula perdida) só vale com palavra-chave na linha, e ainda precisa de outra leitura concordando.
   - Data: só datas reais (dia 1-31, mês 1-12; documentos de dinheiro entre 2010 e o ano que vem), a mais repetida entre todas as leituras. Hora: só com ":" ou "H", de preferência na mesma linha da data, a mais repetida entre as leituras.
6. `finishReading(leituras, tipo)` decide: valor confirmado (duas leituras iguais), **incerto** (leituras discordaram ou só uma achou: o campo fica vazio e os valores lidos viram botões para tocar) ou não lido. O selo no alto diz qual dos três aconteceu, em vez da porcentagem antiga. Também rotula a foto como texto impresso, com partes à mão/apagadas ou parecendo escrito à mão, pela proporção de palavras em que o motor confiou (`classifyTextKind`): é só um aviso, a pessoa confirma. O botão "Trocar tipo" reaproveita as leituras sem ler de novo, e quando o texto parece outro tipo aparece "Parece ser: ...".
7. **Estabelecimento** (`pickEstablishment`): olha as linhas de todas as leituras com a confiança que o motor deu a cada uma (`res.data.lines`). Ganha a linha confiável que parece nome de empresa (LTDA, RESTAURANTE, POSTO, DROGARIA...), vem depois de "COMPRA" (Stone) ou divide a linha com o CNPJ (o CNPJ é tirado e o resto fica). Descarta endereço, cidade/UF, bandeira de cartão, rótulos (VIA CLIENTE, DANFE, PROTOCOLO, ORDER, CASHIER...), linhas com preço e linhas em que a maioria das palavras não parece palavra.
8. **Chave de acesso** (`parseChave`): 44 dígitos em grupos de 4, com dígito verificador (módulo 11). Quando a leitura passa na conferência, dela saem o CNPJ, o número da nota e o mês de emissão; a data lida só fica se for desse mês, senão troca por outra data lida que seja, ou fica vazia. A chave também pode vir do QR code.
9. **QR code e código de barras** (`readCodes`): ZXing (todos os formatos) e jsQR (só QR, aguenta melhor foto), guardados em `libs/`. Roda depois do OCR, em até quatro tentativas (2000 px e 1300 px, em pé e de lado), parando na primeira que lê ou em uns 2,5 segundos. O que lê vira campo "QR code" ou "Código de barras".
10. **Vários papéis na foto** (`findPapers`): numa cópia pequena, as manchas claras grandes o bastante para ser um papel e com texto em cima (pelo menos 15 letras em 3 linhas) viram caixas. Papéis encostados saem como uma mancha só; quando as letras dela têm uma faixa em branco atravessando (as margens de dois papéis), a mancha é cortada pela faixa mais larga, de um lado e de outro, até não sobrar faixa; um pedaço que fica sem 3 linhas de texto (o "obrigado" no fim de um cupom) não vira papel. Faixas escuras impressas numa conta (cabeçalhos da conta de gás) partem o papel em tiras claras: tiras que quase se encostam e têm os dois lados alinhados são coladas de volta. Papéis um em cima do outro continuam juntos. Com duas ou mais caixas, o app mostra a foto com as caixas numeradas e pergunta "Ler os N separados?" (`askPapers`); dizendo sim, cada caixa é recortada em resolução cheia (`cropBox`) e passa pela mesma leitura de um papel só (`readPaper`), com uma diferença desde a 0.7.0: o papel recortado é lido inteiro, sem procurar o papel de novo dentro dele (`buildOcrCanvas` com a região `'all'`). Antes, essa segunda procura ficava com a maior área clara e, numa via com o quadro escuro em volta do valor, cortava a via ao meio (valor, data e final do cartão do lado de fora) e a parte de baixo da conta (a data). O resultado fica em abas ("Papel 1 · R$ 45,00"), cada uma com seus campos; o que a pessoa digita numa aba é guardado ao trocar (`stashEdits`), e Salvar grava um comprovante por aba.
11. **Mesma compra em dois papéis** (`linkSamePurchase`): dois papéis da mesma foto com o mesmo valor confirmado e sem data diferente ganham o campo "Mesma compra: papel N" e um aviso. É o caso do cartão da maquininha e da nota fiscal da mesma compra.
12. **Versão visível**: `APP_VERSION` e `APP_UPDATED` no começo do script aparecem no cabeçalho ("v0.6.0 de 09/10/2026"). A cada etapa publicada, os dois sobem, **e também `VERSAO` no `sw.js`** (é ela que faz o celular trocar a cópia guardada pela nova).
13. `renderFieldsEditor()` mostra **sempre** o campo Valor nos tipos de dinheiro. Quando não foi confirmado, ele fica vazio, em vermelho, com "Não detectado — digite aqui". O vermelho some quando a pessoa digita ou toca num dos botões de valor.

14. **Sem internet e instalável** (`sw.js`, `manifest.webmanifest`, `icons/`): a página não busca mais nada fora do repositório (o CSS do basecoat e a fonte Inter do Google saíram; a fonte do sistema fica no lugar e nada mudou de aspecto). O `sw.js` é um service worker: na primeira visita guarda no aparelho, numa cópia chamada `dgo-leitor-ocr-<versão>`, o básico listado nele (página, motor de leitura sem as partes pesadas, ícones: uns 200 KB) e dali em diante serve tudo da cópia guardada, com ou sem internet. Desde a 0.7.0, as partes pesadas (pastas `tesseract/` e `libs/`: leitor de fotos, de códigos e de PDF, uns 12 MB) não baixam sozinhas, como pede a diretriz: ficam guardadas na primeira vez que são usadas, ou de uma vez em Ajustes → Usar sem internet → "Guardar tudo", que mostra o que já está guardado. Elas moram numa cópia própria (`dgo-leitor-ocr-pesado-1`) que passa de uma versão para a outra; ao atualizar da 0.6 para a 0.7, o que já estava guardado é aproveitado. Todos os apps do solverone.com.br dividem o mesmo endereço e, com ele, as cópias guardadas: ao trocar de versão, o leitor apaga só as cópias dele (nome começando por `dgo-leitor-ocr-`, ou o nome velho `leitor-ocr-`). Até a 0.6.0 ele apagava a de todos os apps, e quem abria o leitor perdia o modo sem internet do HyperNutry, do OmniLife e dos outros até abri-los de novo com internet; corrigido na 0.6.1, com verificação no `testes/offline.js`. Quando a versão muda, o navegador baixa a cópia nova por trás e a página mostra "Nova versão pronta — Atualizar". O manifesto deixa o Chrome oferecer "Instalar" (botão em Ajustes → Usar sem internet, quando o navegador permite; senão, o texto explica o caminho pelo menu).
15. **Arquivos, várias fotos e câmera do computador** (`Leitura.abrir`, `formatos/`, `startReading`): o botão "Fotos ou arquivos" aceita várias fotos e arquivos de uma vez. Cada formato tem seu arquivo em `formatos/`, que só carrega quando chega um arquivo dele: PDF (página com texto é lida direto, sem OCR e sem erro de leitura; página escaneada é desenhada a uns 2200 px e vai para o OCR; até 10 páginas), TXT, DOCX (o texto), CSV, XLSX e OFX (tabelas). O XLSX e o DOCX são zips: abrem com o descompactador do próprio navegador (`formatos/zip.js`), sem biblioteca. Texto de arquivo é exato, então uma leitura basta para o valor ("Valor lido do arquivo"). Tabela com colunas de data e valor (extrato ou fatura exportados pelo banco; OFX sempre) vai para o leitor `extrato`: lista de lançamentos na tela e resumo (período, entradas, saídas, saldo, conta só com os 4 últimos dígitos); o OFX já diz se é extrato ou fatura e não pergunta o tipo. `.xls` e `.doc` antigos são recusados com o motivo e o jeito de resolver. Cada foto e cada página ou aba vira uma "fonte"; cada fonte passa pela mesma leitura de sempre, inclusive a pergunta de vários papéis, e vira uma aba ("Foto 2", "Página 1", "Foto 2 · papel 1"). Com mais de uma fonte, o botão de girar some (ele gira e relê uma foto só). No computador, "Fotografar" abre a câmera ao vivo (`getUserMedia`) num diálogo com "Tirar foto"; no celular continua abrindo o app de câmera.

16. **Pagamento dividido e minha parte** (`leitura/relacoes.js`): numa leitura com uma conta (ou nota) e vias de cartão, as vias que somam exatamente o total da conta, ou, sendo a única conta, as vias do mesmo dia (data lida nas duas) que somam menos que ela, viram "Pago em partes" na conta (com o que falta, pago por outra pessoa ou de outro jeito) e "Parte da conta" em cada via. O papel de cada um sai do texto (`detectDocType`), não só do botão escolhido. Só entram valores confirmados. A via do cartão ganha o campo "Cartão: final 1234" (só os 4 últimos dígitos); tocando em "O cartão final 1234 é meu", esses 4 dígitos ficam guardados no aparelho (`leitor_meus_cartoes`) e as vias passam a dizer "Quem pagou: Você / Outra pessoa", e a conta "Minha parte". A "mesma compra" (passo 11) mudou para esse arquivo também.
18. **Detecção automática da categoria e do tipo** ("Não sei, descobrir", `detectDocType`): primeiro os leitores de dinheiro, como sempre (eles leem o valor e têm a vez); se nenhum reconhece o papel, os outros 52 tipos do catálogo são procurados pelas palavras que os denunciam (`SINAIS` em `leitura/catalogo.js`, 3 ou mais no texto, ganha o que tiver mais). A tela mostra "Categoria › Tipo" (ex.: "Saúde › Receita médica") e o registro guarda o tipo, mesmo que ele ainda seja lido como texto livre. Endereço (rua, avenida) não conta para "placa", porque aparece em quase todo documento.
19. **Documento no app certo** (`Leitura.espiar`, `Leitura.ondeLer`, motor 1.1.0, app 0.7.1): o catálogo diz qual app da SolverONE cuida de cada família; a espiada faz uma leitura só (800 px, sem as conferências) para adivinhar o tipo antes da leitura completa, e `ondeLer` devolve o aviso pronto quando o documento é de outro app. Nas 52 fotos de 17/10: a espiada leva 2,3 s por foto (a leitura completa, 11,2 s), acerta o tipo em 20 (a completa, 25) e dá a mesma resposta da completa em 45. Como se fosse o HyperNutry: avisou em 15 dos 37 documentos de outros apps, sempre indicando o app certo, e em nenhum dos 14 do próprio HyperNutry. No Leitor OCR, que aceita tudo, o tipo aparece com o app de cada documento ("Dinheiro e compras › Comprovante de maquininha · MoneyTRIO"). O `testes/offline.js` confere a espiada e o aviso (27 verificações, todas certas).
20. **PDF com senha** (motor 1.2.0, app 0.7.2): fatura e extrato de banco costumam vir com senha. `Leitura.abrir(arquivos, aviso, pedirSenha)`: o pdf.js avisa que precisa de senha, o motor pergunta ao app (`pedirSenha(nome, errou)`) e tenta de novo; a janela "PDF com senha" avisa a senha errada e deixa pular o arquivo. A senha só abre o arquivo naquele momento: não vai para o `localStorage`, nem para o registro, nem para lugar nenhum. Sem `pedirSenha` (outro app que ainda não pergunta), o PDF volta em `recusados` com o motivo.
21. **Compras de um print de notificação** (`leitores/notificacao.js`; desde a 0.7.5, dentro do leitor de lançamentos, item 28): cada valor "R$" do print é um aviso; o aviso vai do começo dele ("Compra aprovada", "Debitamos", "Você usou", "Pix recebido"...) até o próximo. Dele saem a data e a hora ("em 12/10, às 13h25"; sem ano, é o ano de hoje), a loja ("final 1234 - LOJA valor R$", "R$ 41,00 em LOJA no dia", "de FULANO") e o sinal (recebido, estorno e devolução entram como entrada). Valor de limite ou saldo não é lançamento. A foto é lida duas vezes; o mesmo aviso (mesma data e hora) com valores diferentes fica com o valor lido mais vezes e, empatado, fica de fora com aviso, para nunca entrar valor errado. O resultado é o mesmo do extrato (lançamentos, entradas, saídas), e a tela diz "confirmados em 2 leituras" ou "confira os valores".
22. **Fatura reconhecida como fatura**: a fatura fala de cartão, crédito e débito o tempo todo e era tomada por comprovante de maquininha (página por página, e a página de simulação mostrava R$ 500,00 como valor). Agora, com 6 ou mais sinais de fatura ("pagamento mínimo", "total da fatura", "limite"...), é fatura antes dos leitores de dinheiro, e as outras páginas do mesmo PDF também. Fatura não tem um valor só: o leitor próprio (total, vencimento, lançamentos com a soma conferida) espera o PDF original do banco, com o texto dentro.
23. **Tipo Remédio** (família Saúde, RiseONE): caixa, bula e rótulo da farmácia de manipulação, pelas palavras deles (bula, indicações, solução oral, uso adulto e pediátrico, mg/mL, farmacêutico responsável, CRF, "Prod.:", "Val.:"...). A receita do médico continua com os próprios sinais (receituário, paciente, CRM).
24. **Valor conferido por conta, não por leitura** (motor 1.3.0, app 0.7.3): em documento de banco o valor pode ser conferido pela própria matemática do papel, e aí ele vale mesmo vindo de uma leitura só. Boleto: a linha digitável (47 números) e o código de barras (44) têm 4 dígitos verificadores; deles saem o valor, o vencimento (fator de vencimento, que voltou a 1000 em 22/02/2025) e o banco. Conta de consumo, imposto e multa: o código de arrecadação (48 números, começa com 8) traz o valor e, pelo 2º número, o tipo (luz e gás, água, telefone, prefeitura, multa). NF-e em PDF (DANFE): o total só vale quando produtos + frete + seguro + outras despesas + IPI + ICMS ST − desconto dá ele. Fatura de cartão: as compras só entram quando a soma bate com um total da própria fatura (as compras, ou o saldo anterior mais os lançamentos dando o total); um "- 75,00" que pode ser estorno ou o fim do nome da loja é decidido pela soma. Extrato de conta: o saldo anterior mais os lançamentos tem que dar um saldo impresso. Quando nada fecha, a lista não aparece e a tela diz por quê (até a 0.7.4; desde a 0.7.5 a lista aparece marcada para conferir, item 28).
25. **Documento de contas não é comprovante**: fatura, extrato, prestação de contas do condomínio, informe de Imposto de Renda, extrato de investimento ou previdência e apólice de seguro falam de crédito, débito e valor o tempo todo, e eram tomados por comprovante de maquininha, conta de restaurante ou nota (com valor errado: R$ 4.513,64 num boleto de R$ 1.322,66, R$ 9,90 num de R$ 2.496,20, R$ 800,00 num demonstrativo de reembolso). Agora cada um tem tipo próprio e, com 6 ou mais sinais dele, ganha dos leitores de dinheiro; num PDF de várias páginas o tipo vem do documento inteiro, e as páginas de um documento de contas viram um papel só.
26. **Comprovante de pagamento de boleto**: traz a linha digitável, mas o valor pago pode ser outro (desconto, multa): o Valor é o pago e o do boleto fica em "Valor do boleto". **Comprovante de Pix**: tipo próprio, com o valor e para quem foi.
27. **Moeda**: extrato OFX de conta internacional tem uma conta por moeda; cada uma vira uma aba com o símbolo dela (US$, €, £), e o registro guarda a moeda. Antes, os dólares apareciam como R$.
28. **Um leitor de lançamentos só** (motor 1.4.0, app 0.7.5, `leitores/extrato.js`): extrato de conta, poupança, carteira digital, fatura de cartão e print de notificação, de qualquer banco, em PDF com texto, PDF escaneado ou foto, passam pelo mesmo caminho; não há código por banco. O formato sai do jeito das linhas: a linha que começa com data é um lançamento; o valor está nela, na de cima ou na de baixo (vale o lado que mais aparece no papel); sem histórico na linha da data, a descrição vem das linhas de texto vizinhas (no extrato do Banco do Brasil, o histórico em cima e o detalhe embaixo). O sinal vem do que está escrito (D/C, + e −, parênteses, coluna de débito ou de crédito) ou, sem nada, do costume do papel (no Itaú só a saída tem sinal) e das palavras. O PDF agora entrega onde fica cada pedaço da linha: por ela o leitor separa as colunas de débito e crédito e lê a fatura impressa em duas colunas uma coluna de cada vez, o que dá o cartão certo de cada compra (conferido com os subtotais "Lançamentos no cartão (final ...)" das duas faturas Mastercard: todos batem). O que é de um banco cabe só como dica numa tabela de dados (`DICAS`: palavras do cabeçalho, onde fica o histórico, como marca o sinal); sem dica, o leitor faz igual. O "Repasse de IOF" do Itaú, que tinha regra própria, virou regra geral: linha sem data com encargo (IOF, juros, tarifa) dentro dos lançamentos da fatura entra só se fecha a soma. A soma com o saldo ou o total não decide mais se a lista aparece: quando não fecha, os lançamentos aparecem com `conferido: false` e "a soma não fecha com o saldo (diferença de R$ X)". Pagamento e estorno do mesmo valor no mesmo dia ficam os dois, com `anulado: true` (riscados na tela). Sem lançamento confiável, a tela mostra o texto lido e diz por quê. Na foto, as duas leituras são alinhadas na ordem do papel: o que as duas leram igual fica confirmado; o mesmo lançamento com valor diferente e a linha que junta duas colunas (a data de uma compra com o valor da outra) ficam de fora, contados no aviso. Todo lançamento sai no mesmo formato (ARQUITETURA.md, "Lançamentos"): data, hora, descrição, valor, moeda, entrada, tipo, parcela, final do cartão, conferido, anulado e origem (papel, página, linha). Na compra parcelada, o ano vem da parcela: "13/10 ... 12/12" numa fatura de outubro de 2026 é de 2025.
29. **Loja, produtos e a mesma compra em dois papéis** (motor 1.5.0, app 0.7.6). **Loja**: a razão social é a primeira linha do alto que não é endereço, bairro (o nome que aparece de novo dentro da linha do endereço ou da cidade), cidade, CEP, telefone nem CNPJ; linha com SA, LTDA, CIA, EIRELI ou ME ganha. A raiz do CNPJ (8 primeiros números, conferido pelos dígitos verificadores) acha a rede em `dados/estabelecimentos.json` (25 redes comuns, cada raiz conferida nos dados abertos de CNPJ da Receita): Estabelecimento mostra o nome fantasia, e a razão social e a categoria ganham campos próprios. O nome que a pessoa corrige para um CNPJ fica guardado no aparelho. Correções de leitura que vieram com isso: "CNPI"/"CNPJI" (o J lido errado) não entra no nome; a borda do papel lida como "2 " antes do nome sai; a letra perdida na borda numa leitura ("ADARIA" por "PADARIA") volta pela outra leitura; "Impressão para controle" não é nome de loja. **Produtos**: cada linha de item do cupom (código, descrição, quantidade, unidade, preço, valor), com a quantidade ou o peso na linha de baixo e o "desconto sobre item" na seguinte. Cada produto é conferido pela conta do próprio cupom (quantidade × preço = valor; valor igual ao preço é 1 unidade) e, na foto, pelas várias leituras alinhadas na ordem do cupom (a maior sequência comum); valor que nenhuma conta nem segunda leitura confirma fica de fora. Quando a soma menos os descontos dá o "valor a pagar", os produtos ficam conferidos e confirmam o valor do papel; quando não dá, a lista aparece para conferir com a diferença. **Valor a pagar**: no cupom, o "valor a pagar" (o total depois do desconto) lido igual em duas leituras feitas de jeitos diferentes vale como o valor; antes o app só olhava o "valor total" (antes do desconto), que tem mais destaque, e ficava em dúvida quando as leituras dele não batiam. **Prints**: print de tela escura (modo noturno) é invertido antes do OCR e lido inteiro (antes só o aviso mais claro era recortado, e um "3" virava "8"); a palavra partida no fim da linha volta a ser uma; a data depois do valor só vale se é do próprio aviso ("em 12/10"), não do cabeçalho do aviso seguinte (o Pix que só mostra a hora fica sem data). Dois prints que se cobrem: o mesmo aviso (mesmo valor e cartão, mesma data e hora quando as duas têm, loja parecida) conta no primeiro e fica riscado no outro ("já em Foto 1"); o que ficou herda o que só a cópia inteira mostra (o tipo, a data). **Canhoto e aviso**: a via do cartão e o aviso do banco da mesma compra (mesmo valor e dia, hora até 20 minutos de diferença ou o mesmo final de cartão) ficam ligados: o canhoto ganha "Mesma compra: Foto 2: aviso de 10/10/2026 às 14:07" e o aviso, a marca "mesma compra"; a conta de restaurante e o canhoto de mesmo valor já ficavam ligados ("Mesma compra"). Categoria do lançamento só pela base (o nome de uma rede na descrição); loja desconhecida fica sem categoria.
17. **Leitura sem foto não inventa nada**: se o OCR falhar numa foto de verdade (ex.: sem internet antes de o leitor de fotos estar guardado), aparece um aviso e nenhum campo. Até a 0.6 o app preenchia os campos com um comprovante de exemplo inventado ("AUTO POSTO CENTRAL", R$ 85,00), como se tivesse lido a foto; só os três comprovantes de demonstração continuam com texto próprio.

Cada comprovante salvo guarda o `tipo` (e os lançamentos, quando é extrato), e o histórico mostra o tipo no cartão. No console do navegador, `window.ocrDebug` tem as leituras, os candidatos e os sinais de tipo da última foto.

## Decisões tomadas (e por quê)

- **Campo vazio em vermelho é melhor que valor errado.** Tentativas extras com giros de 90° e ampliação maior chegaram a ler R$ 64,00 e R$ 36.020,00 num comprovante de R$ 84,00. Foram retiradas.
- **Duas leituras precisam concordar.** Uma leitura sozinha errava dígito ("R$ 711,61" num papel de R$ 71,61) com toda a cara de certa. Exigir concordância custa tempo (a foto fácil leva 2 leituras em vez de 1), mas zerou os valores errados. Quando as leituras discordam, mostrar os valores lidos como botões é melhor que escolher um: a pessoa decide com um toque.
- **O tipo do documento manda na leitura.** Numa nota fiscal, o número ao lado de "Tributos" ou de um item nunca é o total; num pedido médico não existe valor. Perguntar o tipo antes de ler deixa o app esperar os campos certos e ignorar o resto.
- **Fundo neutralizado antes de ler.** O comprovante da Atlas Estacionamentos (rosa sobre azul) saía vazio em qualquer modo de segmentação de página, e lido direito em preto e branco: o problema era o Tesseract tratar a área escura como figura. Comparar cada pixel com a média da vizinhança resolve sem o custo de binarizar tudo, e de quebra a DrogaRaia passou a ler R$ 71,61 certo.
- **Giro descoberto pelo próprio motor.** Medir a inclinação pela projeção da tinta não distingue 0° de 180° nem acerta em mesa com letras gravadas; contar palavras confiáveis em cada posição distingue. Só roda quando a primeira leitura sai ruim, para não encarecer a foto normal.
- **Separar papéis pela mancha clara, não pelo texto.** Agrupar as letras em blocos (uma variante testada) separava melhor papéis encostados, mas estourava fotos de um papel só em 3 a 10 pedaços (seções da conta de luz, colunas do comprovante). A mancha clara com o corte por faixas erra para o lado seguro: no máximo junta dois papéis que se tocam. E a pergunta "ler separados?" com a foto marcada deixa a pessoa desfazer um erro de contagem antes de ler.
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

Se a pasta tiver um `gabarito.json`, o script imprime a tabela certo/vazio/errado (formato explicado no começo do `testes/medir.js`). As fotos, o gabarito e o `_resultado.json` (que tem o texto lido) ficam **fora do repositório**, porque têm dados pessoais. A pasta também pode ter PDFs.

O app instalável tem seu próprio teste, sem fotos pessoais (tudo é gerado na hora):

```
node testes/offline.js
```

Ele guarda os arquivos do app, desliga a internet e abre o app de novo (tem que abrir e ler o comprovante de exemplo), manda um PDF de 2 páginas e 2 fotos de uma vez (cada um vira uma aba com seu valor) e testa a câmera do computador com uma câmera falsa do Chromium. Os dois scripts avisam se a versão do `sw.js` não bate com a do `index.html`.

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

## Resultado da etapa 5 (14 fotos, 9/10/2026)

Conjunto novo: 4 fotos com vários comprovantes vindas do WhatsApp, as mesmas 4 em original do celular (4000 px) e 6 fotos de um papel só, de controle, para garantir que nada é separado sem motivo. O roteiro responde à pergunta de ler separados como quem sabe o que fotografou: sim nas fotos com vários papéis, "é um papel só" nas outras.

| | Fotos | Contagem de papéis certa |
|---|---|---|
| Com vários papéis | 8 | 3 |
| Um papel só (controle) | 6 | 6 |

Nos 27 papéis lidos no total (cada aba conta um): valor certo em 17, incerto com o certo entre as opções em 4, incerto em 0, vazio em 6, errado em 0. "Mesma compra" marcada em 4 papéis.

O que falha na contagem: papéis sobrepostos (um em cima do outro, como a foto do Almanara com cinco papéis) saem juntos, porque a mancha clara é uma só e não há faixa em branco entre os textos. Nas fotos do WhatsApp o papel pequeno recortado fica com letras de 5 a 7 px e não lê; nos originais do celular o mesmo papel lê.

**Regressão nas 37 fotos das etapas anteriores** (4 delas têm vários papéis e agora o gabarito diz isso). Na primeira rodada o app ofereceu "ler separados" em 11 fotos de um papel só: faixa clara da mesa, reflexo no granito, piso claro ao lado do papel, o "obrigado" no fim de um cupom tomado por outro papel e a conta de gás partida em tiras pelas faixas escuras impressas. Lendo os pedaços, uma tira da conta de gás deu valor errado (R$ 163,73, que é um subtotal). Correção: um pedaço só vira papel com 3 linhas de texto, e tiras alinhadas que quase se encostam são coladas de volta. Com isso a pergunta sem precisar caiu para 4 fotos (reflexo, piso e madeira clara ao lado do papel); nelas a pessoa toca "É um papel só" e a leitura segue igual à etapa 4.

| Campo | Certo | Incerto, certo entre as opções | Incerto | Vazio | Errado |
|---|---|---|---|---|---|
| valor (43 papéis nas 37 fotos) | 28 | 5 | 1 | 9 | 0 |

Foto a foto, em relação à etapa 4, nada piorou: f07 (nota fiscal + cartão da mesma compra) passou de incerto para certo, porque cada papel é lido sozinho. Os 6 papéis a mais das fotos com vários papéis deram 3 certos, 1 incerto com o certo entre as opções e 2 vazios (papéis pequenos em foto do WhatsApp). As 3 datas erradas são as mesmas da etapa 4.

## Resultado da etapa 7 (app sem internet, 9/10/2026)

Nada mudou na leitura, só na entrada (PDF, várias fotos, câmera do computador) e no empacotamento (sem internet, instalável). Conferido de dois jeitos:

- `node testes/offline.js`: 10 verificações, todas certas (33 arquivos guardados; abre e lê sem internet em 2,5 s; PDF de 2 páginas vira 2 abas com os valores certos; 2 fotos de uma vez viram 2 abas com os valores certos; câmera do computador abre e manda a foto; nenhum pedido para fora; nenhum erro).
- As 14 fotos da etapa 5 de novo: 17 certo, 4 incerto com o certo entre as opções, 0 incerto, 6 vazio, 0 errado, papel por papel igual à etapa 5.

Decisões: o pdf.js vai na versão 5.7 **legacy** (`legacy/build`), porque a 6.x e a 5.7 normal usam um recurso de JavaScript tão novo (`Map.getOrInsertComputed`) que o Chromium 141 do teste, e celulares um pouco mais velhos, não têm. O `sw.js` guarda tudo de uma vez na primeira visita (não aos poucos): simples, e é o que garante que a leitura funcione sem internet logo depois. O arquivo único (`index.html` com tudo dentro, para copiar para o celular) ficou para depois: o motor OCR busca o idioma e o núcleo por `fetch`, que o Chrome não deixa fazer de `file://`; precisa embutir tudo em base64 e testar.

## Resultado da etapa 8 (motor em módulos, arquivos e pagamento dividido, 17/10/2026)

**A separação em módulos não mudou a leitura.** Com o código separado e antes da correção abaixo, as 51 fotos deram o mesmo valor, data e estabelecimento papel por papel; a única diferença foi o campo novo "Cartão: final ..." em 4 vias (e o lixo lido como estabelecimento numa foto em que ele já estava errado).

**Papel recortado lido inteiro** (só muda fotos com vários papéis; as de um papel só seguem o mesmo caminho de antes):

| Conjunto | Valor certo | Incerto, certo entre as opções | Incerto | Vazio | Errado |
|---|---|---|---|---|---|
| 14 fotos com vários papéis (27 papéis), antes | 17 | 4 | 0 | 6 | 0 |
| 14 fotos com vários papéis (27 papéis), depois | 18 | 3 | 0 | 6 | 0 |
| 37 fotos das etapas 2 a 5 (43 papéis), antes | 28 | 5 | 1 | 9 | 0 |
| 37 fotos das etapas 2 a 5 (43 papéis), depois | 28 | 5 | 1 | 9 | 0 |

Data e estabelecimento ficaram empatados nas 14 (um papel ganhou e outro perdeu em cada); nas 37, uma data a menos e um estabelecimento a mais, no mesmo papel.

**Pagamento dividido na foto real** (conta de 4 pessoas, R$ 404,54, e a via do cartão da pessoa, R$ 314,54): antes da correção, a via saía cortada ao meio e sem valor, e nada era ligado; depois, os dois valores e as duas datas saem certos, a conta ganha "Pago em partes: papel 2 R$ 314,54 · faltam R$ 90,00" e a via "Parte da conta: papel 1, total R$ 404,54".

**`testes/offline.js`**: 26 verificações, todas certas: a cópia de outro app continua lá; na primeira visita só o básico (24 arquivos) é guardado e o leitor de fotos não baixa sozinho; depois do primeiro uso ele fica guardado e o exemplo é lido **pelo OCR** sem internet; "Guardar tudo" guarda foto, PDF e códigos; PDF com texto (sem OCR) e escaneado (com OCR); 2 fotos; TXT, CSV de banco em Windows-1252, OFX de fatura (sem perguntar o tipo), XLSX com datas do Excel, DOCX com tabela; uma receita médica fictícia reconhecida como "Saúde › Receita médica"; `.xls` recusado com o motivo; conta paga em 2 partes e "O cartão final 1234 é meu" mostrando a minha parte; câmera; nenhum pedido para fora e nenhum erro.

Decisões: o leitor de XLSX e DOCX não usa biblioteca (são zips de XML; o navegador descompacta); o OFX é lido pelas etiquetas, que servem para as versões 1 e 2; tabela de banco sem cabeçalho tem as colunas descobertas pelo que as células parecem (data, valor, a mais comprida é a descrição); a "minha parte" usa só os 4 últimos dígitos do cartão, guardados no aparelho quando a pessoa toca no botão, nunca adivinhados.

**Detecção automática do tipo**, nas 52 fotos novas de 17/10 lidas com "Não sei, descobrir" (gabarito só de tipo, com mais de um tipo aceito quando a foto é as duas coisas):

| | Tipo certo |
|---|---|
| Antes (só os leitores de dinheiro) | 12 de 52 |
| Com as palavras de cada tipo do catálogo | 25 de 52 |

Nenhuma foto que acertava passou a errar, e a detecção dos comprovantes não mudou. Passaram a acertar: prints de notificação de compra, ingresso com texto, CNH (frente), rótulos de informação nutricional, bioimpedância e os pedidos médicos. Ainda erram: 11 comprovantes girados ou pequenos que a leitura em si não pega bem no modo automático, 4 visores de esteira (números de LED, que o OCR não lê: falta a capacidade "visor"), 4 telas de rótulo enquadradas nos ingredientes (saem como "Ingredientes" em vez de "Informação nutricional"), embalagens e garrafa com letra artística, o verso da CNH, um ingresso só com QR code e dois prints.

Fotos novas recebidas em 17/10 (52): prints de notificação de compra e de aplicativo de banco, ingressos com QR code, visores de esteira, CNH, rótulos e garrafas (inclusive pote redondo), pedidos médicos, bioimpedância e mais comprovantes. Servem de gabarito para os leitores próprios desses tipos, um por vez, por ordem de valor.

## Resultado da 0.7.2 (PDF com senha, prints de notificação, remédio e fatura, 18/10/2026)

**Prints de notificação** (2 prints de 12/10, cada um em duas versões: a do WhatsApp e a mais nítida; 12 compras no total):

| | Compras certas | Faltaram | A mais |
|---|---|---|---|
| Antes (só o texto, nenhum lançamento) | 0 | 12 | 0 |
| Depois | 12 | 0 | 0 |

Todas com data e hora, menos a recarga da Tag no print do banco (o próprio aviso não traz a data). Na versão nítida do print de mensagens, uma compra só apareceu numa das leituras (a outra leu um traço no meio do valor): ela entra, e a tela diz "confira os valores".

**Fotos novas de 17/10** (caixa e bula de remédio, 2 potes de farmácia de manipulação, latas de leite em pó e de achocolatado), tipo descoberto com "Não sei, descobrir":

| | Tipo certo |
|---|---|
| Antes | 4 de 15 |
| Depois | 8 de 15 |

Passaram a acertar: a caixa e a bula do remédio, o pote da farmácia mais nítido e a tabela nutricional da lata que saía como "pedido de exame" (vitamina A, D, E, cálcio, ferro: agora a unidade entre parênteses, "(mg)", conta para a tabela). Ainda erram: a frente das latas (letra artística na curva: o OCR quase não lê nada) e o outro pote da farmácia (foto tremida).

**Fatura em PDF** (6 páginas, o PDF "impresso", que virou imagem): antes, as 6 páginas saíam como comprovante de maquininha e a página de simulação mostrava R$ 500,00 como valor; depois, as 6 são fatura, nenhuma mostra valor, e a leitura caiu de 86 para 65 segundos (fatura não precisa da terceira leitura que confere o valor). Os lançamentos ainda não são lidos: nesse PDF o texto é imagem pequena e o OCR perde as vírgulas ("26000" no lugar de 260,00).

**Regressão** (nenhuma diferença papel por papel em valor, data e estabelecimento):

| Conjunto | Valor certo | Incerto, certo entre as opções | Incerto | Vazio | Errado |
|---|---|---|---|---|---|
| 37 fotos das etapas 2 a 5 (43 papéis), antes | 28 | 5 | 1 | 9 | 0 |
| 37 fotos das etapas 2 a 5 (43 papéis), depois | 28 | 5 | 1 | 9 | 0 |
| 14 fotos com vários papéis (27 papéis), antes | 18 | 3 | 0 | 6 | 0 |
| 14 fotos com vários papéis (27 papéis), depois | 18 | 3 | 0 | 6 | 0 |

Detecção nas 52 fotos de 17/10: 25 → 27 certas (duas telas de tabela nutricional deixaram de sair como "Ingredientes"); nenhuma piorou.

**`testes/offline.js`**: 28 verificações, todas certas, com a nova: um PDF fictício com senha (gerado na hora) pede a senha, avisa a errada, abre com a certa e a senha não fica no aparelho.

## Resultado da 0.7.3 (boletos, contas, faturas e extratos em PDF, 18/10/2026)

**Documentos novos de 18/10** (todos de verdade, fora do repositório; "Não sei, descobrir"):

| Documento | 0.7.2 | 0.7.3 |
|---|---|---|
| Boleto de condomínio com a prestação de contas na mesma página | comprovante, **valor errado** (um número da prestação) | boleto, valor e vencimento pelo código, 3 partes do valor |
| Boleto de condomínio com consumo de água, gás e luz | nota fiscal, **valor errado** (a taxa de 2ª via do rodapé) | boleto, valor pelo código, 7 partes (com "consumo de gás 5,1 m³") |
| Conta de luz | "fatura", sem valor | conta de consumo, valor pelo código, vencimento |
| Comprovante de pagamento de boleto (escola, com desconto) | sem valor | o valor pago, e o do boleto à parte |
| NF-e de compra online (DANFE) | sem valor | total conferido pela soma da nota |
| Comprovante de Pix | "rótulo", sem valor | Pix, valor e para quem |
| 3 faturas de cartão em PDF (11, 91 e 96 compras) | uma aba por página, sem compras | um papel só, total, vencimento e todas as compras, soma conferida |
| Extrato de conta em PDF | 6 abas, uma com **valor errado** (o IOF) | 133 lançamentos, conferidos pelo saldo, iguais aos do OFX |
| Mesmo extrato em OFX / TXT / OFC 1.06 (Money e Quicken) | 133 / sem lançamentos / recusado | 133 / 144 / 144 (TXT e OFC trazem também os 11 agendados) |
| 3 extratos OFX da conta internacional | dólares mostrados como **R$** | US$ |
| Demonstrativo de reembolso de saúde para o IR | conta de restaurante, **valor errado** | Imposto de Renda, sem valor |
| Apólice de seguro (10 páginas) | 10 abas, uma como comprovante com valor | Apólice de seguro, um papel |
| Informes de rendimentos, recibo do IRPF, 3 extratos de previdência, prestação de contas | rótulo, nota, cartão, restaurante | Imposto de Renda, Investimento, Prestação de contas |

Valores errados mostrados: **5 → 0**. Ficam como antes: o PDF "impresso" (vira imagem, o OCR quase não lê), o OFC antigo de uma linha por número e o .xls (recusados com o motivo), os extratos de fundo que são imagem (sem lançamentos) e a carta da contabilidade (texto livre).

**Regressão** (nenhuma diferença papel por papel em tipo, valor, data e estabelecimento):

| Conjunto | Valor certo | Incerto, certo entre as opções | Incerto | Vazio | Errado |
|---|---|---|---|---|---|
| 37 fotos das etapas 2 a 5 (43 papéis), antes e depois | 28 | 5 | 1 | 9 | 0 |
| 14 fotos com vários papéis (27 papéis), antes e depois | 18 | 3 | 0 | 6 | 0 |

Nas 52 fotos de tipos (27 certas), nas 15 de remédio e latas (8 certas) e nos 4 prints de notificação (12 compras certas), também nenhuma diferença. `testes/offline.js`: 30 de 30 (novos: boleto fictício com as partes do valor, e o mesmo boleto com um número trocado na linha, que deixa o valor vazio). Um print de e-mail de aviso de vencimento de boleto sai como boleto, com o valor confirmado nas duas leituras e o vencimento.

## Resultado da 0.7.5 (um leitor de lançamentos só, 18/10/2026)

**Extratos e faturas de verdade** (fora do repositório; "Não sei, descobrir"). "Certos" é contado contra a lista conferida de cada documento (o OFX do banco, as linhas do PDF ou a imagem da página):

| Documento | 0.7.4 | 0.7.5 |
|---|---|---|
| Extrato do Banco do Brasil em PDF (21 movimentos) | 0 (só o texto) | **21 de 21**, a soma fecha com o saldo; os 9 pagamentos estornados no mesmo dia ficam, anulados (18) |
| Extrato do Itaú em PDF (133) | 133, confere com o saldo | 133, confere com o saldo, pelo mesmo caminho |
| O mesmo extrato em OFX | 133 | 133 |
| Fatura Porto Seguro em PDF (11) | 11, confere | 11, confere |
| Fatura Mastercard de setembro em PDF (91) | 91, confere | 91, confere; 26 parcelas; o cartão de cada compra bate com os 10 subtotais da fatura |
| Fatura Mastercard de junho em PDF (96) | 96, confere | 96, confere; 23 parcelas; o cartão de cada compra bate com os subtotais |
| Extrato PJ escaneado, conta em dólar, outro banco (19) | 0 | **18 certos, 0 errados**; 1 ficou de fora (o OCR leu "-]2.00"); sem saldo final na página para conferir |
| Fatura escaneada, 6 páginas em imagem (duas colunas) | 0 | 3 certos, 0 errados; 5 linhas com as duas colunas misturadas pelo OCR ficaram de fora, com aviso |
| Extrato de fundo escaneado (lido como extrato) | 0 | 4 lançamentos com "a soma não fecha: confira"; 1 linha sem a vírgula ficou de fora |
| Extrato "impresso" em PDF (imagem de página inteira) | texto livre | igual: o OCR quase não lê essa imagem |

Lançamento errado mostrado: nenhum. Os documentos de 18/10 que não são extrato nem fatura (boletos, conta de luz, NF-e, Pix, informes, apólice) não mudaram.

**Prints de notificação e regressão** (nenhuma diferença papel por papel em tipo, valor, data e estabelecimento):

| Conjunto | 0.7.4 | 0.7.5 |
|---|---|---|
| 4 prints de notificação (12 compras) | 12 certas, 0 a mais | 12 certas, 0 a mais |
| 2 prints do banco (5 compras) | 5 certas, 0 a mais | 5 certas, 0 a mais |
| 37 fotos das etapas 2 a 5 (43 papéis): valor certo / incerto com o certo / incerto / vazio / errado | 28 / 5 / 1 / 9 / 0 | 28 / 5 / 1 / 9 / 0 |
| 14 fotos com vários papéis (27 papéis) | 18 / 3 / 0 / 6 / 0 | 18 / 3 / 0 / 6 / 0 |

`testes/offline.js`: 38 de 38 (eram 31; os 7 novos falham na 0.7.4). Novos, todos com documentos de mentira: valor na linha de baixo com saldo no fim (e pagamento e estorno do mesmo dia, anulados e riscados), débito e crédito em colunas sem saldo, fatura com parcela 3/10 (comprada em agosto, cobrada em novembro), print com uma compra, soma que não fecha (os lançamentos aparecem com "diferença de R$ 10,00"), extrato sem lançamento (mostra o texto e diz por quê) e o formato combinado em todos os lançamentos.

## Pendências conhecidas (ninguém pediu ainda)

- **PDF escaneado de várias páginas:** cada página é lida como um papel; o saldo do fim não confere os lançamentos das páginas de antes, e a fatura escaneada não acha o total na página das compras. Juntar as páginas escaneadas num papel só, como já acontece com as páginas de texto.
- **Fatura escaneada em duas colunas:** o OCR lê as duas colunas na mesma linha; as linhas misturadas ficam de fora. Com a capacidade "tabela" (posição das palavras na foto) dá para ler uma coluna de cada vez, como no PDF com texto.

- **Canhotos tortos ou de cabeça para baixo numa foto com vários:** cada papel é recortado, mas o que está girado (90°, 120°, de cabeça para baixo) quase não é lido, e dois papéis encostados viram um. Endireitar cada papel recortado pela direção das linhas dele antes de ler.
- **Valor do canhoto em letra grande** (algumas maquininhas imprimem o valor em letra dupla, sem espaço): a foto lê como letras. Sem o valor, a conta e o canhoto da mesma compra não ficam ligados.
- **Print claro de notificações sobre papel de parede escuro:** os avisos são cartões brancos separados; o recorte do papel pega só o mais claro. O print escuro (modo noturno) e a tela branca são lidos inteiros.
- **Produtos de cupom amassado:** a linha do peso que cola na linha do produto seguinte e o mesmo produto duas vezes seguidas (o alinhamento das leituras junta os dois) ficam de fora; a lista aparece marcada para conferir.

- **Arquivo único para copiar ao celular:** ver decisões da etapa 7.
- **PDF com mais de 10 páginas:** só as 10 primeiras são lidas (o app avisa).

- **Estabelecimento:** quando o motor não lê nenhuma linha com confiança, o nome sai embaralhado ou vazio; o lixo antes do nome ("E CARRDEENNAS FENIX ENVIDRACAMENTO LTDA") ainda não é cortado.
- **Códigos em papel térmico:** o QR da NFC-e amassada e os códigos de barras finos (ITF da conta de gás, Code 128 do DANFE) não leem nas fotos atuais; uma foto mais de perto, só do código, resolve.
- **Conta de luz e de gás:** o valor fica numa coluna separada do rótulo "Total a pagar", então as regras por linha não acham; a linha digitável do código de barras carrega o valor e resolve isso (leitor próprio de contas).
- **Rótulo impresso/à mão:** é calculado pela confiança do motor por palavra. Foto escura de texto impresso também sai como "parece escrito à mão ou apagado"; por isso o rótulo diz "ou apagado" e não decide nada sozinho.
- **Papéis um em cima do outro:** saem como um papel só; a pergunta "ler separados?" mostra a contagem para a pessoa conferir, mas ainda não dá para desenhar as caixas na mão.
- **Pergunta "ler separados?" sem precisar:** reflexo, piso ou madeira clara ao lado do papel ainda passam por papel em 4 das 33 fotos de um papel só (é um toque a mais em "É um papel só", não um erro de leitura).
- **Fotos pequenas do WhatsApp com o papel longe:** não há o que ler; o app avisa "tire mais de perto".

Resolvidas na etapa 2: hora pegando o ano ("26:13"), selo de confiança mentindo, Autorização pegando "POSTO".
