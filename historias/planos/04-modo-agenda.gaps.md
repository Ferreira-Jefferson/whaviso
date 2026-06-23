# Relatório de validação: Épico 04 — Modo agenda

> Fonte da verdade: `historias/04-modo-agenda.md`. Plano avaliado: `historias/planos/04-modo-agenda.plano.md`. Código conferido em `backend/apps/api/src/modules/{avisos,recebimentos}`, `backend/supabase/migrations/{0001,0007,0011,0017,0019}`, `packages/shared/src/contracts/{enums,payloads}.ts`.

## 1. Veredito

**Aprovado com ressalvas.** O plano cobre os 5 critérios-mãe (H4.1..H4.5), acerta o diagnóstico da maioria das divergências e lista testes para os pontos críticos. Mas tem **2 gaps críticos** que, se não corrigidos, deixam o épico sem cumprir a história: (a) os tipos de evento `ativado`/`editado`/`pago_manual` não existem no enum e a migration A1 não os adiciona, então os passos B2/B3/B5/B7 quebram em runtime; (b) a regra "free não ativa" não tem enforcement real, porque o plano free (`pessoal`) hoje tem `max_avisos_ativos = 10`, não 0, e o plano reaproveita exatamente essa checagem para a ativação. Há também um erro de fato no diagnóstico ("free hoje nem cria").

## 2. Gaps por severidade

### Críticos

- **G-C1 — Enum `tipo_evento` não cobre os eventos novos (H4.3/H4.4/H4.5).** O plano usa eventos `ativado` (B3), `editado` (B5) e, na D4, propõe `pago_manual`. O enum real (`0001_enums.sql` + `enums.ts`) tem só `criado, aceite, ja_paguei_devedor, confirmado_cobrador, rejeitado_cobrador, desmarcado_cobrador, optout, cancelado_cobrador, expirado, solicitou_pix, recusado`. A migration A1 só fala em `status_aviso add value 'sem_aviso'` e na reescrita do trigger; **não** adiciona valores a `tipo_evento`. Resultado: `inserirEvento(..., 'ativado'|'editado'|'pago_manual', ...)` viola a constraint do enum e estoura no insert. **Correção:** em A1 (ou A2) acrescentar `alter type tipo_evento add value if not exists 'ativado'`, `'editado'`, e (se D4 fechar em evento dedicado) `'pago_manual'`; espelhar em `enums.ts` (`tipoEvento`) e no Zod do front. Isso também afeta o E9 (linha do tempo) — sinalizar lá.

- **G-C2 — "Free não ativa" sem enforcement (H4.3, 4º critério; divergência do épico).** A história exige: free **mantém agenda** mas **não pode ativar** (ativar leva à CTA de plano). O plano (B3) reaproveita `limiteDoPlano`/`contarAtivos` e afirma "Free (limite 0/atingido) cai aqui". Mas no catálogo atual (`0019_billing_personalizado.sql`) `pessoal` (o free) tem `max_avisos_ativos = 10`, **não 0**. Com isso, free conseguiria ativar até 10 avisos, contrariando a história. O plano não especifica zerar o limite ativo do free nem sinaliza a contradição. **Correção:** decidir explicitamente (em coordenação com E1/E11) que o limite de **ativos** do free é 0 (ou um flag `permite_ativar=false`), e a migration A2 deve setá-lo; ou o "ativar" deve ter uma regra própria de "free nunca ativa" independente de `max_avisos_ativos`. Hoje H1.5/E1 trata free como read-only, mas o catálogo diz 10: a divergência precisa ser resolvida neste plano, não só citada.

### Médios

- **G-M1 — Erro de fato no diagnóstico "free hoje nem cria" (tabela §2, linha H4.1 free; e §6 R4).** O código permite a TODO usuário criar até `limiteDoPlano`; com `pessoal.max_avisos_ativos=10`, o free **já cria** até 10 hoje. A afirmação "free hoje nem cria" / "free passa a poder criar agenda" parte de premissa errada. Não muda os passos, mas vicia o raciocínio sobre o que mudar (a refatoração não é "habilitar criação para o free", e sim "separar balde de agenda do balde de ativos e zerar o ativo do free"). **Correção:** corrigir o texto e ancorar na realidade do catálogo.

- **G-M2 — Idempotência de ativação não impede furo de limite por duplo-tap (H4.3 / S4 / R2).** O plano cobre corrida entre dois "ativar" concorrentes (transação + `for update`), mas a D2 deixa em aberto o duplo-tap do MESMO aviso. Com o `for update` na linha do aviso, o segundo tap vê `status <> 'sem_aviso'` e dá 409 — isso resolve, mas o plano não amarra explicitamente que a checagem de `status='sem_aviso'` ocorre **dentro** da mesma transação que faz o `update`, sob o lock. Hoje `criarAviso`/`recebimentos` já usam esse padrão; o plano deve declarar que B3 segue idêntico (carregar `for update` + revalidar status + transitar na mesma tx), senão abre janela. **Correção:** tornar requisito explícito em B3/S4, e o T-api-4 deve testar duplo-tap concorrente (não só sequencial).

