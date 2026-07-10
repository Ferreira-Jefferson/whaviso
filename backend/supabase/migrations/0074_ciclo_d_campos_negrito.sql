-- E12/E13: completa a padronização do formato aninhado nos lembretes do dia D.
--
-- A 0072 padronizou os lembretes multi-campo, mas casava o texto EXATO do catálogo
-- (guarda que protege customização do owner). As duas variantes de `ciclo.d` tinham
-- sido editadas pelo owner e ficaram no formato "corrido" (campos inline numa linha):
--   padrao (ativa):  "Oi, {{1}}. Hoje é o dia do combinado: {{2}}, {{3}}."
--   revisao (aposentada em 0039, ainda visível na aba "Em revisão")
-- Esta migration reescreve as duas para o mesmo padrão aninhado das demais etapas
-- (saudação, linha em branco, *Rótulo*: valor por linha), sem emoji, gênero neutro.
--
-- Match exato do texto atual (mesma guarda da 0072): não sobrescreve se o owner já
-- mexeu de novo. Reseta status_meta='pendente' (o texto mudou -> re-submissão à Meta),
-- como na 0072. Não reativa a revisao (segue aposentada; ver 0039).
--
-- Numeração: última migration = 0073 (templates_ativo_so_aprovado); esta é a 0074.

update public.templates t
   set conteudo          = jsonb_set(t.conteudo, '{texto}', to_jsonb(d.novo::text)),
       status_meta       = 'pendente'::status_meta_template,
       meta_submetido_em = null,
       meta_motivo       = null
  from (values
    ('ciclo.d', 'padrao',
     E'Oi, {{1}}. Hoje é o dia do combinado: {{2}}, {{3}}.',
     E'Olá, {{1}}. Hoje é o dia do combinado:\n\n*Combinado*: {{2}}\n*Valor*: {{3}}'),
    ('ciclo.d', 'revisao',
     E'Oi, {{1}}. Hoje é o dia: {{2}}, {{3}}. Se você já pagou, pode desconsiderar este aviso. 🙂',
     E'Olá, {{1}}. Hoje é o dia do combinado:\n\n*Combinado*: {{2}}\n*Valor*: {{3}}\n\nSe você já pagou, pode desconsiderar este aviso.')
  ) as d(chave, contexto, antigo, novo)
 where t.chave = d.chave
   and t.contexto = d.contexto::template_contexto
   and t.conteudo->>'texto' = d.antigo;
