# enviar

## Proposito
Drena a outbox `envios` e entrega cada item a Meta pelo `ClienteWhats` (transporte
endurecido em `shared/meta_client`). Claim com `FOR UPDATE SKIP LOCKED`, janela de 24h como
guarda, retentativa com backoff e falha definitiva sem PII. Quem produz (api, atendente) so
enfileira; este modulo nunca cria linha em `envios`.

## Entry points
- `index.ts`: `drenarEnvios(deps)` (um tick) e `CONFIG_PADRAO`. Chamado pelo `scheduler.ts`
  (app-root), nao por rota HTTP. Modulo nao importa modulo.

## Especialistas consumidos
- `@whaviso/shared/db` (consultar/sql: unica via de dados, parametrizada)
- `@whaviso/shared/clientes` (`ClienteWhats`, erro tipado, `proximoRetry`, `CredencialResolvida`)
- `@whaviso/shared/cifra` (`Cifra.decifrar`: token do numero e telefone do cliente, so no uso)
- `@whaviso/shared/contracts` (`MensagemProposta`: contrato do payload de `envios`)

## Tabelas
- escreve de: `envios` (so `status`, `enviado_em`, `wamid`, `erro`, `proxima_tentativa_em`,
  `tentativas` -- grant por coluna, SEC-031) e `numeros_whatsapp` (so `status`, saude do numero).
- le de: `envios`, `numeros_whatsapp` (`token_cifrado`), `clientes` (`telefone_cifrado`, para
  resolver o destino), `conversas` (`ultima_entrada_em`, base da janela de 24h), `templates`
  (nome aprovado + idioma + ordem das variaveis).
  Nota: `clientes` nao consta na lista de tabelas de `historias/backend-zap/enviar.md`, mas o
  destino (E.164) so existe cifrado ali (`destinatario_hash` e so sha256); leitura permitida ao
  `whaviso_zap` por grant. Registrado aqui como leitura cruzada documentada.

## Contratos
- consome: `MensagemProposta` (F1) como forma do `payload` de `envios`; `ClienteWhats` (F2).
- nao publica contrato.
