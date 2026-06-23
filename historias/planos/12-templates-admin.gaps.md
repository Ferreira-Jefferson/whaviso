# Relatório de validação (gaps) — Épico 12: Templates / mensagens (admin)

> Revisor crítico (caça-gaps). Fonte da verdade: `historias/12-templates-admin.md`.
> Plano validado: `historias/planos/12-templates-admin.plano.md`.
> Verificação cruzada feita por leitura direta do código (graphify CLI indisponível): migrations 0013/0018/0022/0023/0024, `apps/api/modules/admin`, `apps/zap/shared/templates`, `apps/zap/modules/notificar_cobrador|enviar_lembretes`, `packages/shared/contracts/linguagem.ts`, `frontend/src/modules/admin`, `frontend/src/shared/contracts/linguagem.ts`, e os testes de `admin/tests`.

## 1. Veredito

**Aprovado com ressalvas.**

O plano é honesto, bem-fundamentado e bate com o código real em quase todos os pontos que conferi (preview com `replaceAll` próprio; `notificar_cobrador` faz `return 0` silencioso; `enviar_lembretes` marca `sem_template_ativo` e filtra `ver_pix`; CHECK/grants da 0022 só cobrem palavras proibidas; testes existentes conferem). A maior parte do épico está de fato implementada e o plano corretamente o trata como fechamento/endurecimento. As ressalvas abaixo são gaps reais, mas nenhum é estrutural.

## 2. Gaps por severidade

### Críticos

Nenhum gap crítico (o épico já está implementado; não há ponto de corrida/segurança novo introduzido por este plano que fique sem teste).

### Médios

- **[M1] Divergência de comportamento preview ≠ envio NÃO é só duplicação de código — os dois renderizadores divergem HOJE no valor ausente (H12.7).**
  O plano (passo 4, seção 6) trata a paridade preview↔envio como "risco de divergência *futura*" por código duplicado. Mas a divergência **já existe**: no api (`admin/index.ts` L150) o preview substitui valor ausente por `` `{{${nome}}}` `` (mostra o nome da variável entre chaves); no zap (`shared/templates/index.ts` L64, `renderMensagem`) o valor ausente vira **string vazia** `''`. Logo o owner pode ver no preview `{{nome}}` e o envio real mandar texto vazio naquele ponto. Isso fere diretamente H12.7 ("o que se vê é o que vai sair") **agora**, não no futuro. Correção: a extração do render compartilhado (passo 4) deve **unificar a semântica do valor ausente** (decidir empty-string vs placeholder e aplicar nos dois), e o teste de paridade (testes item 4) deve cobrir explicitamente o caso "variável sem valor". O plano precisa nomear essa diferença, senão a extração pode preservar o comportamento errado de um dos lados.

- **[M2] H12.8 "registrado para o owner corrigir" — o passo 3 não especifica o canal visível ao owner, só log.**
  H12.8 exige que a falta de versão ativa "fique **registrada para o owner corrigir**". O `enviar_lembretes` cumpre via `marcarFalhou(..., 'sem_template_ativo')`, visível em `/admin/envios`. O passo 3 do plano corrige o `notificar_cobrador` (que hoje faz `return 0` silencioso, confirmado na L26 do `index.ts`), mas o critério de aceite do passo fala em "log estruturado (sem PII) + marca recuperável". **Log não é visível ao owner**; a história pede algo que o owner veja. As linhas de `notificacoes_cobrador` ficam `agendado` — o plano precisa decidir e declarar **onde o owner vê isso** (um motivo na linha de notificação, um contador no painel admin, ou um sinal em `/admin/envios`/equivalente), não só logar. Caso contrário H12.8 fica `[~]` mesmo depois do passo 3. Cuidado adicional: marcar a notificação como falha precisa não quebrar o re-drain quando o template for ativado depois (a linha deve voltar a ser elegível) — coerente com o claim do plano, mas o critério do passo deve dizer isso.

- **[M3] H12.3 — terceira opção do aceite ("algum dado incorreto") e família `convite.*`: o plano joga tudo para E5/H12.10, mas o épico cita a 3ª opção como convenção dos Épicos 2/3/5 que o *modelo de botões* deve cobrir.**
  H12.3 último critério: "a estrutura de botões cobre as três opções (aceitar / algum dado incorreto / recusar)". O plano marca `[~]` e diz "não há a 3ª ação no enum; gated, registrar como dependência de E5, não trabalho deste épico". Concordo que o **fluxo** de convite é gated, mas o épico 12 é dono do **modelo de botões/ações** (`acaoBotaoTemplate`); deixar o enum sem a 3ª ação significa que, quando E5 ligar `convite.*`, vai precisar de uma migration/alteração de enum que é trabalho de E12, não de E5. O plano deveria pelo menos **registrar como item explícito de H12.10/dependência reversa** (E12 precisará estender `acaoBotaoTemplate` com a ação da 3ª opção quando E5 destravar), em vez de só remeter a E5. Não bloqueia o MVP, mas evita surpresa de fronteira.

