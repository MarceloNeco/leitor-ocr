---
name: "diretrizes-gerais-apps"
description: "Diretrizes gerais da plataforma SolverONE, valendo em todos os apps de solverone.com.br (antes marceloneco.github.io) e no admin RootifyONE (regra zero, arquitetura, domínio, RootifyONE e arquivos master, planos, PT/EN, datas, padrão comum com 🏠 e 📥 no topo, menu ☰ em grupos, barra de atalhos com arrastar e soltar, botão Voltar do celular, busca, tabelas, anúncios, conta, sessão ao recarregar, voltar ao mesmo lugar após login, inbox, governança de família entre responsáveis, acessibilidade, voz, microfone, compatibilidade, uso sem internet e atalho na tela inicial, rede, offline, segurança/LGPD, OCR, vários arquivos de uma vez, IA com cofre e guia de chaves, assistente AssistONE, trabalho em segundo plano (`Fundo`, Wake Lock, pílula de andamento), feedback dos usuários (pergunta do dia, 💬 em toda tela, prints e vídeos, central no RootifyONE), integrações, versionamento, entrega, cofre de senhas (Senhas da casa) e entrada sem internet, linguagem para leigos, instalar pelo Chrome no navegador da Samsung, lista de pendências). Usar ao criar ou alterar qualquer um desses sites."
---

# Diretrizes gerais — plataforma SolverONE (solverone.com.br)

**SolverONE** é o nome da plataforma que reúne todos os apps. Todos são sites estáticos no
GitHub Pages, um repositório por app, hoje sem servidor. Domínio próprio desde 25/Set/2026:
**solverone.com.br** (Registro.br), com os apps em pastas (`solverone.com.br/<repositório>`) — ver
seção "Domínio".

| App | O que é | Repositório | Estado |
|---|---|---|---|
| Portal de Projetos | página central com links para os apps | `marceloneco.github.io` | beta |
| **RootifyONE** | admin central de todos os apps (ver seção própria) | `rootify-one` | alpha v0.1.9 (25/Set/2026) |
| Feature Tester | testador de funcionalidades | `FeatureTesting` | beta |
| OmniLifeONE | assistente da família e da casa | `omnilife-one` | beta |
| MoneyTRIO | BudgetONE + InvestifyONE + TaxONE | `investify-me` | beta |
| RiseONE | exercício, dieta e saúde | `rise-one` | beta |
| Eleições 2026 | infográficos dos planos de governo (réplica alpha no ChatGPT Sites) | `planos-candidatos-2026` | beta |
| Contador de Histórias | acervo, leitura e criação de histórias | `contador-de-historias` | beta |
| CifrasONE (Cifras e Acordes) | cifras com auto-rolagem, acordes, afinador | `cifras-violao` | beta |
| PetLover | a definir | — | backlog |

O usuário não é desenvolvedor: instruções sempre passo a passo, nível iniciante completo.

## Regra zero (crítica)

Antes de implementar **qualquer requisito destas diretrizes que ainda não esteja implementado
naquele app**, listar quais são e confirmar com o usuário quais entram agora. Nada de aplicar
em silêncio o que ele não pediu naquela conversa. O que já está no módulo comum vem junto sem
perguntar; o que é novo, pergunta.

## Planilha de controle

O usuário mantém a lista-mestre em `SolverONE DIRETRIZES GERAIS vN <data>.xlsx`: aba
**DIRETRIZ GERAL** (#, Categoria, Item, Descrição, Prioridade, Aplicação, Status, Apps,
Observações), aba **APPS**, **Ideias & Pesquisas**, **RootifyONE-admin** e uma aba por app.
Ele preenche aos poucos (status e prioridade muitas vezes em branco, mesmo em item entregue).
Ao processar uma versão nova: não sobrescrever Status nem Prioridade dele; registrar a
situação real numa coluna própria ("Situação real (Claude, data)"); itens de aba de app que
valem para todos são promovidos para a DIRETRIZ GERAL com a origem anotada.

## Arquitetura

Módulo único, igual em todos os apps:

- `diretrizes.js` — o módulo (global `DGO`), **idêntico em todos**
- `diretrizes-config.js` — o **único** arquivo diferente por app
- `sw.js`, `manifest.json`, ícones, `servicos.json`, `anuncios.json`, `TESTE-<app>.html`
- OCR hospedado: `ocr-worker.js`, `tesseract-core-*.wasm.js`, `*.traineddata.gz`
- `ajuda-botao.png`, `ajuda-icone.png` e `assistone-hd.png` — a arte do assistente AssistONE

Instalação: arquivos na raiz + duas linhas antes de `</body>` em **cada** página HTML
(`diretrizes.js` e depois `diretrizes-config.js`). Nenhuma outra edição no HTML.

`app:` no config é a gaveta de dados e nunca muda — todos os sites moram na mesma origem.

Tudo que depende de identidade ou permissão passa por **uma função só** (`entrar`, `pode`).
Hoje responde localmente; com servidor, passa a perguntar a ele e nada mais no app muda.

**Com Firebase os arquivos continuam intercambiáveis**: o `diretrizes.js` segue idêntico; muda
só a *fonte* dos dados (arquivo → Firestore), escolhida no config. O config continua sendo um
por app, de propósito.

## Domínio (solverone.com.br)

- **Um domínio, apps em pastas** (decisão do usuário, 25/Set/2026): o domínio é configurado **uma
  vez** no repositório do Portal (`marceloneco.github.io` → Settings → Pages → Custom domain); todos
  os repositórios de projeto herdam (`solverone.com.br/omnilife-one`, `/rise-one`, `/investify-me`…).
  Assim todos continuam na **mesma origem**: cofre de IA, perfil comum e login valem para todos.
  Subdomínio por app separaria as origens — não usar.
- DNS no Registro.br (modo avançado): 4 registros **A** do GitHub Pages (185.199.108–111.153),
  4 **AAAA** (2606:50c0:8000–8003::153), **CNAME** `www` → `marceloneco.github.io.` e o **TXT**
  de verificação de domínio da conta GitHub. Depois, **Enforce HTTPS**. Voltar atrás = apagar o
  Custom domain (tudo volta para marceloneco.github.io).
- **Nunca fixar endereço no código.** Links entre apps e para o Portal usam o endereço atual
  (`SITE_BASE = location.origin + '/'`); só a cópia baixada (arquivo) usa `https://solverone.com.br/`.
- **Mudar de endereço = mudar de origem.** O que fica no navegador (localStorage, IndexedDB,
  cofre de IA, digital/WebAuthn, app instalado) **não passa** para a origem nova. Por isso: no
  endereço antigo, aviso "Guardar meus dados" (backup com arquivos) para quem usa "só neste
  aparelho"; no novo, ajuda "Trazer os dados do endereço antigo" (importar o backup); depois
  reativar a digital e reinstalar o ícone. Dados na nuvem não mudam.
- **Firebase:** acrescentar `solverone.com.br` e `www.solverone.com.br` em Authentication →
  Domínios autorizados (senão o login Google falha); a mensagem de erro do app diz isso.

## RootifyONE — admin central

Site de administração de **todos** os apps: serviços, preços, planos, configurações, meios de
pagamento, painel de receita e custos, autenticação e administração de usuários, API keys,
políticas de uso e termos, automações — com **log de tudo** (edições, transações, acessos).
O painel de admin que já existe dentro de cada app (`DGO.abrirAdmin`, "ver o app como") é o
protótipo de teste; a edição de verdade migra para o RootifyONE, e o simulador "ver como"
continua em cada app.

### Como está construído (v0.1.3, 25/Set/2026)

- Arquivos: `rootify-catalogo.js` (declarações: módulos, recursos/ações, papéis, perfis de
  clientes, **registro de funções com estado e o que falta especificar**, dados iniciais),
  `rootify-base.js` (cofre, sessão, permissões, log, componentes), `rootify-dados.js` (regras,
  geração/conferência dos arquivos master, automações), `rootify-telas-1/2.js`, `rootify-app.js`
  (acesso, menu, busca, roteador), mais `diretrizes.js` + config com anúncios e login do módulo
  desligados. `ARQUITETURA.md` no repositório explica onde mexer.
- **Cofre cifrado no navegador**: uma chave de dados (AES-GCM) embrulhada pela senha (PBKDF2),
  pelo PIN, pelo código de recuperação e por uma chave presa ao aparelho (usada com a digital
  via WebAuthn). Entrar = digital OU PIN OU senha; bloqueio por inatividade; PIN trava em 5 erros.
  Recarregar a página (F5) **não** pede para entrar de novo enquanto o prazo do bloqueio não passar
  (chave de dados embrulhada por chave de sessão não exportável no IndexedDB; pacote no
  `sessionStorage` da aba); bloquear, sair ou fechar a aba encerra. Depois de entrar de novo,
  volta para a mesma tela (a rota fica no endereço `#/modulo/sub/id`).
- Menu ☰ em janela estreita: fechar a gaveta e **só depois** trocar de tela (esperar o
  `popstate` do `history.back`), senão o navegador desfaz a troca — bug corrigido na 0.1.1.
- **Horários com segundos** em todo o RootifyONE (`RF.util.data(v, true)` → `25/Set/2026
  12:37:05`). No **log** (Auditoria) também o **fuso do aparelho** (`RF.util.data(v, 'fuso')` →
  `… 12:37:05 UTC−03:00`); no detalhe do registro, o nome do fuso (`America/Sao_Paulo`) e o
  horário UTC original; o CSV do log traz `quando_utc` e `quando_local`. O log grava sempre em
  UTC (ISO), a tela converte. Desde a 0.1.7.
- Regras de código: permissão sempre por `RF.pode('recurso:acao', app)` (ou `RF.ui.botaoSe`);
  toda alteração por `RF.mudar(...)`, que grava e registra no log encadeado (hash do anterior);
  texto sempre `T('pt', 'en')`; função sem especificação entra no catálogo com
  `estado: 'especificar'` e a pergunta em `falta`, e aparece em cinza por `RF.ui.cinza(id)`.
- **Papéis da equipe (12)**: Dono (super admin, fixo), Admin da plataforma, Admin de app (por app),
  Suporte N1 (dados mascarados) e N2, Sucesso do cliente (CRM), Conteúdo e marketing, Financeiro,
  Encarregado (DPO), Auditor (só leitura), Desenvolvimento, Analista. Papéis próprios são criados
  a partir de um modelo. Simulador "ver como" só para o dono, com tarja e log.
- **Perfis de clientes**: Visitante, Membro, Premium, Anunciante; a especificar: Responsável e
  Membro da família, Dependente (menor), Profissional, Cliente de profissional.
- **Separação de funções**: quem escreve um termo não o aprova (exceção registrada quando só há um
  dono); excluir titular exige motivo e o e-mail digitado; sempre sobra um dono.
- **CRM**: lista com filtros e segmentos, ficha 360° (dados, plano com histórico, apps, termos
  aceitos, consentimentos, chamados, notas, família, histórico do log), etiquetas, importar/exportar
  CSV, duplicados, bloquear, trocar plano, exportar e excluir/anonimizar titular.
- **Suporte (CS)**: filas (minha, sem responsável, abertos, prazo em risco), SLA por prioridade,
  respostas prontas com {nome}/{app}, nota interna, escalar N1→N2, juntar chamados, sugestão de IA
  com e-mail/telefone/CPF mascarados, e-mail pelo programa local, relatórios, importar CSV do Formspree.
- **IA nos termos (0.1.8, `rootify-ia-termos.js`)**: no editor de cada termo em rascunho, botão
  **✨ Escrever com IA** (escrever do zero, melhorar e completar, só conferir o que falta, traduzir
  PT↔EN, pedido extra); e o **🤖 Agente de políticas** (`#/termos/agente`), que monta sem IA a lista
  do que cada app precisa (termos de uso, privacidade geral e uma por app com registro de tratamento,
  avisos legais, conteúdo de terceiros), mostra a estimativa de pedidos, e para cada documento
  marcado escreve em PT, confere, corrige e traduz para EN, com andamento na tela. Regras: usa
  `DGO.ia` (mesmo cofre, grátis ou paga; `opcoes.limite` para respostas longas); para a IA vai só a
  descrição dos apps e o ROPA, nunca dado de usuário; tudo sai como **rascunho** com autor = quem
  pediu (aprovação continua sendo de outra pessoa); a IA **nunca publica**; texto anterior fica em
  `versao.antesIA` (botão ↶ Desfazer); onde faltar fato a IA escreve `[A DEFINIR: …]` e o envio
  para aprovação fica bloqueado até preencher; "Dados que a IA usa" (responsável, e-mail,
  encarregado, foro) em `config.fatosTermos`; validar com advogado antes de publicar.
- **Integrações e chaves** mostra qual IA está em uso para texto, voz → texto, texto → voz e
  imagens, com botão que abre o cofre e o guia do módulo comum (0.1.9).
- **Quem pode entrar no admin (pendente de decisão do usuário, set/2026):** hoje o RootifyONE é
  site estático; a tela "Primeira vez neste aparelho" aparece para qualquer pessoa que abra o
  endereço num navegador vazio, mas isso cria só um cofre **local e vazio** — não dá acesso aos
  dados do dono (que ficam cifrados no navegador dele) nem à publicação (que exige o token do
  GitHub dele). Restringir de verdade = algo **fora** do navegador: (a) **Cloudflare Access**
  (Zero Trust, grátis até 50 pessoas): lista de e-mails aprovados + código por e-mail antes de o
  site abrir, sem mexer no código, exige o site atrás de um domínio no Cloudflare; (b) **Supabase
  Auth** (o piloto): cadastro público desligado, pessoas convidadas pelo painel, e o RootifyONE
  confere a sessão e uma tabela `equipe` — é a fase 2; (c) repositório privado com Pages (plano
  pago do GitHub). Um "código de convite" só no JavaScript **não** protege (o código é público).
- **Feedback dos usuários** (a construir, decisão de 08/Out/2026): módulo "Feedback" no grupo
  Clientes, com fila, ficha com anexos, status, resposta e painel por app/tela/categoria, mais a
  lista de **beta testers** (e-mails aprovados) — regras na seção "Feedback dos usuários".
- Tela **O que falta especificar** lista tudo em cinza e exporta CSV para a planilha.
- Pacotes: `ROOTIFY-ONE vX.Y.Z <data>.zip` e `SOLVERONE-DADOS vX.Y.Z <data>.zip`.

### Arquivos master e cascata

O conteúdo estratégico **nasce no RootifyONE e desce para os apps**. O RootifyONE não edita os
apps: ele publica arquivos master, e cada app os lê ao abrir. Adotado na v0.1.0: um repositório
único **`solverone-dados`**, publicado em
`solverone.com.br/solverone-dados/` (antes `marceloneco.github.io/solverone-dados/`). Como é a mesma origem dos apps, todos leem sem CORS,
e publicar uma vez vale para todos.

| Arquivo | Conteúdo | Quem lê |
|---|---|---|
| `apps.json` | catálogo: slug, nome PT/EN, URL, estado, `versaoMinima` | todos os apps, portal, anúncios |
| `planos.json` | planos (Visitante, Membro, Premium, Família, Profissional…) e o que cada um inclui | `Niveis.pode()` |
| `servicos/<app>.json` | cada serviço do app → planos que podem usar (padrão: todos) | `Niveis.pode()` |
| `termos.json` | termos e políticas PT/EN por app e globais, com versão, data e `obrigatorio` | tela de aceite |
| `recados.json` | avisos do admin para a inbox (início, fim, público) | inbox |
| `anuncios.json` | anúncios da faixa e do pop-up | faixa |

Regras: o app **sempre** tem cópia local como reserva (offline e se o central falhar); o
formato de cada arquivo é **o mesmo** que depois vira coleção no Firestore — migrar é trocar a
fonte, não o formato. No config: `fonteCentral: '/solverone-dados/'`.

**Publicar (fase 1, sem servidor):** o RootifyONE grava os JSON pela API do GitHub com um token
*fine-grained* do próprio administrador, restrito ao repositório `solverone-dados`, com prazo de
validade, colado no navegador dele e **nunca** no código. A proteção real é o GitHub: sem esse
token, a tela do admin até abre, mas não publica nada. O histórico de commits é o log.

**Fase 2 (Firebase):** mesmas coleções no Firestore; administrador = documento
`admins/{uid}` conferido pelas regras do Firestore (funciona no plano gratuito); log numa
coleção `log` só de inclusão (`quando, quem, app, acao, antes, depois`), sem editar nem apagar.
Cobrança e painel de receita exigem gateway e Functions (plano pago) — fase 3.

**Forçar atualização e termos novos:**

- App mais antigo que `versaoMinima` → tela de "atualize" que recarrega a versão nova (service
  worker `update()` + recarregar); sem isso não entra.
- Termo com versão maior que a aceita pela pessoa e `obrigatorio: true` → tela cheia de aceite
  antes de usar; recusar = sair. Aceite gravado com versão e data (e no log).
- App que precisa de aviso legal (RiseONE: exercício não substitui profissional) usa o mesmo
  mecanismo, com "Estou ciente".

### Planos de usuário

- O admin associa cada usuário a um plano; **Plano Família** agrupa membros de uma casa/
  assinatura; **Profissional–Cliente** (RiseONE: personal/aluno, médico/paciente) vincula
  perfis com consentimento. Os dois últimos exigem servidor.
- **Toda feature nova** é declarada no config com um id de serviço. Ao criar, perguntar ao
  usuário a qual plano ela pertence; se ele não decidir, fica **"todos os planos"** e ele muda
  depois no RootifyONE.
- Hoje: `servicos.json` com níveis Visitante → Membro → Premium (mais Anunciante e
  Administrador de lado); Membro vê anúncio, só Premium fica livre. Enquanto não houver
  cobrança, o admin marca quem é Premium. Em site estático isso organiza a oferta mas não
  protege — serve para testar o fluxo.

