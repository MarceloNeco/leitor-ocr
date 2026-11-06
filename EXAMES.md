# EXAMES.md — exames de saúde da família (PHI): o desenho

Pedido do Marcelo em 06/11/2026: subir todos os exames da família (sangue, ultrassom, laudos), com segurança
máxima, vistos pelo RiseONE (saúde individual) e pelo OmniLifeONE (saúde da família). **Nada foi subido e
nada sobe ainda**: este é só o desenho, para o dono aprovar e para os chats do RiseONE e do OmniLifeONE
construírem a parte deles. Regras da plataforma em `.claude/skills/diretrizes-gerais-apps/SKILL.md`
(Segurança/LGPD, Cofre, Família).

## 1. O que fica guardado

**O texto e os valores, não o PDF.** De cada exame: `{ pessoa, tipo (laboratorial | imagem), exame
("Hemoglobina"), resultado ("13,2"), unidade ("g/dL"), referencia ("12,0 a 16,0"), data, laboratorio, medico,
laudo (texto livre, só nos exames de imagem: a conclusão), modelo: { id, versao } }`. O PDF original pode
ficar guardado fechado no aparelho (como o OmniLifeONE já faz com documentos), nunca na nuvem em aberto.

Quem lê o PDF é o **motor de modelos** (`MODELOS.md`): um modelo por laboratório grande ("resultado de exame
laboratorial": tabela exame | resultado | unidade | referência) e um modelo "laudo de imagem" (texto livre
com a conclusão). O tipo é da família `saude` do catálogo (classe de privacidade `saude`): a IA só com a chave
da pessoa, perguntando a cada vez, e nunca por padrão.

## 2. Onde mora o dado

- **No aparelho**: IndexedDB, **cifrado** (AES-GCM 256, WebCrypto) com a chave de saúde da família, que é
  uma chave aleatória embrulhada (a) pelo PIN/senha de desbloqueio de cada responsável (PBKDF2-SHA256,
  600 mil rodadas, sal aleatório) e (b) pela digital/rosto quando o aparelho tem (WebAuthn com PRF) — o mesmo
  desenho do cofre "Senhas da casa" do OmniLifeONE (`Cofre`, `Trava`). A chave aberta só existe na memória
  enquanto o app está destrancado; bloqueio por inatividade (5 min) e ao sair.
- **Na nuvem** (Supabase `solverone-app`): tabela `saude_exames` com o conteúdo **cifrado no aparelho antes
  de subir**; o servidor e a equipe SolverONE veem só texto embaralhado. Em claro ficam só `familia_id`,
  `pessoa_id`, `criado_em`, `versao` e o hash do arquivo (para não subir duas vezes). RLS por família.
- **A chave de saúde da família** é embrulhada para cada responsável com a chave pública dele
  (`sol_chave_publica` / `sol_grupo_chaves`, como no cofre de senhas): quem entra na família recebe a chave
  reembrulhada por um responsável; quem sai, perde (a chave é girada).
- **Perder PIN, senha e código de recuperação = perder os exames**, a não ser que outro responsável da
  família reembrulhe a chave. Isso é dito na tela antes de o primeiro exame subir.

## 3. Quem vê o quê

| App | Quem | Vê |
|---|---|---|
| **RiseONE** | cada pessoa | **só os próprios exames** (a chave da pessoa abre só a parte dela: cada exame é cifrado com uma chave por pessoa, embrulhada pela chave da família e pela da própria pessoa) |
| **OmniLifeONE** | responsáveis (pai, mãe) | os exames **da família** (crianças e todos os membros) |
| **OmniLifeONE** | membro que não é responsável (adolescente) | só os próprios |
| qualquer app | **quem não é da família** | **nada** (muralha entre famílias: RLS por `familia_id` no banco e chaves diferentes por família; sem a chave, o dado cifrado não abre) |
| equipe SolverONE | ninguém | nada em aberto, nunca |

Um dado só: o exame sobe por um app e aparece no outro (mesma tabela, mesma chave de família).
Criança que cresce (16/18/21, regra da diretriz): passa a ser dona dos próprios exames; os responsáveis
deixam de ver os novos quando ela escolher.

## 4. Como se entra

- **Conta SolverONE mais PIN ou digital (MFA)** para abrir os exames, mesmo com a sessão aberta. Sem conta
  (só neste aparelho): senha principal mais PIN/digital.
- **Registro de quem abriu**: tabela `saude_acessos` (`quando_utc`, `pessoa_id` de quem abriu, de quem é o
  exame, `app`, `aparelho`), só de inclusão, visível para os responsáveis da família ("quem viu os exames").
- **Nada em log**: nem valores, nem nomes de exames, nem PDFs nos logs locais ou do RootifyONE; só o evento
  "exame lido/aberto" com ids.
- Limite de tentativas no PIN (10 → só com internet e conta), igual ao cofre.

## 5. LGPD (dado sensível de saúde, art. 11)

- Consentimento **específico e separado** para guardar exames na nuvem, por pessoa (e pelo responsável, para
  a criança); pode ser retirado, e retirar apaga os dados cifrados da nuvem.
- Política de privacidade com a seção de saúde (o que é guardado, onde, por quanto tempo, quem vê), versionada
  pelo RootifyONE. Exportar e apagar dentro do app.
- A SolverONE é controladora; o Supabase é operador; a IA (quando a pessoa usar a própria chave) é outro
  operador, avisado a cada envio.
- Validar com advogado antes de abrir para gente de fora da família do dono.

## 6. Primeiros modelos de exame (quando o motor estiver pronto)

1. **Resultado de exame laboratorial**, um modelo por laboratório grande: tabela com exame, resultado,
   unidade e valores de referência; data da coleta; laboratório; médico solicitante. Conferência: cada
   linha tem resultado numérico ou texto e uma referência; a data existe.
2. **Laudo de imagem (ultrassom, raio X, ressonância)**: texto livre; campos: exame, data, clínica, médico, e
   a **conclusão** (o trecho depois de "Conclusão"/"Impressão diagnóstica").

## 7. Entregas e ordem

1. Este desenho (feito).
2. **Motor de modelos** (feito na 0.9.0 do leitor, `MODELOS.md`), com a família `saude` já na classe de
   privacidade certa.
3. **Cofre de saúde** (chave por família e por pessoa, cifra no aparelho, tabelas `saude_exames` e
   `saude_acessos` com RLS): primeiro no OmniLifeONE (que já tem o cofre de senhas e a família), depois o
   RiseONE lê a mesma tabela.
4. Modelos de exame com **exames de mentira** (laudos fictícios), testados nos dois apps.
5. Só então o dono sobe os exames de verdade.

**Quando o Marcelo pode subir os exames**: depois do passo 4, quando os dois apps abrirem o mesmo exame de
mentira, cada um mostrando só o que deve, e o teste de "muralha" (outra família não vê nada) passar.

## 8. Notas para os outros chats

- **Para o chat do OmniLifeONE**: construir o cofre de saúde em cima do `Cofre`/`Trava` existentes: chave de
  saúde da família (embrulhada para cada responsável), chave por pessoa, tabelas `saude_exames` (conteúdo
  cifrado, `familia_id`, `pessoa_id`, hash) e `saude_acessos` (só inclusão), RLS por família, consentimento
  separado, "quem viu os exames". A leitura do PDF vem do motor (`Leitura.ler` + `result.modelo`), que chega
  por PR próprio.
- **Para o chat do RiseONE**: ler a mesma tabela com a chave da pessoa; mostrar só os próprios; gráfico por
  indicador (hemoglobina ao longo do tempo) depois; MFA (conta + PIN/digital) para abrir.
