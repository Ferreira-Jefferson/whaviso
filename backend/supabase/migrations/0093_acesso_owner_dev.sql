-- Seed anti-lockout do owner de dev/teste: libera a conta do dono do sistema (toTestAndDevelopment)
-- tanto na allowlist de login (acessos_permitidos) quanto como operador admin do console (operadores).
--
-- Contexto: a semente anti-lockout da 0082 so aprova jefferson.ferreira@olimpiapartners.com.br, e nao
-- existe seed de `operadores` em nenhuma migration. Por isso a conta de owner usada em dev/teste caia no
-- gate de login (nao cadastrada) e tambem nao era reconhecida como operador (403 em /plataforma-painel/eu,
-- flash para /pedidos e volta para /entrar). Decidido com o dono: essa conta deve ter OS DOIS acessos
-- (app da loja via allowlist + console via operador admin).
--
-- Vai em MIGRATION (upsert) porque o seed nao roda no cloud. O operador resolve o user_id pelo e-mail via
-- auth.users; se a conta ainda nao logou (sem linha em auth.users), o insert e no-op (nenhuma linha
-- selecionada), sem erro: basta reaplicar depois do primeiro login, ou o login ja passa pela allowlist.

insert into public.acessos_permitidos (email, status, origem, aprovado_em)
values ('totestanddevelopment@gmail.com', 'aprovado', 'admin', now())
on conflict (lower(email)) do update set status = 'aprovado', aprovado_em = coalesce(public.acessos_permitidos.aprovado_em, now());

insert into public.operadores (user_id, nome, papel, ativo)
select u.id, 'Owner de testes', 'admin', true
from auth.users u
where lower(u.email) = lower('totestanddevelopment@gmail.com')
on conflict (user_id) do update set papel = 'admin', ativo = true;
