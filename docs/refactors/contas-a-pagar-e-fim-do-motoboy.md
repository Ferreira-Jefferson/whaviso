# Refactor: Contas a pagar no Financeiro e fim do módulo Motoboys

Status: plano congelado (2026-10-28). Execução por fases com subagentes no padrão anti-conflito
(uma lane de fundação escreve migration+contrato+regen; as consumidoras programam contra o contrato
congelado; subagente não roda git, o orquestrador verifica e commita cada lane).

## Decisão de produto (fonte: conversa com o dono, 2026-10-28)

O módulo **Motoboys** deixa de existir como página/menu. Ele hoje mistura três coisas que pertencem a
lugares diferentes:

1. **Entrega** é evento do **pedido** (o pedido sai com o motoboy). Já é assim no sistema
   (`pedidos.motoboy_id`, atribuição no Despacho). Nada a mover.
2. **Cadastro** do motoboy é **pessoa** (cargo `motoboy`). Vai para o módulo **Pessoas**: os campos de
   entrega (veículo, placa, Pix) e o **regime de pagamento** passam a ser editados no cadastro da pessoa
   quando o cargo é Motoboy.
3. **Acerto do dia** (quanto pagar) vai para um módulo novo no **Financeiro**: **Contas a pagar**.

**Contas a pagar** controla o que a loja paga para fora, em dois tipos concretos (não um AP genérico):
- **Fornecedores**: entidade nova, com lançamentos manuais (descrição, valor, vencimento, pago).
- **Pessoas**: o que a loja paga a quem presta serviço. O **motoboy** é o caso especial: o valor não é
  digitado, vem do **regime de pagamento** aplicado às entregas/período.

Nome: chamado **Contas a pagar** para não colidir com o módulo **Pagamentos** já existente (que é o
inverso: Pix que o cliente paga para a loja, dinheiro entrando). Distinto também de **Custos** (custo
medido de serviços externos tipo LLM/WhatsApp, automático, não pagamento manual a terceiros).

## Princípio estrutural

A **tabela `motoboys` permanece** (é referenciada por `pedidos.motoboy_id` e por `corridas` do
despacho, e é a identidade de entrega 1:1 com a pessoa via `pessoa_id`). O que acaba é o **módulo**
(página no front + fronteira de código no backend). O código se redistribui:

- Tabela `motoboys` (cadastro de entrega + regime): dono passa a ser o módulo **pessoas**.
- Tabelas `fechamentos` e `motoboy_lancamentos` (acerto): dono passa a ser o novo módulo de
  **contas a pagar** no Financeiro.
- Tabelas novas `fornecedores` e `contas_pagar` (lançamentos manuais): dono é o contas a pagar.
- `corridas` e `pedidos.motoboy_id` ficam como estão (despacho é dono de corridas).

Regra feature-first mantida: cada tabela tem um dono; módulo nunca importa módulo; quem precisa de dado
de outro módulo lê como read-model por SQL (ex.: contas a pagar lê `motoboys`/`pessoas`/`zonas_entrega`
sem importar código).

## Regime de pagamento do motoboy (modelo)

Colunas novas em `motoboys` (todas com default que preserva o comportamento atual):

- `regime_pagamento`: enum `por_entrega` (default) | `fixo` | `fixo_mais_entrega`.
- `periodicidade_fixo`: enum `dia` | `mes` (relevante só quando há parcela fixa).
- `valor_fixo_centavos`: inteiro >= 0 (0 em `por_entrega`).

Cálculo do acerto por regime, sobre um **período** escolhido (generaliza o fechamento diário de hoje):

- `por_entrega`: soma das entregas (cada entrega vale `zonas_entrega.valor_motoboy_centavos`) + ajustes.
  É exatamente o comportamento atual.
- `fixo` + `dia`: `valor_fixo_centavos` por **dia trabalhado** (dia com pelo menos uma entrega no
  período) + ajustes.
- `fixo` + `mes`: `valor_fixo_centavos` por mês do período + ajustes.
- `fixo_mais_entrega`: parcela fixa (conforme periodicidade) + soma das entregas + ajustes.

