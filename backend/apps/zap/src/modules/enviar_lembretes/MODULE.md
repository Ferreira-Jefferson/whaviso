# enviar_lembretes

## Propósito
Lado de saída do outbox: a cada tick, faz claim (`FOR UPDATE SKIP LOCKED`) dos envios devidos,
lê o template ativo da etapa (chave `ciclo.<etapa>`, contexto revisao então padrao) na tabela
unificada `templates` e o renderiza via `shared/templates` (texto {{n}} + botões do
template), disparando via WhatsApp (Baileys), com retry e cancelamento por janela perdida.
Os TRÊS botões (Já paguei / Chave de Pag. / Desativar lembretes) aparecem em TODAS as etapas
(H6.2, sem supressão condicional). Os envios saem no horário reservado do combinado (H6.9).

## Entry points
- `index.ts` → `processarEnviosDevidos(deps)`: chamado pelo loop em `src/scheduler.ts`

## Especialistas consumidos
- `@whaviso/shared/db`, `@whaviso/shared/datas`, `@whaviso/shared/logger`
- `shared/baileys_client` (ClienteWhats.enviarMensagem; ErroEnvio)
- `shared/templates` (carregarTemplateAtivo via repo + renderMensagem)

## Tabelas
- escreve em: envios (claim/status/wamid), eventos_aviso
- lê de: avisos, profiles, templates (chave `ciclo.*`)

## Regras-chave
- aviso fora de `programado`/`informado_pago` resulta em envio `cancelado`
- em `informado_pago` (H6.5): só a etapa `d_mais_1` (empurrãozinho) sai; demais etapas são canceladas (erro `informado_pago`)
- janela da etapa passou (23:59 SP) resulta em `cancelado` com erro `janela_perdida`
- `ErroEnvio` permanente vira `falhou` direto; transitório (inclui WhatsApp desconectado) reagenda com intervalo aleatório 20-60s (shared/retry), EXATAMENTE 3 tentativas (H6.8)
- `processando` > 10 min volta para `agendado` (crash-safety)
- claim menor (5) porque o envio é serializado/espaçado pelo ritmo anti-bloqueio do `baileys_client`