### Baixos

- **[B1] Passo 5 propõe estender o CHECK do banco para travessão — atenção a falso-positivo no JSON inteiro.**
  O CHECK atual (`0022` L38-39) roda `conteudo::text !~* '...'` sobre o **jsonb inteiro serializado**, não só sobre `texto`/`rotulo`. Para palavras proibidas isso é seguro (não aparecem em `acao`/`tipo`/`url`). Mas barrar travessão `—` (em-dash, U+2014) no JSON inteiro é seguro também (não aparece em chaves técnicas). O risco real é o **hífen comum `-`** se a regex for mal escrita: `acao` usa `ver_pix`/`ja_paguei` (underscore, ok), mas `midia.url` pode conter `-`. O plano deve deixar explícito que a regex de travessão é **só o em-dash/en-dash (—, –), nunca o hífen ASCII**, para não quebrar URLs de mídia. Pequeno, mas é exatamente o tipo de detalhe que vira bug de constraint.

- **[B2] Sincronia da linguagem em 4 lugares, não 3.**
  O plano (seção 6) cita a regex de palavras proibidas em "3 lugares" (CHECK 0022, shared, front). Confirmei que o shared (`packages/shared/.../linguagem.ts`) **e** o front (`frontend/src/shared/contracts/linguagem.ts`) têm cópias **independentes** do `PALAVRAS_PROIBIDAS_PATTERN` (o front não importa o shared, por decisão de projeto). Então são de fato 3 padrões textuais + o CHECK = a manutenção do passo 5 toca **3 arquivos de regex + 1 migration**. O plano lista os arquivos certos (bom), mas a contagem "3 lugares" subestima; o teste de espelhamento deve garantir que os **três** padrões fiquem idênticos para o novo termo (travessão).

- **[B3] H12.1 — "catálogo da estrutura, fonte para o editor" está front-only; o plano remete a Decisão em aberto, o que é correto, mas o épico lista isso como critério `[ ]`, não como divergência.**
  O épico H12.1 tem o critério "Há um catálogo da estrutura ... fonte para o editor". O plano marca `[~]` (existe só no front) e empurra para Decisão em aberto #2. Isso é defensável (o épico não exige server-side e não está na seção "Divergências"), mas como é um **critério de aceite marcado** e não uma divergência, o plano deveria afirmar com mais clareza que **considera o critério satisfeito pelo catálogo do front** (e a Decisão em aberto é só sobre *promover* a fonte, não sobre cumprir o critério). Hoje o leitor pode achar que o critério está pendente. Apenas redação.

- **[B4] Passo 6 (saneamento de docs) — a memória `whaviso-templates-unificados` diz que `templates_mensagem`/`templates_cobrador` foram dropadas, mas a migration `0006_templates_mensagem.sql` ainda existe no diretório.**
  Confirmei que `0006_templates_mensagem.sql` está presente. O plano diz para sanear comentários da `0018` que citam tabelas dropadas; deve também garantir que ninguém confunda a `0006` (cria a tabela depois dropada) com estado atual. Migration histórica não se reabre (correto no plano), mas o saneamento de docs deve mencionar a 0006 também, não só a 0018.

## 3. Cobertura dos critérios de aceite (H12.x)

Todos os critérios têm passo/posição no plano. Mapa:

- H12.1 — coberto (estado `[x]`/`[~]`, passos 1 e implícito; ver B3).
- H12.2 — coberto (`[x]`, passo 1 valida).
- H12.3 — coberto, com ressalva M3 (3ª opção remetida a E5).
- H12.4 — coberto (`[x]`).
- H12.5 — coberto (`[x]`; aprovação manual como Decisão em aberto).
- H12.6 — coberto (`[x]`; passo 6 saneamento docs).
- H12.7 — coberto, com ressalva M1 (divergência de valor ausente já presente, não só futura).
- H12.8 — coberto, com ressalva M2 (canal visível ao owner não especificado para `notificar_cobrador`).
- H12.9 — coberto (`[x]`).
- H12.10 — corretamente gated, não implementar (passo 7).

**Critérios sem passo dedicado: nenhum.** Os gaps são de *profundidade/precisão* de critérios cobertos, não de critérios omitidos.

## 4. Testes (pontos críticos)

- **Render do zap (H12.8):** passo 2 cobre `{{n}}`, omissão de botões sem `refId`, fallback `revisao→padrao`. Bom. Confirmei que o fallback existe na query (`carregarTemplateAtivo`, order by contexto desc) — testável.
- **Falha sem template ativo (H12.8):** itens de teste 1 e 2 cobrem `enviar_lembretes` (já há `marcarFalhou`) e o novo comportamento de `notificar_cobrador`. **Ressalva M2:** o teste do `notificar_cobrador` deve verificar tanto "não envia mensagem quebrada" quanto "owner consegue ver/recuperar" — e que a linha volta a ser drenável após ativar o template.
- **Paridade preview↔envio (H12.7):** item de teste 4 previsto. **Ressalva M1:** o teste de paridade DEVE incluir o caso "variável ausente" (onde os dois divergem hoje), senão a extração pode passar verde preservando a divergência.
- **DELETE só em `templates` / ativo único (H12.5/H12.6):** já testados (409 ativo, troca de ativa, unique). OK.

