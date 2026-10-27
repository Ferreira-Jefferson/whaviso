# conhecimento (frontend)

## Propósito
Curadoria da base de conhecimento do atendente. Rota `/conhecimento` (grupo config). Três abas:
- **Documentos**: lista com filtros (status/tipo), criar, editar, aprovar, arquivar, versões.
  Editar rascunho altera no lugar; editar aprovado cria nova versão (rascunho).
- **Perguntas de teste** (golden set): cadastrar, desativar/reativar (sem DELETE).
- **Sugestões** (feedback): triar (novo -> em análise), descartar, promover (o dono escreve o documento).

## Entry points
- `index.ts`: export default da página (`lazy(() => import('@/modules/conhecimento'))`).

## Dados
- `/v1/conhecimento/documentos` (GET/POST), `/documentos/:id` (PATCH), `/:id/versoes`, `/:id/aprovar|arquivar`,
  `/avaliacao` (GET/POST, PATCH `/:id`), `/feedback` (GET), `/feedback/:id/triar|descartar|promover`.
- Contratos: `@/shared/contracts/_generated/conhecimento`. Cache: raiz `['conhecimento']`, toda escrita invalida a raiz.
- Trava de conteúdo estável (422 `conteudo_nao_estavel`) vira mensagem amigável (`estados.ts`).

## Componentes
- `Textarea`: primitivo local (mesmo desenho do cardápio; candidato a promover para `@/shared/ui`).
- `DialogDocumento`: formulário compartilhado por criar/editar/promover (corpo só montado com o dialog aberto).
