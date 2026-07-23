-- E7 (item novo, plano 2026-07-22 grupo 1B): "aprovação de dado incorreto". Hoje o
-- aceite já tem a opção "algum dado está incorreto" (E5 H5.4), mas ela só NOTIFICA o
-- criador (evento `pix_incorreto` da 0035), sem um fluxo estruturado de aprovar/recusar
-- com os dados corrigidos. Este item cobre SÓ o schema + a decisão do cobrador
-- (aprovar/recusar); a ESCRITA do reporte pelo devedor (zap-side, webhook) e a redação
-- da história de aceite ficam com o grupo 1E (wave 2), que roda depois desta migration
-- já aplicada localmente.
--
-- Campos que o devedor pode reportar como incorretos (decidido): valor, data,
-- nome/motivo (agrupados como 'nome_motivo': normalmente reportados juntos, e são os
-- dois campos "descritivos" do combinado). Chave Pix NÃO entra nesta lista (tem o seu
-- próprio sinal dedicado, `pix_incorreto`, 0035).
--
-- SÓ o novo valor de enum nesta migration (numeração: última migration = 0091; esta é
-- 0092). Postgres não permite usar um valor de enum recém-adicionado (ALTER TYPE ... ADD
-- VALUE) na MESMA transação em que ele foi criado (SQLSTATE 55P04, "unsafe use of new
-- value"): o `supabase db push` aplica cada arquivo de migration dentro de uma única
-- transação (ao contrário do `psql -f` avulso do `validate_migrations.sh`, que faz
-- autocommit por statement e por isso não pegava esse erro localmente). Por isso o
-- schema que USA o valor novo (tabela `avisos_reportes`, máquina de estados, view
-- `combinado_linhas`) vai na 0093, um arquivo/transação separado.
alter type status_aviso add value if not exists 'aguardando_aprovacao_dado_incorreto';

alter type tipo_evento add value if not exists 'dado_incorreto_reportado';
alter type tipo_evento add value if not exists 'dado_incorreto_aprovado';
alter type tipo_evento add value if not exists 'dado_incorreto_recusado';
