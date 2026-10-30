-- Renomeia o conceito "cliente" para "usuario" no console do operador (modulo plataforma_clientes
-- vira plataforma_usuarios) e da suporte a 3 fluxos no cadastro de usuario:
--   (a) vincular um usuario a uma loja JA cadastrada (via codigo publico da loja);
--   (b) criar uma conta nova (dono ainda sem loja, que ele mesmo cria depois, POST /v1/lojas);
--   (c) aprovar o acesso de login na hora (sem exigir que a pessoa ja tenha entrado no Whaviso),
--       usando a allowlist de login (0082): a conta fica "pre-provisionada" (dono_user_id null)
--       ate o primeiro login, quando o bootstrap (modulo conta) vincula o dono de verdade.
--
-- 1) lojas.codigo_publico: identificador curto e publico (vai virar o link do cardapio virtual,
--    ainda nao construido; aqui so a coluna). Gerado por default (volatile -> reescreve a tabela e
--    da um valor por linha existente tambem).
alter table public.lojas
  add column codigo_publico text not null default encode(gen_random_bytes(5), 'hex');
create unique index lojas_codigo_publico_uniq on public.lojas (codigo_publico);

-- 2) contas.dono_user_id passa a aceitar NULL: o admin pode pre-criar a conta (com plano) para
--    quem nunca logou; o dono so e vinculado no primeiro login (gate da allowlist).
alter table public.contas alter column dono_user_id drop not null;

-- 3) Renomeia as chaves de permissao 'clientes_plataforma:*' -> 'usuarios_plataforma:*'. UPDATE em
--    vez de apagar+recriar para preservar customizacoes que o admin ja tenha feito na grade
--    (papel_permissoes referencia permissoes por (chave, escopo), sem ON UPDATE CASCADE).
insert into public.permissoes (chave, escopo, rotulo, ordem) values
  ('usuarios_plataforma:ver', 'console', 'Ver usuarios (contas e fichas)', 10),
  ('usuarios_plataforma:criar', 'console', 'Cadastrar usuario (nova conta ou vinculo a loja existente)', 20)
on conflict (chave) do update set escopo = excluded.escopo, rotulo = excluded.rotulo, ordem = excluded.ordem;

update public.papel_permissoes set permissao_chave = 'usuarios_plataforma:ver'
 where permissao_chave = 'clientes_plataforma:ver' and escopo = 'console';
update public.papel_permissoes set permissao_chave = 'usuarios_plataforma:criar'
 where permissao_chave = 'clientes_plataforma:criar' and escopo = 'console';

delete from public.permissoes where chave in ('clientes_plataforma:ver', 'clientes_plataforma:criar');
