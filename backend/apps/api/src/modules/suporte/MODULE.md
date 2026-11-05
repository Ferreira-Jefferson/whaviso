# suporte

## Proposito
Suporte com acesso assistido. A LOJA (dono/gerente) abre chamados, troca mensagens com a equipe
Whaviso e concede/revoga um acesso assistido temporario (consentimento) para o operador poder ver
o conteudo da loja. O CONSOLE (operador) ve a fila de chamados de todas as lojas, responde, e
consulta se ha consentimento ativo (nunca concede nem revoga). A loja efetiva na LOJA vem sempre
do escopo (`req.escopo.loja_ativa`); no CONSOLE a loja alvo vem de parametro de ROTA (`:lojaId`),
nunca do corpo (SEC-002).

## Entry points
- `index.ts` -> `suporteRoutes` (LOJA, prefixo `suporte`) e `plataformaSuporteRoutes` (CONSOLE,
  prefixo `plataforma-suporte`), ambos registrados em `src/routes.ts`.
- `criarRotasSuporte()` / `criarRotasPlataformaSuporte()` -> fabricas (uso em teste).

## Especialistas consumidos
- `shared/acesso_suporte` (kernel): grants de acesso assistido (`conceder`, `revogar`,
  `listarPorLoja`; `acessoAtivo`/`registrarUso` sao da ponte). Este modulo NAO toca as tabelas de
  acesso direto.
- `shared/http_errors` (envelope de erro)
- `shared/auth` + `shared/tenant` + `shared/operador` (preHandlers `autenticar`/`escopoLoja`/
  `escopoOperador`/`exigirPermissao`)
- `@whaviso/shared/db` (dados; sql parametrizado) e `@whaviso/shared/contracts` (via `./schemas`)

## Tabelas
- Dono UNICO de `chamados_suporte` e `chamados_suporte_mensagens` (sem DELETE, SEC-030; mensagens
  append-only).
- NAO e dono de `acessos_suporte`/`acessos_suporte_log`: quem detem e o kernel `shared/acesso_suporte`.

## Transicoes de status do chamado
- abrir -> `aberto`
- loja manda mensagem -> `aberto` (volta para a fila, aguardando a equipe)
- operador responde -> `respondido`
- loja encerra (PATCH) -> `resolvido`

## Acesso assistido (consentimento)
- So a LOJA concede/revoga (consentimento do dono). Duracao MAXIMA de 7 dias (168 horas), validada
  no kernel; `expira_em` tem que ser futuro. O operador apenas LE os grants (ver consentimento
  ativo). A ponte que efetivamente libera o conteudo ao operador vive em `shared/tenant` (fora
  deste modulo): quando ha grant ativo, cada leitura grava `acessos_suporte_log` (append-only).

## SEC-003
- O operador le a correspondencia de suporte (chamados/mensagens): permitido. Nenhuma rota de
  console devolve conteudo de loja (conversa/pedido/cliente); isso fica para a ponte.

## Rotas
- LOJA (`/v1/suporte`, `suporte_loja:gerir`): `GET /chamados` · `POST /chamados` ·
  `GET /chamados/:id` · `POST /chamados/:id/mensagens` · `PATCH /chamados/:id` ·
  `GET /acessos` · `POST /acessos` · `POST /acessos/:id/revogar`
- CONSOLE (`/v1/plataforma-suporte`): `GET /chamados` (fila; filtro de status + cursor;
  `suporte_plataforma:ver`) · `GET /chamados/:id` (`:ver`) · `POST /chamados/:id/mensagens`
  (`:atender`) · `GET /lojas/:lojaId/acessos` (`:ver`)

## Contratos
- publica (espelhar no front, `contracts/suporte`): `ChamadoResumo`, `ChamadoMensagem`,
  `ChamadoFicha`, `ListaChamados`, `ChamadoPagina`, `NovoChamado`, `NovaMensagem`, `PatchChamado`,
  `SuporteChamadosQuery`, `AcessoSuporte`, `ListaAcessos`, `NovoAcesso`, enums `statusChamado`/
  `autorChamado`.
- local: `IdParams` (`:id`), `LojaIdParams` (`:lojaId`).

## Testes
- `suporte.test.ts`: integracao + seguranca (abrir/mensagem/responder; conceder/revogar; acesso
  ativo reflete concessao/revogacao/expiracao; SEC-001/002/003; 403 por falta de permissao;
  duracao maxima; console nunca devolve conteudo de loja).