- **G-M3 — Marcar-pago-agenda e autorização no fluxo invertido (H4.5).** O plano (B7/D4) identifica corretamente que `confirmarRecebimento` usa `exigirPapel(..., 'cobrador')` (`recebimentos/service.ts`), que falha no invertido (criador = devedor). Bom. Mas deixa a decisão (D4) sobre módulo/evento/ator **em aberto**, e o passo B7 ainda fala em reusar `confirmado_cobrador` com `detalhes` como alternativa — o que produziria `ator='cobrador'` semanticamente errado no invertido e contaminaria o E9. **Correção:** fechar D4 a favor do evento dedicado `pago_manual` + `ator = criador_papel`, e remover do B7 a opção de reusar `confirmado_cobrador`. Sem isso o critério "registro manual" fica com auditoria errada.

- **G-M4 — `contarAtivos` e o filtro do painel devem excluir `sem_aviso` deliberadamente (H4.2/H4.3, D5).** `contarAtivos` (`avisos/repo.ts`) filtra `status in ('aguardando_aceite','pendente')`, então hoje `sem_aviso` não entra no balde de ativos — correto. O plano (D5) levanta a dúvida mas não vira passo/teste. **Correção:** adicionar asserção explícita no T-api-3/T-api-4 de que criar agenda **não** incrementa `contarAtivos`, e que ativar **move** do balde de agenda para o de ativos (decrementa agenda, incrementa ativo) — evita regressão se alguém mexer no `count`.

- **G-M5 — Constraint relaxada: caminho do invertido em `sem_aviso` com telefone do criador nulo (H4.1/H4.3).** A1 relaxa `avisos_convite_tem_destino` para `status='sem_aviso' OR (...)`. Correto. Mas há uma sutileza: ao **ativar** um invertido, o alvo do convite é `telefone_cobrador` (validado em B3) — porém `telefone_devedor` (alvo dos lembretes = telefone do criador) pode estar nulo se o perfil não tem telefone. A história H4.3 diz "pede dado faltante antes de ativar"; o ciclo de lembretes (E6) precisa de `telefone_devedor`. O plano valida só `telefone_cobrador`+Pix no invertido e não trata `telefone_devedor` ausente. **Correção:** em B3, no invertido, ou exigir/derivar `telefone_devedor` do perfil ao ativar, ou documentar que a ausência é tolerada porque os lembretes do invertido vão ao cobrador (rever contra E6). Hoje `criarAviso` resolve `telefoneCriador` na criação; na ativação esse passo precisa ser refeito (o perfil pode ter mudado).

### Baixos

- **G-B1 — Caminhos de arquivo no plano estão errados.** O plano cita `apps/api/modules/{avisos,...}`; o real é `apps/api/src/modules/...`. Idem `avisos/index.ts` lista as rotas (confirmado), mas a precisão dos paths ajuda quem implementa. **Correção:** ajustar os paths.

- **G-B2 — `link_aceite` já é `nullable` no contrato de resposta.** O plano (B2/F2) trata `link_aceite: null` como novidade; `criarAvisoResposta` já é `z.url().nullable()` (`payloads.ts`). Não é gap de cobertura, mas o plano poderia notar que o contrato de resposta não muda (só o valor). Baixo.

- **G-B3 — Evento `criado{modo:'agenda'}` vs `criado{direcao}` atual.** Hoje `criarAviso` grava `criado` com `detalhes:{direcao}`. O plano (B2) propõe `detalhes:{modo:'agenda'}`, perdendo `direcao`. **Correção:** manter ambos (`{direcao, modo}`) para não regredir a auditoria do E9.

## 3. Cobertura dos critérios de aceite

Todos os critérios H4.x têm passo no plano. Detalhe:

- **H4.1** (escolher agenda; nasce `sem_aviso` sem convite/envio; telefone opcional; mesmos campos; dois fluxos; free cria agenda; linguagem) → A1, A3, B1, B2, B4, F1, F2, T-api-1/2/3. Coberto, com ressalvas G-C2/G-M1 (free) e G-M5 (telefone invertido).
- **H4.2** (marcado/separado no painel; filtrar; ações a partir da agenda; layout no E9) → F3, F4, `listarAvisosQuery` já aceita `status`. Coberto.
- **H4.3** (ativar gera convite; `sem_aviso→aguardando_aceite`; pede faltante; consome vaga / free não ativa; sem ciclo antes) → A1, B3, B4, F4, F5, T-api-4. Coberto, mas **enforcement de "free não ativa" frágil** (G-C2) e idempotência (G-M2).
- **H4.4** (edição livre sem reaprovação; descartar→`cancelado`; não-DELETE; evento) → A1, B5, B6, T-api-5/6. Coberto, mas evento `editado` não existe no enum (G-C1).
- **H4.5** (marcar pago manual `sem_aviso→pago`; pago terminal; confirmação "normal" fica no E8) → A1, B7, T-api-7. Coberto, mas evento/ator/autorização do invertido em aberto (G-M3) e enum (G-C1).

