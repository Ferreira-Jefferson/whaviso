# Plano de desenvolvimento — Épico 12: Templates / mensagens (admin)

> Fonte da verdade: `historias/12-templates-admin.md`. Onde o código diverge da história, o plano manda mudar o código.
> Estado inspecionado no código real (graphify CLI indisponível nesta máquina; leitura direta de migrations, `apps/api/modules/admin`, `apps/zap/shared/templates` + módulos de envio, `packages/shared/contracts`, `frontend/src/modules/admin`).

## 1. Resumo do épico e escopo

Toda mensagem do produto (lembrete do ciclo, aviso ao cobrador, resposta a botão, OTP, convite) sai de um **template editável** numa **única tabela `templates`** chaveada por `chave`, com conteúdo **estruturado** (`{ texto, botoes:[{acao,rotulo}], midia }`). O **owner** edita texto e rótulos de botão num editor (`/admin/mensagens/:chave`), pré-visualiza e publica por versionamento (propor → aprovar → ativar). O **zap é transporte genérico**: nenhuma string de negócio no código; ele carrega a versão ativa por chave/contexto e renderiza.

**Conclusão da inspeção: o épico já está em grande parte implementado.** A consolidação de templates está feita ponta a ponta (banco, api, zap, frontend). O trabalho restante é de **fechamento/validação** das divergências apontadas no épico e de **endurecimento** (testes dedicados, registro de falha de envio sem template, amarração da validação de linguagem completa do Épico 13). Não há reescrita estrutural.

**MVP 🟢 (todo já existente ou de fechamento):** H12.1 a H12.9.
**Gated 🟡 (fora do MVP, dependem de Meta oficial / OTP):** H12.10 — famílias `convite.*` e `conta.*`. Já modeladas no catálogo do hub com estado honesto; entram na mesma tabela/editor quando ligarem. **Não implementar agora.**

## 2. Estado atual vs história (por critério)

Legenda: `[x]` ok · `[~]` parcial · `[!]` diverge (refatorar) · `[+]` não existe.

### H12.1 Modelo unificado de templates — `[x]`
- `[x]` Uma tabela `templates` chaveada por `chave` (migration `0022_templates_unificada.sql`), conteúdo `jsonb` estruturado.
- `[x]` Tabelas paralelas removidas: `templates_mensagem` dropada na `0024`, `templates_cobrador` na `0023`. `grep` não acha referência viva.
- `[x]` Famílias presentes: `resposta.*` (seed 0022), `ciclo.*` padrão+revisão (0024), `cobrador.pagamento_informado` (0023).
- `[~]` "Catálogo da estrutura" (quais chaves/variáveis/ações cada chave aceita): existe **só no frontend** (`frontend/src/modules/admin/catalogo_mensagens.ts` + `templates_catalogo.ts`). Não há catálogo no backend/shared; o backend confia no que o front manda (validado por Zod genérico, não por chave). Funciona, mas a "fonte única" do épico está no front. Decidir se basta (ver Decisões em aberto).

### H12.2 Edição com paleta de variáveis — `[x]`
- `[x]` Editor `/admin/mensagens/:chave` mostra texto + paleta (`CATALOGO_VARIAVEIS`); variáveis por chave (`catalogo_mensagens.ts`, `VARIAVEIS_CICLO` etc.).
- `[x]` Variáveis mudam por chave (paleta filtrada por `meta.variaveis`).
- `[x]` Substituição na renderização: `apps/zap/src/shared/templates/index.ts#renderMensagem` resolve `{{n}}` na ordem de `variaveis`; cada módulo monta o mapa (`render.ts` em `enviar_lembretes`/`notificar_cobrador`).
- `[x]` Dinheiro em centavos formatado na borda (`formatarValorBr`), datas em America/Sao_Paulo (`formatarDataBr`).

### H12.3 Botões editáveis (rótulo sim, ação não) — `[x]`
- `[x]` Editor lista botões da chave com ação fixa + rótulo editável (`DetalheMensagem.tsx`, secção "Botões").
- `[x]` Ação não editável: `acaoBotaoTemplate` é enum Zod (`ja_paguei|ver_pix|optout|aceite|recusa`); o id do botão é `acao:refId`.
- `[x]` Catálogo define ações por chave (`meta.acoes`); o editor não deixa inventar ação fora da lista.
- `[x]` "Ver chave Pix" suprimido no envio sem Pix: `enviar_lembretes/index.ts` filtra `b.acao !== 'ver_pix'` quando não há `pix_chave`.
- `[~]` Três opções do aceite (aceitar / dado incorreto / recusar): o modelo cobre `aceite`/`recusa`, mas **não há a 3ª ação "algum dado incorreto"** no enum nem chave de convite (gated, H12.10). O aceite hoje é por link/página pública (Épico 5), não por template. Registrar como dependência de E5, não trabalho deste épico.

