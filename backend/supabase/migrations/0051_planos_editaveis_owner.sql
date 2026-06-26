-- E11 (Planos H11.11): o owner passa a EDITAR o catálogo de planos (preço, limites e
-- recursos) pela tela de admin, em runtime. Até aqui o catálogo era somente leitura
-- para a api (`whaviso_api` só tinha grant select; ver 0008) e só mudava por migration.
--
-- Evolução da fonte da verdade (decisão 2026-06-25, ver historias/11-planos-billing.md):
-- a migration SEMEIA os valores iniciais; a partir daí o OWNER é a fonte da verdade e
-- edita no cloud pela tela. Migrations futuras NÃO devem re-upsertar valores de planos
-- já existentes (só inserir planos novos, se houver) para não sobrescrever o que o owner
-- ajustou em produção. A autorização "só owner" é imposta na api (requireRole('owner')
-- no PATCH /v1/admin/planos/:id); aqui só liberamos o UPDATE para o papel da api.
--
-- Regras de ouro: chega ao cloud via `supabase db push`. Numeração: última = 0050;
-- esta é 0051.

grant update on public.planos to whaviso_api;

create policy api_planos_update on public.planos
  for update to whaviso_api using (true) with check (true);