### Chaves de API (política central)

Repositório único de chaves por usuário, valendo para todos os apps. O RootifyONE define a
**política** (mesma chave para todos os apps ou uma por app); **nunca lê a chave** de ninguém —
ela fica cifrada no aparelho da pessoa. Chave da plataforma (paga pelo dono da SolverONE) só
existe no proxy do servidor.

### Armazenamento

O admin define cotas por plano. Nas Configurações de cada app a pessoa vê **quanto usa (MB e
barra em %)** e escolhe onde guardar arquivos: no armazenamento da SolverONE (futuro) ou no
drive dela (Google Drive, OneDrive — já funciona). O uso local já dá para medir hoje com
`navigator.storage.estimate()`, separado por tipo (áudio de voz, OCR, dados), com botão de
limpar cada um.

## Código agnóstico a LLM

O usuário vai evoluir os apps com LLMs e empresas diferentes. Portanto:

- JavaScript, HTML e CSS puros. Sem framework, sem passo de build, sem dependência de
  ferramenta. Qualquer assistente abre e entende.
- Nenhuma amarra a um modelo: recursos de IA ficam atrás de um registro de provedores
  (ver "IA: provedores e chaves"); trocar de provedor é trocar a chave, não o código.
- API pública explícita e estável (`DGO.*`), para mudanças ficarem locais.
- Comentários explicando **por que**, em português simples, e nada de padrão esperto.
- Cada repositório leva um `ARQUITETURA.md`: o que cada arquivo faz, o que não se toca,
  onde mudar o quê. É o briefing que qualquer IA lê antes de mexer.
- Marcar versão do módulo (`DGO.versao`), para dar para saber qual site está atrasado.

O risco real não é uma IA não entender o código: é reescrever um arquivo inteiro e o usuário
perder o módulo que vale para todos os sites. A separação módulo/config e o `ARQUITETURA.md`
são a defesa.

## Revisão do código que não é meu

Não dá para saber quem escreveu um trecho — código não tem assinatura. A regra é:
**tudo que já estava no repositório quando cheguei passa por revisão antes de eu mexer.**

Reportar em três níveis, dizendo onde está e o que acontece se ficar como está:
**risco** (arrumo, avisando), **problema** (reporto e ele decide), **observação** (só registro).

O que procurar, nessa ordem:

1. Chave, token ou segredo dentro do código — os repositórios são públicos.
2. Conteúdo de fora entrando por `innerHTML` sem limpeza.
3. Colisão de `localStorage`: os sites dividem a mesma origem, então duas chaves com o
   mesmo nome em apps diferentes se sobrescrevem em silêncio.
4. `JSON.parse` e `fetch` sem proteção, que derrubam a tela inteira num erro bobo.
5. Biblioteca de terceiros vinda de CDN sem necessidade, quando daria para hospedar.
6. Permissão mais ampla do que o preciso (drive, câmera, notificação).
7. Dado pessoal em lugar público.

Arrumar só o que é risco. O resto se reporta e ele decide.

**Tema claro e o escuro forçado do navegador** (OmniLifeONE 2.14.2): o tema claro declara
`color-scheme: only light` (CSS e `<meta name="color-scheme">`), senão Chrome ("tema escuro para sites") e
Samsung Internet pintam o escuro deles por cima e a chave "Tema escuro" parece errada.

## Idioma e datas

- PT e EN em tudo, sempre revisadas. Todo texto novo nasce nas duas línguas.
- Seletor **PT|EN**: no **computador**, no próprio cabeçalho, junto de 🔍 📥 ⚙ 🏠 👤 (não numa
  faixa só para ele); no **celular**, **dentro do ☰** (no topo da gaveta), para não ocupar o
  cabeçalho. Antes de entrar (tela de boas-vindas, sem ☰), fica visível no cabeçalho também no
  celular. Nunca na faixa do anúncio: fechar o anúncio não pode levar o idioma junto.
- Datas: PT `17/Set/2026` · EN `Sep/17/2026`. Varredura automática a cada atualização.
- Conteúdo do usuário nunca é traduzido nem tem data alterada (lista `ignorar` no config).
- Um app pode ter tradutor próprio (`data-i18n`) convivendo com o módulo: ele apaga o
  próprio botão quando o `DGO` existe, segue `dgo:idioma` e delega datas a `DGO.formatarData`.

## Padrão comum entre os apps

O que se repete em todos, sempre no mesmo lugar e com o mesmo jeito:

- **Configurações pelo ícone de engrenagem ⚙** (não pela palavra, que ocupa espaço).
- **☰ menu lateral** e **barra de baixo configurável** (seção abaixo).
- **Lupa 🔍 de busca** (seção abaixo).
- **🏠 Início fixo no cabeçalho de cima, em TODOS os apps** (inclusive RootifyONE, Portal e
  Feature Tester), sempre no mesmo lugar. Ordem padrão do cabeçalho: à esquerda **☰** e
  ícone + nome do app; à direita **[PT|EN só no computador] 🔍 📥 ⚙ 🏠 👤** (busca, Inbox,
  configurações, Início, conta). Na própria
  tela Início o 🏠 continua visível, marcado como atual (`aria-current="page"`), para nada
  mudar de lugar. `aria-label` "Início"/"Home", alvo de 44×44.
- **📥 Inbox é ícone do cabeçalho**, não item da barra de baixo nem aba, com bolha de não lidos
  colorida pela prioridade (seção Inbox).
- **AssistONE** (assistente/ajuda, ligado por padrão — seção própria) sempre visível; **PT/EN**
  sempre ao alcance (cabeçalho no computador, ☰ no celular).
- **Versão e novidades** nas Configurações.
- **Trabalho demorado nunca morre ao sair da tela** (foto, OCR, IA, importação, áudio): roda solto no
  módulo `Fundo`, segura a tela acesa, avisa antes de fechar e mostra a pílula de andamento (seção
  "Trabalho demorado em segundo plano").
- **💬 Dar uma opinião / avisar um problema** ao alcance em toda tela: no balão do AssistONE, no ☰
  (grupo "Ajuda e mais") e em ⚙ → Ajuda, sempre sabendo em que tela a pessoa estava (seção
  "Feedback dos usuários").
- **Link para o Portal** (abre em outra aba), no menu lateral.
- No celular, a parte fixada no topo ocupa o mínimo: **ícones em vez de palavras**, com
  `aria-label` e dica ao tocar e segurar.

## Faixa do topo

`[ANÚNCIO na vertical]` · `[carrossel]` · `[×]` — **só anúncio.**

O `×` fecha **a faixa inteira** até o fim da sessão e volta no próximo login. Nada de controle do
app (idioma, IA) mora nela, porque some junto. Sem anúncio (Premium, anunciante), a faixa não
existe. A faixa empurra barras fixas do
app para baixo em vez de cobri-las, e some sozinha em telas cheias.

Como ela é fixa, precisa de `scroll-padding-top` igual à sua altura: sem isso ela cobre o
elemento que acabou de receber foco pelo teclado (WCAG 2.4.11 Focus Not Obscured).

## Menus e navegação

- **☰ no topo, à esquerda do nome do app**, em todas as telas e tamanhos. Abre uma gaveta
  lateral com **todas as funções** do app (e as partes de cada uma, ex.: Agenda → Lembretes)
  mais os atalhos principais. Fecha no ×, no Esc, tocando fora ou ao escolher o destino; o
  foco volta para o ☰. `aria-expanded` no botão, alvo de toque de 44×44.
- **Organização do ☰** (benchmark Material 3, NN/g, Toptal; OmniLifeONE 2.4.0):
  1. no topo, **até 4 ações rápidas** em ícones grandes (ex.: Lembrete, Recado, Cheguei, SOS);
  2. funções em **grupos com título**, com nomes do que a pessoa quer fazer (ex.: Dia a dia,
     Cuidar da família, Casa e papéis, Ajustes, Ajuda e mais) — não pela estrutura do código;
  3. **sub-itens em acordeão de um nível só**: tocar no nome abre a função; o ▸ ao lado (44×44,
     `aria-expanded`) mostra/esconde as partes; o grupo da tela atual já vem aberto; os outros,
     fechados;
  4. nada repetido no ☰ que já tenha lugar fixo (busca está na 🔍, alertas na Inbox).
  Sub-itens só em app com mais de ~7 funções ou funções com várias partes (OmniLifeONE,
  MoneyTRIO, RiseONE); app pequeno fica com lista simples. A organização fica em duas listas
  (grupos e partes), para mudar sem mexer em tela.
- Menu lateral que não cabe na altura **rola, com a barra de rolagem visível**, para a pessoa
  saber que há mais opções. Nunca cortar item, nem esconder o calendário ou o conteúdo ao lado.
- **Barra de baixo (celular) só com favoritos** que a pessoa escolhe nas Configurações (até 5);
  no computador, os mesmos favoritos ficam logo abaixo do cabeçalho. **Sem ☰ nem "Mais" no
  rodapé** — quem quer tudo usa o ☰ do topo.
- **Montar a barra por arrastar e soltar** (Configurações → Geral → "Barra de atalhos"):
  - **computador**: lado a lado — "Disponíveis" à esquerda (cartões com ⠿), seta "arraste para
    cá", "Sua barra (n/5)" à direita com 5 casas e uma miniatura do celular embaixo;
  - **celular**: em pé — Disponíveis em cima, "↓ arraste para baixo" e a barra embaixo, no
    formato do rodapé;
  - arrastar de Disponíveis para uma casa **põe** (barra cheia = **troca**, dizendo quem saiu);
    arrastar dentro da barra **troca a ordem**; arrastar para fora **tira** (fica pelo menos 1);
  - **salva sozinho a cada soltar**, com "✓ Salvo" discreto (sem botão Salvar);
  - ícone **↺ Voltar ao padrão** (desativado quando já está no padrão), com **Desfazer**; o padrão
    de cada app são as funções mais usadas dele;
  - funciona com dedo e mouse (Pointer Events, com `touch-action:none` só nos cartões) e rola a
    página sozinho perto da borda;
  - **alternativa sem arrastar** (WCAG 2.5.7): tocar em Disponível põe; tocar num item da barra
    mostra ◀ Mover · Mover ▶ · ✕ Tirar; com a barra cheia, tocar em Disponível e depois no item
    que sai.
- **Tudo que abre ao clicar abre com movimento rápido e suave** (0,15–0,25 s, curva que
  desacelera no fim): a gaveta desliza da esquerda com fundo escurecendo, menus suspensos
  crescem a partir do botão, janelas sobem (no celular, de baixo, como folha). Nem aparecer
  seco, nem animação lenta. Com `prefers-reduced-motion`, sem movimento.
- **Quadros e cartões de resumo são clicáveis** e levam à página a que se referem.
- **Tela atualiza sozinha** quando um dado muda (por voz, OCR, sincronia, outro app): nunca
  exigir recarregar a página para o item aparecer.
- O cabeçalho não pode causar rolagem lateral: no celular estreito, esconder primeiro o que
  já existe em outro lugar — conferir de 320 a 480 px.
- **Botão Voltar do celular navega dentro do app** (reclamação forte dos usuários: hoje o
  Voltar sai do app e cai no Portal). Nunca derruba a pessoa para fora com algo aberto nem no
  meio da navegação: **cada tela** visitada dentro do app volta uma a uma, e só da tela inicial
  é que se sai. Cada camada que abre (outra aba/tela, janela, gaveta ☰, leitor/tela cheia) ganha
  uma entrada no histórico (`history.pushState`); no `popstate` fecha só a camada de cima.
  Abas da barra de baixo não se empilham: qualquer aba fica **uma** camada acima do Início
  (Voltar → Início → sai do app). Fechar pelo botão da tela também tira a entrada do histórico
  (`history.go(-n)`, com fila, porque é assíncrono). Um ponto só no código (ex.: `Nav`) — nada
  de `pushState` espalhado. Testar: abrir aba → item → janela e apertar Voltar três vezes.
  - **Na tela inicial, o Voltar não sai direto**: avisa "Toque em Voltar de novo para sair do
    <app>" e só o segundo toque sai. Como fazer: marcar a primeira entrada
    (`replaceState({inicio:1})`) e, **depois do primeiro toque da pessoa** na página, criar uma
    entrada de guarda (`pushState`). O Chrome ignora entradas criadas sem toque, por isso
    nada de `pushState` ao carregar. Ao voltar para a entrada marcada, mostrar o aviso; o
    próximo Voltar sai.
  - Rota inicial sem `#`: trocar com `replaceState`, não com `location.hash =` (que cria uma
    entrada extra e obriga um Voltar a mais).
  - Vale também com o app instalado na tela inicial (lá o Voltar fecharia o app).
  - No RootifyONE já funciona assim desde a 0.1.3.
- **Início alcançável de qualquer lugar**: aba 🏠 Início na barra de baixo, botão 🏠 em toda
  tela cheia/sobreposta (leitor, player, editor) e o ícone + nome do app no topo levando ao
  Início (com `role="button"`, teclado Enter/Espaço).
- **Nada flutuante cobre controle do app.** O seletor PT|EN e outros elementos do módulo entram
  **dentro** do cabeçalho (não soltos com `position:fixed` sobre ele) e somem quando há leitor,
  janela ou tela cheia aberta. Conferir em 320 px com o leitor aberto: ✕ e título visíveis.

## Busca (lupa)

Em todos os apps e no RootifyONE, uma lupa busca **funções, telas, seções e conteúdos** do app.

- Índice declarado no config (`busca: [{ termo, sinonimos, destino }]`) mais os títulos das
  seções lidos da página — sem biblioteca, pesa quase nada, funciona offline.
- Busca sem acento, sem maiúsculas, em PT e EN; cada resultado é **clicável** e leva ao lugar
  (abre a aba, rola até a seção e destaca rapidamente).
- Nada encontrado: dizer isso e **sugerir termos parecidos** (distância de letras + sinônimos).
- O AssistONE usa o mesmo índice para "Procurar algo" dentro do balão.

## Largura, tabelas e orientação

- Coluna de leitura para **texto corrido** (no contador, `.wrap { max-width: 760px }`; conforto
  de 65 a 75 caracteres). **Tabela, lista, gráfico e painel usam a largura inteira**, com uma
  classe de largura total. Em tela larga, preferir duas colunas a uma coluna estreita com vazio
  nas laterais. A área útil do computador não pode ficar sobrando.
- **Tabela com rolagem lateral:** cabeçalho das colunas fixo no topo ao rolar para baixo
  (congelar, como no Excel — `position: sticky` no `th`) e primeira coluna fixa quando for o
  rótulo da linha.
- **Avisos acima da tabela, no celular ou em espaço estreito**, nesta ordem de cima para baixo:
  1. "Melhor em tela grande ou com o celular deitado." — curto, sempre inteiro (pode quebrar
     linha).
  2. "O quadro é mais largo que a tela: role para o lado para ver o restante de *xxx*." — só
     quando o quadro de fato é mais largo.
- Site com muita informação granular (Eleições) declara `melhorEmTelaGrande: true` no config:
  no celular, aviso "Estou ciente" uma vez por sessão.
- **Em pé e deitado** funcionam os dois, em celular e tablet, e também na **impressão**
  (`@media print` e orientação da página certa para cada tela).

## Anúncios

Carrossel andando para a esquerda em laço sem costura, imagem ao lado do texto, clique em
outra aba, o app nunca anuncia a si mesmo. Lista em `anuncios.json` (central no RootifyONE).

Pop-up sorteado **antes do login** e outro **depois**, com contagem visível de 3, 2, 1 antes
do `×`. Não repete o mesmo app em seguida, não aparece sobre tela cheia nem sobre o login.
No computador deita; no celular fica em pé. Botão "Conhecer" — nunca "Assinar já" em app
gratuito. Exibições e cliques contados por anúncio. Premium não vê nada disso. O RootifyONE
não tem anúncio.

## Conta, senha e perfil

Apelido + e-mail + senha; entra por qualquer um dos dois. PBKDF2. "Esqueci a senha" por
servidor, por formulário ou pelo **código de recuperação** mostrado uma vez na criação — ao
usar, gera um novo e invalida o antigo. Login com Google, biometria (desbloqueio) e senha.
Visitante não deixa rastro.

**Conta SolverONE — um login para todos os apps (decisão de 03/Out/2026; primeiro app: OmniLifeONE
2.13.0).** A conta é a do banco da plataforma (Supabase `solverone-app`; contrato em
`PLATAFORMA-DADOS.md`): e-mail e senha, Google, criar conta e "esqueci a senha", por REST e sem
biblioteca (padrão do módulo Plataforma do Contador de Histórias). No código ficam só a URL e a
publishable key, que são públicas; quem protege os dados é o banco (RLS).

- **Sessão numa chave comum** do `localStorage`: `solverone.sessao.v1`
  (`{access_token, refresh_token, expira, email, nome, desde}`). Entrou num app, vale em todos do
  mesmo endereço. É a única chave sem o prefixo do app, de propósito.
- Antes de renovar o token, **ler a chave de novo** (outro app ou outra aba pode ter renovado) e
  renovar uma vez só por vez. Enquanto um app ainda guardar a sessão numa chave própria (o Contador
  usa `ch_solverone_sessao`), quem migra aproveita essa sessão e **mantém as duas iguais**: se cada
  um renovar com o mesmo token, o servidor derruba os dois.
- **Sair** = `logout?scope=local` (só este aparelho) e apagar a chave. Os outros aparelhos
  continuam conectados.
- **Volta com a sessão no endereço só se este aparelho pediu.** Ao tocar em Google, criar conta ou
  "esqueci a senha", o app grava um marcador (OmniLifeONE: `omnilife.contaPedido`, vale 2 dias).
  Link que chega com `#access_token=…` sem esse marcador pode ser alguém tentando conectar a conta
  **dele** no aparelho da pessoa (e, na nuvem, receber os dados da família): o app pergunta "Este link
  quer conectar a conta x@y neste aparelho. Foi você?" e só conecta com o sim.
