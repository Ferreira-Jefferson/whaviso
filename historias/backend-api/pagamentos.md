# API-pagamentos pagamentos

- **ID:** API-pagamentos  ·  **Área:** API  ·  **Onda:** 3
- **Modelo sugerido:** Opus  ·  **Status:** `A FAZER`
- **Reivindicado por:** (livre)

## Objetivo

Pix na conversa: a loja cadastra a própria chave Pix (`loja_pix`), o sistema gera o **BR Code "copia e
cola"** com `txid` por pedido, registra a cobrança em `pagamentos` e acompanha o status até a
conciliação. A chave Pix é segredo (hash + cifra, nunca em claro).

"Pronto" observável: `PUT /lojas/:lojaId/pix` grava a chave protegida e devolve só máscara; dado um
pedido, `POST /pedidos/:id/pagamentos` gera BR Code válido (CRC16 correto, valor em centavos), cria a
cobrança `pendente` e devolve o texto para o envio; o dono concilia (marca `pago`) ou a cobrança
expira; tudo isolado por loja.

## Dependências

- `F4` api-core.
- `API-conversas`: a cobrança é enviada e acompanhada na conversa; o contrato de mensagem de saída
  (enfileirar em `envios`) vem de lá.
- `API-pedidos`: a cobrança nasce de um pedido (valor = `total_centavos`), e o pedido é lido por
  read-model.

## Contratos e tabelas que toca

- **`loja_pix`**: dono de escrita (grants 0008: `whaviso_api` select/insert/update). Campos protegidos:
  `chave_hash` (sha256) e `chave_cifrada`; `titular` e `cidade` são exigidos pelo BR Code.
- **`pagamentos`**: dono de escrita da conciliação (select/insert/update). O `whaviso_atendente` também
  tem select/insert: ele pode abrir a cobrança durante a conversa. Índice unique `(loja_id, txid)`.
- **Lê (read-model):** `pedidos` (total, status, código), `conversas` (para o envio).
- **Escreve fora de si:** apenas enfileira em `envios` pela porta/contrato de `API-conversas` (módulo não
  importa módulo); não toca `pedidos`.
- Contratos Zod: `LojaPixEntrada` (write-only), `LojaPixEstado` (tipo, `ultimos4`, titular, cidade),
  `CriarCobrancaEntrada`, `PagamentoSaida`, `ConciliarEntrada`.
- Kernel de BR Code: função pura `gerarBrCode({chave, titular, cidade, valorCentavos, txid})` (EMV-MPM,
  campos 00/26/52/53/54/58/59/60/62, CRC16-CCITT) e `validarBrCode`, em `packages/shared`, reutilizável
  pelo atendente (nó `pix`).

## Arquivos (escopo de edição)

- `backend/apps/api/src/modules/pagamentos/**`
- `backend/apps/api/src/routes.ts` (1 linha)
- `backend/packages/shared/src/contracts/pagamentos/**`
- `backend/packages/shared/src/pix/**` (BR Code puro, sem I/O)
- `backend/supabase/migrations/0014_pix_atendente.sql` (somente se a decisão de leitura pelo atendente
  for aprovada; ver Notas)
- `backend/apps/api/test/security/pagamentos.*.test.ts`

## Etapas

- [ ] 1. Scaffold do módulo e registro em `routes.ts`  (commit: `feat(pagamentos): scaffold do módulo`)
- [ ] 2. Kernel BR Code: gerador e validador puros (EMV-MPM + CRC16), com vetores de teste conhecidos
  (chave aleatória, e-mail, telefone, CPF/CNPJ), valor opcional/obrigatório, `txid` alfanumérico até 25
  caracteres  (commit: `feat(shared): gerador e validador de BR Code Pix`)
- [ ] 3. Contratos Zod; validação da chave por `tipo` (CPF/CNPJ com dígito verificador, e-mail,
  telefone E.164, aleatória UUID); `.strict()` nas saídas; `gen_contracts`  (commit: `feat(contratos): pix e pagamentos`)
- [ ] 4. Proteção da chave: sha256 normalizado + cifra com o utilitário de segredo do kernel + `ultimos4`;
  claro nunca devolvido nem logado  (commit: `feat(pagamentos): hash e cifra da chave pix`)
- [ ] 5. Repo e rotas de `loja_pix`: `GET /lojas/:lojaId/pix` (estado), `PUT` (set/rotate), sem endpoint de
  leitura da chave; só `dono`/`gerente`. Trocar a chave não altera cobranças já geradas  (commit: `feat(pagamentos): cadastro da chave pix da loja`)
- [ ] 6. `txid` determinístico e único por loja (ex.: derivado do código do pedido + sequência, limitado
  ao formato Pix), respeitando o unique `(loja_id, txid)`; colisão gera novo sufixo  (commit: `feat(pagamentos): geração de txid`)
- [ ] 7. Criar cobrança: `POST /pedidos/:id/pagamentos` valida que o pedido é da loja, `total_centavos >
  0`, que não há cobrança `pendente` ativa (reuso/idempotência), decifra a chave só em memória, gera o BR
  Code, grava `pagamentos` (`pendente`, `valor`, `txid`, `br_code`, `expira_em`)  (commit: `feat(pagamentos): criar cobrança pix`)
