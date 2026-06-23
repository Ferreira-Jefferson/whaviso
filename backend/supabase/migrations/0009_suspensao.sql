-- Suspensão de conta (owner). Conta suspensa fica bloqueada na api: toda requisição
-- autenticada retorna 403 `conta_suspensa`. Não apaga dados; reativar volta ao normal.
-- whaviso_api já tem UPDATE em public.profiles (0008): sem novos grants, sem DELETE.

alter table public.profiles
  add column suspenso boolean not null default false;