### H12.4 Variante de contexto (padrão / revisão) — `[x]`
- `[x]` Coluna `contexto template_contexto` (`0013`), unique ativo por `(chave, contexto)`; ciclo tem `padrao` e `revisao` (0024).
- `[x]` Alternador padrão/revisão só em chaves com variante: `meta.temRevisao` controla o `SegmentedControl`.
- `[x]` `revisao` usada em `informado_pago`: `carregarTemplateAtivo(pool, chave, 'revisao')` com fallback para `padrao`.
- `[x]` Seleção do contexto é do código (estado do aviso), não do owner.

### H12.5 Versionamento e publicação — `[x]`
- `[x]` Salvar cria nova versão; nasce `pendente`/`ativo=false` (`POST /admin/mensagens`).
- `[x]` Passo de aprovação explícito: `POST /admin/mensagens/:id/submeter` enfileira a versão para a Meta; `status_meta` reflete o veredito real (webhook/reconcile). Não existe mais `/aprovar` manual.
- `[x]` Ativar exige aprovada (`409 template_nao_aprovado` senão).
- `[x]` Ativar substitui a ativa da `(chave, contexto)` em transação; antigas ficam (histórico).
- `[x]` zap usa só a ativa (`carregarTemplateAtivo … where ativo`).
- `[x]` A aprovação (H12.5) é a própria aprovação da Meta por chave (`status_meta`), sem passo manual separado: ver Decisões em aberto (item resolvido).

### H12.6 Apagar versão (exceção de DELETE) — `[x]`
- `[x]` DELETE físico de versão (`DELETE /admin/mensagens/:id`).
- `[x]` Nunca apaga a ativa (`409 template_ativo`).
- `[x]` `whaviso_api` com DELETE só em `templates` (grant na 0022); zap só SELECT.
- `[x]` Apagar pendente/antiga não afeta o ar (teste `admin.test.ts`).
- `[!]` **Doc desatualizada:** a migration `0018_templates_delete.sql` e seu comentário falam em `templates_mensagem` (tabela já dropada). O grant relevante hoje vem da 0022. Trabalho: nota/comentário de saneamento (a 0018 é histórica, já aplicada; não reabrir, só não confundir CLAUDE.md). Confirmar que CLAUDE.md cita a exceção na tabela `templates` (cita).

### H12.7 Pré-visualização — `[x]`
- `[x]` Preview com valores de exemplo + botões (`POST /admin/mensagens/preview`, `WhatsAppPreview`).
- `[x]` Não envia nada (rota só renderiza/linta).
- `[~]` "Mesmo renderizador do envio real": o preview do backend usa **replace próprio** (`admin/index.ts`, `replaceAll('{{i+1}}')`) — **não** chama `renderMensagem` do zap (módulo do api não pode importar módulo do zap; fronteira correta). A lógica é equivalente mas **duplicada**. Risco de divergência futura. Trabalho: extrair o render puro de `{{n}}` para `packages/shared` e ambos consumirem (única fonte). Hoje funciona; é endurecimento.

### H12.8 zap como transporte genérico — `[x]` (com 1 lacuna)
- `[x]` zap sem texto de negócio: lembretes/cobrador/respostas carregam a ativa por chave (`shared/templates`); nenhum módulo monta string.
- `[x]` Transporte entende texto+botões+mídia genericamente (`MensagemWhats`, `renderMensagem`).
- `[x]` Cada módulo monta o mapa de valores e chama o renderizador (`render.ts`).
- `[~]` "Sem versão ativa → falha controlada **e fica registrado para o owner corrigir**": parcial.
  - `enviar_lembretes`: marca `falhou` com motivo `sem_template_ativo` (registrado, owner vê em `/admin/envios`). OK.
  - `notificar_cobrador`: se não há template ativo, **silenciosamente não envia** e as linhas ficam `agendado` (gated, comentário no `index.ts`). **Não há registro visível ao owner** de que falta template. Trabalho: registrar (log estruturado sem PII + sinal no painel de envios/admin) quando uma chave usada não tem versão ativa.
- `[x]` Transporte fica atrás de `ClienteWhats`: hoje é a Meta Cloud API; trocar de provider não mudaria os templates.

