# notificar_billing

## Propósito
Lado de saída do outbox de BILLING (H11.10): a cada tick faz claim (`FOR UPDATE SKIP LOCKED`)
das recargas devidas em `notificacoes_billing`, lê a chave Pix DA PLATAFORMA em
`config_plataforma` (singleton) e o template ativo `billing.recarga` na tabela unificada
`templates`, renderiza via `shared/templates` (texto {{n}}) e empurra a mensagem de compra de
crédito ao WhatsApp do PRÓPRIO usuário (quantidade, valor e a chave Pix). O usuário paga e
manda o comprovante na conversa; o owner credita depois (módulo admin, H11.11). Sem botões
(o comprovante volta como texto livre/imagem, ignorado com segurança pelo webhook).

## Entry points
- `index.ts` → `processarNotificacoesBilling(deps)`: chamado pelo loop em `src/scheduler.ts`

## Especialistas consumidos
- `@whaviso/shared/db`, `@whaviso/shared/datas` (formatarValorBr), `@whaviso/shared/logger`
- `shared/whats` (ClienteWhats.enviarMensagem; ErroEnvio)
- `shared/templates` (carregarTemplateAtivo + renderMensagem)
- `shared/config_plataforma` (lerConfigPlataforma + temChavePix)

## Tabelas
- escreve em: notificacoes_billing (claim/status/wamid)
- lê de: config_plataforma, templates (chave `billing.recarga`)

## Regras-chave
- Sem chave Pix configurada OU sem template ativo: NÃO envia; devolve a linha a `agendado` com
  erro recuperável e VISÍVEL (`pix_nao_configurado` / `sem_template_ativo`), sem tocar
  tentativas. Volta a drenar assim que o owner configurar.
- A chave Pix é lida NO ENVIO (recibo sai com a chave vigente) e NUNCA é logada nem gravada na
  outbox (menos superfície de PII).
- Sem espaçamento de 10min nem coalescing (diferente do `notificar_cobrador`): o recibo de
  pagamento deve sair na hora.
- `ErroEnvio` permanente vira `falhou`; transitório reagenda 20-60s (shared/retry), 3 tentativas.
- `processando` > 10 min volta para `agendado` (crash-safety).
