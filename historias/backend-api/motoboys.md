# API-motoboys motoboys + fechamento

- **ID:** API-motoboys  ·  **Área:** API  ·  **Onda:** 3
- **Modelo sugerido:** Sonnet  ·  **Status:** `A FAZER`
- **Reivindicado por:** (livre)

## Objetivo

Cadastro completo do entregador (nome, telefone, veículo, placa, Pix) e o **fechamento do dia**: quanto
cada motoboy tem a receber, somando automaticamente as entregas feitas e permitindo **lançamento manual**
por cima (ajuste, bônus, desconto, entrega sem motoboy fixo). O dia fecha e é marcado como pago.

"Pronto" observável: CRUD de motoboys com Pix e telefone protegidos (hash + cifra, nunca em claro);
`GET .../fechamentos?data=` mostra por motoboy o total derivado (entregas + ajustes); lançamento manual é
inserido sem nunca editar nem apagar linha anterior; marcar o dia como pago é idempotente e trava novos
lançamentos naquele dia.

## Dependências

- `F4` api-core: server, registry, tenant, `shared/db`.
- `F6` front-shell: contrato gerado consumido pela tela de motoboys/fechamento (`FR-entrega`).

Leitura cruzada (sem dependência de módulo): `pedidos` (`motoboy_id`, `zona_id`, `status`,
`entregue_em`) e `zonas_entrega.valor_motoboy_centavos`, já existentes desde a 0005/0007.

## Contratos e tabelas que toca

- **Dono de escrita:** `motoboys`, `fechamentos`, `motoboy_lancamentos`.
  Grants (0007): `whaviso_api` select/insert/update em `motoboys` e `fechamentos`; em
  `motoboy_lancamentos` só **select, insert** + trigger que rejeita UPDATE (append-only, SEC-033). Sem
  DELETE em nenhuma ("remover" motoboy = `ativo = false`).
- **Lê por read-model:** `pedidos` (entregues com `motoboy_id` no dia) e `zonas_entrega` (valor do
  motoboy). **Não escreve** em `pedidos`: o vínculo motoboy-pedido é do `API-despacho`.
- Campos sensíveis: `telefone_hash`/`telefone_cifrado` e `pix_hash`/`pix_cifrado` (sha256 + cifra da
  aplicação). A resposta devolve só máscara (`pix_ultimos4`, `telefone_ultimos4`), nunca o valor.
  Constraints de formato do hash já existem no banco.
- Invariantes no banco: `lancamentos_entrega_unica` (1 lançamento `entrega` por pedido, torna o cálculo
  automático idempotente), `fechamentos_motoboy_dia` unique, `fechamentos_pago_tem_data`.
- Contratos Zod: `MotoboyEntrada`, `MotoboySaida`, `LancamentoManualEntrada`, `FechamentoDia`,
  `FechamentoLinha`, `PagarFechamentoEntrada`.
- Data de negócio sempre em America/Sao_Paulo, calculada na api (helper `datas` do kernel); banco em UTC.

## Arquivos (escopo de edição)

- `backend/apps/api/src/modules/motoboys/**`
- `backend/apps/api/src/routes.ts` (1 linha)
- `backend/packages/shared/src/contracts/motoboys/**`
- `backend/packages/shared/src/crypto/**` (só reuso do encrypt de segredo; não duplicar)
- `backend/apps/api/test/**/motoboys*`

## Etapas

- [ ] 1. Scaffold do módulo e registro em `routes.ts`  (commit: `feat(motoboys): scaffold do módulo`)
- [ ] 2. Contratos Zod (entradas com Pix/telefone em claro **só na entrada**, saídas mascaradas e
  `.strict()`); `gen_contracts`  (commit: `feat(contratos): motoboys e fechamento`)
- [ ] 3. Proteção de campos: helper do módulo que, ao gravar, calcula `sha256` normalizado (telefone em
  E.164, chave Pix conforme tipo) + cifra com o utilitário do kernel e extrai os últimos 4 para exibição;
  teste de que o claro nunca é devolvido nem logado  (commit: `feat(motoboys): hash e cifra de telefone e pix`)
- [ ] 4. Repo e CRUD: `GET/POST /lojas/:lojaId/motoboys`, `GET/PATCH /motoboys/:id`,
  `POST /motoboys/:id/ativar|desativar`; veículo enum, placa normalizada (maiúscula, formato antigo e
  Mercosul), telefone único por loja entre ativos  (commit: `feat(motoboys): cadastro completo`)
- [ ] 5. Rotas de leitura sem dado sensível (listagem leve para o seletor de despacho: id, nome,
  veículo, ativo)  (commit: `feat(motoboys): listagem leve para seleção`)