Ajuste manual e "marcar como pago" seguem existindo (mesma proteção de hoje: dia/período pago é
definitivo, pagar é idempotente e exige o total visto, append-only em lançamentos). A parcela fixa é
**derivada** no cálculo (não vira lançamento gravado), igual ao total nunca ser armazenado.

> Ponto de revisão do dono: a semântica de período (fixo/dia conta "dia com entrega"; fixo/mês fecha por
> mês) é a decisão mais sensível aqui. Fácil de ajustar antes da fase de acerto.

## Fornecedores e lançamentos manuais (modelo)

- `fornecedores`: `loja_id`, `nome`, contato opcional (telefone cifrado, mesmo kernel de pessoas/clientes
  se for PII), `documento` opcional, `ativo`. Sem DELETE (estado por `ativo`). Permissão `loja:gerir`.
- `contas_pagar` (lançamento manual a pagar): `loja_id`, `credor_tipo` (`fornecedor` | `pessoa`),
  `credor_id`, `descricao`, `valor_centavos`, `vencimento` (date), `status` (`a_pagar` | `pago`),
  `pago_em`, `pago_por_user_id`, `competencia` opcional. Sem DELETE. O acerto do motoboy NÃO usa esta
  tabela (ele é derivado via `fechamentos`/`motoboy_lancamentos`); esta tabela é para o que é digitado
  na mão (fornecedor e pessoa não-motoboy).

## Fases

**Fase 1: fundação (orquestrador, lane única).** Migrations + contratos + regen:
- colunas de regime em `motoboys`;
- tabelas `fornecedores` e `contas_pagar` (+ RLS deny-all, grants `whaviso_api`, sem DELETE, triggers
  `atualizado_em`, append-only onde couber);
- contratos Zod novos (`contas_pagar`, `fornecedores`) e extensão do contrato de pessoa/motoboy com o
  regime; `gen:contracts` + `check:contracts`.
- Gate backend completo. Aplicar no cloud (db push). Commit.

**Fase 2: cadastro (subagentes em paralelo).**
- Lane 2a (Pessoas absorve a entrega): mover a escrita do cadastro de entrega (veículo/placa/Pix) +
  regime para o módulo pessoas (backend) e para o `PessoaDialog` (front), visível quando cargo Motoboy.
  Revelar Pix do motoboy passa a viver aqui (dono/gerente, rate limit, no-store).
- Lane 2b (Fornecedores): backend do módulo contas a pagar para fornecedores (CRUD + lançamentos
  manuais) + front do cadastro de fornecedor.

**Fase 3: acerto no Financeiro (subagentes).**
- Lane 3a (backend acerto): mover `fechamentos`/`motoboy_lancamentos` e a lógica de cálculo para o
  módulo contas a pagar, generalizando para o regime e para período. Materialização, pagar, ajuste.
- Lane 3b (front Contas a pagar): página nova no Financeiro com abas **Pessoas** (acerto, motoboy
  especial) e **Fornecedores** (lançamentos). Filtros por período.

**Fase 4: eliminação (orquestrador).** Apagar `frontend/src/modules/motoboys/` + rota `/motoboys`
(grupo Entrega do menu); dissolver o módulo backend `motoboys` (cadastro já foi para pessoas, acerto
para contas a pagar). Ajustar nav. Gate front+back. Commit.

**Fase 5: relatório de vendas filtrável (separada, posterior).** Estender `relatorios/vendas` com
dimensões/filtros por **motoboy**, **tamanho/variação** e **mesa** (salão), conforme o que o modelo de
pedido suportar (a confirmar no inventário). Entregue depois das fases 1 a 4.

## Padrões obrigatórios (todas as lanes)

Dinheiro em centavos (int). Datas de negócio em America/Sao_Paulo. PII (telefone, Pix) só cifrada no
banco e mascarada na saída (últimos 4); claro só sob rota de revelar com permissão elevada, rate limit,
`no-store`, auditada sem o valor. Sem DELETE em tabela de negócio/auditoria. RLS deny-all para
anon/authenticated; grants mínimos para `whaviso_api`. Loja efetiva só do escopo (`x-loja-id`), nunca de
corpo/query (SEC-001/002). Módulo nunca importa módulo. Gate verde por lane antes de commit
(backend: lint+typecheck+test+test:security; front: typecheck+lint+build+test). Subagente não roda git.
