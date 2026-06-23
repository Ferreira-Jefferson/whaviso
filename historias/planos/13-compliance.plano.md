# Plano de desenvolvimento: Épico 13 (Linguagem, opt-out e compliance)

> Fonte da verdade: `historias/13-compliance.md`. Onde o código/PROJETO.md/CLAUDE.md divergir, o trabalho e mudar o codigo/doc para bater com a historia.
> Este é o épico de **invariantes transversais**: não cria telas, cria a fonte única de linguagem (`contracts/linguagem.ts` + dicionário do front), a garantia automática (lint/validação ao salvar template), a regra de log seguro, e amarra opt-out reversível e estado terminal.

---

## 1. Resumo do épico e escopo

**MVP 🟢 (entra agora):**
- H13.1 Palavras proibidas em tudo que sai e no código (incluindo nomes de banco, comentários, erros da API).
- H13.2 Sem travessão (em dash) em código/copy/comentários/UI.
- H13.3 Mensagens neutras quanto a gênero (templates, front, zap).
- H13.4 Opt-out visível em toda mensagem do ciclo.
- H13.5 Opt-out reversível, por combinado, estado `desregistrado` (não-terminal), sem DELETE.
- H13.6 Estado terminal nunca mais envia, garantido no servidor.
- H13.7 Devedor só por botão; sem chat/IA/Pix automático; não transaciona dinheiro.
- H13.8 Nunca logar telefone/Pix(+titular/banco)/token; token só hash sha256; payload do botão leva `aviso_id`.
- H13.9 Fonte única de linguagem espelhada (backend `contracts/linguagem.ts` + dicionário do front).
- H13.10 (parte 🟢) lint barra travessão e palavras proibidas em código/copy.
- H13.10 (parte 🟡) validação no servidor ao salvar template (proibidas já existe; travessão e gênero a confirmar/criar) e lista de alerta de gênero neutro.

**Gated 🟡 / dependente de outro épico:**
- H13.5 estado `desregistrado` como enum + transições: a **mecânica** mora no Épico 7 (máquina de estados). Este épico **exige** o comportamento (invariante) e descreve o que tocar; a implementação do trigger/transições é coordenada com E7. Não duplicar a maquinaria aqui.
- H13.10 checagem automatizada de gênero neutro: heurística de "lista de alerta" (warning), não bloqueio rígido, por ser difícil de automatizar com precisão.
- H13.8 dados de cartão/gateway: futuro, fora do MVP.

---

## 2. Estado atual vs história (baseado em código inspecionado)

