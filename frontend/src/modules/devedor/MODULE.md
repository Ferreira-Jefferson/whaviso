# Módulo: devedor

Área autenticada do devedor: combinados ativos, detalhe com "Já paguei",
histórico e conta. Mobile-first (o devedor chega pelo celular, via WhatsApp).

**Papel:** user na área `/meus`, liberada por **existência de vínculo de devedor** (`avisos.devedor_profile_id == uid`), nunca por role. "Devedor" é relacional, não identidade: o mesmo `user` é cobrador em `/app` e devedor aqui.
**Rotas:** `/meus`, `/meus/combinados/:id`, `/meus/historico`, `/meus/conta`

## Telas
- **`/meus`** (`MeusCombinados`): combinados ativos (aguardando aceite + no ciclo),
  pendentes em destaque. EmptyState quando não há vínculo (estado legítimo, risco nº 1).
- **`/meus/combinados/:id`** (`DetalheCombinado`): dados (valor, data, motivo, Pix),
  CycleTimeline (envios reais), histórico de eventos. Ações **"Já paguei"** e
  **"Encerrar lembretes"**. "Já paguei" → card "aguardando confirmação do cobrador".
- **`/meus/historico`** (`Historico`): combinados terminais (pago/cancelado/expirado);
  filtro por status na URL (`?status=`).
- **`/meus/conta`** (`ContaDevedor`): perfil (GET/PATCH `/v1/perfil` via shared/auth) +
  troca de senha (supabase auth via shared/supabase).

## Mapa real das rotas do backend (api) usadas
- `GET /v1/avisos`: o backend filtra por `(cobrador_id OR devedor_profile_id) = uid`;
  no front filtramos os itens em que o usuário é o **devedor**. NÃO existe rota
  `/v1/meus` nem `/v1/combinados` dedicada; a filtragem por vínculo é do backend.
- `GET /v1/avisos/:id`: `buscarAvisoVisivel` também libera o devedor; **expõe o Pix**
  (`pix_chave`) ao devedor, que é o que ele precisa para pagar. (Telefone do devedor
  também volta, mas não é exibido na UI do devedor.)
- `POST /v1/avisos/:id/marcar-pago-devedor`: "Já paguei" (`programado → informado_pago`).
  Idempotente: repetir quando já em revisão/pago devolve o estado atual (200).

## Lacunas do backend (degradação graciosa; não inventamos comportamento)
1. **`GET /v1/avisos/:id/envios`**: NÃO existe. A CycleTimeline cai em estado
   "indisponível" (Banner informativo), igual à Fase 4.
2. **`GET /v1/avisos/:id/eventos`**: NÃO existe. O histórico in-app idem.
3. **Opt-out LOGADO**: NÃO existe rota autenticada. O único opt-out é o **público**
   `POST /v1/acao/:token` (exige o token de ação, que o devedor logado não possui).
   A UI consome `POST /v1/avisos/:id/encerrar-lembretes` (shape coerente) e, em 404,
   informa que o opt-out deve ser feito pelo botão do WhatsApp. **Precisa ser criado
   no backend** (`recebimentos/` ou `acoes_devedor/`, autenticado, `programado → optout/
   expirado`, registrando evento `optout`).
4. **Card "aguardando confirmação"**: como o backend leva direto a `pago`, exibimos
   o card "aguardando confirmação do cobrador" com base no sucesso local da mutação.
   Se o produto quiser um estado intermediário real ("aguardando_confirmacao"), ele
   precisa existir no schema/transições do backend.

## Guard por vínculo (`RequireVinculoDevedor` em app/guards.tsx)
owner entra direto; qualquer `user` faz uma checagem mínima via `GET /v1/avisos`
(libera se houver aviso com `devedor_profile_id == uid`). A query vive no hook
compartilhado `useTemVinculoDevedor` (`shared/auth`), reusado pelo guard e pelo
cross-link do AppShell. A bottom-nav é escolhida pela **seção da URL** (`/app`,
`/meus`, `/admin`), não pela role; então `/meus` sempre mostra a nav de `/meus`.

> Fronteira: este módulo NUNCA importa de outro módulo. Coordena via `@/shared/*`
> (ui, contracts, format, api_client, auth, supabase). Páginas lazy em `index.ts`.
