-- Config de pagamento por loja (base do pagamento intermediado via PSP).
--
-- O restaurante escolhe o MODO do Pix (chave_propria = a v1 "copia e cola" de 0008, dinheiro direto
-- e conciliacao manual; intermediado = via PSP, com split e conciliacao por webhook) e QUEM paga a
-- taxa de intermediacao do whaviso (absorve = sai do repasse do restaurante; repassa = somada ao
-- cliente). Cartao, quando habilitado, e sempre intermediado.
--
-- Default conservador: tudo como a v1 (Pix chave propria, sem cartao, loja absorve) ate configurar.
-- As tabelas de recebedor/credencial do PSP e as colunas de cobranca intermediada vem na 0086.
-- Dinheiro em centavos. Sem DELETE (config muda de estado, nunca some).

create type pix_modo as enum ('chave_propria', 'intermediado');
create type encargo_modo as enum ('absorve', 'repassa');

create table public.loja_pagamento_config (
  loja_id uuid primary key references public.lojas (id) on delete cascade,
  pix_modo pix_modo not null default 'chave_propria',
  encargo_modo encargo_modo not null default 'absorve',
  cartao_habilitado boolean not null default false,
  atualizado_em timestamptz not null default now()
);

create trigger trg_loja_pagamento_config_atualizado_em before update on public.loja_pagamento_config
  for each row execute function public.tocar_atualizado_em();

alter table public.loja_pagamento_config enable row level security;
grant select, insert, update on public.loja_pagamento_config to whaviso_api;
create policy api_loja_pagamento_config on public.loja_pagamento_config
  for all to whaviso_api using (true) with check (true);