### H12.9 Hub de navegação — `[x]`
- `[x]` Hub `/admin/templates` (`Templates.tsx`) com trilha do ciclo + famílias (cobrador, convite, respostas, conta).
- `[x]` Cada item leva ao editor `/admin/mensagens/:chave` (rota em `router.tsx`).
- `[x]` Área owner: `RequireRole role="owner"` no `/admin`; nav só no `NAV_OWNER.admin`.
- `[~]` "Navegação reflete o catálogo (adicionar chave aparece no hub sem tela nova)": o hub é dirigido por `SECOES_MENSAGENS` (catálogo **estático do front**), não pelos templates do banco. Adicionar uma chave nova exige editar `catalogo_mensagens.ts` (1 entrada), não cria tela. Aceitável, mas a "fonte" do hub é o catálogo do front, não o backend — coerente com H12.1 `[~]`.

### H12.10 Famílias ainda sem editor 🟡 — `[x]`
- `[x]` `convite.resumo` (resumo + 3 botões, H5.2): **agora editável** no hub (chave `convite.resumo`, variante padrão/revisão, botões aceitar/dado incorreto/recusar). O envio depende de aprovação do template na Meta (gate por chave, como as demais); a variável "quem recebe" foi padronizada de `nome_cobrador` para `cobrador` (migration 0063) para casar com a paleta do editor.
- `[x]` `conta.*` (OTP): já é um template Meta (categoria autenticação), sujeito ao mesmo modelo de submissão/aprovação por chave. `boas-vindas`: `planejado`.
- `[x]` O estado `gated` ("Depende da Meta") saiu do catálogo estático por família: hoje o gate real é **por template aprovado/não aprovado por chave** (`template_meta_nao_aprovado`), o mesmo modelo para todas as famílias.
- `[x]` Demais `convite.*` (pedir número, não encontrado, expirado, etc.) seguem como respostas fixas do fluxo; entram no editor se/quando precisarem (modelo já comporta).

### Divergências do épico, fechamento
- **Aprovação é a da Meta, sem passo manual separado:** ver Decisões em aberto (item resolvido).
- **Famílias sem editor:** corretamente gated; sem chave reservada no banco (entram quando ligar). OK.
- **Garantia de linguagem no editor:** `[~]` validação ao salvar existe **só para palavras proibidas** (`lintLinguagem` no api + `CHECK` no banco + lint no front). **Não valida travessão (—) nem gênero**, que o épico (e E13) exigem amarrar. Trabalho: estender a validação (amarração com E13).

## 3. Trabalho por camada

### Arquitetura / Dados
- Nenhuma migration estrutural nova para o MVP. As 0013/0018/0022/0023/0024 já entregam o modelo.
- (Endurecimento) Considerar estender o `CHECK templates_unif_linguagem_limpa` para barrar travessão `—` no banco também (espelho do padrão E13), mantendo em sincronia com `linguagem.ts`. Migration aditiva só de constraint.
- (Opcional/futuro) Catálogo de estrutura no backend (`packages/shared/contracts` ou tabela) se a Decisão em aberto apontar para fonte única server-side.

### Backend api (`apps/api/src/modules/admin`)
- Estender o lint de conteúdo (`lintConteudo`) para incluir travessão e (quando E13 entregar) gênero, reusando a função/dicionário do `@whaviso/shared/contracts/linguagem` (não duplicar regex).
- Extrair o render de `{{n}}` para `@whaviso/shared` e usar tanto no `preview` quanto (via shared) no zap, eliminando a duplicação de H12.7.

### Backend zap (`apps/zap/src`)
- `notificar_cobrador/index.ts`: ao não achar template ativo na chave, **registrar** (log estruturado sem PII + marca recuperável) para o owner saber que falta ativar a versão, em vez de só não enviar silenciosamente. Espelhar o padrão de `sem_template_ativo` do `enviar_lembretes`.
- `shared/templates`: consumir o render compartilhado (item do api acima) para garantir paridade preview↔envio.

### Frontend (`frontend/src/modules/admin`)
- Estender o lint do cliente (`DetalheMensagem.tsx`) para travessão/gênero junto com E13 (hoje só palavras proibidas via `lintLinguagem` do front).
- Nenhuma tela nova no MVP. Quando E13 entregar o dicionário, ligar o aviso no editor.

### Segurança
- `[x]` Owner-only em todas as rotas (`requireRole('owner')`), testado (403 para não-owner em list/delete/patch). DELETE restrito a `templates` (grant).
- `[x]` RLS deny-all anon/authenticated; policies só roles de serviço.
- Garantir que preview/erros **nunca logam** PII (preview usa valores de exemplo; ok). Auditar o novo log do zap para não vazar telefone/Pix.

