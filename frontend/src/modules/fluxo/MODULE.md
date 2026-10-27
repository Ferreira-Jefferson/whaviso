# fluxo (frontend)

## Propósito
Construtor do fluxo de conversa do atendente. Rota `/fluxo` (grupo config). Lista os fluxos; abrir um
leva ao **editor estruturado** (lista de etapas, sem canvas): tipo, configuração gerada do catálogo,
destino de cada saída, etapa inicial, adicionar/remover. Ações: salvar rascunho, validar, publicar,
ativar/desativar, histórico de versões (restaurar vira rascunho).

## Entry points
- `index.ts`: export default da página (`lazy(() => import('@/modules/fluxo'))`).

## Dados
- `GET /v1/fluxo/catalogo`, `GET|POST /v1/fluxo`, `GET /:id`, `PUT /:id/rascunho` (controle otimista),
  `POST /:id/rascunho/validar|publicar`, `POST /:id/ativar|desativar`, `GET /:id/versoes`,
  `POST /:id/versoes/:versao/restaurar`.
- Contratos: `@/shared/contracts/_generated/fluxo`. Cache: raiz `['fluxo']`.

## Regras do editor
- A validade do grafo é só do servidor (alcançabilidade, ciclos, etapa obrigatória, ação irreversível
  após confirmação). O cliente não replica regra: salva o rascunho e chama `validar`; publicar com 422
  `grafo_invalido` roda `validar` e lista os problemas.
- O formulário de config sai do JSON Schema do catálogo (`CampoConfig`); chave vazia é removida (padrão do servidor).
- Operações puras em `grafo.ts` (com testes). Cada handle tem no máximo uma ligação; sem ligação = fim do turno.
- Edição não salva fica só em estado local; `atualizado_em_base` evita sobrescrever rascunho alheio (409).
