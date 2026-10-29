-- Índices de performance da leva de auditoria de queries (docs/auditoria-queries.md).
--
-- Cada índice abaixo atende um achado da auditoria. São índices B-tree parciais ou com
-- opclass específica, pensados para o filtro exato de cada caminho quente. Não mudam
-- resultado de query nenhuma: só tiram varredura de tabela.
--
-- Os índices são criados sem CONCURRENTLY (a produção ainda é pequena e a migration roda
-- em transação). Reavaliar para CONCURRENTLY se alguma dessas tabelas já estiver grande no
-- cloud quando este arquivo subir.
--
-- Depende de: pg_trgm (habilitada na 0081) para os índices gin_trgm_ops.

-- ── Hot-path de autorização ────────────────────────────────────────────────
-- conta.vinculosAtivos e plataforma_clientes.usuarioTemVinculo: `membros where user_id = $1
-- and ativo`. Os índices por usuário da 0002 são parciais por loja_id, então o planner cai
-- em varredura. Este índice dedicado atende o filtro direto.
create index membros_user_ativo on public.membros (user_id, criado_em) where ativo;

-- ── Filas de entrega em aberto (despacho / roteirizacao) ───────────────────
-- despacho.pedidosProntos e roteirizacao.elegiveis: fila de entrega pronta para despacho.
create index pedidos_entrega_fila on public.pedidos (loja_id, criado_em, id)
  where modalidade = 'entrega' and status in ('novo', 'em_preparo')
    and corrida_id is null and motoboy_id is null;

-- despacho.motoboysComCarga: contagem de pedidos abertos por motoboy (hoje varre o histórico).
create index pedidos_motoboy_aberto on public.pedidos (loja_id, motoboy_id)
  where status in ('novo', 'em_preparo', 'saiu_entrega');

-- zonas_entrega.listar / listarAtivas: contagem de pedidos abertos por zona.
create index pedidos_zona_aberto on public.pedidos (zona_id)
  where status in ('novo', 'em_preparo', 'saiu_entrega');

-- roteirizacao.enderecosPendentes: `exists` em pedidos por endereço (hoje sem índice em
-- pedidos.endereco_id).
create index pedidos_endereco_aberto on public.pedidos (endereco_id)
  where status in ('novo', 'em_preparo') and corrida_id is null;

-- agendamento.listar e o job que libera agendados: ordenação por agendado_para.
create index pedidos_agenda on public.pedidos (loja_id, agendado_para, id)
  where agendado_para is not null and status in ('rascunho', 'novo');

-- ── proximoCodigo: prefixo indexável no lugar do regex ─────────────────────
-- pedidos/repo_escrita.proximoCodigo (api) e motor_fluxo/repo_escrita.proximoCodigo
-- (atendente): hoje `codigo ~ '^AAMMDD-[0-9]+$'` varre todos os pedidos da loja. Com
-- text_pattern_ops na coluna codigo, `codigo like 'AAMMDD-%'` passa a usar índice.
create index pedidos_codigo_loja_prefixo on public.pedidos (loja_id, codigo text_pattern_ops);

-- ── Pagamentos e faturas por data de pagamento ─────────────────────────────
-- relatorios.formasPagamento: filtra pagamentos por pago_em (o índice da 0008 é por criado_em).
create index pagamentos_loja_pago_em on public.pagamentos (loja_id, pago_em)
  where status = 'pago';

-- plataforma_painel (MRR / receita do mês): faturas pagas por pago_em.
create index faturas_pagas_em on public.faturas (pago_em) where status = 'paga';

-- ── Campanhas: limite de frequência por cliente ────────────────────────────
-- campanhas.enfileirar: o lateral de frequência filtra campanha_envios por (loja_id,
-- cliente_id) com campanha_id diferente; o único índice útil hoje começa por campanha_id.
create index campanha_envios_loja_cliente on public.campanha_envios
  (loja_id, cliente_id, criado_em);

-- ── Console do operador ────────────────────────────────────────────────────
-- plataforma_clientes.listarContas: ordenação e busca de contas.
create index contas_criado_em on public.contas (criado_em desc, id desc);
create index contas_nome_trgm on public.contas using gin (nome gin_trgm_ops);
create index lojas_nome_trgm on public.lojas using gin (nome gin_trgm_ops);

-- plataforma_funil: dedupe por telefone e agregados do painel do operador por criado_em.
create index prospectos_tel_hash on public.prospectos (contato_telefone_hash)
  where contato_telefone_hash is not null;
create index prospectos_criado_em on public.prospectos (criado_em);

-- ── Retroalimentação do RAG (atendente, job entre lojas) ───────────────────
-- retroalimentar_base.coletarRespostasHumanas e coletarPerguntasClientes varrem a tabela
-- mensagens inteira por autor/direcao/criado_em. Índices parciais por tipo de mensagem.
create index mensagens_humano_saida on public.mensagens (criado_em desc)
  where autor = 'humano' and direcao = 'saida';
create index mensagens_cliente_entrada on public.mensagens (criado_em desc)
  where autor = 'cliente' and direcao = 'entrada' and tipo = 'texto';

-- coletarConversasHandoff: `not exists` em rag_feedback por conversa/mensagem e filtro por
-- conversa em humano.
create index rag_feedback_conversa_tipo on public.rag_feedback (conversa_id, tipo)
  where conversa_id is not null;
create index rag_feedback_mensagem_tipo on public.rag_feedback (mensagem_id, tipo)
  where mensagem_id is not null;
create index conversas_humano_desde on public.conversas (humano_desde) where status = 'humano';

-- sinaisPendentesGeracao: sinais novos sem rascunho, ordenados por ocorrencias.
create index rag_feedback_novo on public.rag_feedback (ocorrencias desc, criado_em)
  where status = 'novo' and documento_rascunho_id is null;

-- ── Ingestão de conhecimento (atendente) ───────────────────────────────────
-- drenar_conhecimento: documentos aprovados pendentes de ingestão.
create index documentos_aprovado_em on public.documentos (aprovado_em)
  where status = 'aprovado';

-- ── Limpeza do cache semântico ─────────────────────────────────────────────
-- O cache semântico (RAG) nunca é limpo e cresce sem limite, junto do índice HNSW. O job de
-- limpeza do atendente precisa de DELETE nesta tabela. Cache não é auditoria nem negócio,
-- então o DELETE é permitido aqui (mesma lógica da exceção de templates no CLAUDE.md).
grant delete on public.cache_semantico to whaviso_atendente;
