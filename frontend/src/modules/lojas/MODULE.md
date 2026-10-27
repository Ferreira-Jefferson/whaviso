# lojas (frontend)

## Propósito
Gestão das lojas da conta (multi-tenant: uma conta pode ter várias lojas). Lista as lojas,
abre o perfil para criar/editar (nome, endereço, horários e área de entrega), permite tornar
uma loja a ativa do painel e ativar/desativar (só o dono da conta). Rota `/lojas`.

## Entry points
- `index.ts`: export default da página (para `lazy(() => import('@/modules/lojas'))` no registry de rotas).

## Dados
- `GET /v1/lojas` (lista; `incluir_inativas` só vale para o dono), `POST /v1/lojas` (criar),
  `PATCH /v1/lojas/:id` (editar perfil), `POST /v1/lojas/:id/{desativar,reativar}`.
- Contratos: `@/shared/contracts/_generated/lojas` (não redefinir). A validação do payload antes
  do envio usa os mesmos schemas (`LojaCriarEntrada`/`LojaAtualizarEntrada`); a api revalida no servidor.
- Cache: raiz `['lojas']`, a MESMA do `TenantProvider` (seletor de loja do shell). Invalidar essa
  raiz após criar/editar/ativar faz o switcher do topo acompanhar sem import cruzado.
- Seleção da loja ativa reusa `@/shared/tenant` (`useTenant().selecionarLoja`); o shell já tem o seletor.

## Componentes
- `FormularioLoja`: diálogo de criar/editar, com seções de endereço, horários e área.
- `EditorEndereco` / `EditorHorarios` / `EditorAreaEntrega`: editores controlados; montagem e
  validação no formato do contrato ficam no `FormularioLoja`.
- `CardLoja`: item da lista (reusa `AvatarLoja` de `@/shared/tenant`).

## Notas
- Branding (cores/logo) e números de WhatsApp NÃO são editados aqui: têm fluxos próprios
  (`PATCH /v1/lojas/:id/branding` e o módulo `numeros`). O card mostra só a contagem de números.
- Horários em fuso America/Sao_Paulo; faixa que cruza a meia-noite tem `fecha < abre`.
- Desativar/reativar é só do dono; o servidor bloqueia desativar a última loja ativa (erro via toast).
- Ainda não existem no `_generated` contratos de feriados/janela do atendente/estoque: fora de escopo aqui.
