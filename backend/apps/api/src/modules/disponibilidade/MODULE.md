# disponibilidade

## Proposito
Quando a loja atende e aceita pedidos (fonte unica na loja; o atendente nao tem horario proprio).
Estende o dominio de loja com tres configuracoes por loja: horarios de funcionamento (varias faixas
por dia da semana), janela de agendamento (modo desligado|faixa|24h) e excecoes/feriados (datas em
que a loja fecha ou muda o horario). O estado "aceitando agora" e o modo do atendente
(atendimento|agendamento|fechado) NAO sao persistidos: sao derivados dos dados + agora em
America/Sao_Paulo pela funcao pura compartilhada `@whaviso/shared/disponibilidade`.

## Entry points
- `index.ts`: `disponibilidadeRoutes` (registrar em `src/routes.ts`) e `criarDisponibilidadeRoutes()`.
- Rotas (`/v1/disponibilidade`): `GET /horarios`, `POST /horarios`, `PATCH /horarios/:id`,
  `POST /horarios/:id/desativar`; `GET /agendamento`, `PUT /agendamento`; `GET /excecoes`,
  `POST /excecoes`, `POST /excecoes/:id/desativar`; `GET /agora` (estado derivado).
- Leitura: qualquer membro da loja (`escopoLoja`). Escrita: gestor (dono/gerente), via
  `exigirPermissao('loja:gerir')` (atendente nao tem a permissao).

## Especialistas consumidos
- `@whaviso/shared/db` (consultar/sql/comTransacao), `@whaviso/shared/datas` (TZ America/Sao_Paulo),
  `@whaviso/shared/contracts`; `shared/tenant` via `app.escopoLoja`/`app.exigirPermissao`;
  `shared/http_errors`. A loja efetiva vem SO do escopo (header `x-loja-id`), nunca do corpo/query.

## Tabelas (migrations 0024 e 0060)
- dono de: `horarios_funcionamento`, `agendamento_config` (ex-`janela_atendente`, renomeada na 0060
  com coluna `modo`, sem `ativo`), `excecoes_disponibilidade` (insert/update; sem DELETE: remocao e
  logica via `ativo`). Multi-tenant por `loja_id`.
- `whaviso_atendente` tem SELECT nas tres (le para decidir o modo; o motor consome depois).
- escreve auditoria em `eventos` (`disponibilidade.horario_alterado|agendamento_alterado|excecao_alterada`,
  detalhes = so `user_id`, sem PII).

## Decisoes
- Sobreposicao de faixas do mesmo dia e barrada no service (`horario_sobreposto`, 422), pois depende
  do fuso e do estado `ativo`; a nao-sobreposicao nao esta no banco.
- Excecao: indice unico `(loja_id, data) where ativo` -> uma excecao ativa por data; desativar e
  recadastrar a mesma data e possivel (sem DELETE).
- Horas em "HH:mm" (America/Sao_Paulo); datas de excecao em "YYYY-MM-DD"; banco em UTC.
- Faixas e janela de agendamento podem cruzar a meia-noite (`fecha <= abre`). A derivacao e pura e
  mora no kernel `@whaviso/shared/disponibilidade` (`lojaAceitandoAgora`, `dentroAgendamento`,
  `modoAtendente`), consumida igual pela api e pelo motor do atendente, testada sem I/O. O service
  so le o banco e repassa ao kernel; nao ha `calculo.ts` local.
- `GET /agendamento`: default `desligado` quando a loja ainda nao configurou (nunca ha `null`); o
  `atualizado_em` do default e o instante da consulta.
