# API-fluxo fluxo (builder)

- **ID:** API-fluxo  ·  **Área:** API  ·  **Onda:** 5
- **Modelo sugerido:** Opus  ·  **Status:** `A FAZER`
- **Reivindicado por:** (livre)

## Objetivo

Backend do **editor visual do grafo de atendimento**: a loja personaliza o fluxo (ordem e opções dos
passos de saudação, categoria, montagem do pedido, confirmação, endereço, Pix, acompanhamento) sem mexer
no motor. Entrega persistência **versionada** (rascunho, publicada, arquivada), **validação estrutural e
de segurança** do grafo, catálogo de nodes e publicação atômica que o `atendente` passa a executar.

"Pronto" observável: o dono cria um rascunho a partir do fluxo padrão, edita nodes e conexões, valida
(erros apontando node/aresta), publica; o motor de atendimento passa a usar a versão publicada; grafos
inválidos ou perigosos (ciclo sem saída, node desconhecido, atalho que pula confirmação) nunca são
publicados; conversas em andamento terminam na versão em que começaram.

## Dependências

- `AT-motor-min`: o grafo hardcoded e a definição dos nodes (tipos, handles de saída) que o editor
  edita. **Pré-requisito explícito:** o fluxo padrão precisa existir como **dado serializável** no kernel
  (`packages/shared`, mesmo formato do `NodeContract`) e não só como código do atendente; se não existir,
  pedir essa extração a `AT-motor-min` antes da etapa 6.
- `F1` kernel-contratos: `NodeContract` (tipo, schema de configuração, handles de entrada/saída) e o
  catálogo de descritores de nodes; o módulo valida config de cada node com o Zod do kernel.
- (herdadas) `F4`, `F3` escopo de loja.

## Contratos e tabelas que toca

- **Migration nova `0014_fluxos.sql`** (numeração a confirmar): 
  - `fluxos` (`id`, `loja_id` -> lojas, `nome`, `versao_publicada_id` nulo, timestamps). Um fluxo ativo
    por loja na v1 (`unique (loja_id)`).
  - `fluxo_versoes` (`id`, `fluxo_id`, `loja_id`, `numero` (sequencial por fluxo), `estado`
    `rascunho|publicada|arquivada`, `grafo jsonb`, `schema_versao smallint`, `criado_por_membro_id`,
    `publicado_em`, `criado_em`). Trigger rejeita `UPDATE` de `grafo` quando `estado <> 'rascunho'`
    (publicada é imutável); só uma `rascunho` por fluxo (índice parcial único).
  - RLS deny-all; `whaviso_api`: `select, insert, update` (sem DELETE); `whaviso_atendente`: **`select`**
    apenas (lê a publicada). `whaviso_zap` sem acesso. Rodar `validate_migrations.sh` e
    `check_rls_coverage.sh`.
- **Dono de escrita:** `fluxos`, `fluxo_versoes`.
- **Lê:** `lojas`, `membros` (autoria).
- **Eventos (`eventos`, sem PII):** `fluxo.rascunho_criado|publicado|restaurado`.
- **Contratos Zod:** reutiliza `NodeContract`/descritores do kernel; novos `FluxoDTO`,
  `FluxoVersaoDTO`, `GrafoDTO` (`nodes: [{id, tipo, config, posicao:{x,y}}]`, `edges: [{id, de, handle,
  para}]`), `ValidacaoResultado` (`erros[]`/`avisos[]` com `node_id`/`edge_id`/`codigo`), `NodeCatalogoItem`.
- **Rotas:** `GET /fluxo` (fluxo + versão publicada + rascunho), `GET /fluxo/catalogo`,
  `PUT /fluxo/rascunho` (salva grafo), `POST /fluxo/rascunho/validar`, `POST /fluxo/rascunho/publicar`,
  `POST /fluxo/rascunho/descartar`, `GET /fluxo/versoes`, `POST /fluxo/versoes/:id/restaurar`
  (cria rascunho a partir de versão anterior), `POST /fluxo/padrao` (rascunho a partir do padrão).

## Arquivos (escopo de edição)

- `backend/apps/api/src/modules/fluxo/**` (rotas, serviço, validador, testes, `MODULE.md`)
- `backend/supabase/migrations/0014_fluxos.sql`
- `backend/packages/shared/src/contracts/fluxo.ts` (DTOs de API; o `NodeContract` em si é de F1 e não
  se edita aqui)
- `backend/apps/api/src/routes.ts` (1 linha)
- `backend/apps/api/test/security/fluxo.*.test.ts`
- Consumo pelo atendente (ler a versão publicada) é tarefa de `AT-motor-min`/follow-up; **não** editar
  `apps/atendente` aqui.

## Etapas

- [ ] 1. Verificar o pré-requisito: fluxo padrão como dado no kernel e descritores de node (`tipo`,
  handles, `configSchema`); se faltar, registrar a lacuna em Notas e pedir a `AT-motor-min`/F1
  (commit: `docs(fluxo): pre-requisitos do kernel confirmados`)
- [ ] 2. Migration `0014_fluxos.sql` com trigger de imutabilidade e índices + validação de migrations e RLS
  (commit: `feat(db): fluxos versionados por loja`)