### Testes
- `[x]` Já cobertos: lista, owner-only, preview render+lint (texto e rótulo de botão), criar com linguagem proibida (422), propor→aprovar→ativar (troca a ativa, unique), apagar ativa (409).
- **Faltam (escrever):**
  1. zap `enviar_lembretes`: envio com `sem_template_ativo` marca `falhou` (H12.8) — verificar se há teste; senão adicionar.
  2. zap `notificar_cobrador`: sem template ativo → não envia, linha permanece recuperável **e** gera registro/log (H12.8 novo comportamento).
  3. zap `shared/templates`: `renderMensagem` substitui `{{n}}`, omite botões sem `refId`, fallback `revisao→padrao` em `carregarTemplateAtivo`.
  4. (após extração) paridade preview(api)↔render(zap) sobre o mesmo input.
  5. lint estendido: travessão rejeitado ao salvar (quando E13 ligar).

## 4. Sequência de passos

> A maior parte do épico está pronta. Os passos abaixo são de fechamento/validação e endurecimento, em ordem de dependência. Cada passo aterrissa num HNN.x.

1. **Validar end-to-end o que já existe** (rodar `npm run lint && npm run typecheck && npm test` no backend; `lint`+`typecheck` no front; recriar DB de dev com `validate_migrations.sh` para confirmar 0022/0023/0024). Objetivo: linha de base verde antes de mexer. Critério: H12.1/H12.5/H12.6 continuam passando. Arquivos: nenhum (verificação). **Modelo: sonnet** — execução mecânica de comandos e leitura de saída, sem decisão de design.

2. **Teste do render compartilhado do zap** (`apps/zap/src/shared/templates`): cobrir `{{n}}` (em ordem, token fora de faixa intacto, posição vazia→''), omissão de botões sem `refId`, e fallback `revisao→padrao`. Critério: H12.8 (transporte genérico determinístico). Arquivo: `apps/zap/src/shared/templates/tests/templates.test.ts` (novo). **Modelo: opus** — é o núcleo de renderização (substituição/fallback) cujo comportamento alimenta toda mensagem; erros aqui são sistêmicos.

3. **Registrar falha de envio sem template ativo no `notificar_cobrador`**: ao `carregarTemplateAtivo` retornar null, logar estruturado (sem PII) e marcar de forma que o owner perceba (alinhar com o sinal `sem_template_ativo` de `enviar_lembretes`). Critério: H12.8 ("fica registrado para o owner corrigir"). Arquivos: `apps/zap/src/modules/notificar_cobrador/index.ts` (+ `repo.ts` se precisar de coluna/motivo), teste em `tests/notificar_cobrador.test.ts`. **Modelo: opus** — toca o drainer de outbox gated; precisa não enviar mensagem quebrada, não vazar PII e não criar corrida com o claim.

4. **Extrair o render de `{{n}}` para `@whaviso/shared`** e fazer `preview` (api) e `renderMensagem` (zap) consumirem a mesma função. Elimina a duplicação de H12.7 (preview ≠ envio por divergência futura). Critério: H12.7 ("mesmo renderizador do envio real"). Arquivos: `packages/shared/src/contracts` (ou novo `render`), `apps/api/src/modules/admin/index.ts`, `apps/zap/src/shared/templates/index.ts`. **Modelo: opus** — refator cross-workspace que precisa preservar contrato exato dos dois lados (fronteira de módulos, sem regressão de preview).

5. **Estender a validação de linguagem ao salvar template (travessão + gênero)** reusando o dicionário do Épico 13. No api (`lintConteudo`), no front (`DetalheMensagem`), e opcionalmente no `CHECK` do banco (migration aditiva). Critério: divergência "garantia de linguagem no editor" + H12.1/H12.3 (texto e rótulos respeitam regras de ouro). Arquivos: `packages/shared/src/contracts/linguagem.ts`, `apps/api/src/modules/admin/index.ts`, `frontend/src/shared/contracts/linguagem.ts`, migration nova. **Modelo: opus** — segurança/compliance de conteúdo, amarração cross-épico (E13) e espelhamento banco↔shared↔front que precisa ficar em sincronia. **Depende de E13** (se E13 ainda não definiu travessão/gênero, fazer só travessão agora e deixar gênero gated).

