# plataforma_painel

## Proposito
Read-model de crescimento da base para o operador (equipe Whaviso): MRR, lojas ativas, churn,
inadimplencia, conversao de funil/trial e serie mensal. So agregados; nunca conteudo nem volume de
uso de loja (SEC-003). Sem migration, sem escrita.

## Entry points
- `index.ts`: `plataformaPainelRoutes` (registry) e `criarPlataformaPainelRoutes()` (teste).
- Rotas (`/v1/plataforma-painel`): `GET /resumo`, `GET /serie?meses=1..24` (default 12).

## Escopo / permissoes
- Toda rota: `config.acesso = 'plataforma'` + `preHandler [autenticar, escopoOperador]`. Membro de
  loja recebe 403. Nenhum `loja_id`/`conta_id` em corpo/query (querystring estrita).

## Tabelas (somente SELECT agregado, colunas explicitas)
- le: `assinaturas`, `faturas`, `contas`, `lojas` (`id`, `conta_id`, `ativo`, `suspensa`), `prospectos`
  (`estagio`, `criado_em`, so contagem).
- PROIBIDAS (guarda estatica em `fronteira.test.ts`): pedidos, itens_pedido*, conversas, mensagens,
  clientes, enderecos, pagamentos, loja_pix, credenciais_llm, uso_llm, numeros_whatsapp, envios.

## Definicoes (fonte unica em `metricas.ts`, divisao por zero = `null`)
- MRR = soma de `valor_mensal_centavos` das assinaturas `ativa` (trial e suspensa fora).
- Lojas ativas = `lojas.ativo` e nao `suspensa`, cobertas por assinatura `ativa` (da conta ou da loja).
- Churn de contas = cancelamentos no mes de assinaturas ja iniciadas antes do mes / ativas no 1o dia
  do mes (ativa = `inicio_em < ini` e sem `cancelada_em` ate `ini`). Churn de MRR analogo em centavos.
- Inadimplencia = soma de faturas `atrasada` e contas distintas afetadas.
- Receita realizada = faturas `paga` com `pago_em` no mes.
- Conversao do funil = prospectos criados no mes que estao `ativo` / prospectos criados no mes.
- Conversao de trial = assinaturas com `trial_ate` no mes e `inicio_em` preenchido / com `trial_ate` no mes.
- ARPA = MRR / contas distintas com assinatura `ativa` (centavos arredondados).
- Meses em America/Sao_Paulo, limites convertidos para UTC no banco.
- Serie: MRR passado usa o valor atual da assinatura (aproximado, `mrr_aproximado = true`).

## Cache
Em memoria, 60 s por chave (`resumo`, `serie:N`), por processo. `calculado_em` expoe a idade.

## Contratos
- `packages/shared/src/contracts/plataforma_painel.ts` (reexportados por `schemas.ts`).
