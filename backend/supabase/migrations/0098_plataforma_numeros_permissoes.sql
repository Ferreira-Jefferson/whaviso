-- Permissoes de CONSOLE para o operador da plataforma gerir numeros de WhatsApp de QUALQUER loja
-- (todas as contas). O cadastro/gestao por loja (self-service) ja existe (modulo numeros_whatsapp,
-- escopo de loja). Estas chaves habilitam a mesma gestao pelo console, sobre a loja alvo passada em
-- params (nunca no corpo), reusando o kernel de numeros. O operador segue SEM acesso a conteudo
-- (SEC-003): isto e so numero + metadado.
--
-- Molde 0072/0073: insere em `permissoes` e semeia `papel_permissoes` so das chaves novas, idempotente.
-- Fonte dos padroes: apps/api/src/shared/tenant/catalogo.ts (teste de paridade DB x catalogo confere
-- chave/escopo/rotulo/ordem). O seed NAO roda no cloud: tudo aqui e migration. Sem DELETE (SEC-030).

insert into public.permissoes (chave, escopo, rotulo, ordem) values
  ('numeros_plataforma:ver', 'console', 'Ver numeros de WhatsApp das lojas (todas as contas)', 150),
  ('numeros_plataforma:gerir', 'console', 'Conectar, pausar e reconectar numeros de qualquer loja', 160)
on conflict (chave) do nothing;

-- Padroes (alem do fixo `admin`, que e sempre tudo): ver -> suporte, operador; gerir -> operador.
with padrao(papel, chave) as (values
  ('suporte', 'numeros_plataforma:ver'),
  ('operador', 'numeros_plataforma:ver'),
  ('operador', 'numeros_plataforma:gerir')
)
insert into public.papel_permissoes (escopo, papel, permissao_chave, permitido)
select 'console', p.papel, pe.chave,
       (p.papel = 'admin' or exists (select 1 from padrao d where d.papel = p.papel and d.chave = pe.chave))
  from (values ('convidado'), ('suporte'), ('financeiro'), ('operador'), ('admin')) as p(papel)
  join public.permissoes pe on pe.escopo = 'console'
 where pe.chave in ('numeros_plataforma:ver', 'numeros_plataforma:gerir')
on conflict (escopo, papel, permissao_chave) do nothing;
