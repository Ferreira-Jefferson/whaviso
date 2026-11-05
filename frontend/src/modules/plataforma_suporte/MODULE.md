# plataforma_suporte (frontend)

## Proposito
Console do OPERADOR (equipe Whaviso): fila de chamados de QUALQUER loja, resposta aos chamados, e o
visualizador READ-ONLY de conversas de uma loja SOB CONSENTIMENTO ativo (acesso assistido). Espelha
`backend/apps/api/src/modules/suporte` (rotas `/v1/plataforma-suporte/*`).

## Telas
- `pages/Suporte.tsx` (rota `/plataforma/suporte`): fila (`FilaChamados`) + painel (`PainelChamado`).
  - `FilaChamados`: filtro de status (SegmentedControl) + fila por cursor ("Carregar mais").
  - `PainelChamado`: fio de mensagens, caixa de resposta do operador, e o bloco de CONSENTIMENTO:
    - com acesso assistido ativo -> botao que abre o `VisualizadorConversas` (read-only);
    - sem acesso ativo -> aviso para pedir ao cliente conceder (tela de Suporte da loja).
  - `VisualizadorConversas`: lista + thread SOMENTE LEITURA das conversas da loja. Nenhuma acao de
    escrita (nao assume, nao responde, nao encerra). Aviso de que o acesso e auditado.

## Dados
- Prefixo `/v1/plataforma-suporte` (operador, `semLoja: true`): `GET /chamados?status&cursor`,
  `GET /chamados/:id`, `POST /chamados/:id/mensagens`, `GET /lojas/:lojaId/acessos`.
- Conversas (read-only): endpoints EXISTENTES `GET /conversas`, `GET /conversas/:id`,
  `GET /conversas/:id/mensagens` com override de loja por chamada (`lojaId`): o backend so libera
  leitura quando ha acesso assistido ativo para a loja alvo.
- Contratos (`@/shared/contracts/_generated`): `suporte` (ChamadoPagina, ChamadoFicha,
  ChamadoMensagem, ListaAcessos, NovaMensagem) e `conversas` (ConversaListaSaida, ConversaDetalheSaida,
  MensagensSaida). Nao gera contratos proprios.
- Cache raiz `['plataforma_suporte']` (conversas em subchave por loja, nunca cruza com o `['conversas']`
  do painel da propria loja).

## Fronteiras
Modulo nunca importa modulo. A apresentacao read-only das conversas (`conversas_ro.ts`) e uma replica
enxuta de `modules/conversas/estados.ts`, nao um import. 403 (sem `suporte_plataforma:*`) vira "Acesso
restrito a equipe Whaviso" (`AreaErro`).
