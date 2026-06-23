-- Templates UNIFICADOS por chave (a casa futura de TODA mensagem do produto).
--
-- Hoje há dois espelhos de template (templates_mensagem por etapa, templates_cobrador
-- por tipo) e várias mensagens sem tabela nenhuma (respostas a botão, OTP, convite),
-- com texto cravado no código do zap. Isto é um débito técnico: a regra do projeto é "o zap é
-- transporte burro, toda mensagem é um template". Esta tabela é o modelo único:
-- chaveada por `chave` (ex.: 'resposta.ja_paguei', 'ciclo.d_menos_1', 'cobrador.pagamento_informado'),
-- com `conteudo` ESTRUTURADO em jsonb (texto + botões + mídia), de modo que o
-- transporte só lê a estrutura e envia, sem conhecer regra de negócio.
--
-- Migração transicional: a família 'resposta.*' nasce AQUI (sai do hardcoded); o
-- ciclo e o cobrador continuam nas tabelas atuais e migram para cá nas próximas etapas.
--
-- Formato de `conteudo`:
--   {
--     "texto": "Oi {{1}}, ...",                 -- {{n}} resolvido na ordem de `variaveis`
--     "botoes": [{ "acao": "ja_paguei", "rotulo": "Já paguei" }],  -- acao é conhecida pelo código
--     "midia":  { "tipo": "imagem|video|audio|documento", "url": "..." }
--   }
-- `acao` do botão é COMPORTAMENTO (mora no código, ex.: ja_paguei/ver_pix/optout/aceite/recusa);
-- só o `rotulo` é editável. Por isso `acao` é validada na api (Zod), não por enum no banco.

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  chave text not null,
  contexto template_contexto not null default 'padrao',
  nome_meta text not null,
  idioma text not null default 'pt_BR',
  conteudo jsonb not null,
  variaveis jsonb not null default '[]'::jsonb,
  versao integer not null default 1,
  status_meta status_meta_template not null default 'pendente',
  ativo boolean not null default false,
  criado_em timestamptz not null default now(),
  constraint templates_unif_versao_positiva check (versao > 0),
  -- Regra de ouro nº1 no banco: nenhum vocabulário proibido em texto OU rótulo.
  -- Mantido em sincronia com PALAVRAS_PROIBIDAS_PATTERN em packages/shared/contracts/linguagem.ts.
  constraint templates_unif_linguagem_limpa
    check (conteudo::text !~* '(d[ií]vida|devendo|atras(o|ad)|cobran[çc]a|inadimpl)')
);

-- No máximo um template ativo por (chave, contexto).
create unique index idx_templates_unif_ativo_por_chave on public.templates (chave, contexto) where ativo;
create unique index idx_templates_unif_nome_versao on public.templates (nome_meta, versao);

-- Grants (padrão da 0008/0018): api é dona da configuração (inclui DELETE de versões,
-- como em templates_mensagem); o zap só lê para enviar.
grant select, insert, update, delete on public.templates to whaviso_api;
grant select on public.templates to whaviso_zap;

-- RLS deny-all para anon/authenticated; policies só para os roles de serviço.
alter table public.templates enable row level security;
create policy api_templates_unif on public.templates for all to whaviso_api using (true) with check (true);
create policy zap_templates_unif on public.templates for select to whaviso_zap using (true);

-- Seed da família resposta.* (respostas imediatas aos botões do WhatsApp). É o texto
-- que hoje está hardcoded em apps/zap/.../webhook_whatsapp/service.ts. Catálogo vai em
-- MIGRATION (o seed não roda no cloud). Nascem aprovadas + ativas: é o texto vigente.
insert into public.templates (chave, nome_meta, conteudo, variaveis, status_meta, ativo) values
  ('resposta.ja_paguei', 'resposta_ja_paguei',
   '{"texto":"Recebemos sua informação de pagamento! O responsável vai conferir e confirmar. Se já tiver pago, pode desconsiderar os próximos lembretes. 🙂"}'::jsonb,
   '[]'::jsonb, 'aprovado', true),
  ('resposta.optout', 'resposta_optout',
   '{"texto":"Pronto! Você não receberá mais lembretes sobre este combinado. 🙂"}'::jsonb,
   '[]'::jsonb, 'aprovado', true),
  ('resposta.ver_pix', 'resposta_ver_pix',
   '{"texto":"Chave Pix:\n{{1}}"}'::jsonb,
   '["pix_chave"]'::jsonb, 'aprovado', true),
  ('resposta.sem_pix', 'resposta_sem_pix',
   '{"texto":"Nenhuma chave Pix foi cadastrada para este combinado."}'::jsonb,
   '[]'::jsonb, 'aprovado', true),
  ('resposta.aceite', 'resposta_aceite',
   '{"texto":"Combinado confirmado! Vamos te enviar os lembretes acordados. 🙂"}'::jsonb,
   '[]'::jsonb, 'aprovado', true),
  ('resposta.recusa', 'resposta_recusa',
   '{"texto":"Tudo bem, combinado não confirmado. Não enviaremos lembretes. 🙂"}'::jsonb,
   '[]'::jsonb, 'aprovado', true);
