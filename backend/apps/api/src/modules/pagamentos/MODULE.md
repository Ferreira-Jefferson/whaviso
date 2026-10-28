# pagamentos

## Proposito
Pix na conversa: a loja cadastra a propria chave Pix (`loja_pix`), a api gera o BR Code "copia e
cola" (EMV-MPM + CRC16) com `txid` por pedido, registra a cobranca em `pagamentos` e acompanha o
status (`pendente`/`pago`/`expirado`/`cancelado`) ate a conciliacao manual. A chave Pix e segredo:
em repouso so `chave_hash` (sha256) e `chave_cifrada` (AES-256-GCM); o claro nunca sai nem e logado.
Sem PSP na v1 (copia e cola estatico; conciliacao manual pelo dono).

## Entry points
- `index.ts` -> `pagamentosRoutes` (plugin Fastify registrado em `src/routes.ts`, prefixo `pagamentos`)

## Especialistas consumidos
- `@whaviso/shared/db` (consultar/sql/comTransacao: unica via de dados; ErroBanco p/ colisao de txid)
- `@whaviso/shared/pix` (`gerarPayloadPixCopiaCola`: builder PURO do BR Code, promovido ao kernel p/ o
  atendente gerar o MESMO Pix na conversa sem importar este modulo; `validarBrCode` segue nos testes)
- `@whaviso/shared/contracts` (`tipoChavePix`; o builder foi movido para `@whaviso/shared/pix`)
- `@whaviso/shared/contracts/pagamentos` (DTOs do agregado)
- `@whaviso/shared/cifra` (via `cripto.ts`), `shared/http_errors`, `shared/tokens` (`sha256Hex`)
- `shared/auth` + `shared/tenant` (preHandlers `autenticar`/`escopoLoja`/`exigirPermissao('loja:gerir')`)

## Tabelas
- dono de: `loja_pix` (set/rotate; `chave_hash`/`chave_cifrada` nunca saem em SELECT de leitura),
  `pagamentos` (insert + conciliacao; sem DELETE, SEC-030)
- le de: `pedidos` (read-model: `total_centavos`/`status`/`codigo`), restrito a loja ativa

## Segredo (chave Pix)
- `chave_cifrada`/`chave_hash` WRITE-ONLY na pratica: o repo projeta so colunas publicas
  (`COLS_PIX_PUBLICAS`); o metadado exposto e `tipo`, `titular`, `cidade`, `ultimos4` (SEC-020).
- A api decifra a chave SO em memoria, dentro de `criarCobranca`, para montar o BR Code
  (`repo.lerChaveParaBrCode` e a unica query que seleciona `chave_cifrada`), e descarta o claro.
- O `br_code` volta em `PagamentoSaida` DE PROPOSITO (e o copia e cola que o pagador usa); nunca e
  logado (SEC-024). A chave embutida no BR Code e dado publico do Pix, nao o segredo em repouso.

## Contratos (`contracts/pagamentos`, espelhar no front)
- `LojaPixEntrada` (write-only; valida a chave por tipo), `LojaPixEstado`/`LojaPixEstadoResposta`,
  `CriarCobrancaEntrada`, `ConciliarEntrada`, `PagamentosFiltro`, `PagamentoSaida`, `ListaPagamentosSaida`.

## Rotas (`/v1/pagamentos`)
- `GET /pix` estado da chave · `PUT /pix` set/rotate (dono/gerente; rate limit, SEC-101)
- `POST /pedidos/:pedidoId` criar/reusar cobranca (idempotente; rate limit)
- `GET /` listar (filtro `pedido_id`/`status`) · `GET /:id` detalhe
- `POST /:id/conciliar` marcar pago (idempotente) · `POST /:id/cancelar` cancelar pendente

## Decisoes
- BR Code: REUSA `gerarPayloadPixCopiaCola` de `@whaviso/shared/contracts/pix` (pura, testada,
  espelhada no front). Adicionado `validarBrCode` (confere CRC16) e um parametro opcional `cidade`
  (campo 60) ao gerador, ambos aditivos e retrocompativeis.
- Expiracao: 30 min por padrao (configuravel por requisicao, 1..1440), aplicada de forma
  PREGUICOSA (na leitura e na tentativa de conciliar), sem job.
- txid: deterministico a partir do codigo do pedido (alfanumerico, <=25), com sufixo so em colisao
  do unique `(loja_id, txid)`.

## Config de producao
- `MASTER_KEY` (envApiSchema) deriva a chave AES no kernel `@whaviso/shared/cifra`. `config.ts`
  resolve a cifra de forma preguicosa.
