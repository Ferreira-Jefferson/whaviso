-- E12: "ativo" só faz sentido em versão APROVADA na Meta. Limpa o resíduo de linhas
-- marcadas ativo=true mas com status_meta != 'aprovado'.
--
-- Contexto: templates de catálogo nasceram ativo=true (seed/migrations) e vários foram
-- rebaixados a 'pendente' pela 0068 (aprovações fantasma) e pela 0072 (texto reescrito ->
-- re-submissão). Isso deixava linhas "ativo porém não aprovada", que o painel mostrava
-- como "Marcada como ativa" mesmo sem estar no ar, confundindo o owner (ou está no ar, ou
-- não está). O envio nunca dependeu disso: TODO dreno do zap (enviar_lembretes,
-- notificar_cobrador, notificar_billing) já exige ativo E status_meta='aprovado', tratando
-- o resto como estado RECUPERÁVEL ("aguardando ativação/aprovação"), sem perder mensagem.
--
-- Efeito: uma versão não aprovada deixa de ser "ativa". Quando a Meta aprovar, o owner
-- ATIVA explicitamente pelo painel ("Ativar esta versão"), que já troca o ativo anterior e
-- recusa ativar o que não está aprovado (POST /admin/mensagens/:id/ativar). Não muda envio
-- (essas linhas já não iam ao ar), não apaga nada, não mexe em status_meta.
--
-- Idempotente: reexecutar não faz nada (o WHERE já exclui o estado limpo).
--
-- Numeração: última migration = 0072 (templates_campos_negrito); esta é a 0073.

update public.templates
   set ativo = false
 where ativo
   and status_meta <> 'aprovado'::status_meta_template;
