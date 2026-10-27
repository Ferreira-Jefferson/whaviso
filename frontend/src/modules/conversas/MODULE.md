# conversas (frontend)

## Propósito
Atendimento pelo WhatsApp da loja ativa: lista de conversas (filtro por estado e busca por nome),
painel da conversa selecionada com o histórico em bolhas por autor (cliente, automação, atendente,
sistema), resposta como atendente e encerramento. Rota `/conversas`. Duas colunas no desktop
(lista | conversa); no mobile, uma coluna com navegação (lista → painel com botão voltar).

## Entry points
- `index.ts`: export default da página (para `lazy(() => import('@/modules/conversas'))` no registry de rotas).

## Dados (api.ts)
- `GET /v1/conversas` (lista, filtro `status`/`busca`), `GET /v1/conversas/:id` (detalhe + janela 24h),
  `GET /v1/conversas/:id/mensagens` (histórico paginado para trás, `useInfiniteQuery`),
  `POST /v1/conversas/:id/mensagens` (responder como humano), `POST /v1/conversas/:id/encerrar`.
- Contratos: `@/shared/contracts/_generated/conversas` e enums (`statusConversa`, `direcaoMensagem`,
  `tipoMensagem`, `autorMensagem`). Não redefinir.
- Cache: raiz `['conversas']`. O realtime (`conversa.mensagem`, `conversa.handoff`) invalida essa raiz
  via `MAPA_INVALIDACAO`; o painel também assina `conversa.mensagem` só para rolar até o fim.

## Notas
- PII: os DTOs nunca trazem telefone; o cliente aparece por `nome`/`rotulo`. Nada sensível é exibido ou logado.
- A caixa de resposta só habilita quando o contrato permite responder (conversa em `humano`, janela de
  24h aberta e número conectado); os demais casos mostram o motivo do bloqueio, espelhando os 409 da api
  (`conversa_com_ia`, `janela_fechada`, `numero_indisponivel`, `conversa_encerrada`).
- Handoff (assumir a conversa da automação / devolver para a automação) **não existe no contrato de
  conversas** (o backend declara que é responsabilidade de um módulo de API-handoff ainda não exposto).
  Esta tela não inventa rota: quando a conversa está com a automação, a resposta fica bloqueada com a
  explicação, e a única ação de estado disponível é **Encerrar** (válida para qualquer estado não encerrado).
  Quando o endpoint de assumir/devolver existir, ligar aqui (botão no cabeçalho do painel).

## Primitivos locais (candidatos a promover)
- Nenhum. A tela usa só primitivos de `@/shared/ui`. As bolhas de mensagem (`components/Mensagem.tsx`)
  são específicas do atendimento (bolha bidirecional por autor, diferente do `WhatsAppPreview`, que é
  preview de template de uma bolha só de saída) e ficam no módulo.
