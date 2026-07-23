-- Grupo 1G (docs/feedback-2026-07-22.md, item 20): corrige texto orfao do
-- empurraozinho de D+1 (H6.5, ciclo.d_mais_1/revisao).
--
-- Contexto: a 0039 ja trouxe o texto do empurraozinho (H6.5) e ativou esta variante.
-- Depois, a 0087/0088 (rodadas so no CLOUD; a propria 0087 documenta que sao NO-OP em
-- banco de DEV) tiraram o emoji de fecho desta mensagem criando uma NOVA versao
-- ('whaviso_d1_revisao_2', pendente, meta_acao='criar') e, na 0088, ajustaram essa nova
-- versao para nao terminar em variavel (regra da Meta), acrescentando o fecho
-- "Assim que confirmarem, voce recebe o aviso por aqui.". Essa versao ficou ORFA:
-- existe so no cloud (nao reproduzida por migration) e segue pendente, nunca
-- submetida/aprovada pelo painel (nao passa de correcao ad hoc). Em banco de DEV a
-- versao ativa nunca ganhou o fecho novo, entao os dois ambientes divergem.
--
-- Este item NAO e sobre reintroduzir "pode desconsiderar": essa promessa e feita,
-- corretamente, em resposta.ja_paguei (texto livre, fora deste grupo). O empurraozinho
-- de D+1 so avisa que o outro lado ainda nao confirmou; por isso o fecho escolhido e
-- neutro ("assim que confirmarem, voce recebe o aviso por aqui"), sem prometer que os
-- lembretes param (H6/H8: so param quando o cobrador confirma o pagamento).
--
-- Como ciclo.d_mais_1 e template DE VERDADE (comoTemplate: true, inicia conversa fora
-- da janela de 24h), a correcao nasce como NOVA VERSAO pendente (meta_acao='criar'),
-- nunca editando a versao aprovada/ativa em uso: precisa passar pelo fluxo de submissao
-- + aprovacao da Meta (H12.5) antes que o owner possa ativa-la pelo painel
-- (/admin/mensagens/ciclo.d_mais_1, variante "Em revisao"). Isso NAO e instantaneo (a
-- Meta leva de minutos a horas, as vezes dias, para revisar).
--
-- Idempotencia: so insere se NENHUMA versao desta chave/contexto ja tiver este texto
-- exato (cobre reaplicar a migration e o caso do cloud, onde a versao
-- 'whaviso_d1_revisao_2' da 0088 ja tem este texto: o INSERT vira NO-OP la, sem duplicar).
-- Nome/versao seguem a mesma derivacao usada pelo servidor (POST /admin/mensagens): base
-- do nome_meta mais recente sem sufixo numerico + proximo numero da chave/contexto.
--
-- Guarda de AMBIENTE (mesmo sinal usado na 0068): so roda onde ja existe alguma versao
-- desta chave/contexto com `meta_template_id` preenchido, ou seja, que ja foi de fato
-- criada na Meta (CLOUD real). Em banco de DEV nenhuma linha tem meta_template_id (nunca
-- fala com a Meta de verdade), entao esta migration e NO-OP la -- necessario porque o
-- seed (supabase/seed.sql, fora do escopo deste grupo) reativa TODA linha da tabela
-- `templates` incondicionalmente ao final; duas versoes ativas na mesma (chave, contexto)
-- violam o indice unico idx_templates_unif_ativo_por_chave. Precedente identico ao das
-- 0087/0088 (tambem documentadas como NO-OP em DEV pelo mesmo motivo).
--
-- Numeracao: ultima migration = 0095 (billing_comprovantes, grupo 1D); os numeros
-- 0092 a 0095 e 0098/0099 sao de outros grupos (nao tocados aqui). Esta e a 0096,
-- reservada para o grupo 1G (templates/mensagens admin).

insert into public.templates
  (chave, contexto, nome_meta, idioma, conteudo, variaveis, versao, status_meta, ativo, categoria, exemplos, meta_acao)
select
  t.chave,
  t.contexto,
  regexp_replace(t.nome_meta, '_[0-9]+$', '')
    || '_' || ((select max(x.versao) from public.templates x where x.chave = t.chave and x.contexto = t.contexto) + 1),
  t.idioma,
  jsonb_build_object(
    'texto',
      E'Oi, {{1}}. A data do pagamento foi ontem. Você já informou que pagou, mas {{2}} ainda não confirmou. Qualquer coisa, manda um oi pra {{2}}. Assim que confirmarem, você recebe o aviso por aqui.',
    'botoes', t.conteudo->'botoes'
  ),
  '["nome_devedor","cobrador"]'::jsonb,
  (select max(x.versao) from public.templates x where x.chave = t.chave and x.contexto = t.contexto) + 1,
  'pendente', false, t.categoria,
  '{"nome_devedor":"Ana","cobrador":"João"}'::jsonb,
  'criar'
from public.templates t
where t.chave = 'ciclo.d_mais_1'
  and t.contexto = 'revisao'
  -- Fonte = versão mais recente da chave/contexto (não filtra por `ativo`: em CLOUD a
  -- versão mais recente é a base correta, esteja ativa ou ainda pendente de aprovação).
  and t.versao = (
    select max(x2.versao) from public.templates x2
    where x2.chave = t.chave and x2.contexto = t.contexto
  )
  -- Guarda de ambiente (ver comentário acima): só roda onde já existe submissão real à Meta.
  and exists (
    select 1 from public.templates x3
    where x3.chave = t.chave and x3.contexto = t.contexto and x3.meta_template_id is not null
  )
  and not exists (
    select 1 from public.templates x
    where x.chave = 'ciclo.d_mais_1'
      and x.contexto = 'revisao'
      and x.conteudo->>'texto' = E'Oi, {{1}}. A data do pagamento foi ontem. Você já informou que pagou, mas {{2}} ainda não confirmou. Qualquer coisa, manda um oi pra {{2}}. Assim que confirmarem, você recebe o aviso por aqui.'
  );
