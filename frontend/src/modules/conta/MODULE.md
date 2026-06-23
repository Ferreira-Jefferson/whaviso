# Módulo: conta

Conta do COBRADOR: perfil (nome, telefone) e chaves Pix.
(A conta do DEVEDOR é o módulo `devedor` → ContaDevedor.)
Login é sem senha (Google/WhatsApp), então não há troca de senha aqui.

**Papel:** user (área `/app`)
**Rotas:** /app/conta

## Dados
- Perfil: `GET/PATCH /v1/perfil` via helpers do shared (`usePerfil`, `atualizarPerfil`, `recarregarPerfil`).
- Chaves Pix: `shared/pix` (`useChavesPix`, `useCriarChavePix`, `useAtualizarChavePix`).

> Fronteira: este módulo NUNCA importa de outro módulo (nem `auth` nem `devedor`).
> Coordene via `@/shared/*` (ui, contracts, format, api_client, auth, supabase).
> Páginas exportadas lazy em `index.ts`.
