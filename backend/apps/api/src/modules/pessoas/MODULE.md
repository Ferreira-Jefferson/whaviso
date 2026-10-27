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
Diferente de clientes, nao ha `telefone_hash`: pessoa nao e deduplicada por telefone.

## Tabelas (migration 0025)
- dono de (escrita pelo painel): `cargos`, `pessoas`, `escalas` (`escalas.pessoa_id` referencia a pessoa).
- Sem DELETE em nenhuma (RLS deny-all p/ anon/authenticated; grants SELECT/INSERT/UPDATE p/
  whaviso_api). Estado via coluna `ativo` (cargo/pessoa/escala somem com `ativo = false`).

## Contratos
- Zod em `@whaviso/shared/contracts/pessoas` (reexportado em `schemas.ts`; espelhado no front).
  Telefone em claro so na ENTRADA (cadastro/edicao) e em `PessoaTelefoneSaida` (revelar).