- **Ao entrar e ao abrir já conectado** (uma vez por aba): `minha_conta_encerrada` (se estiver
  encerrada, avisa e desconecta), `sol_registrar_uso('<app>')` (C4) e a Edge Function
  `solverone-admin` com `{acao: 'registrar-acesso', evento: login|refresh, app}` (C9); ao sair,
  `evento: logout`.
- **"Encerrar minha conta / pedir exclusão dos meus dados"** = `minha_solicitacao_exclusao`, com
  motivo opcional e duas confirmações, como no Lab. Dados que ficam só no aparelho não saem dele:
  o app lembra onde apagá-los.
- **Registrar uso e acesso assim que a conta entra** (volta do Google, janela de e-mail) **ou ao abrir já
  conectado**, antes de qualquer tela de família ou perfil — nunca depender de a pessoa chegar ao app
  por dentro (lição do OmniLifeONE 2.14.0: parou em "Quem está usando?" e o RootifyONE não viu o app).
  Uma vez por abertura e por conta; recarregar a aba não conta de novo. **Envio garantido e sem duplicar**
  (OmniLifeONE 2.14.2): o evento entra numa fila do aparelho antes de sair; a chamada vai com `keepalive` (se
  a página trocar durante a pré-verificação CORS, sem keepalive só o OPTIONS chega); o que falhou é reenviado
  ao abrir, ao voltar a internet e em 1 min; recusa do navegador na saída da página (`pagehide`) não conta
  como falha.
- **Com a conta conectada, a nuvem tem prioridade** sobre os perfis guardados só no aparelho (inclusive o
  modo local de versões antigas). Depois de entrar, se a conta ainda não tem dados na nuvem, uma tela só
  com as escolhas: **criar novo na nuvem**, **levar os dados deste aparelho** ou **descartar os dados deste
  aparelho** (para testes; com a cópia protegida oferecida antes). Levar ou descartar pede o PIN/digital de
  um responsável do aparelho — **de verdade**: só aparecem responsáveis com PIN ou digital e nunca vale um
  "Confirmar" simples (perfil duplicado fica sem PIN); se ninguém tiver PIN, digitar o nome da família. Quem escolhe "usar só neste aparelho" é respeitado até entrar na conta de
  novo; o link de nova senha não muda essa escolha. Sem internet, abre o que está no aparelho.
- Digital e PIN continuam sendo só o **desbloqueio do aparelho**; visitante continua sem conta.
- No Supabase (Authentication → URL Configuration), os endereços de volta (Google, confirmação de
  e-mail, nova senha) precisam aceitar `https://solverone.com.br/**`.

**Recarregar não desloga.** Atualizar a página (F5), girar o celular ou voltar para a aba não
pede login de novo enquanto a sessão vale; quem encerra é o bloqueio por inatividade, o "Sair"
ou fechar a aba (conforme o app). Nunca guardar senha para isso: só uma chave de sessão.

**Voltar ao mesmo lugar depois de entrar** (vale em todos os apps; no RootifyONE já funciona
pela rota no endereço). O visitante que está numa tela, aba ou item e decide **entrar ou criar
conta** volta para **exatamente ali**, nunca para o Início:

- Antes de abrir o login/cadastro, o módulo guarda o ponto de retorno (`DGO.voltarPara`):
  endereço com `#`/rota, aba ou seção aberta, item selecionado, posição de rolagem e o que a
  pessoa já tinha digitado num formulário. Fica no `sessionStorage` do app
  (`dgo:<app>:voltarPara`), vale por pouco tempo (ex.: 30 min) e é apagado ao usar — não é
  rastro do visitante, é só o marcador da volta.
- Vale para todos os caminhos: e-mail e senha, Google/GitHub (no OAuth, `redirectTo` = o
  endereço atual, e na volta o módulo restaura o resto), confirmação de e-mail e "esqueci a
  senha" (o link traz de volta ao ponto guardado, se ainda válido).
- Só aceita destino **do próprio site** (mesma origem e caminho do app) — nunca um endereço
  vindo de parâmetro de fora, para não virar redirecionamento aberto.
- Se o lugar exige plano ou permissão que a conta não tem, mostra o aviso ali mesmo (o que
  falta e como conseguir), sem jogar para o Início.
- Ao voltar, um aviso curto: "Pronto, você entrou. Continuando de onde estava."

Senha e código de recuperação **sempre aceitam colar** e nunca exigem decorar nada (WCAG
3.3.8 Accessible Authentication). Nada de CAPTCHA de quebra-cabeça.

**Perfil comum entre apps:** dados que valem para a pessoa inteira (nome, apelido, data de
nascimento e idade calculada, idioma) ficam num perfil global (`dgo:global:perfil`, depois
Firestore), não repetidos em cada app. O wizard de um app **reaproveita** o que já existe
(WCAG 3.3.7) em vez de perguntar de novo.

**Consistência:** o módulo compara o que cada app guardou (data de nascimento, chaves de API,
e-mail). Divergente, faltando ou pendente → avisa e pergunta **qual está certo**, e grava a
resposta para todos. Nunca escolher sozinho.

## Inbox, recados e tarefas

Um lugar só, em todos os apps, para três tipos de mensagem:

1. **Aviso do administrador da plataforma** — vem de `recados.json` (central no RootifyONE),
   com data de início e fim e público (todos, membros, premium, um app). Funciona hoje, sem
   servidor.
2. **Aviso do próprio app** — o que as notificações disparam também fica guardado aqui, para
   quem não viu na hora.
3. **Recado de outra pessoa** — "Novo recado de XXXX para YYYY sobre ZZZZ". Caso principal:
   família no [[omnilife-one]]. **Exige servidor**. Deixar tela e formato prontos e ligar no
   Firebase.

Cada recado tem **prioridade** (urgente, importante, só para saber), **destino** (família toda
ou membros específicos) e pode ser **recorrente**. Lido/não lido visível **para quem lê e para
quem enviou**.

**Tarefa** é um recado que termina com um estado: **feita, adiada ou cancelada**, com quem e
quando, e **foto como evidência** quando fizer sentido.