Nenhum critério ficou **sem** passo. Os furos são de **corretude** dos passos, não de ausência.

## 4. Testes (pontos críticos)

- **Corrida na ativação (limite):** previsto (T "Corrida (limite)" + S4). Bom — mas amarrar à mesma transação (G-M2) e cobrir duplo-tap do mesmo aviso, não só dois avisos distintos.
- **Idempotência:** T-api-7 (marcar pago) e T-api-4 (ativar) citam idempotência; ok, mas a de "ativar já ativado" depende do desfecho da D2.
- **Trigger (defesa em profundidade):** T-db cobre transições novas aceitas e inválidas a partir de `sem_aviso`. Bom.
- **zap não varre agenda:** T-zap cobre `expirar_avisos` ignorar `sem_aviso`. Bom.
- **Faltando:** teste de que criar agenda **não** conta para `contarAtivos` e que ativar move de balde (G-M4); teste de que ativar invertido sem `telefone_devedor` do criador se comporta como decidido (G-M5).
- **Horário reservado / coalescing / fila:** não se aplicam a este épico (sem envios em `sem_aviso`) — corretamente fora de escopo.

## 5. Coerência cross-épico

- **E1/E11 (free read-only / limites):** é o ponto frágil (G-C2/G-M1). O plano deferre os valores ao E11 (D3), mas a regra "free não ativa" depende de um valor concreto (limite ativo = 0 do free) que o catálogo atual contradiz (=10). Precisa de decisão coordenada **agora**, não só citação. O `max_agenda` provisório (A2) está ok como ponte.
- **Máquina de estados (espinha):** D1 acerta em só **adicionar** `sem_aviso` e não fazer a varredura `pendente→programado`. Coerente com `_CONTEXTO.md`. R1 mitiga o conflito de trigger.
- **E5 (convite/aceite):** correto que o que ocorre após ativar é do E5; o plano só gera convite e transita.
- **E6 (ciclo):** correto que o ciclo nasce no aceite, não na ativação. Mas ver G-M5 (telefone do devedor no invertido) como dependência implícita do E6.
- **E9 (painel/linha do tempo):** os eventos novos (`ativado`/`editado`/`pago_manual`) precisam ser conhecidos pela linha do tempo do E9 — sinalizar o acréscimo de enum lá (liga a G-C1/G-M3).

## 6. Aderência às invariantes do Épico 13

- **Sem travessão / palavras proibidas:** o plano usa "aviso/lembrete/combinado", rótulo "Sem aviso"; sem travessão no texto do plano. Copy nova (F1/F2) marcada para respeitar E13. Ok (atenção na implementação).
- **Gênero neutro:** sinalizado em F1 e na tabela. Ok.
- **Centavos / fuso:** mantidos (campos de negócio reusados; `data_combinada` em `America/Sao_Paulo`). Ok.
- **Token só como hash:** S1 mantém o padrão de `criarAviso` (gera, guarda sha256, devolve 1x). Ok; a D2 reforça não-reentrega.
- **Não logar sensível:** S3 cobre eventos `editado`/`ativado` sem telefone/Pix. Ok.
- **Sem DELETE de negócio:** descartar vai a `cancelado` (B6), append-only (`inserirEvento`). Ok.
- **Envelope de erro / JWKS:** erros via `regraNegocio`/`conflito` (envelope `{error:{code,message}}`), autenticação por `app.autenticar`/JWKS já existente. Ok.

## 7. Resumo das correções obrigatórias antes de aprovar sem ressalvas

1. Adicionar `tipo_evento` `ativado`/`editado`/`pago_manual` na migration + `enums.ts` + Zod front (G-C1).
2. Resolver o enforcement de "free não ativa": setar limite ativo do free = 0 (ou flag) em A2 e coordenar com E1/E11 (G-C2).
3. Fechar D4 em evento dedicado `pago_manual` + `ator=criador_papel`; tirar a opção de reusar `confirmado_cobrador` (G-M3).
4. Declarar em B3/S4 que a revalidação de `status='sem_aviso'` ocorre sob `for update` na mesma transação; testar duplo-tap concorrente (G-M2).
5. Tratar `telefone_devedor` ausente ao ativar no invertido (G-M5).
6. Corrigir o diagnóstico "free hoje nem cria" e os paths `apps/api/src/modules/...` (G-M1/G-B1).
