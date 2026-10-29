-- Motor de autorizacao EDITAVEL por tela (item 14). As permissoes saem do codigo fixo e vao
-- para o banco: o admin liga/desliga celulas da grade (papel x permissao) na tela Acessos.
-- Grade GLOBAL (vale para todas as contas). Papeis sao FIXOS (nao customizaveis):
--   console: convidado, suporte, financeiro, operador, admin
--   loja:    convidado (novo, so leitura), atendente, gerente, dono
-- `admin` (console) e `dono` (loja) sao SEMPRE tudo e nao sao editaveis (anti-lockout, por
-- CHECK). `acessos:gerir` nunca e delegavel a outro papel (CHECK).
-- Os PADROES semeados reproduzem o comportamento anterior ao motor para os papeis que ja
-- existiam (operador/admin e dono/gerente/atendente); papeis novos sao aditivos.
-- Semeado por upsert idempotente (o seed NAO roda no cloud). Sem DELETE (negado ao whaviso_api).
-- A fonte dos padroes e apps/api/src/shared/tenant/catalogo.ts (um teste confere paridade).

alter type public.papel_membro add value if not exists 'convidado';
alter type public.papel_operador add value if not exists 'convidado';
alter type public.papel_operador add value if not exists 'suporte';
alter type public.papel_operador add value if not exists 'financeiro';

create table public.permissoes (
  chave text primary key,
  escopo text not null check (escopo in ('console', 'loja')),
  rotulo text not null check (length(btrim(rotulo)) between 1 and 120),
  ordem integer not null default 0,
  constraint permissoes_chave_escopo unique (chave, escopo)
);

-- papel em text (nao enum): a grade nao depende de ALTER TYPE e o CHECK fecha o conjunto.
create table public.papel_permissoes (
  escopo text not null,
  papel text not null,
  permissao_chave text not null,
  permitido boolean not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  primary key (escopo, papel, permissao_chave),
  foreign key (permissao_chave, escopo) references public.permissoes (chave, escopo),
  constraint papel_permissoes_papel check (
    (escopo = 'console' and papel in ('convidado', 'suporte', 'financeiro', 'operador', 'admin'))
    or (escopo = 'loja' and papel in ('convidado', 'atendente', 'gerente', 'dono'))
  ),
  -- anti-lockout: o papel fixo nunca perde permissao.
  constraint papel_permissoes_fixo check (permitido or papel not in ('admin', 'dono')),
  -- a gestao de acessos nao e delegavel.
  constraint papel_permissoes_acessos check (
    permissao_chave <> 'acessos:gerir' or papel = 'admin' or not permitido
  )
);

alter table public.permissoes enable row level security;
alter table public.papel_permissoes enable row level security;
grant select on public.permissoes to whaviso_api;
grant select, insert, update on public.papel_permissoes to whaviso_api;
create policy api_permissoes on public.permissoes for all to whaviso_api using (true) with check (true);
create policy api_papel_permissoes on public.papel_permissoes for all to whaviso_api using (true) with check (true);