**Lembrete rápido:** favoritos e frequentes com um toque (ex.: "Comprar tablete lava-louças —
Mercado/Limpeza") e prazo em linguagem de gente: "antes do dia X", "na próxima ida ao mercado",
"esta semana", "daqui a N dias".

**Ícone 📥 no cabeçalho com bolha** (não é item da barra de baixo): número de não lidos
(recados, avisos, alertas novos) e **cor pela prioridade mais alta** entre eles — 🔴 vermelha se
houver algo crítico/urgente, 🟠 âmbar se houver importante, 🔵 azul para recados e coisas menores
(ex.: 1 urgente + 4 importantes + 2 menores = vermelha). O `aria-label` diz a quantidade e se há
urgente. Alertas do app entram na Inbox e contam como não lidos até a pessoa vê-los uma vez.

**Ordem dentro da Inbox:** 1º **prioridade** (urgente → importante → para saber), 2º **mais
recente primeiro**, com um título pequeno por faixa de prioridade.

Regras: contador de não lidos no botão e no ícone do app (`setAppBadge`), marcar como lido,
arquivar, `aria-live` discreto para leitor de tela, e nada de apagar sozinho.
A inbox respeita o horário silencioso para o aviso, nunca para o conteúdo.

## Família e contas compartilhadas — governança entre os responsáveis

Vale para todo app com conta de família ou compartilhada (OmniLifeONE; Plano Família; depois
Profissional–Cliente). Benchmarks: Apple Family Sharing, Google Family Link, 1Password Families,
Bitwarden (acesso de emergência) e apps de pais separados (OurFamilyWizard). Implementado no
OmniLifeONE 2.3.0 (módulos `Gov`, `Devices`, `Grow`, `Areas`, `Duas`).

1. **Ninguém derruba um chefe sozinho.** Rebaixar ou remover outro chefe vira pedido: outro chefe
   aprova, ou vale depois de 48 h sem veto; o próprio alvo pode vetar. Mudar a si mesmo ou quem não
   é chefe é direto. Sempre sobra pelo menos um chefe; o criador é sempre chefe.
2. **Todos os chefes são avisados** das mudanças sensíveis (papéis, remoções, regras, convites,
   emergência, aparelhos) — Inbox e notificação — e tudo vai para o histórico de segurança (só
   inclusão).
3. **Passar a criação** (dono) só vale quando a outra pessoa **aceita**.
4. **Ajudar a entrar de novo:** e-mail de troca de senha; convite de uso único (24 h) já ligado à
   mesma pessoa e papel; no modo "só neste aparelho", o responsável limpa o PIN.
5. **Acesso de emergência ao cofre:** contatos de confiança + espera (1/2/7/14 dias); o contato
   pede, os responsáveis são avisados e podem negar; sem veto, libera. O contato abre com um
   **código** entregue antes, fora do app (a senha mestra cifrada com esse código — "envelope").
6. **Aparelhos conectados:** lista por pessoa, último uso, "desconectar" à distância.
7. **Criança que cresce:** na idade escolhida (16/18/21), sugerir passar a adulto e soltar o
   controle parental.
8. **Duas casas (pais separados):** calendário de guarda (semanas alternadas, 2-2-3, 5-2-2-5, fins
   de semana, manual, com troca de um dia), despesas divididas com comprovante e saldo, e **registro
   de combinados que não se edita nem apaga**.
9. **Responsável por área:** dividir Compras, Saúde, Casa… entre adultos; o nome aparece no topo
   da área e os avisos daquela área vão primeiro para essa pessoa.

Na nuvem, as partes de segurança (1, 3, 5, 6, 8) são garantidas pelas **regras do Firebase**, não
só pela tela; a cada mudança de regra, o pacote traz o arquivo `regras-firestore-<app>.txt` e o
LEIA-ME manda colar de novo. Sem servidor, "desconectar" encerra a sessão quando o aparelho abre o
app; revogar o login na hora exige servidor (Admin SDK) — fase 2.

## Linguagem para leigos (prioridade)

Decisão do dono, 04/Out/2026, depois do teste real do OmniLifeONE 2.15.0 no celular: **a experiência para
quem não é do ramo vem antes de qualquer recurso novo.** Pense numa **dona de casa ou empregada doméstica sem
experiência digital** ao escrever nomes, textos, ajuda e mensagens — em todas as telas, de todos os apps.

- **Nome que diz o que tem dentro.** Ex.: no OmniLifeONE o "Cofre" virou **"Senhas da casa"**; tipos com nome
  do dia a dia ("Senha do Wi-Fi", "Portão, alarme e cadeado") em vez de categorias técnicas ("Apólice",
  "Escritura"). Os **nomes principais** (de telas, abas, funções e tipos) **só mudam com aprovação do dono**:
  mostrar antes a proposta, com prints simulados; se ele delegar ("escolha pelas melhores práticas"), escolher
  e registrar que ele vai refinar depois.
- **Sem palavra técnica na tela**: nada de "cifrado", "criptografado", "ponta a ponta", "biometria", "chave",
  "sincronia", "token", "PRF", "AES". Trocar por "embaralhado aqui no celular", "digital", "foi para a
  internet". O texto legal e a documentação técnica podem continuar técnicos.
- **Exemplo em cada campo** ("Ex.: CASA_SILVA", "Ex.: Portão da garagem") e **só os campos que importam**:
  formulário com tipos mostra apenas os campos do tipo escolhido (Wi-Fi = nome da rede + senha). Campo já
  preenchido num registro antigo nunca some.
- **Primeiro uso guiado**: na primeira vez numa função nova ou sensível, um passo a passo curto na tela (3 a 5
  telas, "Passo 1 de 4", com Pular / Voltar / Próximo) explicando o que é, quem vê, como abrir e o que nunca
  perder; o último botão já começa ("Começar"). Depois, um link "❔ Como funciona" em todas as telas dela.
- **Mensagem diz o que fazer**, não só o que deu errado ("PIN errado 2 vezes. Depois de 10 vezes, bloqueia
  neste celular." em vez de "Erro de autenticação").
- **Opções avançadas recolhidas** (ex.: "⚙️ Opções deste celular"), para a tela principal ficar simples.
- **Teste**: além do teste de funcionamento, um teste "pensando num leigo" que procura palavras técnicas nas
  telas e confere os campos de cada tipo; mandar **prints em tamanho de celular** no resumo da entrega.

## Acessibilidade

Norma de referência: **WCAG 2.2**, recomendação do W3C desde 5 de outubro de 2023. Alvo **nível
AA**. WCAG 3 ainda é rascunho — não correr atrás dela. O critério 4.1.1 (Parsing) saiu da 2.2.

O que sempre vale:

- **Contraste** 4,5:1 em texto normal, 3:1 em texto grande e em ícone ou borda que carregue
  significado.
- **Alvo de toque** de no mínimo 24×24 px CSS (2.5.8, AA); onde couber, 44×44 (2.5.5, AAA).
- **Foco visível** e não encoberto por barra fixa (2.4.11) — ver `scroll-padding-top` acima.
- **Arrastar sempre tem alternativa** de um toque (2.5.7).
- **Ajuda no mesmo lugar em todas as páginas** (3.2.6) — é o AssistONE.
- **Não pedir duas vezes a mesma informação** (3.3.7) — perfil comum e wizard reaproveitam.
- **Reflow**: tudo utilizável a 320 px de largura sem rolagem lateral da página (1.4.10).
- **Texto até 200%** sem quebrar (1.4.4). Tamanhos em `rem`, nunca `px` travado. Texto que
  cresce **quebra linha**, nunca sai da tela — inclusive cifra, mantendo o acorde alinhado
  sobre a sílaba.
- HTML semântico, `<label>` em todo campo, `alt` em imagem que informa, `alt=""` na decorativa.
- Respeitar `prefers-reduced-motion`.
- Nada que dependa só de cor para dizer alguma coisa.

**Controles na mão de quem usa**, numa seção Acessibilidade das Configurações, iguais nos apps:
tamanho da fonte (A− A+, guardado), alto contraste, reduzir animações, sublinhar links,
modo leitura (tira fundo e enfeite), **ler a tela em voz alta** e **falar em vez de digitar**.

**Campos de valor no celular:** além do teclado, botões de somar e subtrair em degraus
(−0,01+ … −1+ −10+ −100+ −1.000+ −10.000+), e microfone para ditar o valor. Começa no
MoneyTRIO; vira componente do módulo.

## Voz: leitura em voz alta (TTS)

Vale para qualquer app com texto longo: histórias, planos de governo (Eleições), tutoriais de
investimento (MoneyTRIO), narração do personal trainer virtual (RiseONE), cifra, avisos e
recados da inbox. Ícone de som ao lado do trecho; PT e EN.

**Duas camadas, escolhidas pelo usuário nos Ajustes** (com troca entre soluções como no
Contador):

1. **Voz de internet com áudio guardado** (Gemini TTS na cota grátis; ElevenLabs/OpenAI pagos).
   Pedaços curtos no início (≈180 caracteres) e maiores depois; os próximos baixam em segundo
   plano; cada pedaço vai para o IndexedDB com chave `id|índice|motor|voz|modelo|hash`. Repetir,
   voltar ou ouvir amanhã **não gasta cota de novo** e funciona sem internet. Baixar respeita a
   preferência de rede (áudio = pacote pesado).
2. **Voz do aparelho** (Web Speech API) — grátis e instantânea, plano B.

**Áudio guardado por item** (história, capítulo, tutorial): indicador 🔴🟡🟢 de quanto já está
baixado, botão baixar tudo e aviso ao dar play sem áudio.

**Voz guardada é por conteúdo, não pelo motor escolhido agora:** selo "voz guardada / em parte"
em cada item, válido para qualquer voz já baixada; trocar para a voz do aparelho **não apaga
nada** e, se houver voz de internet inteira guardada, toca com ela sem gastar cota. Nas
Configurações: total em MB (`navigator.storage.estimate` para a cota), lista por item com
lixeira, limpeza de sobras (itens apagados) e "apagar tudo". Apagar um item apaga a voz dele.

**Tela de bloqueio:** com áudio de verdade (camada 1), preencher `navigator.mediaSession`
(título, app, ícone) com play/pausa/anterior/próximo — é o que aparece na notificação do celular.

Nunca depender do "Ler em voz alta" do navegador nem de voz que um site não consegue selecionar.
A Web Speech API não garante a mesma voz em todo aparelho; quando precisar ser igual, é a camada 1.

**Regras da voz do aparelho (confirmadas pelo guia bilíngue de set/2026):**

- Só existe o que `speechSynthesis.getVoices()` devolve; não dá para forçar outra voz. Nunca
  fixar nome de voz no código ("Microsoft Francisca…"): as vozes Naturais do Edge existem no
  computador e **não existem no Android nem no iOS**.
- A lista chega atrasada e muda: recarregar em `voiceschanged`, em 0,1/0,9/3 s, ao voltar para a
  aba (`visibilitychange`), ao abrir Ajustes e num botão **🔄 Recarregar vozes**.
- Idioma escrito de qualquer jeito: `pt-BR`, `pt_BR`, `por-BRA`, `pt` (normalizar `_`→`-`, minúsculas;
  português = começa com `pt` ou `por`). Preferir pt-BR, depois qualquer pt.
- Oferecer sempre **🔧 Padrão do aparelho**: nenhuma voz escolhida, só `lang='pt-BR'`. No Android
  é isso que faz o navegador usar o **mecanismo padrão das Configurações** (Google, Samsung,
  SherpaTTS, Acapela), mesmo quando a voz nova não aparece na lista.
- `lang` sempre `pt-BR` para texto em português, mesmo quando a voz veio como `pt_BR`.
- ⭐ (parece natural) para nomes com natural|online|neural|enhanced|premium|wavenet|piper|sherpa|
  coqui|vits|acapela|kokoro|woheller69|ttsengine|`-low/-medium/-high`; reconhecer o mecanismo pelo
  nome/URI e mostrar diagnóstico: "o navegador enxerga N vozes, M em português · mecanismos: …".
- Falar só a partir de um toque; `cancel()` antes de falar se houver fila presa, com 60 ms de espera
  (o Chrome derruba o `speak` colado no `cancel`); uma frase por vez; vigia de tempo para não
  travar; `resume()` a cada 9 s (o Chrome do Android para em ~15 s).
- No Android o navegador **guarda a lista de vozes** até ser fechado de vez. Depois de trocar o
  mecanismo: Configurações → Aplicativos → Chrome/Edge → **Forçar parada**; se ainda vier a voz
  antiga, reiniciar o aparelho. Explicar isso no app, num botão **❓ Instalei uma voz e ela não aparece**.
- Cada app com voz leva **`TESTE-VOZ-<app>.html`** (PT/EN, independente do app): lista tudo o
  que o navegador enxerga (idioma, mecanismo, local), opção Padrão do aparelho e fala com a voz
  escolhida.
- Voz e música juntas (RiseONE com Spotify): a voz não pausa a música nem o contrário — tocam
  juntas; testar em cada plataforma, porque o sistema pode abaixar ou pausar a outra fonte.

**Mecanismos no Android (Samsung One UI; nomes de menu variam):** Configurações → 🔍 "conversão
de texto em voz" (na Samsung, "Configurações de Leitura de texto Samsung"; não é o TalkBack) →
Mecanismo preferido → Reproduzir.

| Mecanismo | Custo | Offline | Como |
|---|---|---|---|
| SherpaTTS (Piper/Coqui) | grátis, código aberto | sim, após baixar o modelo | F-Droid oficial → `org.woheller69.ttsengine` → baixar um modelo `pt_BR` (um por idioma) → escolher como padrão; Bloqueador automático da Samsung desligado só na instalação |
| Google (Speech Recognition & Synthesis) | grátis | depende da voz | Play Store → atualizar → engrenagem → Instalar dados de voz → Português (Brasil) |
| Samsung | grátis, já vem | sim | Instalar dados de voz → Português (Brasil); naturalidade varia |
| Acapela TTS Voices | pago por voz | sim | Play Store, prévia antes de comprar, voz presa à conta Google |

## Microfone e ditado (STT) — vale para TODO 🎤

Todo botão de microfone que transforma fala em texto (recado, lista de compras, busca, lembrete,
nota, comando) segue as mesmas regras. Um ponto só no código (ex.: `Voice.dictate`/`Voice.listen`).

- **Explicar antes de frustrar.** No computador, o reconhecimento do navegador (Chrome manda o
  áudio ao Google) muitas vezes grava e **não devolve texto** — rede da empresa, VPN, microfone
  padrão errado no Windows, Edge/Brave/Opera. No **primeiro toque no 🎤 da sessão**, em computador
  e sem IA configurada, mostrar uma dica **não bloqueante** (cartão no rodapé, não janela):
  "No computador, o Chrome às vezes grava e não transforma em texto. Com a IA grátis (uns 2 minutos,
  uma vez só) o app transcreve sozinho. É opcional: enquanto isso, digite ou use ⊞ Win + H."
  Botões: **⚙️ Configurar a IA agora** (link direto para Configurações → IA), **Depois** e
  **Não mostrar mais**. O link é **opcional** — nunca obrigar a configurar para usar o app.
- **Quando falhar sem IA**, mostrar o mesmo cartão com o título "Captei sua voz, mas o navegador
  não devolveu o texto" (este aparece mesmo com "Não mostrar mais", porque explica a falha).
- **A tela de IA, aberta pelo 🎤**, mostra no topo "Para a voz funcionar no computador" com os 3
  passos (abrir o site da chave, criar e copiar, colar e salvar). Ao salvar: "Pronto ✓ Volte e toque
  no 🎤 de novo".
- **Plano B com IA:** enquanto o navegador escuta, gravar o áudio junto (WAV 16 kHz mono via
  Web Audio — o Gemini não aceita o `webm` do MediaRecorder do Chrome). Se não vier texto e o
  microfone captou som, mandar a gravação para a IA transcrever (provedor do cofre; Gemini aceita
  `audio/wav`). Sem reconhecimento no navegador e com IA, funciona só gravando.
- **O ✓ OK sempre encerra.** Botão OK visível durante a gravação (o detector de silêncio falha
  muito); se `stop()` não responder em ~0,7 s, `abort()` e encerrar na marra. Tocar de novo no 🎤
  também encerra. Nada fica piscando para sempre.
- **Mostrar o que está acontecendo:** "Ouvindo… fale agora", texto parcial aparecendo enquanto a
  pessoa fala e **medidor de volume** (barra verde). Sem som em ~6 s: "Não estou captando som".
- **Pedir o microfone antes** (`getUserMedia`) para o aviso de permissão aparecer e para saber se
  foi bloqueado. Cada erro com motivo e o que fazer, em PT e EN: `not-allowed` (cadeado 🔒 →
  Microfone → Permitir), `audio-capture`/microfone mudo (Configurações do Windows → Sistema → Som
  → Entrada: o Chrome usa o microfone **padrão do sistema**, não o escolhido no site), `network`
  (serviço do Google bloqueado → IA ou ⊞ Win + H), `service-not-allowed` (usar Google Chrome),
  `no-speech`. Nunca só "não funcionou".
- **Limpar a fala antes de mostrar**: tirar muletas e comandos ("é", "hum", "tipo", "né",
  "coloca", "põe", "adiciona", "na lista", "por favor", "preciso comprar"…), entender números e
  unidades faladas ("dois litros de leite" → `2 l de leite`, "uma dúzia" → 12), separar itens por
  "e", "mais" e vírgula, e juntar o mesmo item dito duas vezes. O resultado vai para o campo para a
  pessoa conferir.
- **Confirmar sem atrito** o que foi gravado a partir do campo (sem janela): linha logo abaixo,
  "✓ Leite e Pão entraram na lista · Ver lista (6) ›", dizendo também o que "já estava"; some em
  alguns segundos e vira um atalho fixo discreto para a lista ("🛒 6 itens na lista · Ver lista ›").
  O contador da lista na tela sobe na hora.
- Microfone só por toque, nunca ao abrir a tela; o texto ditado entra no campo e a pessoa revisa
  antes de enviar; ditado não apaga o que já estava escrito (acrescenta).

### Comandos de voz e assistentes

Usos: ditar valores e itens (MoneyTRIO, OmniLifeONE), avisar "terminei" no exercício (RiseONE),
comandos simples para quem cuida de idoso (OmniLifeONE), comandos no Contador.

**Comandos de voz (STS):** reconhecimento do navegador (`SpeechRecognition`) com lista fixa de
comandos e, opcional, a IA traduzindo frase livre num desses comandos. Desligado de fábrica
(no Chrome o áudio vai ao Google), microfone só por toque, pausa a leitura enquanto escuta.
Trocar o reconhecimento (Whisper etc.) = mudar uma função só.

- Comandos declarados no config de cada app (`comandos: [{ frase, sinonimos, acao }]`), PT e EN;
  se não reconhecer, mostrar o que ouviu e as opções.
- Suporte do navegador: Chrome e Edge (áudio vai ao servidor deles) e Safari; **Firefox não tem**.
- **Siri, Alexa, Google/Galaxy:** site não se registra nesses assistentes. Sem app nativo, o que dá
  é atalho que abre uma URL do app (Atalhos do iPhone, rotina do Android). Integração de verdade
  exige app nativo (ou skill da Alexa com servidor) — fica para a fase nativa.

## Compatibilidade do aparelho e do navegador

**No topo das Configurações, só quando houver problema**, dois quadros em linguagem de gente:

1. **Recursos do aparelho** — o que falta e o que isso afeta: câmera frontal, câmera traseira,
   som (alto-falante ou fone), microfone, localização (GPS), notificações, vibração, resolução
   da tela, espaço livre… com uma coluna de status (✅ ⚠️ ❌).
2. **Programas** — o que foi detectado e o mínimo exigido: sistema e versão, navegador e versão,
   com **link para atualizar** quando existir.

Níveis de reação:

- **Parcial** → no momento de usar a função afetada, pop-up curto com "Estou ciente".
- **Total** → tela que não deixa entrar, dizendo o que foi detectado (ex.: "iOS 14, iPhone 7"),
  a versão mínima e a lista de plataformas suportadas.

Regras técnicas:

- Decidir por **detecção de recurso** (`'mediaDevices' in navigator`, `enumerateDevices()`
  etc.), não pelo nome do navegador. O nome do sistema/navegador serve para **escrever a
  mensagem** e a orientação certa.
- Orientação diferente para cada ambiente, **detectado sem perguntar**: Android navegador,
  Android dentro de app (webview), iPhone Safari, iPhone dentro de app, app nativo (futuro),
  computador. Assumido: no iPhone todo navegador usa o motor do Safari, e iPad pode se
  apresentar como Mac.
- Funcionar em aparelho antigo o quanto der: sem sintaxe moderna que quebre navegador velho no
  módulo comum, e recurso novo sempre com teste de existência antes de usar.

## Público e desempenho

Público-alvo inclui quem tem **celular simples, pouca memória e internet cara**. Decisões:

- Nada de framework nem build — o que já vale por outro motivo vale aqui também.
- Primeira tela leve; imagem grande só com `loading="lazy"` e em tamanho de tela, não de câmera.
  Desenho simples (vetor) em vez de foto quando der — ex.: aparelhos e movimentos no RiseONE.
- Funcionar depois da primeira visita mesmo sem internet (service worker já faz).
- **Nada pesado baixa sozinho.** O motor de OCR tem ≈11 MB: só baixa quando a pessoa usa OCR
  pela primeira vez, respeitando a preferência de rede. Vale a mesma regra para áudio de voz,
  tabelas offline (CID/TUSS) e qualquer pacote grande: `DGO.rede.pedirPesado`.
- Preferir o que é barato para o aparelho: CSS em vez de animação em JS, lista com paginação
  em vez de milhares de linhas de uma vez.
- Instalar como app (PWA) em vez de exigir loja — ocupa pouco e atualiza sozinho. O ícone na
  tela inicial é o atalho "tipo app" (inclusive offline); um `index.html` solto no aparelho não
  é necessário nem confiável (o Android abre arquivo local com restrições).
- O Portal oferece "Adicionar à tela inicial" de cada app só no celular.

## Usar sem internet e atalho na tela inicial

Vale para **todos os apps, exceto** o Portal (HUB), o RootifyONE e o Feature Tester.

O objetivo do usuário: ter o app no celular/tablet com **o ícone do próprio app**, que **com
sinal abre a versão da web** (sempre a mais nova) e **sem sinal abre a cópia guardada no
aparelho**, sem precisar escolher. Isso é feito pelo **app instalado (PWA) + service worker**,
não por um `index.html` solto: arquivo local no celular abre com restrições, não aceita atalho
com ícone e guarda os dados separados do site.

- **Configurações → "Usar sem internet"** (seção do módulo comum):
  - **Salvar no aparelho**: baixa o app inteiro para o cache (lista de arquivos declarada no
    config, `offline.arquivos`, mais o que o app já usou), respeitando a regra de rede (partes
    pesadas só no Wi-Fi, com `DGO.rede.pedirPesado`). Mostra o tamanho antes.
  - **Criar atalho na tela inicial**: Android/Chrome/Edge com `beforeinstallprompt` (um toque);
    iPhone/iPad mostra os 3 passos (Compartilhar → Adicionar à Tela de Início); já instalado
    (`display-mode: standalone`) mostra "Já está na tela inicial".
  - **Situação**: "Cópia offline: versão X, salva em dd/Mmm/aaaa · N MB", com **Atualizar** e
    **Apagar cópia**. Atualiza sozinha quando houver sinal (e respeita Wi-Fi para o pesado).
- **Troca automática web ↔ cópia**: **código do app** (página, `.js`, `.css`, `.json`) com **rede
  primeiro**, conferindo com o servidor (`fetch(req, { cache: 'no-cache' })`, que fura o cache de
  até 10 min do GitHub Pages) e prazo de 4 s; sem resposta, usa a cópia guardada. Só arquivo
  pesado (imagem, som, motor de OCR) vai de cache primeiro, atualizando por trás. Nunca "página
  nova com `.js` antigo": isso fazia o primeiro recarregar depois de um release rodar misturado
  (no RootifyONE, pedia para entrar de novo). Já está assim no `sw.js` do módulo desde 25/Set/2026.
  Um selo discreto "Sem internet — usando a cópia do aparelho" enquanto estiver offline.
- **Ícone certo**: `manifest.json` de cada app com nome, `short_name`, cores e ícones 192/512 e
  `maskable`, e `apple-touch-icon` no HTML — é esse ícone que vai para a tela inicial.
- **"Instalar o aplicativo no celular" instala de verdade** (lição do OmniLifeONE 2.15.0, em que o passo do
  Início só abria as Configurações): com a janela do navegador (`beforeinstallprompt`) instala na hora; sem
  ela, mostra **o passo a passo do navegador em uso** (Chrome: ⋮ → Instalar app; iPhone: Safari →
  Compartilhar → Adicionar à Tela de Início), com o botão **"Já instalei"** para marcar como feito.
- **Navegador da Samsung (Samsung Internet) → instalar pelo Chrome.** Instalar pelo ícone da barra de endereço
  do Samsung Internet dispara o alerta do Google Play Protect **"App de risco bloqueado — criado para uma versão
  mais antiga do Android"**. O alerta vem do pacote que o próprio navegador da Samsung monta para instalar
  (o Play Protect passou a verificar apps de site na instalação); o manifesto do app não muda isso. Por isso:
  detectar `SamsungBrowser` no `userAgent` e orientar a instalar pelo **Chrome**, com botão **"Abrir no
  Chrome"** (`intent://<endereço>#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=…;end`),
  passo a passo numerado, explicação de que o app não tem risco, "Já apareceu o alerta? Toque em OK e siga os
  passos" e, para quem guarda dados **só no aparelho**, o aviso de fazer a cópia (backup) antes — os dados do
  navegador da Samsung não passam sozinhos para o Chrome. Aviso no Início **só nesse navegador**, com "Agora
  não".
- **No wizard**, quando o acesso for por celular ou tablet (e o app não estiver instalado),
  um passo próprio: "Quer usar sem internet e ter o ícone na tela inicial?" → Salvar no
  aparelho + Criar atalho. Pode pular e fazer depois pelas Configurações.
- **Plano B só no computador**: "Baixar cópia (arquivo)" gera um HTML único com tudo embutido;
  ao abrir com internet, leva para o site; sem internet, funciona local. Avisar na tela que
  essa cópia guarda os dados **separados** do site (use exportar/importar para levar dados).
- Config: `offline: { ativo: true, arquivos: [...], wizard: true }`; nos três apps de fora,
  `offline: { ativo: false }`.

## Rede: Wi-Fi ou dados

Toda pessoa tem em **Configurações → Rede e dados móveis** duas escolhas **separadas**, cada
uma com *Wi-Fi ou dados / Só no Wi-Fi / Nunca*:

1. **Baixar imagens, sons e pacotes grandes** — padrão **Só no Wi-Fi**.
2. **Perguntar à IA** — padrão **Wi-Fi ou dados** (uma pergunta pesa poucos KB).

O módulo guarda em `rede:pesado` e `rede:ia`; o config dá o padrão (`rede: { pesado:'wifi',
ia:'sempre' }`). Código do app respeita com `DGO.rede.podeBaixarPesado()` /
`DGO.rede.pedirPesado(descrição, MB)` (abre "Baixar mesmo assim / Esperar o Wi-Fi") e
`DGO.rede.podeUsarIA()`; evento `dgo:rede` quando a conexão muda.

Fato assumido: só Chrome/Android e Edge dizem se é Wi-Fi ou dados (`navigator.connection`).
Safari e Firefox devolvem "desconhecido" — aí "Só no Wi-Fi" bloqueia apenas quando o navegador
está em economia de dados, e a tela explica isso para ninguém achar que é defeito.

## Offline e sincronia pendente

Depois de carregado, o app **funciona sem sinal**: a pessoa registra a compra, o lançamento, o
recado — e o módulo guarda numa **fila de saída** (`DGO.fila`, IndexedDB) para enviar quando
houver conexão.

- Aviso claro ao registrar sem conexão, e um selo na tela **"N itens aguardando sincronia"**
  enquanto houver pendência. Ao terminar, o selo **diz que deu certo** — **"✓ Tudo sincronizado — o que você
  fez já está salvo na internet"**, em verde, por uns 5 s — e só então some (pedido do dono, 04/Out/2026: antes
  o aviso sumia sem explicar). Só quando faz diferença: depois de ficar sem internet ou de a fila esperar mais
  de 3 s; salvar normal, com internet, não avisa.
- Item pesado (com foto, áudio) respeita a regra de rede: pode ficar esperando o Wi-Fi, e o
  selo diz isso.
- Conflito (mesmo registro mudado em dois aparelhos) → **junta campo a campo e só pergunta o que
  bate** (decisão de 03/Out/2026): campo mudado só de um lado fica; listas somam (o que um lado
  tirou sai); só quando os dois mudaram o **mesmo campo** o app mostra as duas versões e a pessoa
  escolhe ("Depois" pergunta de novo em instantes). Nunca sobrescrever em silêncio.
- Com a conta SolverONE (Supabase), o padrão é o do OmniLifeONE 2.14.0: a tela lê sempre a
  **cópia do aparelho** (IndexedDB), cada mudança entra na fila e sobe quando dá; a gravação usa a
  **versão** do registro (trava otimista) e, se alguém mudou antes, junta como acima. Receber = só
  o que mudou desde a última vez; sem tempo real, o app consulta a cada 20 s e ao voltar para o app
  ou a internet. Registro recusado pelo banco não some: fica no aparelho, marcado, com "Tentar de
  novo". Sem internet ao abrir, o app abre com a última cópia.
