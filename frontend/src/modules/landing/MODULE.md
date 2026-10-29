# Módulo: landing

Página pública em `/`: apresenta o produto (pedidos de restaurante por WhatsApp) e
leva a `/entrar` pelo botão Entrar. Conteúdo estático, sem dado de servidor. Quem já
tem sessão nunca a vê (o guard `RedirectSeLogado` na árvore de rotas manda para a home).

**Papel:** público
**Rotas:** /

## Estrutura
- `pages/Landing.tsx`: a página.

> Fronteira: este módulo NUNCA importa de outro módulo. Coordene via `@/shared/*`.
