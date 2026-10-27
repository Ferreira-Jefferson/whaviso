# plataforma_cobranca (frontend)

## Proposito
Cobranca restaurante -> Whaviso. Duas audiencias: console do OPERADOR (default export) e visao do
DONO DA LOJA (`MinhaFaturaPage`). Espelha `backend/apps/api/src/modules/plataforma_cobranca`.

## Telas (operador, `pages/Cobranca.tsx`, abas)
- Faturas (`PainelFaturas`): filtros situacao e competencia (12 meses), "Dar baixa" (conferencia manual do
  Pix; opcao `reativar`) e "Cancelar" (ConfirmDialog).
- Assinaturas (`PainelAssinaturas`): lista por situacao, "Nova assinatura" (conta por busca, trial ou
  ativa, valor, dia 1..28) e edicao (valor/vencimento para faturas futuras; transicoes suspender, ativar,
  cancelar com confirmacao). Cancelada e terminal.
- Rotinas (`PainelRotinas`): gerar faturas (competencia) e apurar atrasos, ambas com confirmacao e
  mensagem de rate limit (429).
- Dono da loja: `pages/MinhaFatura.tsx` (`MinhaFaturaPage`): so a propria conta; 403 se nao for dono.

## Dados
- `/v1/plataforma-cobranca/*` (operador: `semLoja`), `/minha-fatura` (escopo de loja, com x-loja-id).
- Nome da conta: o DTO so tem `conta_id`; resolvido por HTTP em `/plataforma-clientes/contas` (limite 100,
  melhor esforco; resto cai em "Conta <id curto>"). Sem import do modulo plataforma_clientes.
- Cache raiz `['plataforma_cobranca']`; toda mutacao invalida a raiz.
- Contratos: `@/shared/contracts/_generated/plataforma_cobranca`.

## Regras de exibicao
- Dinheiro em centavos (`MoneyText`/`MoneyInput`). Datas de negocio ('YYYY-MM-DD') sem conversao de fuso
  (`rotulos.ts`); instantes em America/Sao_Paulo. Competencia nunca calculada no cliente: so listada
  para filtro; ausente = mes corrente no servidor.
- Transicoes em `rotulos.ts` espelham o servidor so para UX; o servidor decide (409).

## Primitivos locais
`AreaErro`, `SeletorConta`, `rotulos.ts`.
