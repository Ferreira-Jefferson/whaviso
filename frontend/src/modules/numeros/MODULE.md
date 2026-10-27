# numeros (frontend)

## Propósito
Números de WhatsApp (Meta Cloud API) conectados à loja ativa. Lista com status, ações de
pausar/reativar/reconectar/remover e o fluxo de conectar um número novo. Rota `/numeros` (grupo config).

## Entry points
- `index.ts`: export default da página (para `lazy(() => import('@/modules/numeros'))` no registry de rotas).

## Dados
- `GET /v1/numeros` (lista), `POST /v1/numeros` (conectar / Embedded Signup),
  `POST /v1/numeros/:id/reconectar` (rotaciona o token) e `PATCH /v1/numeros/:id/status`
  (pausar | reativar | remover).
- Contratos: `@/shared/contracts/_generated/numeros_whatsapp` e enum `statusNumero` de
  `.../enums` (não redefinir).
- Cache: raiz `['numeros']`; cada mutação invalida essa raiz.

## Conexão (sem QR)
- A conexão é pela Meta (WhatsApp Cloud API), por **credenciais**: o dialog coleta o `codigo`
  do Embedded Signup + `phone_number_id` + `waba_id`. Não há QR nem pareamento.
- Reconectar envia só um novo `codigo` para renovar o token do número existente.

## Segredo / PII
- O contrato de saída (`numeroSaida`) **nunca** traz o número em claro nem o token: a tela
  exibe apenas metadados não sensíveis (IDs da Meta, status, verificação, data). Não há número
  a mascarar porque o backend não o entrega.
- O `codigo` é sensível: `autoComplete="off"`, limpo ao fechar o dialog, nunca persistido nem
  exibido de volta.

## Notas
- `components/StatusNumeroBadge.tsx` é um primitivo **local**: o `StatusBadge` de `@/shared/ui`
  ainda é tipado para `StatusAviso` (legado de cobrança) e não cobre `StatusNumero`. Promover
  para `@/shared/ui` quando o `StatusBadge` for migrado para o domínio novo.