insert into public.permissoes (chave, escopo, rotulo, ordem) values
  ('clientes_plataforma:ver', 'console', 'Ver clientes (contas e fichas)', 10),
  ('clientes_plataforma:criar', 'console', 'Cadastrar cliente (provisionar conta)', 20),
  ('cobranca:ver', 'console', 'Ver assinaturas e faturas', 30),
  ('cobranca:gerir', 'console', 'Gerir assinaturas, dar baixa e gerar faturas', 40),
  ('planos:gerir', 'console', 'Gerir catalogo de planos', 50),
  ('funil:ver', 'console', 'Ver funil e prospectos', 60),
  ('funil:gerir', 'console', 'Gerir funil e prospectos', 70),
  ('painel:ver', 'console', 'Ver painel (necessario para entrar no console)', 80),
  ('custos_plataforma:ver', 'console', 'Ver custos da plataforma', 90),
  ('equipe:gerir', 'console', 'Gerir equipe da plataforma', 100),
  ('chaves_api:gerir', 'console', 'Gerir chaves de API das contas', 110),
  ('acessos:gerir', 'console', 'Gerir acessos (esta grade)', 120),
  ('conta:gerir', 'loja', 'Conta, membros e assinatura', 10),
  ('loja:gerir', 'loja', 'Configuracao da loja (cardapio, zonas, numeros, IA)', 20),
  ('lojas:gerir', 'loja', 'Editar dados, branding, pausa e capacidade da loja', 30),
  ('pedidos:ver', 'loja', 'Ver pedidos', 40),
  ('pedidos:gerir', 'loja', 'Gerir pedidos', 50),
  ('conversas:atender', 'loja', 'Atender conversas', 60),
  ('relatorios:ver', 'loja', 'Ver relatorios e metricas', 70),
  ('clientes:ver', 'loja', 'Ver clientes', 80),
  ('clientes:gerir', 'loja', 'Gerir clientes e enderecos', 90),
  ('dados_sensiveis:revelar', 'loja', 'Revelar telefone e Pix em claro', 100),
  ('pessoas:ver', 'loja', 'Ver equipe da loja (pessoas)', 110),
  ('pessoas:gerir', 'loja', 'Gerir equipe da loja (pessoas)', 120),
  ('fiscal:ver', 'loja', 'Ver notas fiscais', 130),
  ('fiscal:gerir', 'loja', 'Emitir e cancelar notas fiscais', 140),
  ('fiscal:configurar', 'loja', 'Configurar credencial do emissor fiscal', 150),
  ('custos:ver', 'loja', 'Ver custos da loja', 160),
  ('contas_pagar:ver', 'loja', 'Ver contas a pagar', 170),
  ('contas_pagar:gerir', 'loja', 'Gerir contas a pagar e fornecedores', 180),
  ('promocoes:ver', 'loja', 'Ver promocoes', 190),
  ('promocoes:gerir', 'loja', 'Gerir promocoes', 200)
on conflict (chave) do update set escopo = excluded.escopo, rotulo = excluded.rotulo, ordem = excluded.ordem;