| Critério | Estado | Evidência no código real |
|---|---|---|
| H13.1 palavras proibidas em copy/templates | `[~]` | Existe `PALAVRAS_PROIBIDAS_PATTERN` em `backend/packages/shared/src/contracts/linguagem.ts` e espelho no front; CHECK no banco (`0006`, `0022`). Mas a regra **não** está garantida em todo o código (só no front há `linguagem.test.ts` varrendo `src/`; backend não tem teste equivalente). |
| H13.1 nomes no banco / comentários / erros API | `[!]` | Comentários SQL nas migrations `0006`/`0022`/`0018` contêm "dívida" (em prosa explicativa). A regra do épico inclui comentários de código. Erros da API: `regraNegocio('linguagem_proibida', ...)` é limpo, mas não há varredura sistemática de strings de erro. |
| H13.2 sem travessão | `[!]` | Há travessão (—) em código de produto: `frontend/src/index.css` (3 comentários), `frontend/index.html`, `backend/supabase/migrations/0018_*.sql`, `backend/scripts/*`. Não há lint que barre travessão em lugar nenhum. |
| H13.3 gênero neutro | `[+]` | Não há nada em `linguagem.ts` (backend nem front) sobre gênero; nenhuma lista/heurística. Templates seedados em `0022` já estão neutros por sorte, mas sem garantia. |
| H13.4 opt-out visível em toda mensagem | `[~]` | Templates do ciclo declaram botões incl. `optout`; `enviar_lembretes` só remove `ver_pix` quando não há Pix, nunca remove o opt-out. Mas não há **invariante verificada** (teste) de que todo template do ciclo carrega o botão de opt-out. Mecânica do botão é E7; presença é compliance. |
| H13.5 opt-out reversível (`desregistrado`) | `[!]` | `webhook_whatsapp/repo.ts` põe `status='cancelado'` (terminal) no opt-out e grava evento `optout`. Enum `status_aviso` (`0001`) **não tem** `desregistrado`. Diverge da história (estado próprio reversível). Refator pertence a E7; E13 amarra o requisito. |
| H13.5 não apaga / append-only | `[x]` | Opt-out grava `eventos_aviso` append-only; sem DELETE de negócio. OK. |
| H13.6 terminal nunca envia (servidor) | `[x]` | `enviar_lembretes/index.ts` só envia em `pendente`/`informado_pago`; demais → `marcarCancelado('aviso_nao_ativo')`. `notificar_cobrador` idem. Garantido no servidor. (Quando `informado_pago` "parar" o ciclo é refator do E6, não daqui.) |
| H13.7 devedor só por botão | `[x]` | `webhook_whatsapp/service.ts` só aceita `ACOES_BOTAO`; texto livre cai sem efeito. Sem IA, sem Pix automático. OK (menu pago vs silêncio free é E7). |
| H13.8 não logar sensível | `[~]` | `logger/index.ts` redige `telefone`, `pix_chave`, `chave`, `token`. **Falta**: `pix_titular`/`pix_banco` (existem como conceito), `telefone_cobrador`, `telefone_devedor` já coberto por `telefone`? não: redige `telefone` e `telefone_devedor` mas **não** `telefone_cobrador`. `hook_otp` cuida de não logar código/telefone manualmente (bom exemplo, mas frágil). |
| H13.8 token só hash / payload leva aviso_id | `[x]` | Payload do botão é `acao:avisoId` (uuid), não token (`service.ts`). Aceite por hash sha256 (CLAUDE.md). OK. |
| H13.9 fonte única espelhada | `[~]` | Existe nos dois lados, mas cobre **só** proibidas (sem travessão, sem gênero). Não é a "fonte única" completa que a história pede. |
| H13.10 lint barra travessão/proibidas | `[+]` | `backend/eslint.config.mjs` e `frontend/eslint.config.mjs` só têm `boundaries` (fronteiras de módulo). **Nenhuma** regra de linguagem no ESLint. A garantia hoje é um **teste** (só no front). `npm run lint` não barra nada de linguagem. |
| H13.10 validação ao salvar template | `[~]` | `admin/index.ts` `lintConteudo` barra **proibidas** em texto+rótulos no POST e no preview, com envelope `{error:{code,message}}`. **Falta**: travessão e gênero neutro nessa validação. |

Legenda: `[x]` ok · `[~]` parcial · `[!]` diverge (refatorar) · `[+]` não existe.

---

## 3. Trabalho por camada

### Arquitetura / Dados
- **Fonte única de linguagem ampliada** (`contracts/linguagem.ts` backend + `frontend/src/shared/contracts/linguagem.ts`): além de `PALAVRAS_PROIBIDAS`, acrescentar:
  - `TRAVESSAO` (regex do em dash `—` e, opcionalmente, en dash `–` usado como travessão) + `lintTravessao`.
  - `GENERO_ALERTA` (lista de padrões gendered comuns: `\b(o|a|os|as)\s+(cobrador|devedor|respons[aá]vel|usu[aá]rio|cliente|titular)\b`, `\bsou\s+(o|a)\b`, `bem-vind[oa]\b`, `obrigad[oa]\b`, `ele\/ela`, `o\/a`) + `alertaGenero` retornando lista de ocorrências (warning, não erro).
  - `lintLinguagem` evolui para retornar `{ proibida, travessao, generoAlerta[] }` ou expor funções separadas; manter `lintLinguagem(texto): string|null` para compat (proibidas) e adicionar as novas.
  - Comentário de cabeçalho citando H13.9: "mudar padrão = mudar os dois lados + migration `0006` se tocar banco".
- **Migration `0006`/`0022` CHECK**: continua sendo a guarda de banco para proibidas. Acrescentar **comentário** (não CHECK) de que o padrão é espelhado em `linguagem.ts`. Não adicionar CHECK de travessão no banco (custo/manutenção; o gate fica na API + lint). Decisão: sinalizada na seção 7.
- **Limpeza de travessão em produto**: corrigir os arquivos de produto que hoje têm — (CSS, HTML, migrations `0018`, scripts) trocando por vírgula/parênteses/dois-pontos.
- **`desregistrado` (H13.5)**: enum `status_aviso` + transições do trigger e do app são **propriedade do Épico 7**. Aqui apenas: (a) registrar a dependência; (b) garantir que o invariante "opt-out não é terminal e não envia enquanto desregistrado" seja coberto por teste de compliance; (c) atualizar PROJETO.md/CLAUDE.md (que tratam opt-out como `cancelado`).

