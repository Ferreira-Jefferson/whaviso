-- E12/E13: conclui a padronização do ciclo.d (a 0074 pegou a variante revisao, mas a
-- padrao escapou). O texto salvo da padrao tinha uma QUEBRA DE LINHA no fim
-- ("...{{3}}.\n") deixada pela edição do owner, então o match exato da 0074 não casou.
-- Aqui a comparação ignora espaços/quebras no fim (rtrim) para pegar essa variante.
--
-- Só reescreve se o corpo (sem o espaço final) for exatamente o formato corrido antigo:
-- não sobrescreve se o owner já mexeu de novo. Reseta status_meta='pendente' (texto
-- mudou -> re-submissão à Meta), como nas 0072/0074.
--
-- Numeração: última migration = 0074 (ciclo_d_campos_negrito); esta é a 0075.

update public.templates
   set conteudo          = jsonb_set(
                             conteudo, '{texto}',
                             to_jsonb(E'Olá, {{1}}. Hoje é o dia do combinado:\n\n*Combinado*: {{2}}\n*Valor*: {{3}}'::text)
                           ),
       status_meta       = 'pendente'::status_meta_template,
       meta_submetido_em = null,
       meta_motivo       = null
 where chave = 'ciclo.d'
   and contexto = 'padrao'
   and rtrim(conteudo->>'texto', E' \n\r\t') = E'Oi, {{1}}. Hoje é o dia do combinado: {{2}}, {{3}}.';
