-- Remove a permissao `conta:gerir` do motor de autorizacao editavel (grade da tela Acessos).
--
-- A 0072 semeou `conta:gerir` (escopo loja) na tabela `permissoes` e uma linha por papel de loja em
-- `papel_permissoes`. A chave era enganosa: o rotulo dizia "Conta, membros e assinatura", mas a
-- administracao da propria CONTA (renomear, membros, convites, assinatura) nunca passou pela grade,
-- e e FIXA de dono (checada no codigo: conta/contexto.ts). A unica rota que lia essa celula era
-- desativar/reativar loja (lojas/routes.ts), tambem operacao de dono nao delegavel, agora checada
-- direto pelo papel. Com a chave fora do catalogo TS (shared/tenant/catalogo.ts), tirar as linhas
-- correspondentes do banco mantem a paridade catalogo x banco (teste de integracao do modulo acessos).
--
-- DELETE e permitido aqui porque a migration roda como superusuario; o `whaviso_api` segue SEM DELETE
-- nessas tabelas (nenhum grant novo). Ordem: primeiro a grade (filha pela FK), depois o catalogo (pai).

delete from public.papel_permissoes where permissao_chave = 'conta:gerir';
delete from public.permissoes where chave = 'conta:gerir';

-- `ordem` no catalogo TS e posicional (posicao na lista x 10). Como `conta:gerir` era a 1a permissao
-- de loja (ordem 10), tira-la desloca todas as demais de loja em -10 no TS. Realinha o banco para
-- manter a paridade catalogo x banco (teste do modulo acessos). `ordem` so ordena a grade na tela.
update public.permissoes set ordem = ordem - 10 where escopo = 'loja';
