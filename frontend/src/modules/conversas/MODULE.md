# conversas (frontend)

## Propósito
Atendimento pelo WhatsApp da loja ativa: lista de conversas (filtro por estado e busca por nome),
painel da conversa selecionada com o histórico em bolhas por autor (cliente, automação, atendente,
sistema), resposta como atendente e encerramento. Rota `/conversas`. Duas colunas no desktop
(lista | conversa); no mobile, uma coluna com navegação (lista → painel com botão voltar).

## Entry points
- `index.ts`: export default da página (para `lazy(() => import('@/modules/conversas'))` no registry de rotas).

## Dados (api.ts)
- `GET /v1/conversas` (lista, filtro `status`/`busca`), `GET /v1/conversas/:id` (detalhe + janela 24h
  + `tem_atendente`/`atendido_por_mim`), `GET /v1/conversas/:id/mensagens` (histórico paginado para
  trás, `useInfiniteQuery`), `POST /v1/conversas/:id/mensagens` (responder como humano),
  `POST /v1/conversas/:id/assumir` e `/devolver` (handoff), `POST /v1/conversas/:id/encerrar`.
- Contratos: `@/shared/contracts/_generated/conversas` e enums (`statusConversa`, `direcaoMensagem`,
  `tipoMensagem`, `autorMensagem`). Não redefinir.
- Cache: raiz `['conversas']`. O realtime (`conversa.mensagem`, `conversa.handoff`) invalida essa raiz
  via `MAPA_INVALIDACAO`; o painel também assina `conversa.mensagem` só para rolar até o fim.

## Notas
- PII: os DTOs nunca trazem telefone; o cliente aparece por `nome`/`rotulo`. Nada sensível é exibido ou logado.
- A caixa de resposta só habilita quando **eu** sou o atendente responsável (`status = humano` e
  `atendido_por_mim`), com janela de 24h aberta e número conectado; os demais casos mostram o motivo do
  bloqueio, espelhando os 409/403 da api (`conversa_com_ia`, `nao_e_o_atendente`, `janela_fechada`,
  `numero_indisponivel`, `conversa_encerrada`).
- Handoff: o cabeçalho do painel traz **Assumir atendimento** quando a conversa está reivindicável
  (`ia`, `aguardando`, ou `humano` sem atendente) e **Devolver** quando é a minha conversa. O servidor
  decide o estado (claim atômico, 422 na disputa, 403 se não for o atendente); a tela só espelha os
  botões a partir de `tem_atendente`/`atendido_por_mim`. O realtime `conversa.handoff` já invalida a raiz
  `['conversas']`, então o painel reflete quem assumiu/devolveu ao vivo. **Encerrar** segue disponível em
  qualquer estado não encerrado.

## Primitivos locais (candidatos a promover)
- Nenhum. A tela usa só primitivos de `@/shared/ui`. As bolhas de mensagem (`components/Mensagem.tsx`)
  são específicas do atendimento (bolha bidirecional por autor, diferente do `WhatsAppPreview`, que é
  preview de template de uma bolha só de saída) e ficam no módulo.
