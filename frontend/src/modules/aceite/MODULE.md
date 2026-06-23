# Módulo: aceite

Fluxo público por token: aceite do devedor, ações dos botões do WhatsApp e opt-out.

**Papel:** público
**Rotas:** /aceite/:token, /aviso/:token, /sair-lembretes/:token

> Fronteira: este módulo NUNCA importa de outro módulo. Coordene via `@/shared/*`
> (ui, contracts, format, api_client, auth) ou contratos. Páginas exportadas
> lazy em `index.ts`.

## Estado (Fase 3, implementado)
- `data.ts`: TanStack Query: `useAceiteInfo` (GET público), `useAceitar` (POST JWT
  idempotente), `useAcao` (POST público idempotente). Tudo via `@/shared/api_client`
  (REST `/v1`); nunca SELECT anônimo (RLS deny-all).
- `pages/Aceite.tsx`: coração: ramifica pelo `status` do GET; em `aguardando_aceite`
  mostra resumo + prévia ilustrativa + form signup/login inline (alterna ao detectar
  e-mail já cadastrado), cria sessão e chama o aceite. Idempotente → recibo, não erro.
- `pages/AcaoAviso.tsx`: `/aviso/:token`: "Já paguei" / "Encerrar lembretes"
  (ConfirmDialog antes do opt-out), sem login.
- `pages/SairLembretes.tsx`: opt-out em 1 clique + recibo.
- `components/`: ResumoCombinado, PreviaCiclo (ilustrativa, não calcula etapas),
  Transparencia (opt-out visível).

## Mapa de estados do token (descoberto na api)
| Situação | api | UI |
|---|---|---|
| GET token inexistente/inválido | 404 `nao_encontrado` | recibo "Link indisponível" |
| GET status `aguardando_aceite` | 200 | resumo + form de aceite |
| GET status `programado`/`pago`/`cancelado`/`expirado` | 200 | recibo do estado |
| POST aceite mesmo usuário 2ª vez | 200 `ja_aceito:true` | recibo "confirmado" |
| POST aceite outro usuário | 409 `aviso_indisponivel` | banner amigável |
| POST aceite expirado | 422 `aceite_expirado` | banner amigável |
| POST acao terminal | 200 `aplicado:false` | recibo do estado atual |
| qualquer rota :token | 429 `limite_excedido` (10/min/IP) | banner "tente em instantes" |
