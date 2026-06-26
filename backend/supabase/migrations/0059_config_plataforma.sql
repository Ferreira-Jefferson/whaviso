-- Chave Pix DA PLATAFORMA (do owner), configurável em runtime pelo painel admin.
--
-- Até aqui a chave Pix do whaviso (a que o usuário paga para recarregar créditos) NÃO
-- existia no sistema: era digitada à mão na conversa do WhatsApp (automação externa).
-- Esta tabela traz a chave para dentro do produto, com o MESMO formato da chave Pix do
-- cobrador (tipo, chave, titular, banco; ver chaves_pix 0012/0016/0044) + um comentário
-- livre. É config SINGLETON (1 linha, id=1), igual a creditos_catalogo (0057): o owner
-- edita pela tela de admin, sem migration.
--
-- A chave NUNCA trafega no HTTP do front (H13.8): só a api (rota de admin) a edita e só
-- o zap a lê para montar a mensagem de compra (template billing.recarga, 0061).
--
-- Numeração: última migration = 0058 (creditos_curva_marcos); esta é a 0059.

create table public.config_plataforma (
  id smallint primary key default 1,
  pix_tipo tipo_chave_pix,                 -- cpf|cnpj|email|telefone|aleatoria (0016)
  pix_chave text,
  pix_titular text,
  pix_banco text,
  pix_comentario text,
  atualizado_em timestamptz not null default now(),
  constraint config_plataforma_unico check (id = 1),
  constraint config_plataforma_chave_tam check (pix_chave is null or char_length(pix_chave) <= 140),
  constraint config_plataforma_titular_tam check (pix_titular is null or char_length(pix_titular) <= 120),
  constraint config_plataforma_banco_tam check (pix_banco is null or char_length(pix_banco) <= 80),
  constraint config_plataforma_comentario_tam check (pix_comentario is null or char_length(pix_comentario) <= 140)
);

-- A linha única nasce VAZIA: o owner preenche a chave pela tela de admin.
insert into public.config_plataforma (id) values (1) on conflict (id) do nothing;

create trigger trg_config_plataforma_atualizado_em
  before update on public.config_plataforma
  for each row execute function public.tocar_atualizado_em();

-- Grants (padrão 0008/0057, sem DELETE). api: o owner edita (select + update).
grant select, update on public.config_plataforma to whaviso_api;
-- zap: lê a chave para montar a mensagem de compra (billing.recarga).
grant select on public.config_plataforma to whaviso_zap;

-- RLS deny-all para anon/authenticated; policies só para os roles de serviço.
alter table public.config_plataforma enable row level security;
create policy api_config_plataforma on public.config_plataforma for all to whaviso_api using (true) with check (true);
create policy zap_config_plataforma on public.config_plataforma for select to whaviso_zap using (true);
