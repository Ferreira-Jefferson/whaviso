-- PLACEHOLDER DE NUMERACAO: renumerar na integracao (outro chat mexe em migrations em paralelo;
-- o numero 0074 e provisorio so para o validate_migrations aplicar este arquivo por ultimo).
--
-- Correcao do padrao semeado da grade (achado B4): o papel de console de menor privilegio,
-- `convidado`, foi semeado na 0072 com `cobranca:ver` = true, o que deixava qualquer operador
-- ativo (mesmo o mais baixo) ler assinaturas e faturas de TODOS os tenants. Pela fonte da verdade
-- (docs/pendencias-pos-corte.md, item 14: grade do console, linha `ver fatura` = `-` para
-- convidado) esse papel so ve clientes e o painel de metricas, nunca cobranca.
--
-- A fonte TS (apps/api/src/shared/tenant/catalogo.ts) ja nao inclui `convidado` no padrao de
-- `cobranca:ver`; esta migration alinha o banco (o seed NAO roda no cloud) e mantem a paridade
-- catalogo x grade (ver acessos.test.ts). Alteracao LIMITADA a essa unica celula.

update public.papel_permissoes
   set permitido = false, atualizado_em = now()
 where escopo = 'console' and papel = 'convidado' and permissao_chave = 'cobranca:ver';