- O selo é tocável e abre a lista do que está esperando ("Enviar agora").

## Trabalho demorado em segundo plano (`Fundo`)

Decisão do dono, 09/Out/2026, vale para **todo app**: **trabalho demorado nunca morre ao sair da
tela**. Foto (OCR, leitura de comprovante, borrar print), chamada de IA, importação ou exportação de
arquivos, transcrição e gravação de áudio, envio de anexos pesados, backup e restauração — tudo isso
**roda solto**, independente da tela que estiver aberta, e **entrega o resultado onde a pessoa estiver**.
É **um módulo só por app, chamado `Fundo`** (`DGO.fundo` quando o app usa o módulo comum; app sem o
módulo copia o mesmo comportamento com o mesmo nome). **No app nativo** (Capacitor/TWA, quando houver)
o `Fundo` vira **serviço em primeiro plano** (foreground service), com a notificação fixa do sistema.

**1. O que é um trabalho de `Fundo`.**

- Qualquer coisa que pode passar de **2 segundos** ou que depende de rede, câmera, microfone ou IA.
  A tela **não** executa o trabalho: ela **pede** ao `Fundo` (`DGO.fundo.iniciar({ tipo, titulo, dados,
  executar, aoTerminar })`) e recebe um `id`. O trabalho em si roda em `Promise`/`async` fora da tela,
  em **Web Worker** quando for processamento pesado (OCR, compressão de vídeo, hash) para não travar a
  interface. Trocar de tela, abrir menu, fechar modal, girar o aparelho: nada disso cancela.
- Cada trabalho tem `id`, `tipo`, `titulo` (para leigo: "Lendo o comprovante…", "Enviando o vídeo…"),
  `andamento` (0–100 ou "indefinido"), `inicio`, `fim`, `estado` (`rodando`, `pausado`, `feito`,
  `erro`, `cancelado`), `resultado`, `erro`, `telaOrigem`/`rota` (de onde a pessoa pediu) e
  `podeCancelar`. A lista fica em memória **e** no IndexedDB (`dgo:<app>:fundo`), para sobreviver a
  um recarregamento e dizer "um trabalho foi interrompido" quando o app voltar.

**2. Tela acesa (Wake Lock).**

- Enquanto houver trabalho rodando, o `Fundo` pede `navigator.wakeLock.request('screen')` e **segura a
  tela acesa**; solta quando o último trabalho termina. Se o navegador liberar (aba escondida), pede de
  novo ao voltar (`visibilitychange`). Sem suporte (Safari antigo, Firefox): segue sem travar, e a
  pílula avisa "mantenha a tela aberta até terminar". Nunca pede Wake Lock sem trabalho rodando
  (bateria).

**3. Perguntar antes de fechar ou recarregar.**

- Com trabalho rodando, `beforeunload` pergunta: "Ainda estou terminando <titulo>. Sair agora perde
  esse trabalho. Sair mesmo assim?" (o texto do navegador é genérico; o app mostra o próprio aviso ao
  tocar em sair/recarregar dentro do app e só deixa o `beforeunload` como rede de segurança). O botão
  **Voltar do celular** na tela inicial também avisa antes de sair.
- Trabalho que **pode ser retomado** (envio em fila, importação por etapas) grava o ponto no IndexedDB e,
  ao reabrir, pergunta "Continuar de onde parou?"; trabalho que não pode (chamada de IA no meio) é
  marcado `cancelado` com explicação, e o que já foi feito não se perde.

**4. Pílula de andamento (sempre visível).**

- Enquanto houver trabalho rodando aparece uma **pílula fixa** (canto inferior, acima da barra de baixo e
  abaixo do AssistONE, sem cobrir botões): ícone do tipo + título curto + barra fina ou "…" animado +
  contagem quando há mais de um ("2 em andamento"). **Um toque leva de volta** à tela/registro de origem
  **ou abre a lista** dos trabalhos (quando há mais de um): cada um com andamento, **Cancelar** (se
  `podeCancelar`), e, quando pronto, **"Ver resultado"**.
- Ao terminar: a pílula vira **"✓ <titulo> — Ver"** por 6 s (verde) e, se a pessoa estiver em outra tela,
  o resultado **é entregue onde ela estiver**: o registro é salvo normalmente (ex.: compra lida do
  comprovante entra na lista mesmo com a pessoa na Agenda), e o aviso "Ver" leva até ele. Se a pessoa
  **ainda estiver na tela de origem**, o resultado aparece no lugar, sem pílula extra. Em erro: pílula
  vermelha "⚠ <titulo> não deu — Tentar de novo / Detalhes", e o botão de feedback "Avisar que deu erro"
  já com o erro anexado (seção "Feedback dos usuários").
- Com o app **em outra aba ou minimizado**, ao terminar usa `Notification` (se a pessoa já permitiu
  notificações, seção "Notificações") — nunca pede permissão só para isso; toque na notificação abre a
  tela do resultado. Em `aria-live="polite"` para leitor de tela; respeita `prefers-reduced-motion`.
- Também aparece na **Inbox** do app ("Trabalho concluído: …") quando a pessoa não viu o aviso em
  6 s, para nada ficar sem registro.

**5. Regras de código e de teste.**

- Módulo único por app; **nenhuma tela** implementa a própria barra de progresso para trabalho
  demorado. API mínima: `DGO.fundo.iniciar(...)`, `andamento(id, pct, texto)`, `concluir(id, resultado)`,
  `falhar(id, erro)`, `cancelar(id)`, `lista()`, `aoMudar(fn)`. Cancelar usa `AbortController` (fetch
  da IA, upload) e `worker.terminate()`.
- Rede: respeita a regra Wi-Fi/dados e a fila offline (`DGO.fila`) — envio pesado sem rede vira item da
  fila, e a pílula diz "esperando o Wi-Fi". Trabalho de `Fundo` **nunca** segura chave de IA fora do cofre.
- Log local (`DGO.log`): início, fim, duração, erro — sem conteúdo do que foi processado.
- Teste de toda entrega: iniciar um OCR/IA e trocar de tela 3 vezes (resultado chega e o registro é
  salvo); recarregar no meio (aviso aparece; ao voltar, "interrompido" ou "continuar"); cancelar pelo
  botão da pílula; Wake Lock pedido e solto (ver em `about://` ou pelo indicador do navegador); sem
  internet no meio de um envio (vai para a fila); leitor de tela anuncia o fim; dois trabalhos ao mesmo
  tempo (lista com os dois).
- No **Feature Tester**, o `Fundo` tem um cartão próprio para testar os cenários acima com um trabalho
  simulado de 30 s.

## Segurança, criptografia, log e LGPD

**Hoje (site estático):** não há servidor para invadir; o risco está no que é publicado e no
navegador. Regras: HTTPS (o GitHub Pages já dá), nenhum segredo no repositório, `Content-Security-Policy`
em meta, `integrity` em qualquer script de CDN (ou hospedar), permissão mínima em câmera,
microfone, notificação e drive, e nunca dado pessoal em endereço de página.

**Criptografia:** senha nunca guardada, só o PBKDF2. Dado pessoal, chave de API e dado de saúde
guardados no aparelho ficam **cifrados** (AES-GCM do WebCrypto, com chave derivada da senha da
pessoa). Na nuvem, **cifrar antes de enviar** para o servidor só ver texto embaralhado — o
preço: senha e código de recuperação perdidos = dado perdido, e isso tem de ser dito na tela.
Visitante (sem senha) não tem como cifrar; por isso não guarda nada.

**Log de alterações:** toda mudança de dado (cadastro, configuração, dado pessoal, plano,
termos aceitos) grava `quando, quem, o quê, antes, depois`. Hoje: log local por app, com limite
de tamanho, visível nas Configurações. Com Firebase: coleção `log` só de inclusão, lida pelo
RootifyONE. O `quando` é gravado em **UTC** (ISO 8601) e a tela converte para o horário local;
em telas de log e auditoria, mostrar **segundos e o fuso** (`UTC−03:00`), para comparar registros
de aparelhos e países diferentes sem ambiguidade.

**Pentest:** num site sem servidor, pentest pago não se paga. O que vale agora é revisão de
código, Lighthouse e verificadores públicos de cabeçalho. Pentest de verdade entra quando
existir servidor com conta e dado de gente.

**LGPD e GDPR:** hoje os apps se apoiam em uso pessoal e de pesquisa, sem coleta. No momento
em que houver conta e nuvem, o usuário vira controlador de dados e passa a precisar de:
política de privacidade dizendo o que é coletado, por quê, onde fica e por quanto tempo;
consentimento separado para notificação, nuvem e cada uso de dado sensível; e botão de
**exportar meus dados** e **apagar minha conta** dentro do app. Coletar o mínimo.

- **Dado sensível** (saúde no RiseONE: exames, carteirinha, CID; dados de crianças no Contador)
  tem regra própria: consentimento específico, cifrado sempre, nunca para IA sem avisar.
- Definir, por app, se a SolverONE é **controladora** ou **operadora** do dado — com Firebase,
  o Google é operador.
- Todo texto legal leva **legislação e data de referência**, e uma rotina de revisar se a regra
  mudou. Isso não é assessoria jurídica: validar com advogado antes de coletar dado de gente.

**Criança (LGPD art. 14):** nome de criança não vai para a IA — trocar por códigos
(`[NOME1]`…) no ponto único que chama a IA e restaurar no aparelho, com campo para outros nomes
(irmãos, pets, escola). Avisar que voz de internet recebe o texto a ler. Nada de nome real de
criança em arquivo público do repositório (`historias.json` e afins).

**Nuvem gratuita em pequena escala:** Firebase ou Supabase resolvem sem servidor próprio.
AWS, GCP e Azure também têm camada grátis, mas cobram cedo e exigem operação — para este
porte, não compensam. Em qualquer um: ligar alarme de cobrança antes de ligar o serviço.

## Cofre de senhas e entrada sem internet
- Segredos (senhas do cofre e afins) são cifrados NO APARELHO antes de sair (AES-GCM 256, WebCrypto). A nuvem guarda só texto cifrado (ponta a ponta): nem o servidor nem a equipe SolverONE leem.
- Chave: uma chave aleatória do cofre da família, embrulhada (a) para cada membro com a chave pública dele (sol_chave_publica / sol_grupo_chaves; privada cifrada em omni_chave_privada) e (b) localmente por chave derivada do PIN/senha de desbloqueio (PBKDF2-SHA256, no mínimo 600.000 iterações, sal aleatório) e, quando o aparelho suportar, pela digital/rosto (WebAuthn com extensão PRF). A chave aberta só existe na memória enquanto o app está destrancado; nunca em localStorage.
- Cópia local: cache cifrado em IndexedDB com a mesma proteção; o cofre abre sem internet.
- Entrar sem internet: quem já entrou com a conta neste aparelho pode destrancar offline com PIN ou digital (a conferência é local: o PIN certo é o que consegue decifrar). Limite de tentativas com espera crescente; depois de 10 erros, só com internet + conta. Quando a internet volta, revalidar a sessão; conta encerrada, banida ou aparelho desconectado => apagar o cache cifrado e a chave local.
- Bloqueio automático do cofre por inatividade (ex.: 5 min) e ao sair do app. "Sair" apaga a chave da memória; "Desconectar este aparelho" apaga também o cache.
- Recuperação: código de recuperação do cofre mostrado uma vez; aviso claro de que perder PIN, senha e código = perder o cofre, a não ser que outro responsável da família reembrulhe a chave para a pessoa.
- Senha só aparece ao tocar no olho; ao copiar, limpar a área de transferência após ~30 s; nunca em log, endereço, notificação ou IA. Visitante não usa o cofre.

*Onde já está: OmniLifeONE v2.15.0 (03/Out/2026) — módulos `Cofre`, `Trava` e `copiarSegredo` (ver o `ARQUITETURA.md` do app).*

**Na tela (OmniLifeONE 2.15.1 e 2.15.2, 04/Out/2026 — ver "Linguagem para leigos"):**
- O cofre se chama **"Senhas da casa"** (no código continua `Cofre`/`vault`; não renomear o código). Tipos, os
  mais usados em casa primeiro, cada um com exemplo e só os seus campos: Senha do Wi-Fi; Portão, alarme e
  cadeado; Senha de site ou aplicativo; Banco; Seguro, contrato ou escritura (junta três tipos antigos, que
  continuam abrindo); Outro segredo. Item novo começa por **"O que você quer guardar?"**, em botões grandes.
- **Primeiro uso guiado** (4 telas: para que serve, quem vê, como abrir, o papel com o código) que abre
  sozinho na primeira vez; o código de recuperação é pedido como "Anote este código num papel" e o PIN como
  "6 números fáceis para você e difíceis para os outros (não use data de aniversário nem 123456)".
- Sem conta ("só neste aparelho"), a senha que abre tudo se chama **"senha principal"**.
- O "cofre de chaves" de IA é outra coisa e mantém o nome.



## Cópia (backup) e restauração sem duplicar usuário

**Regra geral para todos os apps: restaurar uma cópia nunca pode duplicar usuário.** Referência:
OmniLifeONE 2.11.1 (`Restore` / `Merge` em `index.html`; ver `ARQUITETURA.md`).

1. **Cópia protegida.** O conteúdo sai cifrado (AES-GCM 256) com uma chave de dados aleatória, embrulhada
   duas vezes: pela **senha da cópia** (mínimo 6 caracteres; 8+ recomendado) e por um **código de
   recuperação** de ~100 bits mostrado **uma vez** (Copiar; guardar fora do aparelho). PBKDF2-SHA256 com pelo
   menos 310 mil rodadas (OWASP 2023 recomenda 600 mil para apps novos). Em claro, só o mínimo (app, versão,
   data, primeiro nome de quem fez, quem tinha digital). O **PIN nunca vira chave da cópia** (é curto demais).
2. **Restaurar antes de entrar** (primeira tela, “Restaurar cópia”) **só com cópia protegida** e com a senha ou
   o código do dono. Cópia aberta (.json comum): explicar e só aceitar depois de entrar, por um responsável.
3. **Reconhecer a mesma pessoa e JUNTAR:** mesmo id interno; ou mesmo nome quando a cópia foi aberta com a
   senha/código. Os ids da cópia viram os do aparelho em **todos** os registros. Com gente no aparelho,
   perguntar **Juntar** (padrão) / **Substituir** / **Manter separado**.
4. **Juntar não perde nem tranca ninguém** (erros reais encontrados e corrigidos na 2.11.1):
   - **PIN, login (uid), papel e administrador do aparelho sempre vencem.** Um PIN guardado como
     `sha256(PIN + id)` **nunca** pode passar de um id para outro: o perfil ficaria trancado para sempre.
   - Registro nos dois lados: **saúde e ajustes se completam** (o do aparelho vence, vazios vêm da cópia, listas
     somam); o resto só entra se a cópia for **mais nova** (`updatedAt`; gravar a cópia sem trocar essa data).
   - **Manter separado** não sobrescreve nada do aparelho.
5. **Segurança do aparelho que recebe:** antes de entrar, escrever num aparelho que **já tem família** exige o
   **PIN/digital de um responsável** (ou do próprio perfil, se nenhum responsável tem PIN). **Substituir** baixa
   antes uma **cópia protegida** do que está ali (com a mesma senha/código digitado). Quem confirmou o próprio
   PIN entra direto no seu perfil; nos demais casos, o perfil só abre com o PIN dele.
6. **Digital de outro endereço não vale** (WebAuthn é presa ao domínio): avisar “ligue a digital de novo neste
   endereço” e deixar entrar pelo PIN/senha.
7. **Unir perfis duplicados** (para quem já ficou em dobro): mostra o que cada perfil tem, **confirmação dupla**
   (check + digitar o nome que some) **mais o PIN/digital de quem faz**, e **baixa uma cópia protegida antes**
   (nunca uma cópia aberta com dados de saúde no Downloads). Registros com o id da pessoa (ex.: ficha de saúde)
   são **juntados**, não sobrescritos; PIN, login e papel são os de quem fica; a digital do aparelho vai junto;
   na nuvem, dois perfis com login próprio não se unem (o que tem login é o que fica).
8. **Antes de aplicar qualquer mudança desse tipo, listar o que muda e os riscos de fraude:** arquivo roubado;
   força bruta; cópia forjada com o id ou o nome de outra pessoa; escrita sem login num aparelho com família;
   elevação de papel pela cópia; arquivo adulterado ou malicioso; perda de dado ao juntar; perfil trancado por PIN
   de outro id; abuso de “unir perfis”; cópia de segurança aberta; código de recuperação exposto; biometria de
   outro domínio. **E testar** os casos: aparelho vazio, mesmo nome com outro id, perfil sem PIN recebendo
   cópia com PIN, registro mais novo no aparelho, PIN errado, Substituir, unir com ficha de saúde nos dois.

## Propriedade intelectual e termos

**De terceiros:** só entra no repositório o que tem licença que permita. Cada arquivo de fora
(fonte, imagem, biblioteca, trilha, dado de mercado) vai num `CREDITOS.md` com origem e licença.
Preferir domínio público e CC0. Letra de música e cifra de obra protegida ficam no limite do uso
pessoal, com aviso e canal de remoção — como já está no [[cifras-violao]]. Nos Termos de cada
app, seção **"Direitos reservados e conteúdo de terceiros"** (ex.: música das eleições da Rede
Bandeirantes, dados de mercado vindos de API, mídias).

**Dele:** cada repositório leva um `LICENSE`. Repositório público sem licença significa, na
lei, que ninguém recebeu permissão — mas o código fica à vista de qualquer um, e isso não
muda com aviso. Contra plágio, o realista é: `LICENSE` claro, registro das marcas da família
ONE no INPI, e — quando houver servidor — manter a lógica de valor e os dados **no servidor**,
não no navegador. Minificar ou ofuscar só atrasa quem copia. Repositório privado com Pages
exige plano pago.

