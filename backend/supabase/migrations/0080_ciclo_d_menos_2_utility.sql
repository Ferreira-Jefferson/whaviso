-- E6: reescreve o 'ciclo.d_menos_2/padrao' para ENQUADRAMENTO TRANSACIONAL e assim manter
-- a categoria UTILITY na Meta. Diagnostico definitivo (Graph API rejected_reason do template):
-- 'INCORRECT_CATEGORY'. NAO era estrutura, botao nem nome (rename tambem foi recusado com o
-- mesmo motivo): o TEXTO "{{2}} pediu para eu te lembrar" (lembrete em nome de um TERCEIRO)
-- e classificado pela Meta como MARKETING, e submetido como UTILITY -> rejeicao sincrona na
-- checagem basica. As irmas do ciclo ("Hoje e o dia" / "Amanha e o dia") sao transacionais e
-- passaram como UTILITY.
--
-- Decisao de produto (dono, 2026-07-12): manter UTILITY (barato, consistente, sem opt-in de
-- marketing) e reescrever o D-2 como lembrete transacional do proprio combinado, mantendo a
-- referencia a quem recebe ("com {{2}}"), sem o enquadramento de solicitacao de terceiro.
-- historia 06 (fonte da verdade) atualizada junto.
--
-- categoria e variaveis NAO mudam (UTILITY; {{1}}..{{5}} sequenciais, todos usados). NAO zera
-- meta_template_id: no cloud a versao ja existe na Meta (rejeitada), entao a resubmissao vira
-- EDIT com o texto novo (re-analise real, agora com conteudo utility). Volta status_meta=
-- 'pendente' e limpa meta_submetido_em/meta_motivo. Guarda por texto atual -> idempotente.
--
-- Numeracao: ultima migration = 0079; esta e a 0080.

update public.templates
   set conteudo          = jsonb_set(
         conteudo, '{texto}',
         to_jsonb(E'Olá, {{1}}. Faltam 2 dias para o combinado com {{2}}:\n\n*Combinado*: {{3}}\n*Valor*: {{4}}\n*Data*: {{5}}\n\nSe você já pagou, pode desconsiderar este aviso.'::text)),
       status_meta       = 'pendente'::status_meta_template,
       meta_submetido_em = null,
       meta_motivo       = null
 where chave = 'ciclo.d_menos_2'
   and contexto = 'padrao'::template_contexto
   and conteudo->>'texto' = E'Olá, {{1}}. {{2}} pediu para eu te lembrar do combinado:\n\n*Combinado*: {{3}}\n*Valor*: {{4}}\n*Data*: {{5}}\n\nSe você já pagou, pode desconsiderar este aviso.';
