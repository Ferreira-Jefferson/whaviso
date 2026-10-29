# API-pagamentos-intermediado pagamentos_intermediado (PSP)

- **ID:** API-pag-int  ·  **Área:** API  ·  **Onda:** 4
- **Modelo sugerido:** Opus  ·  **Status:** `A FAZER`
- **Reivindicado por:** (livre)

## Objetivo

Evolução do `API-pagamentos` (v1 = Pix "copia e cola" da chave da própria loja, conciliação manual): o
restaurante passa a poder **receber via PSP intermediado** (cartão sempre; Pix por opção da loja), com o
dinheiro caindo **direto na subconta do restaurante** por split, o whaviso retendo a **taxa de
intermediação** (de `P-taxas`), e a **conciliação automática por webhook**. O PSP (Asaas na primeira
implementação) fica **isolado atrás de uma interface** (`ClientePagamento`), env-gated com stub, no mesmo
molde dos adapters `ClienteFiscal`/`ClienteCanal`. O whaviso **nunca centraliza** o dinheiro do cliente
final (split entrega à subconta), o que mantém a operação limpa e fora do fluxo de caixa do whaviso.

"Pronto" observável: a loja escolhe, por configuração, o **modo de Pix** (`chave_propria` = v1 inalterada;
`intermediado` = via PSP) e quem paga a taxa (`encargo = absorve | repassa`); dado um pedido de uma loja
em modo intermediado (ou qualquer cartão), a api cria a cobrança no PSP com split (subconta do restaurante
+ taxa do whaviso), envia na conversa, e marca `pago` **automaticamente** quando o webhook do PSP chega
(assinatura do webhook verificada, idempotente por evento). Cartão só é oferecido a loja com subconta
aprovada; loja que usa só Pix de chave própria não precisa de subconta.

## Dependências

- `API-pagamentos` (v1): tabela `pagamentos`, kernel de BR Code, cadastro de `loja_pix`. Esta história
  **adiciona** o caminho intermediado como segunda estratégia, sem quebrar o caminho de chave própria.
- `P-taxas`: `resolverTaxaIntermediacao(contaId)` para o valor da taxa (não recalcula taxa aqui).
- `P-cobranca` / `0071_planos`: a conta tem assinatura e plano (de onde a taxa é resolvida).
- `F2` clientes-externos: padrão de interface + stub + env-gate (como `ClienteWhats`).
- `F4` api-core, `F3` tenant-auth (escopo de loja para configurar; webhook é rota pública assinada).

## Contratos e tabelas que toca

- **Dono de escrita (config da loja):** `loja_pagamento_config` (tabela nova): `loja_id` (unique),
  `pix_modo` enum (`chave_propria | intermediado`, default `chave_propria`), `encargo_modo` enum
  (`absorve | repassa`, default `absorve`), `cartao_habilitado boolean`. Default conservador: tudo como
  está hoje (Pix chave própria, sem cartão) até a loja configurar.
- **Dono de escrita (recebedor PSP):** `psp_subcontas` (tabela nova): `loja_id`, `provider` (`asaas`),
  `subconta_ref` (id/wallet da subconta no PSP), `status_kyc` enum (`pendente | aprovada | recusada`),
  timestamps. Sem dados sensíveis de KYC no banco (o onboarding corre no PSP; guardamos só a referência).
- **Estende (dono já é o v1):** `pagamentos` ganha colunas do caminho intermediado: `provider`
  (`manual | asaas`), `charge_ref` (id da cobrança no PSP), `meio` (`pix | cartao`), `encargo_centavos`
  (taxa whaviso aplicada, snapshot no momento da cobrança), `taxa_psp_centavos` (quando o PSP informar).
  Coordenar com o dono de `pagamentos` (v1) por estar na mesma tabela; a alteração entra numa migration
  deste módulo e a matriz de grants não muda de dono.
- **Segredo (credencial do PSP, nível plataforma):** `credenciais_psp` (tabela nova) com a chave do Asaas
  **cifrada** (molde de `credenciais_llm`/`loja_pix`: `chave_cifrada bytea`, nunca em claro, nunca
  logada). É credencial da **plataforma** (o whaviso é o marketplace no PSP), não da loja.
- **Lê (read-model):** `pedidos` (total, status), `conversas` (envio), `assinaturas`/`planos` via
  `P-taxas`, `loja_pix` (caminho chave própria do v1).
