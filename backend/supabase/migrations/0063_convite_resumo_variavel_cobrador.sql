-- Padroniza a variável "quem vai receber" do template convite.resumo de `nome_cobrador`
-- para `cobrador`, alinhando com o ciclo, o billing e a paleta do editor (catalogo de
-- variáveis do front). Sem isso, ao editar convite.resumo em /admin/mensagens o owner
-- monta {{n}} com a chave `cobrador`, mas o webhook (responderResumo) só resolvia
-- `nome_cobrador`: a posição ficaria órfã (string vazia no resumo).
--
-- A migration 0037 semeou as variantes 'padrao' e 'revisao' com `nome_cobrador`; o número
-- da posição NÃO muda (o texto segue {{1}}..{{n}}), só o NOME da variável naquela posição.
-- Idempotente: troca apenas o token exato entre aspas e só nas linhas que ainda o têm.
--
-- Numeração: última migration = 0062 (view_combinado_linhas); esta é a 0063.

update public.templates
   set variaveis = replace(variaveis::text, '"nome_cobrador"', '"cobrador"')::jsonb
 where chave = 'convite.resumo'
   and variaveis::text like '%"nome_cobrador"%';
