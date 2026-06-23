# Módulo: auth

Login SEM senha (Google via Identity Services + signInWithIdToken, e WhatsApp OTP;
cadastro fundido no mesmo fluxo) e onboarding. A fachada de auth fica em `@/shared/supabase`.
O Google roda na nossa origem (sem redirect pro supabase.co), então o consentimento
mostra o nosso app. Componente: `components/GoogleLoginButton`.

**Papel:** público
**Rotas:** /entrar, /onboarding

> Fronteira: este módulo NUNCA importa de outro módulo. Coordene via `@/shared/*`
> (ui, contracts, format, api_client, auth) ou contratos. Páginas exportadas
> lazy em `index.ts`. Lógica de negócio chega nas fases 1-7 (Fase 0 = placeholders).