- **Interface:** `ClientePagamento` (contrato + stub em `packages/shared`, implementação `asaas_client`),
  com `criarCobranca({meio, valorCentavos, split, txid})`, `consultar`, e verificação de assinatura de
  webhook. Env-gate: sem `ASAAS_*`, cai no stub (como `ClienteFiscal`/`ClienteCanal`).
- **Eventos (`eventos`):** `pagamento.intermediado_criado|conciliado_webhook|falhou`,
  `psp.subconta_criada|aprovada`.
- **Rotas:** `PUT /lojas/:lojaId/pagamento-config` (dono/gerente), `POST /lojas/:lojaId/psp/subconta`
  (inicia onboarding), `POST /webhooks/psp/asaas` (pública, assinada, idempotente).

## Arquivos (escopo de edição)

- `backend/apps/api/src/modules/pagamentos_intermediado/**` (config, subconta, webhook, serviço, testes)
- `backend/apps/api/src/modules/pagamentos/**` (apenas as colunas novas de `pagamentos` e o ponto de
  bifurcação de estratégia; mínimo, coordenado com o dono do v1)
- `backend/packages/shared/src/pagamento/**` (interface `ClientePagamento` + stub)
- `backend/apps/api/src/shared/asaas_client/**` (implementação do provider, isolada)
- `backend/supabase/migrations/00NN_pagamento_intermediado.sql` (próxima livre; confirmar o número)
- `backend/packages/shared/src/contracts/pagamento_intermediado.ts`
- `backend/apps/api/src/routes.ts` (rotas + webhook)
- `backend/apps/api/test/security/pagamentos_intermediado.*.test.ts`

## Etapas

- [ ] 1. Migration: `loja_pagamento_config`, `psp_subcontas`, `credenciais_psp` (cifrada), colunas novas
  em `pagamentos`; RLS/grants; validar migrations + RLS  (commit: `feat(db): config de pagamento, subconta e credencial do PSP`)
- [ ] 2. Interface `ClientePagamento` + stub determinístico + env-gate  (commit: `feat(shared): interface ClientePagamento e stub`)
- [ ] 3. Contratos Zod + `gen_contracts`  (commit: `feat(contracts): pagamento intermediado`)
- [ ] 4. Cifra/decifra da credencial do PSP (reusa kernel de cifra), set/rotate por operador, claro nunca
  devolvido nem logado  (commit: `feat(pagamentos-int): credencial do PSP cifrada`)
- [ ] 5. Config por loja (`pix_modo`, `encargo_modo`, `cartao_habilitado`), rota + validação  (commit: `feat(pagamentos-int): config de pagamento da loja`)
- [ ] 6. Onboarding de subconta no PSP (cria recebedor, guarda `subconta_ref` + `status_kyc`)  (commit: `feat(pagamentos-int): onboarding de subconta`)
- [ ] 7. Implementação Asaas do `ClientePagamento` (criar cobrança Pix/cartão com split; `fetchSeguro`/SSRF;
  credencial por chamada)  (commit: `feat(asaas): implementacao de ClientePagamento`)
- [ ] 8. Criar cobrança intermediada: resolve a taxa (`P-taxas`), monta o split (subconta recebe o valor
  conforme `encargo`; whaviso recebe o encargo; % do PSP sempre do restaurante), grava `pagamentos`
  (`provider=asaas`, `charge_ref`, `encargo_centavos`), envia na conversa  (commit: `feat(pagamentos-int): criar cobranca com split`)
- [ ] 9. Cálculo do encargo por `encargo_modo`: `absorve` (cliente paga o total, taxa sai do repasse);
  `repassa` (cliente paga total + encargo; restaurante recebe cheio). Arredondar o encargo pra cima ao
  centavo. Testes de unidade dos dois modos  (commit: `feat(pagamentos-int): regra de absorve e repassa`)
- [ ] 10. Webhook `/webhooks/psp/asaas`: verifica assinatura, idempotente por id de evento, marca
  `pagamentos.pago`, emite realtime + evento; nunca confia no corpo sem verificar  (commit: `feat(pagamentos-int): webhook de conciliacao`)
- [ ] 11. Gate de oferta: cartão só se `cartao_habilitado` e subconta `aprovada`; Pix intermediado só se
  `pix_modo=intermediado`; senão cai no caminho de chave própria do v1  (commit: `feat(pagamentos-int): selecao de estrategia por loja`)
