# billing

## Propósito
Carteira de créditos de envio (Épico 11, modelo pré-pago). 1 envio = 1 ocorrência de
aviso; tudo é liberado para todos, o que limita é o SALDO. Não há mais planos,
assinatura, checkout nem webhook de pagamento: a compra é MANUAL no MVP (o usuário
escolhe a quantidade num slider, confirma, e o servidor EMPURRA as instruções de
pagamento ao WhatsApp dele; o usuário paga via Pix e manda o comprovante na conversa; o
OWNER credita depois, no módulo admin). Este módulo LÊ (saldo + curva + extrato) e
ENFILEIRA a recarga (não credita: o usuário nunca se credita, H11.11).

## Entry points
- `index.ts`: plugin Fastify registrado em `src/routes.ts` sob `/v1`

## Rotas
- `GET  /billing/carteira` (JWT) saldo (livre/reservado/em hold/consumido) + curva do catálogo
- `GET  /billing/extrato`  (JWT) lançamentos da conta, paginado (compra/crédito/reserva/consumo/devolução/hold)
- `POST /billing/recarga`  (JWT) valida a quantidade, calcula o valor e ENFILEIRA a mensagem de
  compra (template `billing.recarga` + chave Pix da plataforma) na outbox de billing; o `zap`
  envia ao WhatsApp do próprio usuário (H11.10). Recusa: `telefone_ausente`, `pix_nao_configurado`,
  `quantidade_invalida`. NÃO retorna a chave Pix (H13.8). NÃO credita saldo. Retorna `id` (id da
  linha em `notificacoes_billing`, usado no endpoint de comprovante abaixo) e `telefone_vendas`
  (número pareado pelo zap, lido de `whats_sessao`) para o front montar o link "abrir conversa" sem env.
- `POST /billing/recarga/:id/comprovante` (JWT, item 19/H11.14) anexa o comprovante (foto/PDF,
  JSON base64) de uma recarga própria. Guarda no Storage (bucket privado `comprovantes`) e chama
  a validação por IA (`shared/validacao_comprovante`, OpenRouter): confiança alta + valor batendo
  credita na hora (`creditarEnvios`, tipo `compra`); qualquer outro caso (baixa confiança, valor
  não confirmado, IA indisponível) fica `aguardando_revisao_manual` (nunca credita nem rejeita
  sozinho). Recusa: `armazenamento_indisponivel`, `arquivo_invalido`, `comprovante_ja_processado`.
- `GET  /billing/comprovantes/revisao` (JWT, owner) lista comprovantes `aguardando_revisao_manual`
  (fila simples, sem UI sofisticada) com `url_comprovante` assinada (10min) quando o Storage
  responde.
- `POST /billing/comprovantes/:id/resolver` (JWT, owner) aprova (credita) ou rejeita um
  comprovante pendente; espelha H11.11 (owner credita com confirmação).

## Tabelas
- lê de: creditos_carteira, creditos_catalogo, creditos_lancamentos, config_plataforma, whats_sessao
- escreve em: notificacoes_billing (enfileira a recarga; o zap drena/envia), billing_comprovantes
  (0095: comprovante + decisão da IA/owner)

## Especialistas consumidos (shared/, módulo nunca importa módulo)
- `shared/planos` (lerCarteira/lerCatalogo/precoPorEnvioCentavos/creditarEnvios)
- `shared/config_plataforma` (lerConfigPlataforma/temChavePix: a chave Pix da plataforma)
- `shared/notificacoes_billing` (enfileirarRecarga: insere na outbox de billing)
- `shared/whats_sessao` (lerNumeroVendas: número pareado pelo zap, para o link "abrir conversa")
- `shared/storage_comprovantes` (NOVO, item 19): upload/leitura do comprovante no Supabase
  Storage via REST + service role key (sem SDK, mesmo estilo de `shared/supabase_admin`).
- `shared/validacao_comprovante` (NOVO, item 19): chama o OpenRouter (modelo com visão, não
  Gemini) para classificar o comprovante; nunca lança, degrada para baixa confiança.

## Pendências de infra (item 19, fora do escopo de arquivos desta leva)
- **Bucket do Storage:** o bucket privado `comprovantes` não é criado por migration (o schema
  `storage` do Supabase não existe no Postgres local de validação); precisa ser criado no
  painel/cloud antes deste recurso rodar em produção.
- **`OPENROUTER_API_KEY`/`OPENROUTER_MODEL`:** lidos direto de `process.env` em
  `shared/validacao_comprovante` (ainda não estão no schema tipado `apps/api/src/env.ts`, fora
  do escopo de arquivos desta leva). Sem a chave, o endpoint funciona (comprovante entra direto
  em `aguardando_revisao_manual`, nunca quebra), só não credita sozinho.
- **Job de retenção de 30 dias:** `billing_comprovantes.expira_em` marca quando o ARQUIVO deve
  ser apagado do Storage (o registro/decisão nunca é apagado). Não há infra de cron na `api`
  hoje; o job periódico (varrer `idx_billing_comprovantes_retencao`, chamar
  `apagarComprovante` e marcar `arquivo_apagado_em`) deve entrar no scheduler do `zap`
  (`apps/zap/src/scheduler.ts`, mesmo padrão do job de `creditos_hold` de 24h) numa leva futura;
  `zap` não está no escopo de arquivos desta leva.

## Carteira (shared/planos, lido em runtime)
A leitura do saldo, a curva de preço (`precoPorEnvioCentavos`) e a movimentação da
carteira (reserva/consumo/devolução/crédito/hold, sempre com livro-razão) vivem em
`shared/planos`, não neste módulo (módulo nunca importa módulo). A reserva acontece na
ATIVAÇÃO (módulo avisos); o consumo no DISPARO (zap); o crédito do owner no módulo admin.
