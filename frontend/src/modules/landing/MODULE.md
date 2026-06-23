# Módulo: landing

Página pública de venda ("Calmo Editorial"): hero, como funciona (ciclo
D-2→D+1), tom da mensagem (WhatsAppPreview ilustrativo), planos/preços e CTA
para /entrar. Layout próprio de marketing (largo), fora do PublicLayout.

**Papel:** público
**Rotas:** /

## Dados (data.ts)
- `GET /v1/billing/planos` (público no backend) → seção de preços. Fallback
  estático quando a api está fora (a página nunca quebra).

> Fronteira: este módulo NUNCA importa de outro módulo. Coordene via `@/shared/*`.
> Páginas exportadas lazy em `index.ts`.
