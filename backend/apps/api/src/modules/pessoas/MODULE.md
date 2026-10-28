# pessoas

## Proposito
Quem trabalha a favor da loja: cadastro de **pessoas**, cargos (funcoes) editaveis e escala de
trabalho (dias/horarios). "Pessoas" e nao "funcionarios" porque nem todo mundo que trabalha pro
restaurante e funcionario CLT: o motoboy e o churrasqueiro de fim de semana trabalham a favor da
loja sem vinculo. **Cargo = funcao** (o eixo do cadastro). SEM folha de pagamento e SEM fiscal. O
telefone da pessoa e PII (hash nao; so cifra): fica cifrado no banco, mascarado na saida e so e
revelado sob permissao elevada.

## Entry points
- `index.ts`: `pessoasRoutes` (registry) e `criarPessoasRoutes(cifra)` (injetavel em teste).
- Rotas finais (`/v1/pessoas`):
  - Cargos: `GET /cargos`, `POST /cargos`, `PATCH /cargos/:id`.
  - Pessoas: `GET /`, `POST /`, `GET|PATCH /:id`, `POST /:id/telefone/revelar`.
  - Entrega (so cargo motoboy): `PUT /:id/entrega` (upsert veiculo/placa/Pix/regime),
    `POST /:id/entrega/pix/revelar` (papel dono/gerente, rate limit 10/min, `no-store`).
  - Escalas: `GET|POST /:id/escalas`, `PATCH /escalas/:id`, `POST /escalas/:id/desativar`.

## Permissoes
- Tudo exige `loja:gerir` (dono e gerente): equipe e configuracao da loja.
- `POST /:id/telefone/revelar`: papel `dono`/`gerente`, rate limit 10/min, `Cache-Control: no-store`.

## Cargos: preset de plataforma x cargo da loja (decisao de tenancy)
- Presets de plataforma tem `loja_id = NULL` e sao visiveis a TODAS as lojas (catalogo inicial de
  funcoes: cozinheira, ajudante de cozinha, atendente, marmiteira, recepcao, garcom). Vem por
  UPSERT na migration 0025 (nao no seed, que nao roda no cloud).
- A loja NAO muta um preset (seria uma linha global, quebraria o isolamento): ela cria cargos
  PROPRIOS (`loja_id = sua loja`) e edita/arquiva apenas esses (`PATCH /cargos/:id` so atinge
  `loja_id = loja and not sistema`). Tentar editar um preset = 422 `cargo_nao_editavel`.
- **Motoboy** e preset de SISTEMA (`sistema=true`, `chave='motoboy'`), FIXO: nao pode ser apagado
  (sem grant de DELETE), desativado nem ter a chave alterada. Garantido na api (service) E por
  trigger `proteger_cargo_sistema` (defesa em profundidade). Uma pessoa com cargo cuja
  `chave='motoboy'` E o motoboy usado na entrega (sem conceito duplicado; o modulo de entrega
  referencia pessoas com esse cargo).

## Cifra: kernel compartilhado
`cripto.ts` so reexporta `@whaviso/shared/cifra` (mesma cifra de clientes). Telefone da pessoa
cifrado com a `MASTER_KEY` (AES-256-GCM); a cifra e injetavel (`criarPessoasRoutes(cifra)`).
Diferente de clientes, nao ha `telefone_hash`: pessoa nao e deduplicada por telefone. O Pix da
entrega usa o kernel `@whaviso/shared/pix_credencial` (normaliza/hash/mascara, mesmo do motoboys),
nunca importando o modulo motoboys.

## Dados de entrega (tabela `motoboys`, cargo motoboy)
A entrega (veiculo, placa, Pix e regime de pagamento) e a linha 1:1 em `public.motoboys` por
`pessoa_id` (unica por `motoboys_pessoa_unica`). O proprio modulo pessoas passou a escreve-la pelo
`PUT /:id/entrega` (so cargo `chave='motoboy'`, senao 422 `cargo_nao_motoboy`); INSERT se nova,
UPDATE se ja existe. placa/Pix: ausente mantem, null limpa, presente troca (o Pix so sai mascarado,
ultimos 4). Regime (`regime_pagamento`, `periodicidade_fixo`, `valor_fixo_centavos`): com parcela
fixa o valor tem de ser > 0 (422 `valor_fixo_obrigatorio`); em `por_entrega` o valor e gravado 0.
O claro do Pix so sai em `POST /:id/entrega/pix/revelar`, auditado sem o valor (eventos
`pessoa.entrega_definida`/`pessoa.pix_revelado`, sem PII). Convive com o modulo motoboys (mesma
tabela) ate a eliminacao futura daquele modulo; pessoas nunca importa motoboys.

## Tabelas (migration 0025)
- dono de (escrita pelo painel): `cargos`, `pessoas`, `escalas` (`escalas.pessoa_id` referencia a pessoa).
- Sem DELETE em nenhuma (RLS deny-all p/ anon/authenticated; grants SELECT/INSERT/UPDATE p/
  whaviso_api). Estado via coluna `ativo` (cargo/pessoa/escala somem com `ativo = false`).

## Contratos
- Zod em `@whaviso/shared/contracts/pessoas` (reexportado em `schemas.ts`; espelhado no front).
  Telefone em claro so na ENTRADA (cadastro/edicao) e em `PessoaTelefoneSaida` (revelar).