- [ ] 3. Contratos Zod (`GrafoDTO`, `ValidacaoResultado`...) + `gen_contracts`  (commit: `feat(contracts): contratos do fluxo`)
- [ ] 4. Catálogo de nodes `GET /fluxo/catalogo`: projeta os descritores do kernel (rótulo, handles,
  JSON Schema da config gerado do Zod, flag `obrigatorio`, `irreversivel`), sem executar nada
  (commit: `feat(fluxo): catalogo de nodes`)
- [ ] 5. Validador `validar.ts` puro (maior parte do valor do módulo), regras com códigos estáveis:
  `no_desconhecido`, `config_invalida` (Zod do node), `aresta_invalida` (handle inexistente, origem ou
  destino ausente), `sem_inicio`/`multiplos_inicios`, `no_inalcancavel`, `sem_saida` (caminho sem node
  terminal), `ciclo_sem_saida` (ciclo permitido só se houver aresta de escape para fora),
  `acao_irreversivel_sem_confirmacao` (todo caminho até um node `irreversivel`, como criar pedido ou
  enviar Pix, passa por `confirmar`), limites (máx 100 nodes, 300 arestas, 256 KB de jsonb, profundidade
  de config)  (commit: `feat(fluxo): validador estrutural e de seguranca do grafo`)
- [ ] 6. Testes de unidade do validador com grafos fixtures (válido padrão, ciclo, órfão, atalho que
  pula confirmação, handle errado, grafo gigante, config com campo extra)
  (commit: `test(fluxo): validador do grafo`)
- [ ] 7. Persistência do rascunho: `PUT /fluxo/rascunho` com controle otimista (`versao_base`/
  `atualizado_em`; conflito = 409), valida **forma** (Zod) sempre e só aceita rascunho; `POST
  /fluxo/padrao` cria rascunho a partir do padrão do kernel  (commit: `feat(fluxo): rascunho do grafo`)
- [ ] 8. Publicação atômica: valida de novo no servidor (nunca confia no cliente), em transação marca a
  anterior `arquivada`, a rascunho vira `publicada` (imutável), `fluxos.versao_publicada_id` atualizado,
  `eventos`; falha de validação = 422 com a lista de erros  (commit: `feat(fluxo): publicar versao`)
- [ ] 9. Versões e restauração: listar histórico, restaurar cria rascunho novo (não reescreve a
  publicada)  (commit: `feat(fluxo): historico e restauracao de versoes`)
- [ ] 10. Autorização por papel: editar/publicar só `dono|gerente`; `atendente` apenas lê; testes de
  matriz  (commit: `feat(fluxo): permissoes por papel`)
- [ ] 11. Testes de integração (2 lojas, publicar duas vezes, conflito otimista, trigger de
  imutabilidade, `SET ROLE whaviso_atendente` só lê) e registro em `routes.ts`
  (commit: `test(fluxo): integracao e registro`)
- [ ] Testes passando; lint, typecheck, test
- [ ] Revisão (Opus) de segurança (grafo como entrada não confiável) antes de `CONCLUIDO`

## Testes e segurança exigidos

- **SEC-061** (central): o validador impede que o grafo permita ação irreversível sem passar pelo node
  determinístico de confirmação; teste com grafo malicioso que liga `montar_pedido` direto a `criar
  pedido`/`pix` é rejeitado na publicação, mesmo que o cliente envie "validado".
- **SEC-070**: o catálogo **não** expõe nodes de HTTP arbitrário, execução de código nem expressões
  avaliáveis; teste garante que todo `tipo` aceito pertence ao catálogo fechado do kernel.
- **SEC-001/002**: rascunho/versão de outra loja inacessível (404); `loja_id` e `fluxo_id` forjados no
  corpo ignorados.
- **SEC-003**: operador da plataforma recebe 403.
- **SEC-032/030**: matriz `SET ROLE`: atendente só `SELECT` em `fluxos`/`fluxo_versoes`; zap sem
  acesso; api sem DELETE; `grafo` de versão publicada rejeita UPDATE.
- **SEC-080/081**: `config` de cada node validada pelo Zod; ids de node/aresta em formato restrito;
  tamanho e quantidade limitados; textos exibidos ao cliente passam pelo mesmo check de linguagem dos
  templates quando o node os contém.
- Unidade/integração: determinismo do validador, imutabilidade da publicada, controle otimista, 422 com
  erros localizados.

## Notas e decisões

- **Não executar o grafo na api.** O motor vive no `atendente`, e a api não importa app irmão. Por isso
  a v1 entrega **validação estática e análise de caminhos**, sem simulação de execução. Simulador
  ("testar conversa") exigiria extrair o motor para o kernel e fica como evolução.
- **Conversas em andamento:** o `atendente` fixa `fluxo_versao_id` em `conversas.contexto` ao iniciar e
  só adota a nova publicada em conversas novas. Contrato a registrar em `AT-motor-min`; este módulo só
  garante que versões publicadas **nunca mudam**.
- **Um fluxo por loja na v1** (`unique (loja_id)`); múltiplos fluxos (por horário/canal) é evolução.
- **Fluxo padrão** vem do kernel como dado; loja sem fluxo publicado usa o padrão embutido (o
  atendente trata ausência como "padrão"), então o editor é opt-in e nunca bloqueia a operação.
- **Grafo é entrada não confiável:** o editor roda no navegador do usuário; toda regra de segurança é
  reaplicada no servidor na publicação.
- Migration nova: ao commitar, **perguntar** se aplica no cloud (`supabase db push`).
