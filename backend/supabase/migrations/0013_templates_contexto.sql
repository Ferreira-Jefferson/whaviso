-- Variante de template para lembretes enviados enquanto o aviso está "em revisão"
-- (status informado_pago): mesma etapa do ciclo, porém com a observação
-- "caso já tenha pago, desconsidere este aviso". O scheduler escolhe a variante
-- 'revisao' quando o aviso está em informado_pago, com fallback para 'padrao'
-- enquanto a variante não estiver aprovada/ativa na Meta (lembretes nunca param).

create type template_contexto as enum ('padrao', 'revisao');

alter table public.templates_mensagem
  add column contexto template_contexto not null default 'padrao';

-- Antes: no máximo um ativo por etapa. Agora: um ativo por (etapa, contexto).
drop index if exists idx_templates_ativo_por_etapa;
create unique index idx_templates_ativo_por_etapa
  on public.templates_mensagem (etapa, contexto) where ativo;
