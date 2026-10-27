# P-funil plataforma_funil

- **ID:** P-funil  ·  **Área:** P  ·  **Onda:** 4
- **Modelo sugerido:** Sonnet  ·  **Status:** `A FAZER`
- **Reivindicado por:** (livre)

## Objetivo

CRM de **aquisição** da Whaviso: cadastrar restaurantes prospectos, movê-los pelos estágios
(`novo -> contato -> proposta -> ativo | perdido`), registrar atividades (nota, ligação, mensagem,
reunião, follow-up com data) e ver a agenda de follow-ups do operador. Ao fechar, o prospecto é
**vinculado à conta** criada pelo cadastro do restaurante.

"Pronto" observável: o operador cria prospecto, muda o estágio com histórico, agenda e conclui
follow-ups, filtra por estágio/responsável/cidade, e vê o quadro (kanban) do funil; telefone do contato
nunca aparece em claro em log nem em listagem.

## Dependências

- `F4` api-core.
- `F3` tenant-auth (escopo de operador).
- `P-clientes` não é bloqueante; o vínculo prospecto -> conta usa apenas `contas.id` lido por
  `SELECT` (sem importar o módulo).

## Contratos e tabelas que toca

- **Dono de escrita:** `prospectos`, `prospecto_atividades` (append-only: `INSERT` e `SELECT`, sem
  `UPDATE` nem `DELETE`).
- **Lê:** `operadores` (responsável), `contas` (nome, para o vínculo).
- **Segredos/PII:** `contato_telefone_hash` (sha256, unique lógico para evitar duplicidade) +
  `contato_telefone_cifrado` (cifra da aplicação via helper do kernel; decifra só no detalhe do
  prospecto, para o operador ligar). Listagens devolvem apenas máscara (`(11) 9****-1234`, últimos 4).
- **Eventos (`eventos`, sem PII):** `prospecto.criado`, `prospecto.estagio_alterado`,
  `prospecto.vinculado`.
- **Contratos Zod:** `ProspectoDTO`, `ProspectoCriar`, `ProspectoPatch`, `AtividadeCriar`,
  `AtividadeDTO`, `FunilQuadro` (contagem e itens por estágio), `AgendaFollowUp`.
- **Rotas:** `GET/POST /plataforma/prospectos`, `GET/PATCH /plataforma/prospectos/:id`,
  `POST /plataforma/prospectos/:id/estagio`, `GET/POST /plataforma/prospectos/:id/atividades`,
  `POST /plataforma/prospectos/:id/vincular-conta`, `GET /plataforma/funil/quadro`,
  `GET /plataforma/funil/agenda`.

## Arquivos (escopo de edição)

- `backend/apps/api/src/modules/plataforma_funil/**`
- `backend/packages/shared/src/contracts/plataforma_funil.ts`
- `backend/apps/api/src/routes.ts` (1 linha)
- `backend/apps/api/test/security/plataforma_funil.*.test.ts`

## Etapas

- [ ] 1. Scaffold + `MODULE.md`  (commit: `feat(plataforma-funil): scaffold do modulo`)
- [ ] 2. Contratos Zod + `gen_contracts`  (commit: `feat(contracts): contratos de plataforma_funil`)
- [ ] 3. Regras puras `estagios.ts`: matriz de transições (`novo -> contato|perdido`,
  `contato -> proposta|perdido|novo`, `proposta -> ativo|perdido|contato`, `perdido -> novo` reabrir,
  `ativo` terminal; `ativo` só via vínculo de conta) e normalização de telefone BR (E.164, hash
  sha256 sobre o normalizado)  (commit: `feat(plataforma-funil): regras de estagio e normalizacao de telefone`)
- [ ] 4. Testes de unidade das regras (transição inválida, telefone com máscara, DDD, 9º dígito)
  (commit: `test(plataforma-funil): regras puras`)
- [ ] 5. CRUD de prospectos: criar (hash+cifra do telefone, detecção de duplicata por hash retorna 409
  com o id existente), editar campos, atribuir responsável (operador ativo), listagem com filtros e
  paginação por cursor, máscara de telefone  (commit: `feat(plataforma-funil): crud de prospectos`)
- [ ] 6. Mudança de estágio: valida transição, `UPDATE prospectos` e `INSERT` de atividade do tipo
  `nota` automática ("estágio X -> Y") na mesma transação, `eventos`  (commit: `feat(plataforma-funil): transicao de estagio com historico`)
- [ ] 7. Atividades (append-only): criar nota/ligação/mensagem/reunião/follow-up com `agendada_para`;
  conclusão de follow-up é uma **nova** atividade referenciando a anterior em `descricao` estruturada
  (sem UPDATE), decisão abaixo  (commit: `feat(plataforma-funil): atividades e follow-ups`)
- [ ] 8. Agenda `GET /funil/agenda`: follow-ups com `agendada_para` até N dias, sem conclusão
  posterior, por responsável (default: o operador logado), usando o índice `prospecto_atividades_agenda`
  (commit: `feat(plataforma-funil): agenda de follow-ups`)
- [ ] 9. Vincular conta: `prospectos.conta_id = :conta`, só se a conta existe e não está vinculada a
  outro prospecto; move para `ativo`; `eventos`  (commit: `feat(plataforma-funil): vinculo prospecto-conta`)
- [ ] 10. Quadro `GET /funil/quadro`: contagem e top N por estágio (agregação em uma query)
  (commit: `feat(plataforma-funil): quadro do funil`)
- [ ] 11. Testes de integração + registro em `routes.ts`  (commit: `test(plataforma-funil): integracao e registro`)
- [ ] Testes passando; lint, typecheck, test
- [ ] Revisão (Opus) do tratamento de PII do prospecto

## Testes e segurança exigidos

- **SEC-003/041**: só operador acessa; membro de loja recebe 403 em todas as rotas.
- **SEC-023/024**: telefone do prospecto só como hash + cifra; um `pg_dump` de banco semeado não contém
  o número em claro; logs e respostas de listagem não trazem o número (redaction cobre `contato_telefone*`
  e `telefone`).
- **SEC-033**: `prospecto_atividades` rejeita `UPDATE` (trigger existente) e não tem `DELETE`; teste por
  `SET ROLE whaviso_api`.
- **SEC-080/081**: filtros parametrizados; Zod limita tamanhos (`descricao` até 2000, `observacoes` até
  4000), enums de estágio/tipo, e-mail válido.
- Unidade/integração: transições válidas e inválidas, duplicata por hash, agenda correta no fuso
  America/Sao_Paulo, vínculo único conta-prospecto.

## Notas e decisões

- **Atividade é imutável** (tabela append-only): "concluir follow-up" é registrar nova atividade com
  `descricao` estruturada `{"conclui": <id>}`; a agenda exclui os concluídos por essa referência.
- **Prospecto é dado de terceiro (LGPD):** coletar só o necessário para o contato comercial; campo
  `origem` é texto livre curto. Sem scraping nem import automático nesta onda.
- **`ativo` não é setável direto**: só pelo vínculo de conta, para o funil nunca mentir sobre quem
  realmente virou cliente.
- Importação em massa (CSV) e automação de follow-up por WhatsApp ficam fora desta onda.