### Backend api
- **`admin/index.ts` `lintConteudo`**: estender para barrar **travessão** (erro, `linguagem_travessao`) e emitir **alerta de gênero** (não bloqueia; retorna no preview e/ou em campo `avisos[]` da resposta de criação). Mantém envelope `{error:{code,message}}` (H13.10, H13.8).
- **Contrato de erro**: garantir que nenhuma mensagem de erro nova vaze proibida/sensível (revisão das strings em `shared/http_errors`).

### Backend zap
- Nenhuma copy nova (transporte). Revisar `hook_otp` (texto OTP hardcoded) e qualquer string remanescente quanto a gênero/proibidas/travessão. O texto OTP atual já é neutro.

### Logging / Segurança (H13.8)
- **`logger/index.ts`**: ampliar `redact.paths` para `telefone_cobrador`, `*.telefone_cobrador`, `pix_titular`, `*.pix_titular`, `pix_banco`, `*.pix_banco`, `titular`, `*.titular`, `banco`, `*.banco`, `otp`, `*.otp`, `codigo`, `*.codigo`. Confirmar nomes reais dos campos Pix em `contracts/entidades.ts` antes (campo `pix_chave`/`nome_cobrador`/`telefone_cobrador` confirmados; titular/banco entram no E3/E7).
- **Teste de "não loga sensível"**: teste de unidade que cria um logger e verifica que um objeto com esses campos sai com `[oculto]`.

### Frontend
- **Dicionário de linguagem ampliado** (`frontend/src/shared/contracts/linguagem.ts`): espelhar travessão + lista de alerta de gênero do backend (cabeçalho "ESPELHO de ..." já existe).
- **Limpeza de copy/CSS**: trocar os travessões de `index.css`/`index.html`; varrer strings de UI por gênero (CTA pós-aceite, painel, etc.).

### Testes (unit + varredura + corrida onde crítico)
- **Backend: teste de varredura** equivalente ao `frontend/src/shared/contracts/linguagem.test.ts`, varrendo `apps/*/src` e `packages/*/src` por proibidas **e** travessão (excluindo o próprio `linguagem.ts`, `*.test.ts`, dirs de doc). Hoje só o front tem isso.
- **Frontend: estender `linguagem.test.ts`** para também falhar em travessão (hoje só proibidas).
- **Validação ao salvar template**: testes em `admin.test.ts` para 422/regra de negócio em proibida e travessão; alerta (não bloqueio) de gênero.
- **Logger redaction**: teste unit dos novos paths.
- **Invariante opt-out visível**: teste que carrega os templates do ciclo (seed/fixture) e exige presença do botão `optout`.
- **Corrida**: não há ponto de corrida próprio deste épico (estado/fila são E6/E7/E10). O único cuidado é que a varredura de lint rode no CI/`npm run lint`+`npm test`.

---

## 4. Sequência de passos

> Modelo: **sonnet** para mecânico (regex, copy, redact paths, varredura). **opus** só onde há risco de regra sutil (consolidação da fonte única que outros épicos consomem; coordenação do estado `desregistrado`).

1. **Ampliar a fonte única de linguagem (backend).** Adicionar `TRAVESSAO`/`lintTravessao` e `GENERO_ALERTA`/`alertaGenero` em `backend/packages/shared/src/contracts/linguagem.ts`, mantendo `lintLinguagem` compat. Cabeçalho citando H13.9.
   - Arquivos: `backend/packages/shared/src/contracts/linguagem.ts`.
   - Aceite: H13.9 (fonte única tem proibidas + travessão + construções neutras de referência), base de H13.2/H13.3.
   - Modelo: **opus** — é o contrato que api, front e validação de template consomem; o desenho das regex e da superfície de funções tem que ficar certo de primeira para os espelhos não divergirem.

2. **Espelhar no front.** Replicar travessão + alerta de gênero em `frontend/src/shared/contracts/linguagem.ts` (espelho exato).
   - Arquivos: `frontend/src/shared/contracts/linguagem.ts`, `frontend/src/shared/contracts/index.ts` (já reexporta).
   - Aceite: H13.9 (dicionário do front espelha o backend), H13.2/H13.3.
   - Modelo: **sonnet** — cópia espelhada mecânica do passo 1.

