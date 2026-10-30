-- Permissoes do console para a Central de Evals (evals:ver, evals:rodar). Padrao: operador (e admin,
-- papel fixo). Upsert idempotente com DO NOTHING na grade: re-rodar nao sobrescreve o que o admin
-- editou. Fonte dos padroes: apps/api/src/shared/tenant/catalogo.ts (um teste confere paridade).

insert into public.permissoes (chave, escopo, rotulo, ordem) values
  ('evals:ver', 'console', 'Ver a central de evals (suites, casos e execucoes)', 130),
  ('evals:rodar', 'console', 'Gerir suites e casos e disparar execucoes de evals', 140)
on conflict (chave) do update set escopo = excluded.escopo, rotulo = excluded.rotulo, ordem = excluded.ordem;

insert into public.papel_permissoes (escopo, papel, permissao_chave, permitido)
select 'console', p.papel, c.chave, (p.papel in ('operador', 'admin'))
from (values ('convidado'), ('suporte'), ('financeiro'), ('operador'), ('admin')) as p(papel)
cross join (values ('evals:ver'), ('evals:rodar')) as c(chave)
on conflict (escopo, papel, permissao_chave) do nothing;