**Dos usuários:** o que a pessoa escreve (história, cifra, lançamento, recado) é dela. Nunca
publicar conteúdo de usuário sem pedir, nunca mandar para IA sem avisar que vai.

**Avisos legais por app:** conteúdo que pode ser confundido com orientação profissional
(exercício e saúde no RiseONE, impostos e investimento no MoneyTRIO) leva aviso "Estou ciente"
na entrada e nos Termos, em PT e EN, versionado pelo RootifyONE.

## AssistONE — assistente, ajuda, tutorial e wizard

O **AssistONE** é o assistente de todos os apps (arte: ponto de interrogação dourado com rosto de
perfil, fibras e pérola; arquivos `ajuda-botao.png`, `ajuda-icone.png` e `assistone-hd.png`).
É a mesma ideia do antigo "clipe" do Office, mas sem atrapalhar.

- **Ligado por padrão.** Liga/desliga em ⚙ → Geral, num cartão com o botão no estilo
  "ASSIST ONE ATIVADO" (arte + chave dourada). Ali também: "Abrir o AssistONE" e "Recomeçar o
  passo a passo e as dicas". Desligar pelo próprio balão avisa onde religar.
- **Onde fica:** personagem redondo flutuante no canto de baixo à direita, **acima da barra de
  baixo** no celular; no computador, canto de baixo à direita. Mesmo lugar em todas as páginas
  (WCAG 3.2.6). Alvo de 44×44 no mínimo, `aria-label` claro, foco visível.
- **Não cobrir nada:** some quando abre janela, menu ☰ ou tela de entrada; a página ganha espaço
  embaixo para o último item não ficar atrás dele; os avisos (toasts) sobem para cima dele; o balão
  aberto fica por cima dos avisos. Tocar fora fecha o balão; **Esc** fecha. O balão **não entra
  no histórico** (o Voltar do celular continua levando às telas).
- **Movimento:** flutua de leve; parado para quem pediu menos movimento (aparelho ou
  Acessibilidade do app). Imagem pequena embutida no HTML (webp, ~35 KB) para funcionar offline.
- **Ao tocar, dobra de tamanho** (de ~58 para ~116 px, transição de 0,25 s) enquanto o balão
  estiver aberto, e volta ao normal ao fechar; sem transição para quem pediu menos movimento. O
  balão nunca passa do topo da tela (altura máxima limitada pela altura da janela).
- **Começa pela ajuda da tela atual:** o primeiro bloco do balão é "📍 Você está em <tela>", com
  uma frase do que dá para fazer ali e 1 a 3 atalhos que já executam a ação (ex.: Compras →
  "🎤 Adicionar falando", "🥫 Ver a despensa"; Agenda → "Novo compromisso"). Cada app declara esse
  mapa por tela (título, frase, atalhos). As opções gerais vêm depois, sem repetir o que o bloco
  da tela já oferece.
- **Primeira visita:** balão "Olá! Eu sou o AssistONE 👋" com as opções (PT e EN):
  1. **Começar** — o wizard de onboarding;
  2. **Tour rápido** — destaca ☰, 🔍, ⚙, 🏠, ações rápidas, barra de baixo/abas e ele mesmo, com
     "Próximo" e "Sair" (pula o que não estiver visível na tela);
  3. **Procurar algo** — campo dentro do balão com **o mesmo índice da lupa**; resultados
     clicáveis; Enter abre o primeiro; "Ver todos" abre a busca completa; nada encontrado →
     "Você quis dizer…" (distância de letras sobre as palavras do índice) e atalho para a ajuda;
  4. **Ajuda desta tela** — abre a ajuda da tela atual (ou o índice de ajudas);
  5. **💬 Dar uma opinião / avisar um problema** — abre o formulário de feedback já com a tela
     atual preenchida (seção "Feedback dos usuários"); fica em todas as aberturas do balão, não só
     na primeira;
  6. **Agora não** e, discreto, **Desligar o AssistONE**.
