# lojas (frontend)

## Propósito
Gestão das lojas da conta (multi-tenant: uma conta pode ter várias lojas). Lista as lojas,
abre o perfil para criar/editar (nome, endereço e área de entrega), permite tornar uma loja a
ativa do painel e ativar/desativar (só o dono da conta). Reúne também a disponibilidade da loja
ativa (horário de atendimento, janela de agendamento e exceções; fonte única na loja, o atendente
não tem horário próprio). Rota `/lojas`.

## Entry points
- `index.ts`: export default da página (para `lazy(() => import('@/modules/lojas'))` no registry de rotas).

## Dados
- `GET /v1/lojas` (lista; `incluir_inativas` só vale para o dono), `POST /v1/lojas` (criar),
  `PATCH /v1/lojas/:id` (editar perfil), `POST /v1/lojas/:id/{desativar,reativar}`.
- Disponibilidade (escopo = loja ativa, via header do api_client): `GET/POST/PATCH /v1/disponibilidade/horarios`,
  `GET/PUT /v1/disponibilidade/agendamento` (modo `desligado|faixa|24h`), `GET/POST /v1/disponibilidade/excecoes`,
  `GET /v1/disponibilidade/agora` (`aceitando_agora` + `modo_atendente`). Cache raiz `['disponibilidade']`.
- Contratos: `@/shared/contracts/_generated/{lojas,disponibilidade}` (não redefinir). A validação do payload
  antes do envio usa os mesmos schemas; a api revalida no servidor.
- Cache: raiz `['lojas']`, a MESMA do `TenantProvider` (seletor de loja do shell). Invalidar essa
  raiz após criar/editar/ativar faz o switcher do topo acompanhar sem import cruzado.
- Seleção da loja ativa reusa `@/shared/tenant` (`useTenant().selecionarLoja`); o shell já tem o seletor.

## Componentes
- `FormularioLoja`: diálogo de criar/editar, com seções de endereço e área de entrega.
- `EditorEndereco` / `EditorAreaEntrega`: editores controlados; montagem e validação no formato do
  contrato ficam no `FormularioLoja`.
- `CardLoja`: item da lista (reusa `AvatarLoja` de `@/shared/tenant`).
- `disponibilidade/`: subárea da loja (fonte única). `Painel` compõe `EstadoAgora` + abas
  `EditorHorarioAtendimento` / `EditorAgendamento` (3 modos) / `EditorExcecoes`, sobre a loja ativa.

## Notas
- Branding (cores/logo) e números de WhatsApp NÃO são editados aqui: têm fluxos próprios
  (`PATCH /v1/lojas/:id/branding` e o módulo `numeros`). O card mostra só a contagem de números.
- Horário de atendimento = quando a loja aceita pedido ao vivo (o atendente opera nesse horário; não
  há horário próprio do atendente). Fuso America/Sao_Paulo; faixa que cruza a meia-noite tem `fecha <= abre`.
- O campo legado `loja.horarios` deixou de ser editado pela UI (o `PATCH /lojas` ainda o aceita, mas a
  tela não o envia): o horário é o da disponibilidade.
- Disponibilidade só para dono/gerente da loja ativa (atendente não gere). Desativar/reativar loja é só
  do dono; o servidor bloqueia desativar a última loja ativa (erro via toast).
