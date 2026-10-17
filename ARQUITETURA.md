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
| Visor de 7 segmentos, tabela por posição, IA online, rosto | — | ainda não existem | listadas no catálogo como `futuro` |

A lista oficial está em `leitura/catalogo.js` (`capacidades`). O `sw.js` guarda o básico na primeira visita e as pastas `tesseract/` e `libs/` só ao passar por elas, numa cópia (`dgo-leitor-ocr-pesado-1`) que atravessa as atualizações sem baixar tudo de novo.

## Mapa dos arquivos

| Arquivo | O que faz |
|---|---|
| `leitura.js` | Porta de entrada (global `Leitura`): carregar capacidades sob demanda, registro de leitores, `abrir`, `acharPapeis`, `ler`, `lerArquivo`, `resultado`, e o app certo de cada documento (`espiar`, `ondeLer`, `appsDoTipo`). |
| `leitura/catalogo.js` | Capacidades, formatos de arquivo aceitos (e os recusados com o motivo), **todas as famílias e tipos de documento** com o leitor de cada um, o que vão precisar e a classe de privacidade. |
| `leitura/texto.js` | Campos a partir do texto (`parseDocument`, `findMoney`, `parseChave`, `pickEstablishment`), tipo pelo texto (`detectDocType`), valor confirmado (`agreedValue`) e o resultado de um papel (`buildResult`). |
| `leitura/foto.js` | Inclinação, papéis na foto (`findPapers`), recorte, limpeza do fundo, as várias leituras com o Tesseract (`readPaper`, `lerFotos`). |
| `leitura/codigos.js` | `readCodes`: QR e códigos de barras (ZXing + jsQR). |
| `leitura/relacoes.js` | `Leitura.relacionar(papeis)`: mesma compra, pagamento dividido, quem pagou e "minha parte" (cartões da pessoa pelos 4 últimos dígitos, em `localStorage` `leitor_meus_cartoes`). |
| `leitores/*.js` | Um arquivo por tipo de documento que já tem leitor próprio: `cartao`, `nfce`, `conta`, `extrato`. |
| `formatos/*.js` | Um arquivo por tipo de arquivo. |
| `index.html` | Telas: capturar, abas dos papéis, campos para conferir, histórico, exportar, ajustes. Janelas: `detailDialog`, `confirmDialog`, `docTypeDialog`, `cameraDialog`, `papersDialog` (todas `<dialog>` nativo). |
| `sw.js` | Uso sem internet. `VERSAO` acompanha `APP_VERSION` do `index.html`. Arquivo novo do app entra em `ARQUIVOS`. |
| `testes/medir.js` | Mede a leitura em fotos reais (fora do repositório) contra um gabarito. |
| `testes/offline.js` | Testa sem dados pessoais: uso sem internet, partes pesadas por demanda, PDF, TXT, CSV, OFX, XLSX, DOCX, várias fotos, pagamento dividido, câmera. |
| `NOTAS-leitor-ocr.md` | Como a leitura funciona, por que cada decisão foi tomada, os números de cada etapa e as pendências. |
| `ESTRATEGIA-leitura.md`, `PEDIDOS.md` | O plano do motor único para todos os apps e os pedidos que chegam dos outros apps. |

## O caminho de um documento

1. `Leitura.abrir(arquivos)` → **fontes**. Cada foto, página de PDF, aba de planilha ou texto vira uma fonte: `{ nome, img }` (ler como foto), `{ nome, texto }` (texto pronto), `{ nome, linhas }` (tabela) ou `{ nome, itens, info }` (lançamentos de OFX). Arquivo que não abre volta em `recusados`, com o motivo, sem atrapalhar os outros.
2. A tela pergunta o tipo (o OFX já diz que é extrato ou fatura) e, em foto, se há vários papéis (`Leitura.acharPapeis`).
3. `Leitura.ler(fontes, { tipo, aviso, progresso })` → **papéis**, um por documento, cada um com `result` (`fields`, `valor`, `candidates`, `status`, `itens`...). Foto passa pelo OCR (várias leituras; o valor só vale quando duas leituras diferentes concordam). Texto de arquivo é exato: uma leitura basta.
4. `Leitura.relacionar(papeis)` acrescenta os campos de relação.

