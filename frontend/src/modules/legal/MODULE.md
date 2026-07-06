# Módulo: legal

Páginas jurídicas públicas do site: Política de Privacidade (LGPD) e Termos de
Uso. Conteúdo estático, sem acesso a dado de servidor. Layout próprio
(`LegalLayout`, coluna de leitura larga) com o rodapé do site (`RodapeSite`).

**Papel:** público
**Rotas:** /politica-de-privacidade, /termos-de-uso

## Estrutura
- `components/legal-ui.tsx` — blocos de apresentação (DocumentoLegal, Secao, P,
  Lista, BaseLegal, LinkExterno, Email), alinhados ao design system.
- `pages/PoliticaPrivacidade.tsx`, `pages/TermosUso.tsx` — o conteúdo.

## Linguagem
O texto exibido segue as Regras de Ouro (Épico 13): vocabulário aprovado
(aviso/lembrete/combinado/crédito/envio/saldo/recarga), sem travessão, neutro
quanto a gênero. Alterar o conteúdo exige manter essas regras (o lint barra).

> Fronteira: este módulo NUNCA importa de outro módulo. Coordene via `@/shared/*`.
> Páginas exportadas lazy em `index.ts`.
