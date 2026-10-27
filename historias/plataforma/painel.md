# P-painel plataforma_painel

- **ID:** P-painel  ·  **Área:** P  ·  **Onda:** 4
- **Modelo sugerido:** Sonnet  ·  **Status:** `A FAZER`
- **Reivindicado por:** (livre)

## Objetivo

Read-model de **crescimento da base** para o operador: MRR, lojas ativas, novas contas, churn,
inadimplência, conversão do funil e série mensal. Tudo derivado de `assinaturas`, `faturas`, `contas`,
`lojas` e `prospectos`. **Nunca** lê conteúdo nem volume de uso das lojas.

"Pronto" observável: `GET /plataforma/painel/resumo` devolve os KPIs do mês corrente e
`GET /plataforma/painel/serie?meses=12` devolve a série mensal; números conferem com fixtures
calculadas à mão; um teste estático garante que o módulo não cita tabelas de conteúdo.

## Dependências

- `P-cobranca`: define o significado de `ativa/trial/suspensa/cancelada` e emite as faturas que alimentam
  inadimplência e MRR realizado.
- `P-clientes`: contas e lojas como universo da base (lidas direto do banco, sem importar o módulo).
- (herdadas) `F4`, `F3` operador.

## Contratos e tabelas que toca

- **Dono de escrita:** nenhuma (puro read-model). Sem migration obrigatória.
- **Lê (somente `SELECT` agregado, colunas explícitas):** `assinaturas`, `faturas`, `contas`, `lojas`
  (`id`, `conta_id`, `ativo`, `suspensa`, `criado_em`), `prospectos` (`estagio`, `criado_em`,
  `atualizado_em`, só contagem).
- **Proibidas:** `pedidos`, `itens_pedido*`, `conversas`, `mensagens`, `clientes`, `enderecos`,
  `pagamentos`, `envios`, `uso_llm`, `credenciais_llm`, `numeros_whatsapp`. Métrica de uso (pedidos por
  loja, volume de conversas) **fica fora** do console da plataforma por decisão de privacidade (abaixo).
- **Definições (fonte única em `metricas.ts`, testadas):**
  - **MRR** = soma de `valor_mensal_centavos` das assinaturas `ativa` (trial e suspensa não entram).
  - **Lojas ativas** = lojas com assinatura `ativa` cuja flag `suspensa` é falsa.
  - **Em trial / suspensas / canceladas** = contagens por status.
  - **Novas contas no mês** = `contas.criado_em` no mês (fuso America/Sao_Paulo).
  - **Churn de contas do mês** = assinaturas com `cancelada_em` no mês / assinaturas `ativa` no
    primeiro dia do mês; **churn de MRR** análogo em centavos.
  - **Inadimplência** = soma de `faturas.valor_centavos` `atrasada` e quantidade de contas afetadas.
  - **Receita realizada no mês** = faturas `paga` com `pago_em` no mês.
  - **Conversão do funil** = prospectos `ativo` no período / prospectos criados no período.
  - **ARPA** = MRR / contas com assinatura ativa.
- **Contratos Zod:** `PainelResumo`, `PainelSerieMes`, `PainelSerie`.
- **Rotas:** `GET /plataforma/painel/resumo`, `GET /plataforma/painel/serie`.

## Arquivos (escopo de edição)

- `backend/apps/api/src/modules/plataforma_painel/**`
- `backend/packages/shared/src/contracts/plataforma_painel.ts`
- `backend/apps/api/src/routes.ts` (1 linha)
- `backend/apps/api/test/security/plataforma_painel.*.test.ts`

## Etapas

- [ ] 1. Scaffold + `MODULE.md` com as definições de métrica e a lista de tabelas permitidas/proibidas
  (commit: `feat(plataforma-painel): scaffold do modulo`)
- [ ] 2. Contratos Zod + `gen_contracts`  (commit: `feat(contracts): contratos de plataforma_painel`)
- [ ] 3. `metricas.ts` (funções puras que recebem linhas agregadas e calculam MRR, churn, ARPA,
  conversão; divisão por zero retorna `null`, não `0`)  (commit: `feat(plataforma-painel): definicoes de metricas`)
- [ ] 4. Testes de unidade das métricas com fixtures manuais (mês sem base, churn 100%, trial não conta
  no MRR, virada de ano)  (commit: `test(plataforma-painel): metricas`)
- [ ] 5. Queries agregadas `resumo` (poucas queries com `COUNT/SUM ... FILTER`) com limites de mês em
  America/Sao_Paulo convertidos para UTC  (commit: `feat(plataforma-painel): resumo de crescimento`)
- [ ] 6. Série mensal de N meses (1 a 24) por `generate_series` e `inicio_em`/`cancelada_em`; MRR
  histórico **aproximado** com o valor atual da assinatura (decisão abaixo)  (commit: `feat(plataforma-painel): serie mensal`)
- [ ] 7. Cache em memória por 60 s por chave de consulta (processo único; sem Redis)
  (commit: `feat(plataforma-painel): cache curto de agregados`)
- [ ] 8. Teste estático de fronteira (sem tabela proibida, sem `SELECT *`) e testes de integração
  (commit: `test(plataforma-painel): fronteira e integracao`)
- [ ] 9. Registro em `routes.ts`  (commit: `feat(plataforma-painel): registrar rotas`)
- [ ] Testes passando; lint, typecheck, test

## Testes e segurança exigidos

- **SEC-003** (central): teste estático falha se qualquer SQL do módulo citar tabela proibida; teste de
  integração com operador confirma que o payload contém só chaves da allowlist de métricas.
- **SEC-001/041**: membro de loja recebe 403 em `/plataforma/painel/*`.
- **SEC-080/081**: parâmetro `meses` validado (1..24, inteiro); nenhuma interpolação.
- Unidade: cada métrica contra fixture; consistência (`lojas ativas <= lojas totais`), centavos
  inteiros, fuso na virada do mês.

## Notas e decisões

- **Sem métrica de uso das lojas.** Contar pedidos ou conversas por loja é ler dado de operação de um
  cliente; a política da plataforma é "métricas e faturamento, nunca conteúdo". Se o negócio precisar de
  saúde de adoção (ex.: loja inativa há 14 dias), a solução correta é um **sinal agregado materializado**
  (`ultima_atividade_em` por loja, mantido por trigger sem conteúdo) numa evolução própria, não leitura
  de `pedidos` aqui.
- **Série histórica aproximada:** não existe tabela de snapshot de assinatura; o MRR passado usa o valor
  atual. Aceitável porque o valor padrão é único; se houver reajustes, criar `assinaturas_historico`
  (append-only) em tarefa separada.
- **Cache:** curto e por processo; o painel não é tempo real. Sem SSE aqui.
- Idade do dado: exibir `calculado_em` no payload para o front mostrar "atualizado há X".