3. **Varredura backend de linguagem (teste).** Criar teste vitest que varre `apps/*/src` e `packages/*/src` por proibidas e travessão, excluindo `linguagem.ts`/`*.test.ts`/docs. (Espelha o do front, que hoje só existe lá.)
   - Arquivos: `backend/packages/shared/src/contracts/linguagem.test.ts` (novo) ou `backend/apps/*/.../linguagem.scan.test.ts`.
   - Aceite: H13.1 (proibidas em código), H13.2 (travessão em código), parte do gate automático de H13.10.
   - Modelo: **sonnet** — varredura de arquivos direta, padrão já existente no front.

4. **Estender a varredura do front para travessão.** Atualizar `linguagem.test.ts` do front para falhar também em travessão.
   - Arquivos: `frontend/src/shared/contracts/linguagem.test.ts`.
   - Aceite: H13.2, H13.10.
   - Modelo: **sonnet** — uma regex a mais na varredura existente.

5. **Limpar travessões de produto.** Remover — de `frontend/src/index.css`, `frontend/index.html`, `backend/supabase/migrations/0018_templates_delete.sql`, scripts em `backend/scripts/` (os que são produto/infra do app), trocando por vírgula/parênteses/dois-pontos. Rodar os testes dos passos 3/4 até passarem.
   - Arquivos: os listados; deixar docs/planos intactos (exentos).
   - Aceite: H13.2 (nunca aparece em código/copy/UI).
   - Modelo: **sonnet** — substituição textual guiada pelo teste.

6. **Limpar comentários/strings com palavra proibida em código de produto.** Reescrever comentários SQL das migrations (`0006`, `0022`, `0018`) e qualquer comentário/identificador com "dívida/cobrança/..." em código (não docs). Usar sinônimo do vocabulário aprovado ou reescrever.
   - Arquivos: migrations citadas + qualquer hit do passo 3.
   - Aceite: H13.1 (vale em comentários de código e nomes no banco).
   - Modelo: **sonnet** — reescrita de comentários, guiada pela varredura.

7. **Validação de template no servidor: travessão + alerta de gênero.** Estender `lintConteudo` em `admin/index.ts` para barrar travessão (erro `linguagem_travessao`, envelope `{error:{code,message}}`) e devolver `avisos[]` de gênero no preview e na criação (sem bloquear).
   - Arquivos: `backend/apps/api/src/modules/admin/index.ts`, contratos de resposta em `packages/shared/src/contracts/payloads.ts` (campo `avisos_genero`/`palavra_proibida`/`travessao`).
   - Aceite: H13.10 (validação ao salvar template no servidor), H12.5 amarrada, H13.2/H13.3.
   - Modelo: **opus** — toca o contrato de resposta consumido pelo editor do front e a regra de "bloqueia proibida+travessão mas só alerta gênero"; precisa de cuidado para não quebrar E12.

8. **Endurecer redaction do logger (H13.8).** Acrescentar `telefone_cobrador`, `pix_titular`, `pix_banco`, `titular`, `banco`, `otp`, `codigo` (e variantes `*.x`) ao `redact.paths`. Confirmar nomes reais antes via `entidades.ts`.
   - Arquivos: `backend/packages/shared/src/logger/index.ts`.
   - Aceite: H13.8 (telefone/Pix/titular/banco/token nunca em log).
   - Modelo: **opus** — segurança: a lista de paths precisa cobrir o shape real dos objetos logados (api+zap), sob risco de vazamento silencioso.

9. **Testes de segurança e de invariantes.** (a) teste de redaction dos novos paths; (b) testes de `admin.test.ts` para template com proibida (erro), com travessão (erro), com gênero (alerta, salva); (c) teste de "todo template do ciclo carrega botão optout".
   - Arquivos: `backend/.../logger.test.ts` (ou em shared), `backend/apps/api/src/modules/admin/tests/admin.test.ts`, teste de templates do ciclo.
   - Aceite: H13.8, H13.10, H13.4.
   - Modelo: **opus** — o teste de log seguro e o de presença obrigatória de opt-out são guardas de invariantes que não podem regredir; vale o cuidado extra.

10. **Coordenar `desregistrado` com o Épico 7 e atualizar docs.** Não implementar a máquina aqui; abrir/atualizar o item no plano de E7 (enum `status_aviso += desregistrado`, transições `programado↔desregistrado`, opt-out → `desregistrado` em `webhook_whatsapp/repo.ts`). Atualizar PROJETO.md/CLAUDE.md que hoje tratam opt-out como `cancelado`. Adicionar teste de compliance: `desregistrado` não é terminal e não envia.
    - Arquivos: `PROJETO.md`, `CLAUDE.md`, referência cruzada ao plano `07-interacao-devedor.plano.md`; (impl. real do trigger fica em E7).
    - Aceite: H13.5 (opt-out reversível, `desregistrado` distinto de cancelado/pausado/recusado), divergência da seção "Divergências".
    - Modelo: **opus** — máquina de estados e coerência cross-épico; precisa não contradizer E6/E7/E10.

