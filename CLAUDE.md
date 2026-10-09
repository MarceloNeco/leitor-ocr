# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

# Projeto Leitor de Comprovantes (OCR)

## Quem pede as mudanças

- O dono do repositório (Marcelo) não é desenvolvedor. Responda sempre em português do Brasil, em linguagem simples, sem jargão.
- Quando ele precisar fazer algo no GitHub ou no navegador, dê o passo a passo como para um iniciante completo (onde clicar, que botão apertar).
- Ao terminar uma mudança, diga em uma ou duas frases o que mudou e como ele vê o resultado no site.

## O que é o repositório

- Leitor de comprovantes de maquininha (via do cliente) com OCR no navegador, publicado no GitHub Pages em https://solverone.com.br/leitor-ocr/ (o endereço antigo marceloneco.github.io/leitor-ocr/ redireciona para esse).
- Veio do repositório FeatureTesting (onde era `leitor-ocr.html`). Lá fica só um card apontando para cá.
- Não tem build, framework nem dependências instaladas: o app inteiro é o `index.html`, com CSS e JavaScript dentro. O motor de OCR (Tesseract.js) e o idioma português ficam na pasta `tesseract/`, os leitores de QR code e código de barras (ZXing e jsQR) e o leitor de PDF (pdf.js) na pasta `libs/`, tudo no próprio repositório. Nada é buscado na internet: o app é instalável e funciona sem conexão (`sw.js` guarda os arquivos no aparelho).
- A cada versão publicada, suba `APP_VERSION`/`APP_UPDATED` no `index.html` **e** `VERSAO` no `sw.js` (os testes avisam se diferirem). Arquivo novo no app entra na lista do `sw.js`.
- Para medir a leitura sem celular: `node testes/medir.js <pasta-de-fotos>` (as fotos e o gabarito ficam fora do repositório). Para testar o app sem internet, PDF e várias fotos: `node testes/offline.js`.
- Antes de mexer na leitura, leia `NOTAS-leitor-ocr.md`: explica como a leitura funciona, por que cada decisão foi tomada, os resultados dos testes e as pendências.

## Cuidados

- O repositório é público. Nunca coloque nele fotos reais de comprovantes, números de cartão, CPF/CNPJ pessoais ou qualquer dado pessoal, nem em testes.
- O valor é o campo mais importante. Prefira deixar o campo Valor vazio em vermelho a mostrar um valor errado.
- Toda mudança na leitura precisa ser medida antes e depois (veja "Como testar sem celular" nas notas), e o resultado contado para ele numa tabela simples.

# SolverONE — regras do projeto para o Claude Code

Antes de qualquer alteração neste repositório, leia e siga **inteira** a diretriz geral da plataforma em
`.claude/skills/diretrizes-gerais-apps/SKILL.md` (ela também é carregada como skill `diretrizes-gerais-apps`).

Resumo do que nunca pode ser esquecido (o detalhe está na diretriz):

- **Regra zero**: antes de implementar no app um requisito da diretriz que ainda não existe aqui, liste o que
  falta e confirme com o dono. Não crie repositórios nem publique (push/Pages) sem permissão explícita.
- **Segurança**: nenhuma senha, chave de API, token ou segredo entra no código, no repositório, no chat ou em
  arquivo. Chaves de IA ficam só no cofre do navegador da pessoa. Se uma chave aparecer no chat, peça para revogar.
- **Idioma**: textos para o usuário em PT e EN; instruções para o dono em português, passo a passo, como para
  iniciante (ele não é desenvolvedor).
- **Entrega**: um `.zip` por app, nome `<NOME APP> <VERSAO> <dd-Mmm-aaaa> <HHhMMm>.zip`, arquivos soltos na
  raiz; atualizar `versoes.json`, a versão no código, o `sw.js` e `ARQUITETURA.md`/`PENDENCIAS.md`.
- **Trabalho demorado** (foto, OCR, IA, importação, áudio) roda no módulo `Fundo`: nunca morre ao sair da tela,
  Wake Lock, aviso antes de fechar, pílula de andamento, resultado entregue onde a pessoa estiver.
- **Feedback dos usuários**: pergunta do dia, 💬 em toda tela e no AssistONE, tudo estruturado no RootifyONE.
