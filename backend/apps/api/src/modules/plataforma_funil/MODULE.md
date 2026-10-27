# Módulo plataforma_funil

CRM de aquisição da Whaviso (P-funil): prospectos (restaurantes), estágios, atividades e follow-ups.
Fonte da verdade: `historias/plataforma/funil.md`.

- **Dono de escrita:** `prospectos`, `prospecto_atividades` (append-only: só INSERT/SELECT). **Leitura:** `operadores`, `contas`.
- **Rotas** (`/v1/plataforma-funil/*`): `GET|POST /prospectos`, `GET|PATCH /prospectos/:id`,
  `POST /prospectos/:id/estagio`, `GET|POST /prospectos/:id/atividades`, `POST /prospectos/:id/vincular-conta`,
  `GET /funil/quadro`, `GET /funil/agenda`.
- **Auth:** toda rota é `acesso: 'plataforma'` + `[autenticar, escopoOperador]`. Membro de loja recebe 403. O operador
  que age (`operadores.id`) vem do JWT (`resolverAtor`), nunca do corpo.
- **Estágios** (`estagios.ts`): `novo -> contato|perdido`, `contato -> proposta|perdido|novo`, `proposta -> perdido|contato`,
  `perdido -> novo` (reabrir). `ativo` é terminal e só nasce do vínculo de conta (`vincular-conta`).
  Cada mudança grava, na mesma transação, uma atividade `nota` automática e o evento.
- **Atividade imutável:** concluir follow-up = nova atividade com `descricao` `{"conclui":<id>,"texto":"..."}`. A agenda
  exclui os concluídos por essa marca; descrição livre que imita a marca é recusada (422).
- **PII:** telefone do prospecto só como hash HMAC + cifra AES-GCM (kernel `@whaviso/shared/cifra`); listagem, quadro e
  agenda devolvem só a máscara; o claro sai só em `GET|POST|PATCH` do detalhe. Duplicata por hash: 409
  `prospecto_duplicado` com o id existente na mensagem (serializada por advisory lock).
- **Agenda:** follow-ups até hoje + N dias (America/Sao_Paulo), atrasados sempre incluídos; responsável efetivo =
  responsável do prospecto, ou quem agendou se não houver. Default: operador logado (`todos=true` lista todos).
- **Eventos** (`eventos`, ator `operador`, sem PII): `prospecto.criado`, `prospecto.estagio_alterado`, `prospecto.vinculado`.
- **Testes:** `estagios.test.ts` (puros) e `funil.test.ts` (banco real, role `whaviso_api`).
