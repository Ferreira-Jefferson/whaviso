-- Migra a família COBRADOR (notificação "pagamento informado") para a tabela
-- unificada `templates` e aposenta `templates_cobrador`. Passo 2 da consolidação
-- (depois da 0022, que criou a unificada e migrou resposta.*). O zap passa a ler
-- o template do cobrador por chave ('cobrador.<tipo>') via shared/templates, e o
-- painel edita pela MESMA tela (/admin/mensagens/:chave). A outbox
-- `notificacoes_cobrador` NÃO muda: é fila, não template.

-- 1. Copia o que existir em templates_cobrador (no cloud traz os dados reais; em
--    banco novo a tabela está vazia, pois o seed roda depois das migrations).
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, versao, status_meta, ativo, criado_em)
select 'cobrador.' || tipo, 'padrao', nome_meta, idioma,
       jsonb_build_object('texto', corpo), variaveis, 1, status_meta, ativo, criado_em
from public.templates_cobrador;

-- 2. Garante o catálogo da notificação ao cobrador (banco novo, onde a cópia acima
--    não trouxe nada). Mesmos valores do antigo seed; não duplica se já veio do passo 1.
--    GATED: nasce pendente+inativa (o drainer só roda com template ativo).
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'cobrador.pagamento_informado', 'padrao', 'whaviso_cobrador_pagamento_informado', 'pt_BR',
       jsonb_build_object(
         'texto',
         E'Oi, {{1}}. {{2}} informou que pagou: {{3}}, {{4}}. Confira e confirme o recebimento no painel. 🙂'
       ),
       '["cobrador","nome_devedor","motivo","valor"]'::jsonb, 'pendente', false
where not exists (
  select 1 from public.templates where chave = 'cobrador.pagamento_informado'
);

-- 3. Aposenta a tabela antiga (já migrada). Nada mais a referencia: a api nunca
--    teve endpoints de cobrador e o zap passa a ler da unificada.
drop table public.templates_cobrador;
