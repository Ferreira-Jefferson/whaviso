-- SEC-030: whaviso_api nao tem DELETE em tabela alguma, exceto `templates` (config). A 0090 deu
-- DELETE a whaviso_api em eval_suites/eval_casos ("config, como templates"), mas a api so desativa
-- (coluna `ativo`), nunca apaga: o grant era desnecessario e abria uma excecao nova no SEC-030.
-- Revoga aqui para a lista de excecoes de DELETE da api voltar a ser exatamente {templates}.
revoke delete on public.eval_suites from whaviso_api;
revoke delete on public.eval_casos  from whaviso_api;
