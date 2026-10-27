# API-lojas lojas

- **ID:** API-lojas  ·  **Área:** API  ·  **Onda:** 1
- **Modelo sugerido:** Sonnet  ·  **Status:** `A FAZER`
- **Reivindicado por:** (livre)

## Objetivo

Perfil da loja, branding, horários de funcionamento e área de entrega. Entrega o CRUD da loja dentro da
conta: criar/editar loja, logo e cores (branding do painel e do cardápio), endereço, horários por dia da
semana e a área de entrega (a configuração-base que o atendente lê; a precificação por bairro/zona é do
módulo `zonas_entrega` da Onda 3). "Pronto" observável: o dono cria uma segunda loja na conta, edita
horários e cores, e `GET /lojas` devolve só as lojas do escopo do usuário; o atendente (IA) consegue ler
horários e área pela role `whaviso_atendente` (grant `select` já existente).

## Dependências

- `F4` api-core: registry de rotas, erros, config, `shared/db`. Transitivas: `F0` (tabela `lojas`),
  `F1` (contratos), `F3` (escopo de loja resolvido pelo kernel; este módulo **consome** o escopo).
- Não depende de `API-conta`: a existência de conta/membro é pré-requisito de dados, mas o módulo não a
  importa (módulo nunca importa módulo). O seed e os testes criam conta e membro direto por SQL de teste.

## Contratos e tabelas que toca

- **Dono de escrita:** `lojas` (insert/update; desativar = `ativo = false`, sem DELETE).
- **Lê por read-model:** `membros` (apenas via kernel de tenant, para o escopo; o módulo não consulta
  `membros` diretamente), `numeros_whatsapp` (só contagem/estado para o resumo da loja, leitura via
  `shared/db`, documentada no MODULE.md, colunas não sensíveis: nunca `token_cifrado`).
- **Contratos Zod (F1):** `LojaCriarEntrada`, `LojaAtualizarEntrada`, `LojaSaida`, `Cores` (tokens de cor
  hex validados), `Horarios` (por dia 0..6, lista de faixas `abre`/`fecha` em `HH:mm`, `fechado`,
  fuso fixo America/Sao_Paulo), `Endereco`, `AreaEntrega` (modo `raio` com `raio_km` + centro, ou
  `bairros` com lista de nomes; polígono fica para `zonas_entrega`). Os jsonb do banco (`cores`,
  `endereco`, `horarios`, `area_entrega`) são sempre lidos/gravados via esses schemas, nunca livres.
- Evento de auditoria (sem PII): `loja.criada`, `loja.atualizada`, `loja.desativada`.

## Arquivos (escopo de edição)

- `backend/apps/api/src/modules/lojas/**`
- `backend/apps/api/src/routes.ts` (1 linha de registro, combinado)
- `backend/packages/shared/src/contracts/lojas*.ts`

## Etapas

- [ ] 1. Scaffold `lojas` + MODULE.md (dono de `lojas`; leituras cruzadas declaradas)
  (commit: `chore(api-lojas): scaffold do modulo lojas`)
- [ ] 2. Contratos Zod de loja, cores, horários, endereço e área de entrega, com regras: `fecha` pode
  cruzar meia-noite (faixa 18:00 a 02:00 válida), sem sobreposição de faixas, `raio_km` > 0 e limite
  máximo, cor hex `#RRGGBB`; regenerar `_generated`  (commit: `feat(contracts): contratos de loja, horarios e area de entrega`)
- [ ] 3. Repo SQL parametrizado: listar por escopo (`WHERE conta/loja` vindo do kernel), buscar, criar,
  atualizar parcial, desativar  (commit: `feat(api-lojas): repositorio de lojas`)
- [ ] 4. `GET /lojas` e `GET /lojas/:id` (qualquer papel com acesso à loja; fora do escopo = 404)
  (commit: `feat(api-lojas): listar e ler lojas do escopo`)
- [ ] 5. `POST /lojas` (somente `dono`; conta vem do escopo, nunca do corpo): cria loja ativa com
  horários/área default vazios válidos  (commit: `feat(api-lojas): criar loja`)
- [ ] 6. `PATCH /lojas/:id` (dono e gerente): nome, endereço, horários, área; `PATCH /lojas/:id/branding`
  (cores e logo)  (commit: `feat(api-lojas): editar perfil, horarios, area e branding`)
- [ ] 7. Logo: aceitar apenas `logo_url` https de host permitido por config (allowlist) ou upload
  adiado para decisão registrada abaixo; validar tamanho da URL e esquema  (commit: `feat(api-lojas): validar logo_url por allowlist`)
- [ ] 8. `POST /lojas/:id/desativar` e `/reativar` (somente dono): `ativo` falso não apaga nada;
  bloqueia quando já é a única loja ativa da conta  (commit: `feat(api-lojas): desativar e reativar loja`)
- [ ] 9. Função pura `lojaAbertaAgora(horarios, agora)` em America/Sao_Paulo, exposta no detalhe como
  `aberta_agora` (calculada no servidor, nunca no cliente), com testes de virada de meia-noite e de
  fuso  (commit: `feat(api-lojas): calcular aberta_agora no servidor`)
- [ ] 10. Testes de unidade e integração do módulo  (commit: `test(api-lojas): suite de lojas`)
- [ ] 11. Testes de segurança (SEC-001/002/081)  (commit: `test(api-lojas): sec de isolamento de loja`)

## Testes e segurança exigidos

**Unidade/integração:**
- Contratos: horário sobreposto, `fecha` antes de `abre` sem virada válida, cor inválida, raio negativo.
- `lojaAbertaAgora`: dentro/fora de faixa, faixa que cruza meia-noite, dia fechado, horário de verão
  não existe no Brasil hoje, mas o cálculo usa o fuso nomeado, não offset fixo.
- Matriz de papéis: atendente lê e não edita; gerente edita e não cria/desativa; dono faz tudo.
- Loja de outra conta devolve 404 (não 403, para não confirmar existência).
- `whaviso_atendente` consegue `select` em `lojas` e não consegue `update` (checado por `SET ROLE`).

**SEC aplicáveis:**
- `SEC-001`: membro da loja A não lê nem edita a loja B.
- `SEC-002`: `conta_id` e `id` do corpo ignorados no `PATCH`/`POST`.
- `SEC-081`: Zod nega jsonb fora do contrato (impede injetar chaves arbitrárias em `cores`/`horarios`).
- `SEC-030`: nenhum caminho de código faz DELETE em `lojas` (o grant não existe; o teste confirma).

## Notas e decisões

- **Área de entrega x zonas:** este módulo guarda só a área-base de atendimento (raio ou lista de
  bairros) em `lojas.area_entrega`. Taxa por bairro/zona e valor do motoboy são de `API-zonas` (Onda 3).
  Quando as zonas existirem, `area_entrega` continua como filtro de "atendemos aqui?".
- **Logo:** upload de arquivo exigiria storage (não decidido na arquitetura). Decisão para a Onda 1:
  só `logo_url` de host allowlisted; upload fica como melhoria futura registrada.
- **Primeira loja:** criada por este módulo, não por `API-conta`; o front chama `POST /conta` e em
  seguida `POST /lojas` no onboarding.
- **Multi-loja consolidado** é Onda 4 (dashboard); aqui só o CRUD por loja.