- [ ] 12. Redaction de credencial do PSP e do corpo do webhook em log/erro  (commit: `feat(pagamentos-int): redaction do PSP`)
- [ ] 13. Testes unidade + integração + `security/`  (commit: `test(pagamentos-int): unidade, integracao, seguranca`)
- [ ] Revisão (Opus) de segurança (segredo, webhook, dinheiro) antes de `CONCLUIDO`

## Testes e segurança exigidos

- **Segredo (SEC-020/023/024 por analogia):** `credenciais_psp` nunca em claro no `pg_dump`; nenhuma
  resposta/log traz a chave do Asaas; set/rotate não vaza.
- **Webhook:** assinatura inválida é rejeitada (401/403); replay do mesmo evento é no-op (idempotência);
  corpo não verificado nunca marca `pago`; webhook de outra loja/charge não concilia pedido alheio.
- **Dinheiro:** encargo e split em centavos; `absorve` e `repassa` batem a soma (restaurante + whaviso +
  PSP = total certo em cada modo); arredondamento do encargo pra cima; o whaviso **nunca** absorve o %
  de adquirência do cartão (teste explícito do split fee-liability).
- **Gate:** cartão só com subconta aprovada; loja em `chave_propria` jamais chama o PSP; `loja_id` forjado
  não configura/concilia terceiro (SEC-001/002/041).
- **SEC-030:** sem DELETE em `pagamentos`/`psp_subcontas`/`credenciais_psp` (estado, não sumiço).
- **SEC-032:** `whaviso_zap`/`whaviso_atendente` sem acesso a `credenciais_psp`/`psp_subcontas`.
- **SEC-061:** valor e chave/subconta vêm de regra determinística, nunca de texto de modelo.

## Notas e decisões

- **Regra de ouro (dinheiro):** o percentual de adquirência do PSP é **sempre** do restaurante (absorve ou
  repassa ao cliente); o whaviso **nunca** absorve o % do cartão. A taxa fixa do whaviso (R$ 0,50, de
  `P-taxas`) é margem limpa por cima. Se o whaviso absorvesse o % do cartão, a taxa fixa daria prejuízo.
- **Repasse no cartão só como preço diferenciado** (Lei 13.455/2017), transparente como linha ao cliente,
  **a validar com jurídico/contador** e checar regras do PSP e da bandeira antes de habilitar `repassa`
  para cartão. No Pix intermediado o repasse é trivial e sem essa trava (o whaviso define o valor da
  cobrança). Enquanto o jurídico não liberar, `repassa` vale para Pix; cartão fica em `absorve`.
- **Chave própria do v1 permanece** como uma das estratégias (dinheiro direto, sem taxa, conciliação
  manual). Quem só usa chave própria não precisa de subconta nem passa pelo PSP. O caminho intermediado é
  aditivo, não substitui.
- **Taxas do Asaas a confirmar:** os números de adquirência/Pix do Asaas e um eventual custo de repasse do
  split ao whaviso precisam ser confirmados com o provider ao integrar; não hardcodar (o custo do PSP,
  quando informado, é gravado em `pagamentos.taxa_psp_centavos` a partir do retorno/webhook).
- **PSP atrás de interface + env-gate:** trocar Asaas por outro provider (ou versão) é pontual, atrás de
  `ClientePagamento`, com stub quando não há credencial (mesmo molde de `ClienteFiscal`/`ClienteCanal`
  já no projeto). Sem credencial `ASAAS_*`, o sistema opera só o caminho de chave própria.
- **ME, não MEI:** a retenção de taxa (intermediação) pressupõe a empresa no Simples; o split entregar
  direto à subconta do restaurante é o que mantém o whaviso fora do fluxo de caixa do cliente final.
  Migrar de MEI para ME não troca o CNPJ, então a conta no PSP e as subcontas sobrevivem à mudança.
- **Coordenação front (abrir FR, mock-first):** tela de config de pagamento da loja (modo de Pix,
  absorve/repassa, status da subconta) e, no editor de plano do operador, o campo de taxa (de `P-taxas`).
- **Coordenação com o v1:** a alteração em `pagamentos` (colunas novas) e o ponto de bifurcação de
  estratégia tocam o módulo do v1; integrar com commit atômico coordenado, sem reescrever o BR Code puro.
