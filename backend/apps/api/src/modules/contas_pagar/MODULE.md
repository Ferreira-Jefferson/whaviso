# contas_pagar

## Proposito
Contas a pagar da loja: o que a loja paga **para fora**, digitado na mao, em dois tipos concretos de
credor: **fornecedores** (entidade propria deste modulo) e **pessoas** (quem presta servico, exceto o
acerto do motoboy). Dinheiro SAINDO, distinto de `pagamentos` (Pix que o cliente paga a loja, dinheiro
entrando) e de `custos` (consumo medido de servicos externos: LLM, WhatsApp, mapas, fiscal). Fonte:
`docs/refactors/contas-a-pagar-e-fim-do-motoboy.md`.

O acerto do motoboy NAO passa por aqui: ele e derivado das entregas/regime (modulo proprio). Aqui so
entra o pagavel DIGITADO na mao.

## Entry points
- `index.ts`: `contasPagarRoutes` (registry, prefixo `contas-pagar`) e `criarContasPagarRoutes(cifra)`
  (injetavel em teste).
- Rotas finais (`/v1/contas-pagar`, loja = `x-loja-id`, permissao `loja:gerir`):
  - Fornecedores: `GET /` (`?incluir_inativos`), `POST /`, `GET|PATCH /:id`,
    `POST /:id/ativar|desativar`, `POST /:id/telefone/revelar` (papel dono/gerente, rate limit 10/min,
    `no-store`, auditado sem o valor).
  - Contas a pagar: `GET /contas` (filtros `credor_tipo`/`status`/`de`/`ate` por vencimento),
    `POST /contas` (lancamento; idempotencia por `chave_idempotencia`), `PATCH /contas/:id` (so
    enquanto `a_pagar`; paga = 409), `POST /contas/:id/pagar` (`valor_centavos` visto; 409
    `total_divergente` se mudou; idempotente se ja paga).

## Tabelas (migration 0067)
- dono de escrita: `fornecedores` (insert/update; arquivar = `ativo=false`, sem DELETE),
  `contas_pagar` (insert/update; nunca some, muda de `status`; sem DELETE).
- le de (read-model, sem importar codigo de outro modulo): `fornecedores`/`pessoas` para o
  `credor_nome` (LEFT JOIN pela FK coerente ao `credor_tipo`).
- escreve auditoria em `eventos` (`fornecedor.*`, `conta_pagar.*`), sem PII (nunca o telefone).

## Decisoes
- **Loja so do escopo** (`x-loja-id`), nunca do corpo/query (SEC-001/002): o repo carimba `loja_id`.
- **Telefone do fornecedor e PII**: cifra AES-256-GCM (kernel `@whaviso/shared/cifra`, MASTER_KEY);
  saida so com `telefone_ultimos4`; o claro so em `telefone/revelar` (dono/gerente), auditado sem o
  valor. Fornecedor nao tem Pix neste escopo (so telefone).
- **Credor coerente**: o lancamento valida que o credor existe e e da loja, e grava a FK que casa com
  `credor_tipo` (a constraint `contas_pagar_credor_coerente` garante exatamente uma FK). Fornecedor
  arquivado nao aceita lancamento (`fornecedor_inativo`).
- **Idempotencia do lancamento**: reenvio do mesmo `(loja, chave_idempotencia)` e no-op (devolve a
  conta original, sem 2o evento), pela unique parcial `contas_pagar_idem`.
- **Pagar e definitivo e idempotente**: trava a linha (`FOR UPDATE`), recusa (409 `total_divergente`)
  se `valor_centavos` divergiu do visto, marca `pago`/`pago_em`/`pago_por_user_id`. Repagar e no-op.
- **Editar so enquanto `a_pagar`**: conta paga = 409 `conta_ja_paga`. Editar serializa com o pagar
  pelo mesmo `FOR UPDATE`.
- Fora do escopo = 404 (nao confirma existencia); loja alheia no header = 404 pelo kernel.
