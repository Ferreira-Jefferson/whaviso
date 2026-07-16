-- 0088: fecho neutro nos 3 templates que a Meta recusou (meta_100 "Invalid parameter")
-- depois da 0087.
--
-- Causa: nesses 3 o 🙂 era o ÚLTIMO elemento do corpo. Ao removê-lo (0087, versão nova),
-- o corpo passou a TERMINAR numa variável {{n}}, o que a Meta recusa no CREATE (mesma
-- regra estrutural tratada na 0078). Solução: acrescentar uma frase de fecho neutra
-- (sem mudar o sentido; gênero neutro; sem palavra proibida nem travessão) e reenfileirar
-- a submissão (meta_acao='criar') para o zap recriar na Meta.
--
-- Alvo: só as versões NOVAS criadas pela 0087 (nome_meta com sufixo _2), guardadas por
-- nome. No banco de DEV essas linhas não existem (a 0087 é no-op lá), então isto também
-- é NO-OP no DEV; corrige só o estado do cloud.
--
-- Numeração: última migration = 0087 (templates_sem_emoji_rosto); esta é a 0088.

-- ciclo.d_mais_1/revisao ({{1}}=nome_devedor, {{2}}=cobrador): já informou pagamento,
-- aguardando o outro lado confirmar.
update public.templates
   set conteudo = jsonb_set(conteudo, '{texto}', to_jsonb(
         'Oi, {{1}}. A data do pagamento foi ontem. Você já informou que pagou, mas {{2}} ainda não confirmou. Qualquer coisa, manda um oi pra {{2}}. Assim que confirmarem, você recebe o aviso por aqui.'::text)),
       status_meta = 'pendente', meta_motivo = null, meta_acao = 'criar'
 where nome_meta = 'whaviso_d1_revisao_2';

-- devedor.reengajamento ({{1}}=alvo, {{2}}=codigo, {{3}}=cobrador): cobrador ainda não
-- localizou o pagamento; a mensagem tem botões de resposta.
update public.templates
   set conteudo = jsonb_set(conteudo, '{texto}', to_jsonb(
         'Oi, {{1}}. {{3}} pediu para avisar que ainda não localizou o pagamento do combinado {{2}}. Se você já pagou, pode desconsiderar este aviso.'::text)),
       status_meta = 'pendente', meta_motivo = null, meta_acao = 'criar'
 where nome_meta = 'whaviso_devedor_reengajamento_2';

-- devedor.status_alterado ({{1}}=alvo, {{2}}=codigo, {{3}}=cobrador): combinado voltou a ativo.
update public.templates
   set conteudo = jsonb_set(conteudo, '{texto}', to_jsonb(
         'Oi, {{1}}. Houve um ajuste: o combinado {{2}} voltou a ficar ativo. Em caso de dúvida, fale com {{3}}. Os lembretes seguem normalmente.'::text)),
       status_meta = 'pendente', meta_motivo = null, meta_acao = 'criar'
 where nome_meta = 'whaviso_devedor_status_alterado_2';