-- Grade: uma linha por (papel do escopo x permissao do escopo); permitido = padrao do catalogo.
-- Re-rodar NAO sobrescreve o que o admin editou (do nothing), exceto garantir o papel fixo.
with padrao(escopo, papel, chave) as (values
  ('console', 'convidado', 'clientes_plataforma:ver'),
  ('console', 'suporte', 'clientes_plataforma:ver'),
  ('console', 'financeiro', 'clientes_plataforma:ver'),
  ('console', 'operador', 'clientes_plataforma:ver'),
  ('console', 'admin', 'clientes_plataforma:ver'),
  ('console', 'admin', 'clientes_plataforma:criar'),
  ('console', 'convidado', 'cobranca:ver'),
  ('console', 'suporte', 'cobranca:ver'),
  ('console', 'financeiro', 'cobranca:ver'),
  ('console', 'operador', 'cobranca:ver'),
  ('console', 'admin', 'cobranca:ver'),
  ('console', 'financeiro', 'cobranca:gerir'),
  ('console', 'operador', 'cobranca:gerir'),
  ('console', 'admin', 'cobranca:gerir'),
  ('console', 'financeiro', 'planos:gerir'),
  ('console', 'admin', 'planos:gerir'),
  ('console', 'operador', 'funil:ver'),
  ('console', 'admin', 'funil:ver'),
  ('console', 'operador', 'funil:gerir'),
  ('console', 'admin', 'funil:gerir'),
  ('console', 'convidado', 'painel:ver'),
  ('console', 'suporte', 'painel:ver'),
  ('console', 'financeiro', 'painel:ver'),
  ('console', 'operador', 'painel:ver'),
  ('console', 'admin', 'painel:ver'),
  ('console', 'financeiro', 'custos_plataforma:ver'),
  ('console', 'operador', 'custos_plataforma:ver'),
  ('console', 'admin', 'custos_plataforma:ver'),
  ('console', 'admin', 'equipe:gerir'),
  ('console', 'admin', 'chaves_api:gerir'),
  ('console', 'admin', 'acessos:gerir'),
  ('loja', 'dono', 'conta:gerir'),
  ('loja', 'gerente', 'loja:gerir'),
  ('loja', 'dono', 'loja:gerir'),
  ('loja', 'gerente', 'lojas:gerir'),
  ('loja', 'dono', 'lojas:gerir'),
  ('loja', 'convidado', 'pedidos:ver'),
  ('loja', 'atendente', 'pedidos:ver'),
  ('loja', 'gerente', 'pedidos:ver'),
  ('loja', 'dono', 'pedidos:ver'),
  ('loja', 'atendente', 'pedidos:gerir'),
  ('loja', 'gerente', 'pedidos:gerir'),
  ('loja', 'dono', 'pedidos:gerir'),
  ('loja', 'atendente', 'conversas:atender'),
  ('loja', 'gerente', 'conversas:atender'),
  ('loja', 'dono', 'conversas:atender'),
  ('loja', 'convidado', 'relatorios:ver'),
  ('loja', 'gerente', 'relatorios:ver'),
  ('loja', 'dono', 'relatorios:ver'),
  ('loja', 'convidado', 'clientes:ver'),
  ('loja', 'atendente', 'clientes:ver'),
  ('loja', 'gerente', 'clientes:ver'),
  ('loja', 'dono', 'clientes:ver'),
  ('loja', 'atendente', 'clientes:gerir'),
  ('loja', 'gerente', 'clientes:gerir'),
  ('loja', 'dono', 'clientes:gerir'),
  ('loja', 'gerente', 'dados_sensiveis:revelar'),
  ('loja', 'dono', 'dados_sensiveis:revelar'),
  ('loja', 'gerente', 'pessoas:ver'),
  ('loja', 'dono', 'pessoas:ver'),
  ('loja', 'gerente', 'pessoas:gerir'),
  ('loja', 'dono', 'pessoas:gerir'),
  ('loja', 'gerente', 'fiscal:ver'),
  ('loja', 'dono', 'fiscal:ver'),
  ('loja', 'gerente', 'fiscal:gerir'),
  ('loja', 'dono', 'fiscal:gerir'),
  ('loja', 'dono', 'fiscal:configurar'),
  ('loja', 'gerente', 'custos:ver'),
  ('loja', 'dono', 'custos:ver'),
  ('loja', 'gerente', 'contas_pagar:ver'),
  ('loja', 'dono', 'contas_pagar:ver'),
  ('loja', 'gerente', 'contas_pagar:gerir'),
  ('loja', 'dono', 'contas_pagar:gerir'),
  ('loja', 'gerente', 'promocoes:ver'),
  ('loja', 'dono', 'promocoes:ver'),
  ('loja', 'gerente', 'promocoes:gerir'),
  ('loja', 'dono', 'promocoes:gerir')
),
papeis(escopo, papel) as (values
  ('console', 'convidado'), ('console', 'suporte'), ('console', 'financeiro'), ('console', 'operador'), ('console', 'admin'),
  ('loja', 'convidado'), ('loja', 'atendente'), ('loja', 'gerente'), ('loja', 'dono')
)
insert into public.papel_permissoes (escopo, papel, permissao_chave, permitido)
select p.escopo, p.papel, pe.chave,
       (p.papel in ('admin', 'dono') or exists (
          select 1 from padrao d where d.escopo = p.escopo and d.papel = p.papel and d.chave = pe.chave))
  from papeis p
  join public.permissoes pe on pe.escopo = p.escopo
on conflict (escopo, papel, permissao_chave) do update
  set permitido = true
  where public.papel_permissoes.papel in ('admin', 'dono');