- [ ] 6. Cálculo automático do dia: serviço `materializarEntregas(loja, data)` que, para pedidos
  `entregue` com `motoboy_id` e `entregue_em` caindo na data de negócio, insere `motoboy_lancamentos`
  tipo `entrega` com `valor = zonas_entrega.valor_motoboy_centavos` da zona do pedido (0 se sem zona),
  usando `INSERT ... ON CONFLICT DO NOTHING` sobre `lancamentos_entrega_unica`  (commit: `feat(motoboys): lançamento automático por entrega`)
- [ ] 7. Lançamento manual: `POST /motoboys/:id/lancamentos` (tipo `ajuste`, valor pode ser negativo,
  `descricao` obrigatória, `criado_por_user_id` do token); correção = novo lançamento com sinal oposto,
  **nunca** edição  (commit: `feat(motoboys): lançamento manual de ajuste`)
- [ ] 8. Fechamento do dia: `GET /lojas/:lojaId/fechamentos?data=` roda a materialização, cria (se
  faltar) a linha `fechamentos` em `aberto` por motoboy com movimento e devolve o total **derivado**
  (soma de lançamentos), detalhado por linha  (commit: `feat(motoboys): fechamento do dia derivado`)
- [ ] 9. Marcar como pago: `POST /fechamentos/:id/pagar` define `status = pago`, `pago_em`,
  `pago_por_user_id`; idempotente; após pago, lançamento manual naquela data é rejeitado (409) e deve ir
  para o dia corrente  (commit: `feat(motoboys): marcar fechamento como pago`)
- [ ] 10. Pagar via exibição segura do Pix: endpoint que devolve a chave Pix **decifrada** apenas para
  `dono`/`gerente` no momento de pagar (a api precisa decifrar o Pix do motoboy para o dono pagar), com
  auditoria em `eventos` (sem o valor) e rate limit. Registrar a decisão nas Notas  (commit: `feat(motoboys): revelar pix para pagamento`)
- [ ] 11. Relatório por período: total por motoboy entre datas (read-only), sem materializar  (commit: `feat(motoboys): resumo por período`)
- [ ] 12. Testes de unidade e integração (ver abaixo)  (commit: `test(motoboys): unidade e integração`)
- [ ] 13. Testes `security/` do módulo  (commit: `test(seguranca): motoboys e lançamentos`)
- [ ] 14. Revisão (Opus) por tocar Pix/PII de terceiros

## Testes e segurança exigidos

- Materialização idempotente: rodar duas vezes não duplica; entrega sem zona vale 0; pedido não
  `entregue` ou sem motoboy não gera lançamento.
- Borda de data: entrega às 23:30 e 00:10 de Brasília caem no dia certo (UTC vs America/Sao_Paulo).
- Total derivado = soma das linhas (positivas e negativas); fechamento `pago` rejeita lançamento novo.
- Motoboy de outra loja ou fechamento de outra loja: 403/404 (SEC-001/002).
- Nenhuma resposta traz `pix_hash`, `pix_cifrado`, `telefone_*` em claro; só máscaras.
- **SEC-033:** UPDATE em `motoboy_lancamentos` dispara exceção; sem grant de DELETE.
- **SEC-030:** `whaviso_api` sem DELETE em `motoboys`, `fechamentos`, `motoboy_lancamentos`.
- **SEC-023:** dump com Pix sentinela não contém o claro.
- **SEC-024:** redaction de `pix`, `chave`, `telefone` em log e erros.
- **SEC-081/101:** validação Zod; rate limit no endpoint que revela Pix.

## Notas e decisões

- **Totais nunca armazenados:** a soma do dia é derivada de `motoboy_lancamentos`, para não divergir.
- **Materialização preguiçosa** (ao abrir o fechamento) em vez de trigger ou job: o módulo `pedidos` é
  dono da transição de status e este módulo não pode ser chamado por ele; a leitura do read-model resolve
  sem acoplar, e a unique `lancamentos_entrega_unica` garante idempotência. Entrega que muda de
  `entregue` para `problema` depois de materializada: o dono corrige com ajuste negativo (log claro).
- **Dia pago é definitivo** (sem reabrir) na v1; ajustes posteriores entram no dia corrente com
  descrição. Reabrir fica como melhoria futura, decisão do dono.
- **Pix decifrado só para pagar:** o dono precisa da chave para transferir. Isso exige a api
  decifrar `pix_cifrado`, o que é diferente da credencial de LLM (que a api nunca decifra). Para isso a
  api importa `decrypt` do kernel só neste módulo e em `pagamentos`; o lint de fronteira e o teste de
  import de `API-config-llm` impedem o uso na área de LLM. Alternativa aceita: exibir só máscara e o dono
  consultar o cadastro externo; decisão padrão: revelar sob papel `dono`/`gerente` com auditoria.
- Entrega manual sem motoboy fixo: o dono usa lançamento manual com o nome na descrição, ou atribui o
  motoboy retroativamente via `API-despacho` antes de fechar o dia.
