# plataforma_numeros (frontend)

## Proposito
Console do OPERADOR (equipe Whaviso): gestao pela plataforma dos numeros de WhatsApp de QUALQUER
loja de QUALQUER conta, para dar suporte. Espelha `backend/apps/api/src/modules/plataforma_numeros`.
Nao e a tela self-service da loja (`canais/numeros`): aqui o operador escolhe a loja alvo primeiro.

## Telas
- `pages/Numeros.tsx` (rota `/plataforma/numeros`): duas etapas.
  - `SeletorLoja`: escolhe a CONTA (busca por nome, min. 2 letras, debounce 300 ms, "Carregar mais"
    por cursor) e depois a LOJA daquela conta (lista da ficha). "Trocar de conta" / "Trocar de loja".
  - Apos escolher a loja, lista os numeros com as acoes conectar, pausar, reativar, reconectar e
    remover (ConfirmDialog pessimista na remocao), espelhando a experiencia de `canais/numeros`.
  - `ConectarNumeroDialog`: conectar (code + phone_number_id + waba_id) ou reconectar (so o code).
    O `codigo` e sensivel: autoComplete off, nunca persistido nem exibido de volta.
- Deixa explicito na UI que e a gestao pela plataforma (suporte) e que so mostra metadados.

## Dados
- Para escolher a loja: `GET /v1/plataforma-usuarios/contas` e `GET /v1/plataforma-usuarios/contas/:id`
  (reusa os endpoints de contas por HTTP; modulo nunca importa modulo).
- Numeros, prefixo `/v1/plataforma-numeros`: `GET /lojas/:lojaId/numeros`, `POST /lojas/:lojaId/numeros`,
  `PATCH /numeros/:id/status`, `POST /numeros/:id/reconectar`. A loja alvo vai SEMPRE na rota.
- Contratos reusados (`@/shared/contracts/_generated`): `numeros_whatsapp` (numeroSaida,
  listaNumerosSaida, numeroConectarEntrada, numeroStatusEntrada, numeroReconectarEntrada) e
  `plataforma_usuarios` (PlataformaContaPagina, PlataformaContaFicha). Nao gera contratos proprios.
- Cache raiz `['plataforma_numeros']`. Rotas de operador: `semLoja: true` (sem `x-loja-id`).

## Privacidade
- So metadados do numero (identificadores da Meta, status, verificacao, data). Nunca o numero em
  claro, o token, nem conteudo da loja. 403 (sem `numeros_plataforma:ver`/`:gerir`) vira "Acesso
  restrito a equipe Whaviso" (`AreaErro`).

## Primitivos locais (replicam o modulo de loja; modulo nunca importa modulo)
`CardNumero`, `StatusNumeroBadge`, `ConectarNumeroDialog`, `SeletorLoja`, `AreaErro`, `rotulos.ts`.
