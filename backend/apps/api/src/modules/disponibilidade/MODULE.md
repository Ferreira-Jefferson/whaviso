# disponibilidade

## Proposito
Quando a loja atende e aceita pedidos, e quando o atendente (IA) pode responder. Estende o
dominio de loja com tres configuracoes por loja: horarios de funcionamento (varias faixas por dia
da semana), janela do atendente (dias/horario em que a IA responde) e excecoes/feriados (datas em
que a loja fecha ou muda o horario). O estado "aceitando agora" / "atendente pode responder" NAO e
persistido: e derivado dos dados + agora em America/Sao_Paulo.

## Entry points
- `index.ts`: `disponibilidadeRoutes` (registrar em `src/routes.ts`) e `criarDisponibilidadeRoutes()`.
- Rotas (`/v1/disponibilidade`): `GET /horarios`, `POST /horarios`, `PATCH /horarios/:id`,
  `POST /horarios/:id/desativar`; `GET /janela`, `PUT /janela`; `GET /excecoes`, `POST /excecoes`,
  `POST /excecoes/:id/desativar`; `GET /agora` (estado derivado).
- Leitura: qualquer membro da loja (`escopoLoja`). Escrita: gestor (dono/gerente), via
  `exigirPermissao('loja:gerir')` (atendente nao tem a permissao).

## Especialistas consumidos
- `@whaviso/shared/db` (consultar/sql/comTransacao), `@whaviso/shared/datas` (TZ America/Sao_Paulo),
  `@whaviso/shared/contracts`; `shared/tenant` via `app.escopoLoja`/`app.exigirPermissao`;
  `shared/http_errors`. A loja efetiva vem SO do escopo (header `x-loja-id`), nunca do corpo/query.

## Tabelas (migration 0024)
- dono de: `horarios_funcionamento`, `janela_atendente`, `excecoes_disponibilidade`
  (insert/update; sem DELETE: remocao e logica via `ativo`). Multi-tenant por `loja_id`.
- `whaviso_atendente` tem SELECT nas tres (le para decidir se atende/responde; o motor consome depois).
- escreve auditoria em `eventos` (`disponibilidade.horario_alterado|janela_alterada|excecao_alterada`,
  detalhes = so `user_id`, sem PII).

## Decisoes
- Sobreposicao de faixas do mesmo dia e barrada no service (`horario_sobreposto`, 422), pois depende
  do fuso e do estado `ativo`; a nao-sobreposicao nao esta no banco.
- Excecao: indice unico `(loja_id, data) where ativo` -> uma excecao ativa por data; desativar e
  recadastrar a mesma data e possivel (sem DELETE).
- Horas em "HH:mm" (America/Sao_Paulo); datas de excecao em "YYYY-MM-DD"; banco em UTC.
- Faixas e janela podem cruzar a meia-noite (`fecha <= abre`). `calculo.ts` tem as funcoes puras
  `lojaAceitandoAgora` e `atendentePodeResponder` (testadas sem I/O).
