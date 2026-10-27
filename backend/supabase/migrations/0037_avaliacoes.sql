-- Avaliacao pos-venda do consumidor sobre o pedido entregue.
--
--   avaliacoes  uma linha por pedido (pedido_id unico): nota 1..5 e comentario opcional, ligada
--               ao pedido, ao cliente e a loja. Append-only: a avaliacao registrada nao se edita
--               nem se apaga (sem UPDATE/DELETE para a api). Quem avalia e o consumidor; o painel
--               (loja) so le e agrega, e o registro entra pela integracao da conversa.
-- O comentario e texto livre do consumidor: pode conter dado pessoal, nunca vai para log.

create table public.avaliacoes (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  pedido_id uuid not null references public.pedidos (id),
  cliente_id uuid not null references public.clientes (id),
  nota integer not null check (nota between 1 and 5),
  comentario text,
  criado_em timestamptz not null default now(),
  constraint avaliacoes_comentario_tamanho check (comentario is null or char_length(comentario) between 1 and 1000)
);
-- Uma avaliacao por pedido (chave natural; garante a idempotencia do registro).
create unique index avaliacoes_pedido on public.avaliacoes (pedido_id);
create index avaliacoes_loja_recentes on public.avaliacoes (loja_id, criado_em desc, id desc);
create index avaliacoes_cliente on public.avaliacoes (cliente_id);

alter table public.avaliacoes enable row level security;

-- api: registra e le (SELECT/INSERT). Sem UPDATE/DELETE: avaliacao e append-only.
grant select, insert on public.avaliacoes to whaviso_api;
create policy api_avaliacoes on public.avaliacoes
  for all to whaviso_api using (true) with check (true);
