# acessos_login (API-acessos-login)

Allowlist de login: controle de acesso por e-mail APROVADO. Fecha o bootstrap de conta
(`POST /v1/conta`) para quem o operador ainda nao liberou. Fluxo decidido: **aprovar antes,
conta depois** (ver migration `0082_acessos_login.sql`).

> Nao confundir com o modulo `acessos` (motor de permissoes por tela, `acessos:gerir`). Este
> modulo e a lista de e-mails que podem CRIAR conta; o nome `acessos` ja estava ocupado, dai
> `acessos_login` (prefixo `acessos-login`).

## Rotas (registry: prefixo `acessos-login` -> `/v1/acessos-login/*`)

Qualquer autenticado (sem escopo de loja/operador), so `autenticar`:
- `GET /eu` elegibilidade do PROPRIO usuario: resolve o e-mail pelo token (`plataforma_auth_info`)
  e devolve `{ estado }` (`ativo` | `pendente` | `revogado` | `nao_cadastrado`). Sonda da porta de
  entrada do painel (front-shell). So reporta o caller: nao vaza status de terceiros.

Operador (equipe Whaviso), `config.acesso: 'plataforma'` + `escopoOperador` + permissao
`cobranca:gerir` (JA EXISTENTE; nao foi criada permissao nova):
- `GET  /` lista e-mails (filtro `status`).
- `POST /` adiciona um e-mail (status `pendente`, origem `admin`). E-mail duplicado -> 409.
- `POST /:id/aprovar` status -> `aprovado`, carimba `aprovado_por`/`aprovado_em` e ENFILEIRA o
  boas-vindas em `emails_outbox` (uma vez; guarda `boas_vindas_enviado_em` + dedupe no banco).
- `POST /:id/revogar` status -> `revogado`. Sem DELETE (negocio: estado, nao some).

## Propriedade de dados

- **Escreve `acessos_permitidos`:** no fluxo do operador (adicionar/aprovar/revogar). O modulo
  `plataforma_cobranca` TAMBEM escreve esta tabela no gancho de pagamento (aprovacao automatica do
  dono, origem `pagamento`); coordenacao por banco, sem import entre modulos.
- **Enfileira `emails_outbox`:** via o helper compartilhado `shared/emails_outbox`
  (`enfileirarBoasVindas`). A api so PRODUZ; o zap (`ZAP-enviar-email`) DRENA e envia via Resend.
- **O gate** vive no modulo `conta` (`criarConta`): resolve o e-mail do usuario por
  `plataforma_auth_info` e exige `status = 'aprovado'` aqui antes de criar a 1a conta. Convidado de
  outra conta nao passa por este gate.

## Decisoes

- E-mail unico case-insensitive (indice `lower(email)`); o servico normaliza no schema de entrada.
- Aprovar e idempotente (`coalesce` em `aprovado_por`/`aprovado_em`): reaprovar nao reescreve o
  carimbo nem reenfileira o boas-vindas.
- Nenhum e-mail entra em log (so vai no DTO ao operador e na coluna `para` da outbox).