## Detecção automática da categoria e do tipo

- **Tipo de arquivo**: pela extensão e pelo tipo que o navegador informa (`L.formatoDe`); formato antigo é recusado com o motivo.
- **Tipo de documento** ("Não sei, descobrir", `detectDocType` em `leitura/texto.js`): primeiro os leitores de dinheiro (cartão, nota, conta), pelos `sinais` de cada um, porque são eles que leem o valor; se nenhum reconhece o papel, os outros tipos do catálogo, pelas palavras de `SINAIS` em `leitura/catalogo.js` (3 ou mais no texto; ganha o que tiver mais). O tipo descoberto vem com a categoria ("Saúde › Pedido de exame") e já fica no registro, mesmo antes de o tipo ter leitor próprio (aí ele é lido como texto livre).
- **Arquivo que já diz o que é**: OFX é extrato ou fatura; CSV e planilha com colunas de data e valor viram lançamentos.
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
   - ou `daTabela(linhas)` e `resultado(papel)` quando o documento é uma lista (ex.: `extrato`).
3. No catálogo: `leitor: '<id>'` no tipo e o id em `leitores` (a ordem é a da detecção).
4. Pôr o `<script src="leitores/<id>.js">` no `index.html` e o arquivo na lista do `sw.js`.
5. Medir com fotos reais e gabarito (`testes/medir.js`) antes e depois, e contar o resultado numa tabela.

## Abrir um formato novo de arquivo

Criar `formatos/<id>.js` com `Leitura.formatos.<id> = async arquivo => [partes]`, declarar a capacidade e o formato (extensões) no catálogo, pôr o arquivo no `sw.js` e um caso no `testes/offline.js`. Se precisar de biblioteca, ela vai para `libs/` (pesada: só baixa no uso).

## Usar o motor em outro app

1. Copiar sem alterar: `leitura.js`, `leitura/`, `leitores/` (só os leitores que o app usa), `formatos/` e as pastas pesadas que ele vai usar (`tesseract/` para foto, `libs/` para códigos e PDF).
2. Na página, antes do script do app:
   ```html
   <script src="leitura.js"></script>
   <script src="leitura/catalogo.js"></script>
   <script src="leitura/texto.js"></script>
   <script src="leitura/relacoes.js"></script>
   <script src="leitores/cartao.js"></script>   <!-- um por leitor -->
   ```
3. No código do app:
   ```js
   const { fontes, recusados } = await Leitura.abrir(input.files);
   const papeis = await Leitura.ler(fontes, { tipo: 'auto', aviso: t => status.textContent = t });
   Leitura.relacionar(papeis);
   papeis.forEach(p => console.log(p.label, p.result.fields, p.result.valor));
   ```
4. No `sw.js` do app: os arquivos do motor na lista do básico; `tesseract/` e `libs/` guardados no primeiro uso (ver o `sw.js` daqui).
5. Atualizar: copiar de novo as pastas a partir daqui. `Leitura.versao` diz qual versão do motor o app tem.

## Privacidade

- Tudo é lido no aparelho. Nada sai para a internet.
- O catálogo marca a classe de cada tipo: `financeiro`, `saude`, `pessoal`, `biometrico`. Quando existir a leitura por IA online (capacidade `ia`), saúde, documento pessoal e rosto nunca serão enviados sem a pessoa escolher, com aviso do que sai.
- Cartão: só os 4 últimos dígitos são lidos e guardados.
- O repositório é público: nunca colocar foto real, número de cartão, CPF ou qualquer dado pessoal, nem em teste. Os testes geram material fictício.

## O que ainda não está aqui (diretriz SolverONE, regra zero: confirmar com o dono antes)

`Fundo` (leitura que continua ao trocar de tela, Wake Lock, pílula de andamento), telas em PT e EN, `versoes.json` e novidades em Ajustes, `PENDENCIAS.md`, `janela.js` nas janelas, arrastar e soltar ou colar arquivo, compartilhar para o app (`share_target`), fila de arquivos com progresso e aviso de duplicado, medir a nitidez antes de aceitar a foto, preferência Wi-Fi/dados para baixar o pesado, código do app com "rede primeiro".