- [ ] 8. Envio na conversa: enfileira a mensagem com o BR Code pela porta de `API-conversas` (botão
  copiar quando o template permitir), sem logar o código  (commit: `feat(pagamentos): enviar pix na conversa`)
- [ ] 9. Conciliação manual: `POST /pagamentos/:id/conciliar` (marca `pago` com `pago_em`), `cancelar`;
  transições válidas (`pendente -> pago|expirado|cancelado`, nada sai de `pago`), idempotente  (commit: `feat(pagamentos): conciliar e cancelar`)
- [ ] 10. Expiração: status `expirado` aplicado de forma preguiçosa quando `expira_em` passou (na
  leitura e na tentativa de conciliar), sem job; listagem filtra por status  (commit: `feat(pagamentos): expiração de cobrança`)
- [ ] 11. Listagem por loja/pedido para o painel e evento de realtime quando o status muda  (commit: `feat(pagamentos): listagem e realtime`)
- [ ] 12. Redaction: `chave`, `br_code`, `pix` mascarados em log e erro  (commit: `feat(pagamentos): redaction de pix e br code`)
- [ ] 13. Testes de unidade e integração (ver abaixo)  (commit: `test(pagamentos): unidade e integração`)
- [ ] 14. Testes `security/` (SEC-023 e correlatos)  (commit: `test(seguranca): chave pix protegida`)
- [ ] 15. Revisão (Opus) contra o SEGURANCA.md antes de `CONCLUIDO`

## Testes e segurança exigidos

- BR Code: CRC16 confere em vetores conhecidos; valor com 2 casas a partir de centavos; truncamento de
  `titular` (25) e `cidade` (15) conforme a norma; txid inválido rejeitado.
- Pedido de outra loja ou inexistente: 403/404 (SEC-001/002); pedido sem total: 422.
- Cobrança duplicada para o mesmo pedido reaproveita a `pendente` (idempotência).
- Transições inválidas (`pago -> pendente`) rejeitadas; conciliar duas vezes é no-op.
- Troca de chave não muda cobranças existentes.
- **SEC-023:** `pg_dump` de banco semeado com chave Pix sentinela não contém o claro (hash e cifra).
- **SEC-020 (por analogia):** nenhuma resposta traz `chave_cifrada`; só `ultimos4`, tipo, titular, cidade.
- **SEC-024:** log durante set/gerar/erro não contém a chave nem o BR Code completo.
- **SEC-030:** sem DELETE em `loja_pix`/`pagamentos` para a api.
- **SEC-032:** o atendente só toca `pagamentos` (e, se aprovado, as colunas mínimas de `loja_pix`); nada
  de billing/plataforma/Meta.
- **SEC-061:** a cobrança só é criada por regra determinística do fluxo (o texto do modelo nunca define
  valor ou chave).
- SEC-081, SEC-101 (rate limit em set/rotate da chave).

## Notas e decisões

- **Sem PSP na v1:** o Pix é "copia e cola" estático da chave da própria loja; não há webhook do banco,
  então a conciliação é **manual** (o dono vê o comprovante no extrato e marca pago; opcionalmente o
  cliente envia comprovante na conversa). Integração com PSP (cobrança dinâmica com webhook) é evolução
  futura isolada atrás de interface, como `ClienteWhats`.
- **Conflito de grants a resolver:** a 0008 dá ao atendente select/insert só em `pagamentos`; para gerar o
  BR Code na conversa ele precisaria da chave decifrada, que fica em `loja_pix` (sem grant ao atendente).
  Decisão proposta: migration `0014_pix_atendente` concedendo ao `whaviso_atendente` `SELECT` **por
  coluna** (`loja_id, tipo, chave_cifrada, titular, cidade`) e policy de SELECT, espelhando o molde de
  `credenciais_llm`. Isso **ajusta a matriz SEC-032** (atendente continua sem billing, plataforma e Meta)
  e exige revisão Opus e atualização do SEGURANCA.md antes do merge. Alternativa descartada: a api expor
  o BR Code ao atendente por HTTP (acopla runtimes e fura "integração só por banco").
- O módulo entrega a **mesma função pura de BR Code** ao atendente via kernel; a api e o atendente nunca
  divergem na geração.
- Expiração padrão da cobrança: 30 minutos (configurável por loja numa evolução); `expira_em` preenchido
  na criação.
- Valor da cobrança sempre `pedidos.total_centavos` lido no instante da criação; alteração posterior do
  pedido exige cancelar e gerar nova cobrança.
- **Permissão de rotacionar a chave Pix:** cadastrar e trocar a chave Pix é gerir pagamentos
  (`pagamentos:gerir`, por padrão gerente), e não uma permissão de dono exclusiva. Isso difere das
  credenciais de provedor externo (emissor fiscal, provedor de IA, canal de venda), que são por padrão só
  do dono (chave `:configurar`): a chave Pix é um dado da própria loja, não um segredo de terceiro, então
  cabe na gestão de pagamentos da loja. A grade de acessos pode ajustar esse padrão
  (ver `../regras-negocio/10-acessos-permissoes.md`).
