# suporte (frontend)

## Proposito
Suporte do lado da LOJA (dono/gerente): abrir e conversar em chamados com a equipe Whaviso, e
conceder/revogar o acesso assistido (consentimento) as conversas da loja. Espelha
`backend/apps/api/src/modules/suporte` (rotas `/v1/suporte/*`).

## Telas
- `pages/Suporte.tsx` (rota `/suporte`, grupo Configuração, chave `suporte_loja:gerir`): duas abas.
  - "Chamados": `ListaChamados` (lista + "Abrir chamado") + `PainelChamado` (fio de mensagens, caixa
    de resposta, "Marcar resolvido"). `NovoChamadoDialog` abre um chamado (assunto + 1a mensagem).
  - "Acesso da equipe": `PainelAcessos` concede (`ConcederAcessoDialog`), lista e revoga o acesso
    assistido. Explica que o acesso e so-leitura, temporario, auditado e revogavel a qualquer momento.

## Dados
- Prefixo `/v1/suporte` (LOJA): a loja vem SEMPRE do escopo (`x-loja-id` da loja ativa), nunca do
  corpo (SEC-002) e nunca por `semLoja`/`lojaId` (isso e so do console).
  - `GET /chamados`, `POST /chamados`, `GET /chamados/:id`, `POST /chamados/:id/mensagens`,
    `PATCH /chamados/:id` (status 'resolvido'), `GET /acessos`, `POST /acessos`,
    `POST /acessos/:id/revogar`.
- Contratos (`@/shared/contracts/_generated/suporte`): ChamadoResumo, ChamadoFicha, ChamadoMensagem,
  ListaChamados, ListaAcessos, AcessoSuporte, NovoChamado, NovaMensagem, PatchChamado, NovoAcesso,
  DURACAO_ACESSO_MAX_HORAS. Nao gera contratos proprios.
- Cache raiz `['suporte']`. TanStack Query; apiClient normal (COM x-loja-id).

## Fronteiras
Modulo nunca importa modulo. So consome `@/shared/*` e contratos de `_generated`.