11. **Garantia de que `npm run lint` reflete a regra (decisão).** Se a decisão (seção 7) for plugin ESLint, adicionar regra `no-restricted-syntax`/regra custom de travessão+proibidas ao `eslint.config.mjs` dos dois lados. Se for "teste basta", documentar que a garantia automática de H13.10 é via `npm test` (varredura) e ajustar o texto de H13.10/CLAUDE.md.
    - Arquivos: `backend/eslint.config.mjs`, `frontend/eslint.config.mjs` (se plugin) ou docs.
    - Aceite: H13.10 (lint do backend e do front barra travessão e proibidas em código/copy).
    - Modelo: **sonnet** — config de lint mecânica; a parte difícil (a decisão) é da seção 7.

---

## 5. Dependências de outros épicos

- **Este épico é fundação** (ver `_CONTEXTO.md`): E13 (linguagem) é pré-requisito de E2/E3/E5/E6/E7/E10/E12 (todo texto obedece a fonte única).
- **E12 (templates):** H13.10 (validação ao salvar) vive no editor/endpoints de templates do E12. A validação de proibida já existe; travessão/gênero entram aqui mas amarram H12.5.
- **E7 (interação do devedor / máquina de estados):** `desregistrado` (H13.5) é implementado lá; E13 só fixa o invariante e atualiza docs. H13.4 (opt-out visível) e H13.6 (terminal não envia) dependem dos botões/estados de E6/E7 — aqui se garante a regra, não a mecânica.
- **E3 (pagar invertido):** introduz `pix_titular`/`pix_banco` (titular/banco da chave); a redaction (passo 8) precisa cobrir esses campos quando existirem.

---

## 6. Riscos e pontos de teste dedicado

- **Espelhos divergirem (backend vs front):** mitigar com cabeçalho explícito e, idealmente, um teste que compare os patterns. Risco principal de H13.9. Teste dedicado de igualdade dos patterns.
- **Falso positivo de proibidas/travessão na varredura:** "atras(o|ad)" pega "atrasado/atraso" mas pode pegar substrings legítimas; "atrás" tem acento (não casa `atras` sem acento? casa "atras" sem acento). Revisar a lista de exclusões e palavras com acento. Travessão pode aparecer legitimamente em dados de terceiros (não no nosso código). Teste com casos de borda.
- **Redaction incompleta (H13.8):** maior risco de segurança do épico. Se um objeto for logado por um caminho aninhado não previsto, vaza. Teste com objetos reais de api e zap; considerar logar só ids/codigos de erro, nunca o objeto cru de aviso/perfil.
- **Gênero neutro automatizável só por heurística:** a lista de alerta gera falsos positivos ("a data", "o valor"). Por isso é **alerta, não bloqueio** (H13.10 🟡). Teste confirma que é warning, não erro.
- **`desregistrado` cross-épico:** se E7 não implementar, o invariante H13.5 fica falho (opt-out ainda terminal). Teste de compliance deve falhar enquanto o estado não existir (sinaliza pendência), não passar silenciosamente.

---

## 7. Decisões em aberto (confirmar com o humano)

> O épico declara "Nenhuma decisão pendente neste épico". Estas são decisões de **implementação** que o plano não deve inventar:

1. **Onde mora o gate automático de H13.10:** (a) regra ESLint custom (`npm run lint` barra), como o texto da história literalmente pede ("parte do `npm run lint`"), **ou** (b) teste de varredura vitest (`npm test`), que já existe no front e é mais simples de manter para travessão/proibidas em strings. Recomendação do plano: manter o **teste de varredura** como guarda principal (cobre strings, não só AST) e, se quiser cumprir a letra de H13.10, adicionar uma regra ESLint leve. Confirmar.
2. **CHECK de travessão no banco:** adicionar constraint de travessão na tabela `templates` (como já há para proibidas) ou deixar só na API+lint? Recomendação: só API+lint (evita migration e ruído de CHECK), mas é uma escolha de defesa-em-profundidade.
3. **`desregistrado` (H13.5) é dono do Épico 7:** confirmar que a refatoração do enum/trigger/transições e a troca de `optout→cancelado` por `optout→desregistrado` entram no plano de E7, com E13 só fixando o invariante e os docs. (Sinalizado na divergência do próprio épico.)