**Pontos críticos do épico que NÃO se aplicam a E12:** corrida na fila/coalescing (E10/E6), horário reservado (E6), idempotência de webhook (E7), limite sem corrida (E11). O épico 12 não introduz nenhum desses; o plano corretamente não inventou testes deles. Correto não cobrir aqui.

## 5. Coerência cross-épico

- **E13 (linguagem):** dependência correta (passo 5). O plano acerta que palavras proibidas já existem e travessão/gênero é o que E13 acrescenta; e que se E13 não definiu ainda, faz só travessão e deixa gênero gated. Coerente.
- **E1 (auth):** owner-only no backend via `requireRole('owner')` (confirmado nas rotas) já real; front com guards mockados. O plano declara que nada muda em E12 quando E1 ligar. Coerente.
- **E5 (convite/aceite) e E1 (OTP):** destravam H12.10 e a 3ª ação. Coerente, mas ver M3 (a extensão do enum de ação é trabalho de E12 quando destravar, não de E5).
- **E6/E7/E8:** consomem templates; E12 é fundação já entregue. Coerente com o índice de dependências do `_CONTEXTO.md` (E12 é fundação).

**Sem contradição com outros épicos.** A única amarração reversa a vigiar é M3 (enum de ação ↔ E5).

## 6. Aderência às invariantes (Épico 13)

- **Sem travessão / palavras proibidas:** o plano *aumenta* a aderência (passo 5 adiciona travessão à validação ao salvar). Hoje só palavras proibidas são barradas (confirmado: shared, front e CHECK só têm `PALAVRAS_PROIBIDAS_PATTERN`). Gap pré-existente que o plano corretamente endereça. Ver B1 (não barrar hífen ASCII) e B2 (sincronizar os 3 padrões).
- **Gênero neutro:** o plano reconhece que NÃO é validado hoje e o deixa gated em E13. Honesto.
- **Centavos / fuso:** H12.2 confirmado (`formatarValorBr`/`formatarDataBr` na borda). Respeitado.
- **Sem DELETE de negócio:** a exceção `templates` está correta (grant DELETE só em `templates`, confirmado na 0022 L48; zap só SELECT L49). Plano mantém a guarda (nunca apaga a ativa, 409). Respeitado.
- **Nunca logar PII:** o plano alerta para auditar o novo log do `notificar_cobrador` (sem telefone/Pix). Correto e necessário (M2 reforça que o registro visível ao owner também não pode vazar PII).
- **Erros em envelope `{ error: { code, message } }`:** rotas usam `conflito`/`naoEncontrado`/`regraNegocio` (confirmado). Respeitado.

## 7. Recomendação de modelo por passo

Sensata no geral:
- Passos 2, 3, 4, 5 como **opus** está certo (render núcleo, drainer de outbox sem PII, refator cross-workspace, compliance cross-épico).
- Passos 1, 6, 7 como **sonnet** está certo (verificação mecânica, edição de comentários, doc de futuro).
- **Sem objeção.** Única observação: o passo 4 (extração do render) ganhou ainda mais peso por M1 (precisa unificar semântica de valor ausente, não só mover código) — mantém **opus**, justificado.

## 8. Decisões em aberto (do plano) — validação

Ambas as Decisões em aberto levantadas pelo plano (aprovação manual com Meta; catálogo front-only vs server-side) são legítimas, não-inventadas, e o épico de fato as lista em "Divergências (confirmar/fechar)". Correto sinalizar sem inventar resposta.

---

### Resumo acionável

1. **M1 (médio):** a divergência preview↔envio (valor ausente → `{{nome}}` no api vs `''` no zap) é atual, não futura; passo 4 deve unificar a semântica e o teste de paridade cobrir o caso ausente.
2. **M2 (médio):** passo 3 precisa especificar o canal **visível ao owner** (não só log) para a falta de template no `notificar_cobrador`, e garantir re-drain após ativar.
3. **M3 (médio):** registrar que a 3ª ação do aceite e `convite.*` exigirão estender o enum `acaoBotaoTemplate` (trabalho de E12) quando E5 destravar.
4. **B1/B2 (baixo):** regex de travessão só em-dash/en-dash (nunca hífen ASCII); sincronizar os 3 padrões de linguagem + CHECK.
5. **B3/B4 (baixo):** redação de H12.1 (critério satisfeito pelo front) e saneamento mencionar a 0006 além da 0018.
