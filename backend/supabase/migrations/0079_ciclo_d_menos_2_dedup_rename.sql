-- E6/E12: resolve o 'ciclo.d_menos_2/padrao', o unico template iniciador que a Meta
-- barrou na analise BASICA (rejeicao sincrona, sem motivo especifico). Investigado:
-- NAO e estrutura (as 9 irmas de mesmo formato entraram em analise) nem botao (todos os
-- ciclo.* tem os mesmos 3 botoes, inclusive ver_pix "Chave Pix"). A unica diferenca era o
-- NOME 'whaviso_d2_antecipado', que ficou "queimado" na Meta por ter sido rejeitado numa
-- tentativa anterior: recriar/editar com esse nome volta rejeitado sem reanalise real.
--
-- Duas coisas nesta migration:
--
-- 1) DEDUP: no cloud havia DUAS linhas de ciclo.d_menos_2/padrao (versoes 2 e 3) com o
--    MESMO nome_meta, o que causava colisao (o webhook message_template_status_update casa
--    por nome e atualizava as duas). Config nao pode ter lixo: mantem a versao mais ANTIGA
--    (min(versao)) e apaga as demais. `templates` e configuracao (nao auditoria), DELETE e
--    permitido. Em banco novo (uma linha so) o filtro nao casa nada (no-op idempotente).
--
-- 2) RENAME: renomeia o nome_meta para 'whaviso_d2_antecipado_2' (nome novo escapa do
--    queimado; a Meta trata como create limpo e analisa de verdade). Zera meta_template_id
--    e volta status_meta='pendente' para o proximo submit ser um CREATE. A resubmissao e
--    operacional (nao enfileira aqui). Guarda por nome antigo -> idempotente.
--
-- Numeracao: ultima migration = 0078; esta e a 0079.

-- 1) DEDUP: mantem a versao mais antiga da chave/contexto duplicada.
delete from public.templates t
 where t.chave = 'ciclo.d_menos_2'
   and t.contexto = 'padrao'::template_contexto
   and t.versao > (
     select min(versao) from public.templates
      where chave = 'ciclo.d_menos_2' and contexto = 'padrao'::template_contexto
   );

-- 2) RENAME: escapa do nome queimado na Meta e reseta o estado de submissao.
update public.templates
   set nome_meta         = 'whaviso_d2_antecipado_2',
       meta_template_id  = null,
       status_meta       = 'pendente'::status_meta_template,
       meta_submetido_em = null,
       meta_motivo       = null
 where chave = 'ciclo.d_menos_2'
   and contexto = 'padrao'::template_contexto
   and nome_meta = 'whaviso_d2_antecipado';
