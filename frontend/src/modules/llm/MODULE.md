# llm (frontend) — Atendente

## Propósito
A IA que atende, reunida numa tela só (rota `/llm`, rótulo "Atendente", grupo Configuração). Três abas:
- **Chave e consumo** (`pages/ConfiguracoesLlm`): chave BYO do provedor (write-only, cifrada no servidor) e consumo.
- **Conhecimento** (`conhecimento/`): o que a IA sabe sobre a loja (documentos, avaliação, feedback do laço RAG).
- **Fluxo** (`fluxo/`): editor visual do grafo de atendimento (canvas React Flow), carregado sob demanda (lazy)
  para não puxar o canvas pesado fora da sua aba.

`pages/Atendente` é o shell de abas (`SegmentedControl`); `index.ts` exporta ele.

## Absorção
As subpastas `conhecimento/` e `fluxo/` eram módulos próprios (`/conhecimento`, `/fluxo`), absorvidos aqui:
tudo que configura o atendente é parte do atendente. Mantêm os próprios `api.ts`/componentes/estados; o
módulo nunca importa outro módulo (só `shared/` e o próprio `llm/`). As rotas antigas saíram do registry.

## Dados
- Chave/consumo: `api.ts` (raiz `['llm']`); chave só escrita, nunca lida de volta.
- Conhecimento: `conhecimento/api.ts`. Fluxo: `fluxo/api.ts` (grafo, versões publicada/rascunho, validação).
- Contratos em `@/shared/contracts/_generated` (llm, conhecimento, fluxo); nunca logar chave.