- **Wizard é capacidade, não conteúdo:** o módulo dá o motor (sequência, progresso "Passo X de
  N · Y feitos", Fazer agora, Pular, Continuar depois, retomar) e cada app declara os passos com
  `feito()` e destino. Passos já feitos são pulados sozinhos; ao concluir um passo ele comemora e
  mostra o próximo. **Tocar fora do wizard** pergunta: "Sim, continuo depois" / "Voltar ao passo" /
  "Encerrar". Guardado, aparece o botão "▸ Continuar o início (X/N)" junto do personagem. No
  celular/tablet o wizard inclui "Usar sem internet e atalho na tela inicial" (exceto Portal,
  RootifyONE e Feature Tester). Passos pulados continuam no cartão de configuração do Início.
- **Dicas por tela:** uma dica curta por tela, **uma vez só**, alguns segundos depois de entrar;
  some sozinha; não aparece durante o wizard nem com janela aberta. "Entendi" / "Mais ajuda".
- A ajuda de cada app tem um tópico "AssistONE" e a busca acha "AssistONE" (e "clipe",
  "ajudante", "tutorial", "wizard").

## Notificações e mensagens fora do app

Avisos por tipo, ligados um a um. Horário silencioso segura e solta depois (urgente fura).
Lembretes com repetição. iPhone/iPad só com o app na Tela de Início. Permissão num botão,
nunca na abertura. Com o app fechado exige servidor de push. Todo aviso também vai para a inbox.

**Sem app instalado** (quem não pôs o app na tela inicial):

- **Hoje, sem servidor:** botão que abre o WhatsApp ou o Telegram com a mensagem pronta
  (`wa.me`/`t.me` com texto) — a pessoa só toca em enviar. Grátis, sem integração.
- **Com servidor:** bot do Telegram (API gratuita; o token do bot fica no servidor) e WhatsApp
  Business Cloud API (pago por mensagem pela tabela da Meta; conferir preço atual antes).
  E-mail de aviso pelo mesmo caminho do "esqueci a senha".
- Serviços gratuitos de mensageria e e-mail: pesquisar antes de escolher, com limites e custo
  de cada um.

## OCR — prioridade alta

Câmera e webcam, PT e EN, com tratamento de imagem e extração de valores, datas e CNPJ.
**Motor hospedado no próprio repositório** (≈11 MB): funcionalidade acima de espaço.
Sem os arquivos, cai sozinho para a versão que baixa da internet. Nunca baixar sem a pessoa
pedir — ver "Rede".

**Foto nítida** (o RiseONE saiu desfocado): pedir a câmera em resolução alta, foco contínuo
quando o aparelho oferecer, tocar para focar, usar `ImageCapture.takePhoto()` onde existir
(foto cheia, não quadro do vídeo), **medir a nitidez antes de aceitar** e pedir para tirar de
novo se estiver borrada. Sempre permitir escolher uma foto da galeria/arquivo.

Cada app estende o extrator: rótulos de alimento (RiseONE), exames e carteirinha (RiseONE),
modo de pagamento e cartão (MoneyTRIO), cifras (CifrasONE).

## Carregar vários arquivos de uma vez

Vale para **todo lugar que recebe arquivo ou foto** em qualquer app: exames e carteirinha
(RiseONE), extratos, faturas e notas (MoneyTRIO), documentos (OmniLifeONE), cifras (CifrasONE),
importações de CSV/JSON. Um componente só no módulo (`DGO.arquivos.escolher({ aceita, multiplos,
aoLer })`), usado por todos.

- **Várias formas de trazer**, todas com vários arquivos: botão com seleção múltipla
  (`<input type="file" multiple>`), **arrastar e soltar** vários no computador, **colar** imagem
  (Ctrl+V), **câmera em sequência** (tira uma foto atrás da outra até tocar em "Pronto") e, com o
  app instalado no Android, **compartilhar vários arquivos** de outro app direto para ele
  (`share_target` no `manifest.json`). Sempre com alternativa de toque ao arrastar (WCAG 2.5.7).
- **Tipos aceitos por lugar**: imagem (JPG, PNG, HEIC quando o navegador ler), **PDF com várias
  páginas** (cada página vira uma imagem para o OCR; PDF com texto é lido direto, sem OCR), CSV,
  OFX e JSON nos extratos. Arquivo de tipo errado é recusado **sozinho**, com o motivo, sem
  derrubar os outros.
- **Fila com progresso**: lista dos arquivos com miniatura, nome, tamanho e estado de cada um
  (na fila, lendo, pronto, erro — com "tentar de novo"). Dá para tirar um da lista, reordenar
  (↑↓) e cancelar tudo. Processa um por vez (celular simples não aguenta tudo junto) e a tela
  continua usável enquanto isso.
- **Detectar e juntar**: o app reconhece o tipo de cada arquivo (ex.: exame de sangue × laudo ×
  carteirinha; extrato de banco × fatura de cartão) e o período/data; junta o que é da mesma
  coisa (páginas de um mesmo exame, meses de um mesmo extrato) e **avisa duplicados** (mesmo
  arquivo pelo hash, ou mesmo lançamento/resultado em dois arquivos) antes de gravar.
- **Tela de conferência antes de salvar**: tudo o que foi lido aparece junto, agrupado por
  arquivo, com o trecho de origem ao lado; a pessoa corrige, desmarca o que não quer e só então
  confirma. Nada é gravado sem essa confirmação.
- **Limites claros**: mostrar antes o total (ex.: "12 arquivos · 38 MB") e respeitar a regra de
  rede para o que precisa baixar (motor de OCR) ou enviar (IA, nuvem). Se passar do limite do
  plano ou do espaço, dizer quanto passou e deixar escolher quais seguem.
- **Privacidade**: arquivos de saúde e financeiros são lidos **no aparelho** (OCR local) e ficam
  cifrados; só vão para a IA ou para a nuvem se a pessoa escolher, com aviso do que sai.
  Depois de lidos, a pessoa escolhe guardar o arquivo original (com o espaço que ocupa) ou só o
  resultado.

## IA: provedores, chaves e o guia passo a passo

**Regra: plano grátis primeiro.** O cofre de chaves é do módulo comum (`DGO.ia`, `diretrizes.js`
≥ 1.1.0) e é **igual em todos os apps e no RootifyONE**: cola uma vez, vale em todos.

**Capacidades** (`DGO.ia.capacidades()`): ✍️ `texto` (escrever, resumir, responder), 🎤 `stt`
(voz → texto, transcrição), 🔊 `tts` (texto → voz), 🖼️ `visao` (fotos, rótulos, exames, PDF).
Cada provedor declara `cap: [...]`; o cofre filtra por uso com chips no topo e mostra "Em uso
agora: ✍️ Groq 🎤 Groq 🔊 Voz do aparelho".

| Provedor | Capacidades | Grátis? (set/2026, conferir na conta) | Formato |
|---|---|---|---|
| Google Gemini | texto, stt, tts, visao | sim, sem cartão (AI Studio; cota por modelo) | próprio |
| Groq | texto, stt | sim, sem cartão (~30 req/min, ~1.000/dia; Whisper ~2 h de áudio/hora) | OpenAI |
| OpenRouter | texto | sim, modelos `:free` (20/min, 50/dia; 1.000/dia com US$ 10 comprados) | OpenAI |
| Mistral | texto, stt (Voxtral), visao (OCR) | sim, plano Experiment (pede celular) | OpenAI |
| Voz do aparelho | tts, stt | sim, **sem chave** (Web Speech) | — |
| Deepgram | stt | US$ 200 de crédito inicial, sem cartão | próprio |
| AssemblyAI | stt | US$ 50 de crédito inicial, sem cartão | próprio |
| ElevenLabs | tts | ~10 mil caracteres/mês (uso pessoal) | próprio |
| Cerebras | texto | US$ 5 por 30 dias, **pede cartão** | OpenAI |
| OpenAI | texto, stt, tts, visao | não (mín. US$ 5) | OpenAI |
| Anthropic (Claude) | texto, visao | não — pago por uso, crédito mínimo US$ 5 (o plano grátis do app claude.ai não serve para sites) | próprio (`/v1/messages` + cabeçalho `anthropic-dangerous-direct-browser-access: true`) |
| DeepSeek | texto | não (barato) | OpenAI |
| Personalizado | texto | depende (endereço base + chave) | OpenAI |

**Guia passo a passo "para leigo", dentro do cofre, por provedor:** para que serve, limites do
grátis, tipo de conta (Google/GitHub/e-mail, se pede cartão), botão grande **Abrir o site ↗** (outra
aba), passos numerados com os **nomes exatos dos botões** ("Create API Key", "Copy") e uma
**ilustração desenhada** (SVG: janela + botão destacado) em cada passo — trocável por print real
pondo `guia-<provedor>-<n>.png` na raiz do app; campo da chave com 👁, **Salvar e testar** (confere
formato: prefixo `gsk_`, `sk-or-`, `AIza`, `sk-ant-`, `csk-`, sem espaço, tamanho mínimo; depois
testa de verdade no provedor: `/models`, `/v1/user`, `/v1/projects`…), erros em linguagem de
gente (recusada → copie inteira ou crie outra; bloqueio do navegador → chave salva, tente usar).
O guia abre por `DGO.ia.guia(provedor, capacidade)`; o 🎤 e o 🔊 dos apps devem abrir o cofre já
filtrado (`DGO.ia.guia(null, 'stt')`).

**Ida e volta ao site da chave (celular e computador) — feito no OmniLifeONE 2.8.0, vale para todos:**

- O botão **Abrir o site ↗** do cofre guarda um **marcador de volta** (`<app>:keyReturn`: provedor,
  capacidade filtrada, de onde veio e a hora; vale 30 min) **antes** de abrir o site. Nunca navegar na
  mesma aba por padrão (o app some); só como plano B se o pop-up for bloqueado — o marcador traz de volta.
- **Celular:** o site abre em outra aba (`noopener`). Ao voltar — aba viva, aba recarregada pelo Android
  ou app reaberto pelo ícone — o cofre **reabre sozinho no mesmo provedor** (`resume()` chamado ao entrar,
  em `visibilitychange` e em `pageshow`), com o campo pronto e o botão **📋 Colar**
  (`navigator.clipboard.readText()`; se o navegador negar, foco no campo e a dica "toque e segure → Colar").
  Com o app **instalado** na tela inicial o site abre por cima com um X que volta direto: dizer isso no
  cofre. Não existe tela dividida controlada pelo site no Android — não prometer.
- **Computador:** o navegador não divide a tela sozinho; o app faz a divisão: abre o site numa **janela na
  metade direita** (`window.open(url, nome, "popup,width=W/2,height=H,left=W/2,top=0")`) e leva a janela do
  cofre para a **esquerda** (`body.keyside`), para copiar de um lado e colar do outro. Nunca `iframe` (os
  provedores bloqueiam).
- O marcador some ao salvar a chave ou ao fechar o cofre pelo ×. Vai para o módulo comum (`DGO.ia.guia`).

**Quando acaba a cota — vale para todos os recursos:** se o provedor escolhido devolve erro HTTP (402/429
sem cota ou créditos, chave recusada, 5xx), o app tenta **todos os outros provedores cadastrados com chave
e a mesma capacidade** (texto, foto → texto, voz → texto), primeiro na ordem de preferência e depois
qualquer outro, avisando na tela qual está usando (no idioma do app); com reserva disponível espera só 3 s
em 429/503. Só depois de esgotar todos cai para o recurso do aparelho (OCR, reconhecimento local, voz do
navegador). A lista sai do registro de provedores (`pool(capacidade)`), nunca de uma lista fixa.

**Claude (Anthropic) como provedor:** entra no cofre como "Claude (Anthropic)" — texto e fotos, formato
próprio (`POST https://api.anthropic.com/v1/messages`, cabeçalhos `x-api-key`, `anthropic-version:
2023-06-01` e `anthropic-dangerous-direct-browser-access: true`, obrigatório para chamar do navegador;
teste da chave em `GET /v1/models`; imagens em `content` como `{ type: "image", source: { type: "base64" } }`).
Modelos atuais (set/2026): `claude-opus-5` (padrão), `claude-sonnet-5` (reserva) e `claude-haiku-4-5` (mais
barato) — nunca fixar um só, usar "Ver modelos que esta chave aceita". **Não há plano grátis na API**: é
pago por uso, com crédito pré-pago (mínimo US$ 5) em console.anthropic.com → Billing; o plano grátis do
app claude.ai não serve para sites. Chave começa com `sk-ant-`. Como é pago, nunca é o padrão: entra na
troca automática depois dos grátis. Guia no cofre: Billing → API keys → "+ Create Key" → nome → "Add" →
"Copy Key" (aparece uma vez só).

**Escolha por uso:** "Usar para ✍️ / 🎤 / 🔊" em cada provedor. O app pergunta
`DGO.ia.provedorPara('stt')` / `DGO.ia.chavePara('tts')` (e `provedores('tts')` para listar); sem
chave de voz, cai em `aparelho`. Eventos `dgo:ia-chaves` e `dgo:ia-uso` avisam mudanças. Texto
continua sendo `DGO.ia.provedor()`. Provedores só de voz (`soVoz`) não entram no seletor de chat.

- **Um adaptador só para tudo que fala o formato OpenAI** (`/chat/completions` e `/models`);
  Gemini e Anthropic têm o deles. Provedor novo = uma entrada no registro (`nome, gratis, cap,
  prefixo, onde, limite, conta, passos, serve, testar`), zero código de tela.
- **Chave nunca no chat, e-mail ou arquivo.** É senha. Se o usuário colar uma chave num chat,
  mandar revogar e criar outra antes de qualquer coisa, e nunca usar a colada. O cofre repete o
  aviso no rodapé.
- **Cofre único** compartilhado entre os apps (mesma origem): cola uma vez, vale em todos. A
  chave é da pessoa e fica só no navegador; nunca no repositório. Política (mesma chave ou uma
  por app) definida no RootifyONE.
- Modelos mudam de nome (o Google aposentou o `gemini-2.5-flash` para chaves novas em set/2026):
  nunca fixar um só. Guardar o modelo escolhido por provedor, botão **"Ver modelos que esta
  chave aceita"** (filtra os grátis nos provedores grátis) e trocar sozinho quando o salvo saiu.
- Pedido com insistência (503/429 → esperar 6/15/30 s, depois modelo reserva); em gerações em
  partes, nunca perder as partes já prontas. Widget mostra "o que a IA recebe junto" e aviso de
  que a resposta pode errar.
- Resposta sobre lei, imposto ou saúde sempre com **data de referência e fonte**.
- **Futuro, já preparado — chave escondida:** `ia.proxy: { openrouter: 'https://…' }` aponta
  para um proxy do usuário (Firebase Function no Blaze, Cloudflare Worker grátis) que guarda a
  chave e repassa `{ provedor, modelo, sistema, mensagens, app }`. Ligado, o widget para de
  pedir chave e nada mais muda. `cofreBackend` só sincroniza chaves entre aparelhos — não as
  esconde; esconder é o proxy.

## Integrações

- **Agenda e contatos (Google e Outlook):** importar/sincronizar com o login que já existe
  (Google Identity para Drive; Microsoft com PKCE para OneDrive), pedindo **só o escopo de
  leitura** necessário e em botão separado. Sem login nenhum: importar e exportar arquivo `.ics`
  (agenda) funciona em todo lugar; no Chrome do Android, o seletor de contatos do aparelho deixa
  a pessoa escolher contatos um a um sem dar acesso à agenda inteira.
- **Clima ligado à agenda (OmniLifeONE 2.9.0; vale para todo app com agenda ou rotina ao ar livre):**
  a **config fica no RootifyONE** (Integrações → Clima → arquivo master `solverone-dados/clima.json`:
  `ativo`, `provedor`, `avisosOficiais`, `chavePessoal`, `planos`, `logins`, `oculto`, `limites`, `horaAviso`,
  `diasAdiante`; modelo `clima-MODELO-<app>.json`, reserva local `clima.json`, padrão embutido) e **no app só a
  experiência**: cartão no Início (hoje + próximos dias), ícone em cada dia do calendário, previsão na hora
  de cada compromisso e **avisos práticos** para hoje e amanhã (chuva → guarda-chuva e capa para as crianças;
  frio → agasalhar; calor → água, protetor e sombra; vento e chuva forte → cuidado na rua e na estrada), que
  entram nos Alertas, na Inbox e num aviso diário no aparelho. **Elegibilidade** por tipo de login (`visitor`,
  `local`, `cloud`) e plano (`gratis`, `premium`): sem direito, some (`oculto: true`) ou aparece trancado
  dizendo o plano. **Provedores** (set/2026, conferir): Open-Meteo — padrão, grátis, sem chave, direto do
  navegador, 10 mil chamadas/dia para uso pessoal (comercial US$ 29/mês, chave só via proxy); INMET —
  avisos oficiais do Brasil, sem chave, pelo código IBGE do município (vem do CEP); WeatherAPI.com e
  OpenWeatherMap — grátis com a chave da própria pessoa (cofre, `wx:<provedor>`); Google Weather (10 mil/mês
  grátis, depois US$ 0,15 por mil), Tomorrow.io e Climatempo — pagos com chave da plataforma, só quando
  existir proxy. **Chave da plataforma nunca vai para JSON público.** Só a localização aproximada da casa vai
  para o serviço; a previsão fica guardada 1 h e funciona sem internet até a próxima atualização.
- **Mapa interativo para escolher lugar — OBRIGATÓRIO em todo app com localização (OmniLifeONE 2.10.0;
  vale para RiseONE — corrida na rua —, OmniLifeONE — compromissos, lugares, casa, Cheguei —, PetLover —
  onde está o cachorro —, Bolinho de Chuva — chove onde a pessoa está? — e qualquer outro):** nunca pedir
  só um CEP ou uma coordenada digitada. O padrão é o widget `MapPick.open({ title, lat, lon, gps })` (copiar do
  OmniLifeONE): **Leaflet + OpenStreetMap** (sem chave; a biblioteca carrega só quando o mapa abre, via
  `LIBS.leaflet`/`LIBS.leafletCss` no jsDelivr), uma janela com **busca** por endereço, CEP ou nome
  (Nominatim `search`, `countrycodes=br`), botão **📍 minha localização** (a localização do aparelho só com um
  toque da pessoa — nunca abrir o pedido de permissão sozinho), **toque no mapa ou arrastar o pino**, e embaixo
  o **endereço e o CEP do ponto** (Nominatim `reverse`, `addressdetails=1`; UF vem de `ISO3166-2-lvl4`),
  com o botão **✓ Usar este lugar**. Devolve `{ lat, lon, cep, street, number, district, city, uf, addr, short }`.
  Onde entra: endereço da casa (🗺 Marcar no mapa, com o CEP preenchido pelo ponto), cadastro de lugares (CEP
  **ou** ponto no mapa), campo Local do compromisso (🗺 No mapa → `placeGeo` guardado no compromisso e usado
  na rota e no clima), lugar do clima, ponto de partida/chegada de corrida, última posição do pet, etc. Regras:
  sempre com a alternativa de **digitar** o CEP/endereço (sem internet o mapa não carrega: avisar e deixar
  digitar); guardar só a coordenada com 4–5 casas (≈ 10 m) e nunca a rua quando o cadastro é “só CEP”;
  acessível (busca por teclado, `role="application"` no mapa, `aria-live` no endereço, botão de confirmar
  grande); PT/EN; tiles do OSM só para uso leve (política de uso do OSM) — para uso pesado (mapa sempre aberto,
  rastreio), MapTiler ou Stadia com chave **só via proxy**; Nominatim no máximo 1 pedido por segundo e sem
  autocompletar a cada tecla (buscar no Enter/🔎).
- **Localização da pessoa como padrão (OmniLifeONE 2.10.0):** toda função que depende de lugar (clima,
  rota, serviços perto) usa, nesta ordem, o lugar escolhido nos Ajustes → o endereço da casa (CEP) → a
  **localização do aparelho**. Se o navegador já deu a permissão, o app usa sozinho, sem perguntar de novo;
  se ainda não deu, um cartão no Início pede um toque em “📍 Usar minha localização” (nunca abrir o pedido
  de permissão do navegador sem a pessoa tocar). Guardar só a coordenada aproximada (3 casas), renovar de
  tempos em tempos e nunca mandar para a nuvem. **Compromisso sem local usa a localização da pessoa;**
  compromisso num lugar cadastrado longe (25 km+) usa o lugar.
- **Deslocamento e “hora de sair” (OmniLifeONE 2.10.0; vale para todo app com agenda):** o compromisso diz
  se **envolve deslocamento**, de onde sai (casa, um lugar cadastrado ou “de onde eu estiver”) e **como vai**,
  com mais de um meio (carro, moto, Uber/táxi, metrô, ônibus, trem, avião, ônibus de viagem/rodoviária,
  bicicleta, a pé). O app calcula **Sair às = hora − caminho − antecedência − folga** (antecedência: 2 h
  aeroporto nacional, 3 h internacional, 45 min rodoviária; folga 10 min), mostra no compromisso, no Início e
  nos Alertas (até 2 h antes) e notifica 10 min antes. **Lugares** (trabalho, escola, médico, aeroporto…) são
  cadastrados **só com o CEP** (cidade + coordenada aproximada; a rua não fica guardada) e alimentam o campo
  Local com sugestões (casa, lugares, contatos com endereço, locais já usados). Estimativa de tempo: rota
  pelo **OSRM** (grátis, sem chave, sem trânsito ao vivo, uso leve) ou **TomTom** (chave da pessoa, 2.500/dia
  grátis, trânsito ao vivo); sem serviço, linha reta × velocidade média. Sem trânsito ao vivo, multiplicar por
  1,4 em horário de pico (dia útil 7–10 h e 17–20 h) e por 1,2 com chuva prevista (integra com o clima).
  **Trânsito e navegação por link, sem chave:** Google Maps (`maps/dir/?api=1&destination=…&travelmode=…`),
  Waze (`waze.com/ul?ll=…&navigate=yes`), Uber (`m.uber.com/ul/?action=setPickup&dropoff[latitude]=…`),
  Moovit (transporte público) e Flightradar24 (status do voo pelo número). Waze não tem API pública de
  trânsito; Google Routes (trânsito ao vivo) só com proxy e chave da plataforma. A config fica no RootifyONE
  (`solverone-dados/rotas.json`: `ativo`, `provedor`, `chavePessoal`, `links`, `antecedencia`, `fatorPico`,
  `fatorChuva`, `planos`, `logins`; modelo `rotas-MODELO-<app>.json`, reserva local, padrão embutido) e no app
  só a experiência, com elegibilidade por login e plano como no clima.
- **Formulário de compromisso (padrão para todo app com agenda; OmniLifeONE 2.10.1):** opção **Dia inteiro**;
  **Início** e **Até** lado a lado (também no celular), cada um com botões **− e + de 30 min**; **faixas
  prontas** que preenchem os dois (08–17h, 09–18h, 08–12h, 13–17h, 19–22h) e **“mover −30 / +30 min”** que
  deslocam início e fim juntos; **horários comuns** (07:00 … 20:00) e **duração** (30 min, 1 h, 2 h, 3 h) em
  chips de um toque — os horários entram **no campo tocado por último** (Início ou Até), com o campo marcado
  e uma linha dizendo isso; nunca mandar sempre para o início. **Fim nunca antes do início no mesmo dia**
  (prática do Google Agenda / Outlook): quando o início muda, o fim acompanha **mantendo a duração**; um fim
  digitado antes do início volta para 30 min depois e avisa na hora, sem bloquear a digitação; os botões − / +
  respeitam o limite; o salvar é bloqueado só se ainda estiver inválido. **Mais de um dia** (viagem, plantão
  que vira a noite): um check revela a **data final** (padrão: dia seguinte, nunca antes da inicial); aí o fim
  pode ser antes do início; o compromisso aparece em todos os dias do período (dias de continuação sem
  lembrete repetido) e os links de Google Agenda / .ics levam a data final. **Ordem dos campos:** o quê →
  data (+ dia inteiro, mais de um dia) → horário → **lugar → deslocamento** → tipo → quem → repetir/avisar →
  observações; rótulos completos (“Tipo de compromisso”, não só “Tipo”). Seções opcionais (deslocamento)
  só aparecem quando a pessoa diz “Sim”.
- **Saída e chegada explícitas (todo app com rota, corrida ou “onde estou”):** o bloco fica **logo abaixo do
  campo de lugar**, com um Não / Sim segmentado bem visível — nunca escondido no fim do formulário atrás de um
  select. “Saindo de” oferece **📍 Onde
  estou agora**, **🕓 Última localização** (guardada só no aparelho, com “há X min”), Casa, lugares
  cadastrados e **🗺 ponto no mapa**; “Chegando em” mostra o destino (no compromisso, o Local). Ao usar a
  localização atual, **mostrar onde é** (endereço curto pelo reverse do Nominatim) e a **precisão** (“±35 m”;
  acima de 100 m avisar “sinal fraco, aproximado”, comum dentro de prédio) e, se o ponto estiver perto de um
  lugar conhecido (150 m, ou a precisão do GPS até 600 m), **perguntar “Você está em Casa?”** com Sim / “Não,
  usar o ponto exato”. A localização é lida na hora (sem cache) e só com um toque da pessoa. Os links de rota
  levam a origem quando ela é conhecida (`origin=` no Google Maps).
- **Drive e OneDrive** em pasta privada do app. Backup em `.json` sempre funciona; backup e
  **restauração das configurações** separados dos dados.
- **Compartilhamento nativo** do aparelho.
- **Impressão:** toda tela que faça sentido imprimir tem CSS de impressão (ver "Largura").
- **TV:** vídeo usa o botão de transmitir do próprio navegador (Chromecast no Chrome, AirPlay no
  Safari) antes de qualquer SDK. Câmera + TV + detecção de movimento (RiseONE) é projeto à parte.
- **Relógio inteligente, Spotify, Open Finance:** por app, pesquisar antes de desenvolver.

## Nuvem e plataforma

PWA instalável. Preparado para app nativo (adaptadores): cada recurso do aparelho passa por uma
função do módulo, para trocar a implementação web pela nativa sem mexer no app.

**Antes de apagar qualquer dado do navegador** (03/Out/2026): o app **oferece a cópia protegida** e
**levar os dados para a nuvem** (Supabase) antes. Vale para "Apagar tudo", para apagar a cópia
antiga depois de levar (só com a fila vazia e a cópia oferecida) e para qualquer limpeza nova.
Sair da conta ou da família não apaga a cópia do aparelho.

**Levar os dados do aparelho para a nuvem** (primeiro: OmniLifeONE 2.14.0): oferecido logo depois
de entrar na conta (e nas Configurações → Nuvem); prévia do que vai e do que fica; cópia protegida
antes (ou "já tenho uma", com confirmação); a pessoa do aparelho vira a pessoa da conta (mesmo id);
junta pela regra do Restaurar (ninguém duplicado; nunca "Substituir" a família da nuvem); a cópia
antiga continua no aparelho até a pessoa mandar apagar. Quem escolhe "usar só neste aparelho" não é
perguntado de novo logo em seguida.

**Quem garante as regras é o banco**, não a tela: papéis, convites, aprovações, 48 h e emergência
passam por funções do banco; códigos de confirmação ficam numa tabela que só quem pediu lê, e quem
aprova digita o que a pessoa diz (o banco confere). Dados sensíveis (saúde, documentos, cofre) só
vão para a nuvem cifrados no aparelho.

**Testes da nuvem** só num Supabase **local** com a base real e o SQL do app (o teste desvia as
chamadas do endereço de produção para o local). Nunca criar contas de teste na produção.

## Caminho dos serviços externos

**Decisão de 03/Out/2026:** a nuvem da plataforma é o **Supabase** (projeto `solverone-app`, São
Paulo), com o contrato de dados v1 (`PLATAFORMA-DADOS.md`: grupos/família, tabelas por app com
RLS, ponte entre apps, arquivos, cifra no aparelho, LGPD por app). O Firebase não será usado; o
texto abaixo fica como histórico. Notificação com o app fechado continua precisando de Web Push
(chave VAPID e uma Edge Function), que o Supabase não faz sozinho.

Hoje, sem servidor: Formspree (contato e pedidos), Google Drive em pasta do app, login Google,
chaves de IA coladas pela pessoa, `solverone-dados` publicado pelo RootifyONE. Depois,
**Firebase** é o salto que resolve de uma vez conta valendo em qualquer aparelho, "esqueci a
senha" por e-mail, dados compartilhados, recado entre pessoas na inbox, planos família, log
central e push com o app fechado — e é o único que cobre push (Supabase não envia notificação).
Cobrança de assinatura ainda exige gateway e Functions, que não entram no plano gratuito.

Um **projeto Firebase só** para todos os apps = uma conta vale em todos (como o cofre de IA hoje).
Projetos separados = logins separados. Decidir quando for montar.

Nunca pôr senha de e-mail ou chave secreta nos repositórios: são públicos.

## Feedback dos usuários (prioridade — beta restrito)

Decisão do dono, 08/Out/2026: os apps vão abrir para um grupo de **beta testers** (e-mails de amigos
aprovados), e o que eles disserem é o que vai guiar a melhoria dos apps. Por isso **todo app** tem o mesmo
jeito de ouvir a pessoa, muito fácil de usar, e tudo o que chega fica **guardado de forma estruturada no
RootifyONE** (banco da plataforma), com data, hora, app, versão, **tela e função onde a pessoa estava**,
categoria e anexos. No futuro, abre para todo mundo; o framework é o mesmo. É função do módulo comum
(`DGO.feedback`), igual em todos; app sem o módulo copia o mesmo comportamento.

**1. Pergunta do dia (pop-up uma vez por dia).**

- Uma vez por dia, por pessoa e por app, um balão pequeno (não uma janela que trava a tela): **"Está
  gostando do <app> hoje?"** com **👍 Sim** / **👎 Não** / **Agora não**. Em PT e EN.
- **Sim** → "Que bom! Quer contar o que está funcionando ou o que falta?" com o formulário já aberto
  (categoria Elogio pré-marcada, pode trocar). **Não** → o mesmo formulário, com "O que podemos melhorar?"
  (categoria Problema pré-marcada). **Agora não** → nada hoje; o 👍/👎 sozinho já é registrado como
  feedback rápido (nota do dia), mesmo sem texto.
- Quando aparece: depois de **2 minutos de uso real** na sessão (não ao abrir), nunca na **primeira
  visita** (dia 1 é só o wizard), nunca sobre login, wizard, janela aberta, tela cheia, leitor, gravação de
  voz ou formulário com texto digitado; só uma vez por dia local (`dgo:<app>:feedback:dia`, data de
  Brasília) e, no máximo, **3 vezes por semana** por padrão (ajustável no RootifyONE). Com "Agora não" três
  vezes seguidas, espera 7 dias. Em ⚙ → Geral a pessoa pode desligar ("Não perguntar mais"), reversível.
- No beta, aparece para quem está na **lista de beta testers**; depois, para todos. Nunca no RootifyONE
  (interno) nem no Portal; no Feature Tester, só o botão.
- Não é anúncio: não entra na faixa, não tem contagem de 3-2-1, e some sozinho em 20 s se ninguém tocar.

**2. 💬 Dar uma opinião / avisar um problema — em toda tela.**

- Lugares fixos: **balão do AssistONE** (item "💬 Dar uma opinião / avisar um problema"), **☰ → Ajuda e
  mais → 💬 Feedback**, **⚙ → Ajuda → Feedback** e, nas telas de erro ("Esta tela teve um erro"), o botão
  **"Avisar que deu erro"** já com o erro anexado. Em todo lugar o formulário abre **sabendo a tela e a
  função** onde a pessoa estava (o mesmo mapa por tela do AssistONE: `tela`, `titulo`, mais a última ação
  registrada, ex.: "Compras → adicionar falando"). Esse contexto aparece no topo do formulário ("Sobre:
  Compras · Adicionar falando — trocar") e a pessoa pode trocar.
- **Formulário curto, para leigo** (uma tela, PT e EN):
  1. **Tipo** (botões grandes, um toque): 🐞 Deu erro · 💡 Sugestão · ❓ Não entendi · 👍 Gostei ·
     🎨 Aparência ou texto · 🐢 Lento ou travou · 🔒 Privacidade · 📝 Outro. Cada app pode acrescentar
     os seus (ex.: RiseONE "exercício errado", MoneyTRIO "valor lido errado"), declarados no config.
  2. **Nota** 1–5 estrelas (opcional).
  3. **Conte com suas palavras** — texto com 🎤 para ditar (mesmas regras do STT) — opcional se houver
     anexo ou nota.
  4. **Anexos, sem limite de quantidade**: **📸 Print desta tela** (captura feita pelo app, com o aviso
     "confira se não aparece dado de outra pessoa" e pincel para borrar antes de enviar), **🎥 Gravar a
     tela** (no computador: `getDisplayMedia`; no celular: orientação de como gravar a tela e depois
     "Anexar vídeo"), **🎙 Gravar áudio** (fala em vez de escrever) e **📎 Anexar arquivos** (fotos, vídeos,
     PDF — vários de uma vez, pelo componente comum de arquivos). Tamanho por arquivo limitado só pelo que
     o RootifyONE definir (padrão 200 MB; vídeo acima disso é comprimido no aparelho quando der, senão pede
     um trecho menor). Anexo pesado respeita a regra de rede (Wi-Fi) e vai pela fila offline.
  5. **"Pode me responder sobre isso?"** (marcado por padrão para quem tem conta) e **Enviar**.
- Depois de enviar: "Obrigado! Chegou aqui: #1234 (Compras · Sugestão)". A pessoa vê e apaga os próprios
  envios em ⚙ → **Meus feedbacks** (lista com status: recebido, lido, em análise, planejado, feito, não
  vai ser feito, e a resposta da equipe). **Quando o status vira "feito"**, a Inbox do app avisa: "Você
  pediu, nós fizemos — versão X.Y" (fecha o ciclo; é o que faz a pessoa continuar mandando).

**3. O que vai junto, sem a pessoa digitar (contexto automático).**

`app`, `versaoApp`, `versaoModulo`, `tela` e `rota` (`#/…`), `funcao`/última ação e o **título visível** da
tela, `quando_utc` (ISO) **e** `fuso` do aparelho (`UTC−03:00`, `America/Sao_Paulo`), `idioma`, `online` ou
offline na hora, aparelho e navegador (nome e versão, tela, se está instalado como app), `plano` e `tipo de
login` (visitante, só no aparelho, conta), `pessoa_id` da conta SolverONE (ou um id anônimo do aparelho,
`dgo:global:feedback:anon`, para visitante), as **últimas 20 ações** do app (nomes de tela/ação, sem
conteúdo) e, no tipo "Deu erro", os últimos erros de JavaScript guardados pela telemetria local. **Nunca**
vai: conteúdo de registros (compras, saúde, dinheiro, senhas), chaves de IA, texto de campos, nomes de
outras pessoas. O print é o único lugar onde pode aparecer dado pessoal — por isso o aviso e o borrar.

**4. Onde fica guardado (estrutura).**

- **Banco da plataforma (Supabase `solverone-app`)**, lido pelo RootifyONE — tabela `feedback`: `id`,
  `numero` (sequencial por app, o "#1234"), `quando_utc`, `fuso`, `app`, `versao_app`, `versao_modulo`,
  `tela`, `rota`, `funcao`, `titulo_tela`, `categoria`, `categoria_app`, `nota`, `rapido` (👍/👎 do dia),
  `texto`, `pessoa_id`, `anon_id`, `email_contato`, `pode_responder`, `plano`, `login_tipo`, `aparelho`
  (json), `trilha` (json das últimas ações), `erros` (json), `status`, `resposta`, `respondido_em`,
  `versao_feito`, `etiquetas`, `chamado_id`, `lido_por`, `criado_em`, `atualizado_em`. Tabela
  `feedback_arquivos`: `id`, `feedback_id`, `tipo` (print, video, audio, arquivo), `nome`, `mime`,
  `tamanho`, `caminho`, `duracao`. Arquivos no **Storage** (bucket privado `feedback`, caminho
  `<app>/<feedback_id>/<n>-<nome>`), nunca no banco.
- **RLS**: a pessoa lê e apaga só o que é dela (`pessoa_id` ou `anon_id` do aparelho); a equipe lê tudo
  conforme o papel (Suporte, Produto, Dono); visitante grava com `anon_id`. Apagar pelo usuário apaga os
  arquivos também (LGPD). Retenção padrão: 24 meses, definida no RootifyONE.
- **Sem internet** o feedback entra na fila do aparelho (`DGO.fila`) com os anexos no IndexedDB e sobe
  quando houver conexão, com o "✓ Tudo sincronizado". **Enquanto o app ainda não tiver conta SolverONE
  ligada**, a mesma estrutura vai por Edge Function `solverone-admin` com `{acao:'feedback'}` usando a
  publishable key (gravação permitida só para inserir, nunca ler) — para nenhum app ficar sem coleta
  por falta de login. Plano B de emergência (sem banco): Formspree, com o mesmo JSON no corpo.
- O formato é **o mesmo** do `log` e dos arquivos master: migrar de lugar é trocar a fonte.

**5. No RootifyONE (módulo "Feedback", grupo Clientes).**

- **Fila** com filtros (app, categoria, tela, status, nota, período, beta tester, com anexo) e busca no
  texto; ordem padrão: novos primeiro, erros antes.
- **Ficha**: contexto completo, trilha das ações, anexos abertos na própria tela (print, vídeo com player,
  áudio com transcrição pela IA do cofre — opcional), status, etiquetas, nota interna, **resposta à pessoa**
  (vai para a Inbox do app e, se houver e-mail e "pode me responder", por e-mail), **converter em chamado**
  (liga ao Suporte) e **ligar a uma pendência** (`PENDENCIAS.md` do app). Mudar para "feito" pede a versão.
- **Painel**: nota média do dia e por tela, 👍/👎 por dia, categorias por app, telas com mais erros,
  quem mais contribui, tempo até a resposta; exporta CSV. É o que alimenta as prioridades de cada release.
- **Beta testers**: lista de e-mails aprovados (tabela `beta_testers`: e-mail, nome, apps, desde, ativo,
  convite enviado), publicada como `beta.json` para os apps saberem quem vê a pergunta do dia e quem
  entra nos apps fechados; convite por e-mail com o link de cada app. **Chave de leitura nos apps: só o
  e-mail hash (SHA-256)** no JSON público, nunca o e-mail em claro.
- Tudo com `RF.mudar` (log encadeado) e permissão por `feedback:ver | responder | apagar`.

**6. Regras de código e de teste.**

- Config: `feedback: { ativo: true, perguntaDiaria: true, categoriasApp: [...], maxMB: 200, telas:
  <mapa do AssistONE> }`; API: `DGO.feedback.abrir({ tela, funcao, categoria, erro })`,
  `DGO.feedback.perguntaDoDia()`, `DGO.feedback.registrarAcao(nome)` (alimenta a trilha; chamar nas trocas
  de tela e nas ações principais — é a mesma chamada que já marca "Você está em <tela>" para o AssistONE).
- **Nunca travar o app** por causa do feedback: falha de envio vai para a fila, falha do print cai para
  "anexar imagem", sem câmera/microfone some o botão correspondente.
- Teste de toda entrega: pergunta do dia respeita as regras de quando não aparecer; 💬 abre com a tela
  certa em pelo menos 3 telas; envio offline e depois online; print com borrar; vídeo de 50 MB; a pessoa
  vê e apaga o próprio envio; o RootifyONE mostra a ficha com os anexos.

## Telemetria

Medir uso, desempenho e erros por app — **só com consentimento** e sem dado pessoal. Hoje:
erros de JavaScript e tempo de carregamento guardados localmente, com botão "enviar relatório".
Depois: coleta central lida pelo RootifyONE. Escolher a ferramenta pesquisando custo e LGPD.

## Versionamento visível

Todo projeto mostra, nas Configurações, a versão **e o que cada versão trouxe**. Arquivo
`versoes.json` na raiz: versão, data e lista do que mudou, em PT e EN; o módulo desenha a tela.
A entrada mais nova aparece com um selo "novidades" até a pessoa abrir uma vez (ver consolidação
por dia abaixo).

Ao publicar versão nova: subir o número no `versoes.json` **e** o `VERSAO` do `sw.js`, senão os
celulares seguem na versão antiga. Versão mínima obrigatória fica no `apps.json` do RootifyONE.

**Releases do mesmo dia viram um só para quem usa.** Às vezes saem várias versões no mesmo dia
(ex.: 1.3.15, 1.3.16, 1.3.17, 1.3.18); mostrar cada uma é poluição para o usuário.

- O `versoes.json` continua guardando **todas** as versões, cada uma com data e hora (histórico
  técnico, para suporte e para voltar atrás). Quem faz o release só acrescenta a entrada
  normal — a consolidação é automática, feita pelo módulo na hora de mostrar
  (`DGO.versoes.porDia()`), no mesmo dia pelo horário de Brasília.
- Na tela, **uma entrada por dia**: o número da **última versão do dia** (ex.: `1.3.18`), com
  **só a data** — nunca a hora, que distrai (para quem usa, é um release por dia) — e as notas
  de **todas** as versões daquele dia juntas, na ordem, sem item repetido. Item que foi
  corrigido de novo no mesmo dia aparece uma vez só, na forma final (entrada pode marcar
  `"substitui": "1.3.16"`). Uma linha pequena e discreta: "inclui 1.3.15 a 1.3.18", útil para
  o suporte.
- O salto de número (1.3.15 → 1.3.18) é normal e não precisa ser explicado ao usuário.
- O selo "novidades" aparece **uma vez por dia consolidado**, não a cada versão.
- **Em Configurações, fica recolhido**: seção expansível (`<details>`, fechada por padrão) cujo
  título mostra só "Versão 1.3.18 · 25/Set/2026"; ao abrir, as novidades por dia, as mais
  recentes primeiro (até 5 dias) e "ver mais". Não ocupa espaço de quem não quer ver.
- O mesmo vale para as novidades que o RootifyONE publica dos apps (`versoes/<app>.json`): o
  arquivo guarda tudo; a tela consolida por dia.

**Cache do service worker com o nome do app.** Todos os apps moram na mesma origem e dividem
os caches: um `sw.js` que chama o cache só de `dgo-vN` e, no `activate`, apaga "todo cache que
não é o meu" apaga o modo sem internet dos **outros** apps. Nome: `dgo-<app>-vN`; o `activate`
só apaga caches que começam com `dgo-<app>-`. (Problema achado no `sw.js` do pacote em set/2026;
corrigido no `sw.js` do módulo em 25/Set/2026: o nome sai da pasta do próprio endereço, e o
arquivo continua idêntico em todos os apps.)

## Regras de entrega

- Sempre `.zip`; entrega que cobre mais de um app → **um zip por app**, arquivos soltos na raiz.
- **Nome do zip — TODO zip, de TODOS os apps, sem exceção** (inclusive pacotes de apoio, como
  ícones ou testes): `<NOME APP> <VERSAO> <dd-Mmm-aaaa> <HHhMMm>.zip` — aplicação, versão, data
  e **hora do release** (horário de Brasília), porque às vezes sai mais de um release no mesmo
  dia. Ex.: `MONEY-TRIO v1.4.0 25-Set-2026 16h38m.zip`. Nomes fixos: `ELEICOES 2026`, `CIFRAS`,
  `CONTADOR DE HISTORIAS`, `RISE-ONE`, `MONEY-TRIO`, `OMNI-LIFE-ONE`, `ROOTIFY-ONE`,
  `SOLVERONE-DADOS`, `FEATURE-TESTER`, `PORTAL`. Pacote de apoio leva o nome do que é
  (ex.: `ASSIST-ONE-ICONE v1.0 25-Set-2026 16h38m.zip`).
- O `versoes.json` de cada release leva a mesma data **e hora** (`"hora": "HH:MM:SS"`). A hora é
  só técnica (zip, arquivo, suporte): **na interface dos apps do usuário aparece só a data**.
  Exceção: o **RootifyONE**, que é interno, mostra data e hora completas com segundos (ex.:
  `25/Set/2026 11h15m37s`), tanto das versões dele quanto das dos apps. Zip gerado dentro de
  um app (ex.: pacote do Publicar no RootifyONE) segue o mesmo padrão de nome.
- Arquivos de teste e leitura levam o nome do app no próprio nome.
- Incluir atalho que abra a página de teste em `http://` local.
- Ele já se confundiu com pacotes acumulados: ao entregar, dizer claramente que a entrega nova
  substitui as anteriores. Quando pedir para não gerar arquivos, não gerar.
- Pacote de um app é pedido no chat daquele app.
- **Lista de pendências do app** (`PENDENCIAS.md` no repositório; no OmniLifeONE desde 04/Out/2026): lista
  oficial e viva com número, descrição, origem e situação (🟡 aberta, 🔵 em andamento, ⏸ aguardando o dono,
  ✅ feita com a versão). A cada entrega: atualizar a situação, acrescentar o que surgiu (números não mudam
  nem são reaproveitados) e **dizer no resumo o que fechou**. Nos outros apps, perguntar antes de criar (regra
  zero).

## Conferir se o módulo está mesmo ativo

O arquivo existir no repositório não quer dizer que esteja ligado. Conferir os `<script src>`
de **cada** página publicada antes de afirmar qualquer coisa sobre o estado de um site.

## Ideias e futuro (da planilha, sem data)

Pentest real (com servidor) · cobrança/assinatura · registro das marcas ONE no INPI · app
nativo via adaptadores · relógio inteligente · impressora · transmissão para TV · comando de
voz nos assistentes · telemetria · Planos Família · Planos Profissional–Cliente · PetLover.

## Pendências por app (planilha de 24/Set/2026)

Específicas de cada app — valem no chat daquele app; aqui só para visão geral.

- **OmniLifeONE:** recados com prioridade, destino e confirmação de leitura dos dois lados;
  tarefas com estado e foto; lembretes rápidos com prazo em linguagem de gente; dados da
  família (aniversários, conferência entre membros); Plano Família; **modo Vigilante** (câmera
  detecta movimento enquanto se cuida de alguém e dispara alarme/mensagem); bug: item ditado
  por voz só aparece depois de recarregar; bug: quadros do início não clicáveis.
- **MoneyTRIO:** modo de pagamento por lançamento (detectado por OCR ou escolhido); cartões
  (final, vencimento, bandeira); cadastro rápido de bancos com lista pronta (CNPJ, código,
  nome, logo); campos de valor com botões ±; salário bruto → líquido (com descontos
  retroativos); frequência no calendário e no wizard; calendário 100% visível no desktop com
  menu lateral rolando; wizard que salva ao tocar fora; ditado de valores; voz nos tutoriais;
  visão PJ no TaxONE (MEI, Simples, Fator R, pró-labore, PJ×CLT) sempre com lei e data de
  referência; Open Finance, leitura de notificações do banco, OFX/CSV — pesquisar antes.
- **RiseONE:** narração de personal trainer; comando de voz "terminei"; música junto com a voz;
  relógio; tabela CID/TUSS/TISS offline com espaço ocupado e botão limpar; OCR de rótulos
  (em teste) e bug de foto desfocada; OCR de carteirinha e exames com gráfico por indicador;
  reembolso de plano de saúde; filtro por equipamentos disponíveis; desenhos vetoriais
  (aparelho azul, pessoa laranja, pesos brancos; vista de frente e de lado, ou girando com
  pausa); câmera + TV + detecção de movimento; fisioterapia por local, desenho do corpo ou
  doença; aviso legal "Estou ciente"; dado de saúde sob LGPD; avaliar dividir em sub-apps como
  o MoneyTRIO; referências Desrotulando e Vedios.
- **Eleições 2026:** voz nos planos (PT e EN); comparadores no início dos infográficos com
  índice clicável; sugestões prontas (bolhas) que marcam os filtros e se desmarcam quando a
  pessoa altera; comparador de marcos regulatórios em radar e por dimensão; série do salário
  mínimo desde 1992; indicador de sigilos decretados desde 1990 (etiqueta transparência);
  avisos de tela pequena e cabeçalho fixo nas tabelas; pacote `ELEICOES 2026`.
- **Contador de Histórias:** áudio guardado por história com indicador, preservado ao trocar de
  voz, limpeza por história ou total com MB; cuidado extra com dados de crianças; comandos de
  voz (preparar).
- **CifrasONE:** terminar a instalação do módulo; OCR próprio (`ocr.html`) com extração de
  acordes; letra que cresce quebra linha mantendo o acorde alinhado; topo do celular com
  ícones em vez de "Configuração"; voz lendo a cifra; `CREDITOS.md`.

## Estado do cifras-violao (set/2026)

O repositório já tem `diretrizes.js` (build antigo), `diretrizes-config.js` e um `idioma.js`
próprio — mas **nenhuma página HTML os carrega**: a instalação ficou pela metade.

Não há conflito entre as versões que circularam: o `idioma.js` foi feito para **cooperar** com
o módulo, e o `diretrizes.js` dos dois pacotes é o mesmo módulo em builds diferentes. O config
desse pacote desliga o OCR do módulo porque o site tem `ocr.html` próprio.

Para terminar: subir o `diretrizes.js` mais novo e acrescentar as duas linhas em `index.html`,
`cifra.html`, `acordes.html` e `importar.html`.