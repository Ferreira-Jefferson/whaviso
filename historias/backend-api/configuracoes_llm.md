# API-config-llm configuracoes_llm

- **ID:** API-config-llm  ·  **Área:** API  ·  **Onda:** 2
- **Modelo sugerido:** Opus  ·  **Status:** `A FAZER`
- **Reivindicado por:** (livre)

## Objetivo

Área de BYO key da loja: o dono cadastra a própria credencial de LLM (provedor, chave, modelo
preferido), troca (rotate) quando quiser e vê só o estado ("configurada, termina em 1234, validada em
..."). A chave é **write-only**: entra por um endpoint, é validada por uma chamada de teste, é cifrada
com envelope encryption e gravada; **a api nunca a lê de volta** (grant por coluna). Expõe também o
consumo (`uso_llm`) da loja para o painel de gasto.

"Pronto" observável: `PUT /lojas/:lojaId/llm/credencial` valida a chave no provedor e grava cifrado;
`GET` devolve só metadados; nenhuma resposta, log ou erro contém o texto claro; os testes SEC-020,
SEC-021, SEC-023 e SEC-024 passam; sem credencial ativa a loja fica com IA desligada (o atendente
degrada para o fluxo sem LLM).

## Dependências

- `F4` api-core: server, registry de rotas, http_errors, config e fronteira `shared/db`.
- `F6` front-shell: a tela da área consome api_client/auth do shell (este módulo entrega só a api, mas
  o STATUS.md o amarra ao shell para o contrato gerado e o `FR-*` que o consome).

Pré-requisitos já prontos: `F0` (tabelas `credenciais_llm` e `uso_llm`, migration 0012). Também usa o
kernel de tenant (`F3`), que `F4` já exige.

## Contratos e tabelas que toca

- **`credenciais_llm`**: este módulo é o **único dono de escrita**. Grants reais da 0012 para
  `whaviso_api`: `SELECT` só de `id, loja_id, provedor, ultimos4, modelo_preferido, ativo, validada_em,
  criado_em, atualizado_em`; `INSERT` de `loja_id, provedor, chave_cifrada, ultimos4, modelo_preferido,
  ativo`; `UPDATE` de `provedor, chave_cifrada, ultimos4, modelo_preferido, ativo, validada_em`. Sem
  `SELECT` em `chave_cifrada`, sem DELETE. Unique `(loja_id)`: uma credencial por loja.
- **`uso_llm`** (read-model): `SELECT` agregado por loja/período/origem/modelo. Quem grava é o atendente.
- Contratos Zod novos em `@whaviso/shared/contracts` (via `F1`): `CredencialLlmEntrada`
  (`provedor`, `chave` string write-only, `modelo_preferido?`), `CredencialLlmEstado` (sem campo de
  chave), `UsoLlmResumo`.
- Rotas (resumo): `GET /lojas/:lojaId/llm/credencial`, `PUT .../credencial` (set e rotate),
  `PATCH .../credencial` (ativar/desativar, trocar modelo, sem enviar chave), `POST .../credencial/testar`
  (revalida com chave nova no corpo, nunca a gravada), `GET .../llm/uso`.

## Arquivos (escopo de edição)

- `backend/apps/api/src/modules/configuracoes_llm/**` (rotas, service, repo, validadores de provedor,
  testes, `MODULE.md`)
- `backend/apps/api/src/routes.ts` (1 linha de registro)
- `backend/packages/shared/src/contracts/configuracoes_llm/**` (só os contratos deste módulo, combinado
  com `F1`)
- `backend/packages/shared/src/crypto/**` (envelope encryption: só se `F1`/kernel ainda não expôs
  `encrypt`/`decrypt`; ver Notas)
- `backend/apps/api/test/security/configuracoes_llm.*.test.ts`

## Etapas

- [ ] 1. Scaffold do módulo (`scaffold_module.sh api configuracoes_llm`), `MODULE.md` com as regras de
  ouro (nunca ler a chave, nunca logar) e registro em `routes.ts`  (commit: `feat(config-llm): scaffold do módulo`)
- [ ] 2. Contratos Zod: entrada com `chave` (min/max de tamanho, sem espaços, trim), enum `provedor`,
  `modelo_preferido` opcional; saída **sem** campo de chave (schema `.strict()`); rodar `gen_contracts`
  (commit: `feat(contratos): credencial llm e uso llm`)
- [ ] 3. Kernel de cifra (se ausente): `encryptSegredo(plaintext)` com envelope encryption (DEK aleatória
  por registro cifrada pela master key `LLM_MASTER_KEY` vinda do ambiente, AES-256-GCM, formato versionado
  `v1|iv|tag|dek_cifrada|payload`). A api importa só o **encrypt**; `decrypt` fica para o atendente.
  Teste de ida e volta no kernel e de adulteração (tag inválida)  (commit: `feat(shared): cifra em envelope para segredos`)
- [ ] 4. Validação do formato da chave por provedor (prefixo e tamanho plausíveis, ex.: `sk-or-` para
  OpenRouter) como filtro barato antes da chamada de rede  (commit: `feat(config-llm): validar formato por provedor`)
- [ ] 5. Validador por chamada de teste: adapter por provedor com **host fixo allowlisted** (SEC-070),
  `fetch` sem seguir redirect (`redirect: "error"`), timeout curto, chave só no header `Authorization`
  (nunca no corpo/URL, SEC-026), chamada barata (endpoint de metadados/`models` ou 1 token de saída).
  Mapeia resposta do provedor para `valida | invalida | indisponivel`; erro do provedor nunca é repassado
  cru (pode ecoar a chave)  (commit: `feat(config-llm): validação por chamada de teste`)
- [ ] 6. Repo: `inserirCredencial`/`atualizarCredencial` (colunas permitidas pelo grant, SQL parametrizado)
  e `buscarEstado` (só colunas de metadados, **lista explícita, nunca `select *`**)  (commit: `feat(config-llm): repositório com colunas explícitas`)
- [ ] 7. Service set/rotate: valida formato, chama o provedor, **só se válida** cifra, extrai `ultimos4`,
  faz upsert por `loja_id` (set = primeiro insert, rotate = update de `chave_cifrada`/`ultimos4`/
  `validada_em`), zera a referência ao texto claro e registra evento de auditoria **sem** a chave  (commit: `feat(config-llm): set e rotate da credencial`)
- [ ] 8. Rotas e autorização: só papel `dono` (e `gerente`, decidido nas Notas) escreve; `atendente` não
  vê nem a área. Escopo de loja pelo kernel de tenant (SEC-001/002)  (commit: `feat(config-llm): rotas e papéis`)
- [ ] 9. Desativar/reativar e remover: `PATCH ativo=false` (sem DELETE; "remover" = sobrescrever com
  `ativo=false`, mantendo só metadados). Trocar `modelo_preferido` sem reenviar a chave  (commit: `feat(config-llm): ativar, desativar e modelo`)
- [ ] 10. Read-model de consumo: `GET /llm/uso` agregando `uso_llm` por dia/origem/modelo e total do mês;
  sinaliza pico (média móvel simples) para o alerta SEC-100  (commit: `feat(config-llm): resumo de consumo`)
- [ ] 11. Redaction: garantir que a config de log do `F4` mascare `chave`, `api_key`, `authorization`,
  `chave_cifrada` em corpo de request, resposta e erros (inclusive campos aninhados); handler de erro
  nunca ecoa o corpo recebido  (commit: `feat(config-llm): redaction de chave em logs e erros`)
- [ ] 12. Rate limit na escrita/teste da chave (SEC-101): poucas tentativas por loja e por IP/min
  (commit: `feat(config-llm): rate limit de escrita e teste`)
- [ ] 13. Testes de unidade e integração do módulo (ver abaixo)  (commit: `test(config-llm): unidade e integração`)
- [ ] 14. Testes `security/` SEC-020/021/023/024 (ver abaixo)  (commit: `test(seguranca): chave de llm nunca vaza`)
- [ ] 15. Revisão (Opus) contra o SEGURANCA.md antes de `CONCLUIDO`

## Testes e segurança exigidos

Unidade/integração:
- set válido grava cifrado e devolve só `provedor`, `ultimos4`, `ativo`, `validada_em`.
- chave inválida no provedor: 422 com mensagem genérica, **nada gravado**.
- provedor indisponível: 502/503 sem gravar; retry seguro.
- rotate troca `chave_cifrada` e `ultimos4`; cifras de duas chamadas iguais diferem (IV/DEK novos).
- membro de outra loja recebe 403/404; `loja_id` forjado no corpo é ignorado (SEC-001/002).
- papel `atendente` negado; resposta com `.strict()` rejeita campo inesperado.
- adapter do provedor recusa redirect e host fora da allowlist (SEC-070).

Segurança:
- **SEC-020**: varredura de **todas** as respostas do módulo (sucesso, erro 4xx/5xx, validação) com uma
  chave sentinela conhecida: o texto claro nunca aparece.
- **SEC-021**: `SET ROLE whaviso_api; select chave_cifrada from credenciais_llm` falha por privilégio;
  `select *` também falha (o repo nunca usa).
- **SEC-023**: `pg_dump` de banco semeado com a chave sentinela não casa com o texto claro.
- **SEC-024**: log capturado durante set/rotate/erro com a sentinela não a contém (redaction aninhada).
- **SEC-022** (apoio): o módulo não depende de `decrypt`; teste de import garante que a api não importa a
  função de decifrar.
- SEC-026 (apoio), SEC-070, SEC-081, SEC-101.

## Notas e decisões

- **A api valida com a chave em mãos, antes de cifrar.** Como a api nunca lê a chave gravada,
  "revalidar a chave já salva" não existe na api: a revalidação periódica fica com o atendente (que
  decifra) ao falhar uma chamada. Aqui `validada_em` só marca o momento do set/rotate. Decisão: o
  `POST /testar` exige a chave no corpo.
- **Papéis:** escrita só para `dono` e `gerente`; decisão do dono se `gerente` pode. Padrão adotado:
  só `dono`, por ser o ativo mais caro.
- **Master key:** `LLM_MASTER_KEY` no ambiente (secret manager em produção), versionada no formato do
  ciphertext para permitir rotação da KEK sem migrar tudo de uma vez. Rotação da KEK é tarefa futura.
- **Uma credencial por loja** (unique em `loja_id`): trocar de provedor sobrescreve a linha.
- Sem credencial ativa, o módulo do atendente degrada; este módulo não decide isso, só expõe o estado.
- O contrato `CredencialLlmEstado` inclui `configurada: boolean` derivado de `ativo` + existência.