6. **Saneamento de docs/comentários**: corrigir a referência a `templates_mensagem`/`templates_cobrador` (dropadas) nos comentários remanescentes (`0018` é histórica; CLAUDE.md já cita a exceção na tabela `templates`). Garantir que a memória `whaviso-templates-unificados` e CLAUDE.md batem com o estado final. Critério: H12.6 (exceção de DELETE registrada corretamente). Arquivos: comentários de migration histórica (sem reabrir migração aplicada), CLAUDE.md se necessário. **Modelo: sonnet** — edição textual de comentários/docs, sem lógica.

7. **(Gated, não implementar) Documentar o caminho de H12.10**: deixar registrado no plano/catálogo como `convite.*` e `conta.*` entram (adicionar chave ao catálogo do hub + semear template + ligar o módulo de envio) quando Meta oficial/OTP destravarem. Critério: H12.10 🟡. Arquivos: nota no catálogo (`catalogo_mensagens.ts` já tem os estados). **Modelo: sonnet** — documentação de plano futuro.

## 5. Dependências de outros épicos

- **E13 (Linguagem):** o passo 5 (validação travessão/gênero no editor) depende do dicionário/`contracts/linguagem.ts` de E13. As palavras proibidas já existem; travessão/gênero são o que E13 acrescenta. É a única dependência de implementação.
- **E1 (Auth):** o gate owner-only do `/admin` depende dos guards reais (hoje "Fase 0: mockados, deixam passar" no front; o backend já valida `requireRole('owner')` via JWKS). Quando E1 ligar os guards, nada muda no E12.
- **E5 (Convite/Aceite) e E1 (OTP):** destravam H12.10 (`convite.*`, `conta.*`) e a 3ª ação do aceite (H12.3). Fora do MVP.
- **E6/E7/E8:** consomem os templates do ciclo/cobrador/respostas que este épico fornece (E12 é fundação, já entregue). E12 não depende deles.

## 6. Riscos e pontos de teste dedicado

- **Paridade preview ↔ envio (H12.7):** hoje o render é duplicado (api faz replace próprio, zap usa `renderMensagem`). Risco de o owner ver no preview algo diferente do que sai. Teste dedicado após a extração (passo 4): mesmo input → mesma saída nos dois.
- **Render do zap (H12.8):** núcleo de toda mensagem. Teste dedicado de substituição/fallback (passo 2). Fallback `revisao→padrao` precisa nunca deixar uma mensagem sem texto.
- **Falha sem template ativo (H12.8):** garantir "não manda mensagem quebrada" E "fica registrado". O `notificar_cobrador` hoje só silencia. Teste do passo 3 deve verificar o registro sem vazar PII.
- **Sincronia banco ↔ shared ↔ front da linguagem:** a regex de palavras proibidas existe em 3 lugares (`CHECK` na 0022, `linguagem.ts` shared, `linguagem.ts` front). Travessão/gênero (passo 5) precisa manter os três alinhados; teste do `linguagem.test.ts` (já existe no front) deve cobrir o novo termo.
- **DELETE só em `templates`:** já testado (apagar ativa→409). Confirmar que nenhuma outra tabela ganhou DELETE de tabela (auditar grants se mexer em migration no passo 5).
- **Sem corrida de "ativo único":** unique index `(chave, contexto) where ativo` + transação no `ativar` cobrem; manter ao mexer.

## 7. Decisões em aberto (confirmar com o humano)

O épico declara "Nenhuma pendente neste épico", mas a inspeção do código levanta duas escolhas de fechamento que a história lista como "confirmar":

1. **Aprovação manual permanece com a Meta oficial? RESOLVIDO.** Não há mais passo manual: o antigo `/aprovar` saiu. O passo "aprovar" (H12.5) hoje É a aprovação da Meta: o owner submete a versão pelo painel (`/admin/mensagens/:id/submeter`), o `zap` cria/edita o template na WABA, e `status_meta` reflete o veredito real (webhook/reconcile). Só uma versão com `status_meta='aprovado'` pode ser ativada.
2. **Catálogo de estrutura: front-only ou também no backend?** Hoje a "fonte única da estrutura" (chaves/variáveis/ações por chave) vive em `frontend/.../catalogo_mensagens.ts`; o backend valida só genericamente (Zod) e confia no que o front envia. Funciona, mas se outro cliente (ou o próprio zap) precisar da estrutura, ela não está server-side. Decidir se o catálogo deve subir para `@whaviso/shared`/tabela (fonte única real) ou se o front basta. Afeta H12.1 ("um catálogo da estrutura, fonte para o editor").

Ambas são de produto/arquitetura, não bloqueiam o fechamento do MVP; sinalizo para não inventar a resposta.
