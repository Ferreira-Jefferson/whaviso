-- E5 H5.0: o Whaviso INICIA a conversa do convite.
--
-- Até aqui o convite era compartilhado À MÃO pelo criador (link wa.me + mensagem pronta) e
-- o convidado é que dava o primeiro passo (mandava o número de 6 dígitos); só então o
-- Whaviso respondia o resumo. Era uma barreira herdada da era Baileys (evitar que um número
-- não oficial iniciasse conversa). Com a Meta Cloud API o modelo oficial é template
-- aprovado + opt-in, então o Whaviso passa a MANDAR o convite direto ao convidado
-- (api enfileira `convite_enviar` na notificacoes_cobrador; o zap drena e manda o template
-- `convite.resumo`). A decisão está revista na historia 05-convite-aceite.md.
--
-- Esta migration só mexe no CONTEÚDO do template `convite.resumo` (as duas variantes):
--   1) reescreve o corpo para soar como a PRIMEIRA mensagem do Whaviso (nomeia quem
--      registrou o combinado, em vez de "encontrei seu combinado", que pressupunha que o
--      convidado escreveu primeiro);
--   2) acrescenta a sugestão gentil de SALVAR O CONTATO (H5.2), para a pessoa não perder os
--      próximos lembretes;
--   3) volta o status_meta para 'pendente' (o corpo mudou, então a aprovação anterior não
--      vale mais). NÃO enfileira a submissão à Meta aqui (meta_acao fica null): submeter é
--      uma ação operacional do painel (POST /admin/mensagens/:id/submeter), feita quando a
--      empresa estiver verificada. Enquanto não aprovar, o auto-envio fica gated
--      (visível/recuperável, não quebra), igual às demais mensagens que iniciam conversa.
--
-- Os botões (aceite/dado_incorreto/recusa), as variáveis e o nome_meta NÃO mudam. Os textos
-- seguem as invariantes (gênero neutro, sem palavra proibida, sem travessão; historia 13).
--
-- Numeração: última migration = 0066 (templates_meta_sync); esta é a 0067.

-- 1) Variante 'padrao' (fluxo receber: convidado = devedor). {{1}}=quem recebe (cobrador),
--    {{2}}=quem paga (devedor, saudado pelo nome), {{3}}=motivo, {{4}}=valor, {{5}}=data.
update public.templates
   set conteudo = jsonb_build_object(
         'texto',
           E'Oi, {{2}}! Aqui é o Whaviso. {{1}} registrou um combinado com você e pediu para eu te avisar:\n\nQuem vai receber: {{1}}\nQuem vai pagar: {{2}}\nMotivo: {{3}}\nValor: {{4}}\nData combinada: {{5}}\n\nSalve este contato para não perder os próximos lembretes. Como deseja responder?',
         'botoes', jsonb_build_array(
           jsonb_build_object('acao','aceite','rotulo','Aceitar'),
           jsonb_build_object('acao','dado_incorreto','rotulo','Algum dado está incorreto'),
           jsonb_build_object('acao','recusa','rotulo','Recusar combinado')
         )
       ),
       status_meta = 'pendente'::status_meta_template,
       meta_motivo = null,
       meta_submetido_em = null
 where chave = 'convite.resumo' and contexto = 'padrao';

-- 2) Variante 'revisao' (fluxo invertido: convidado = cobrador, confere a chave Pix).
--    {{1}}=quem recebe (cobrador, saudado pelo nome), {{2}}=quem paga (devedor, o criador),
--    {{3}}=motivo, {{4}}=valor, {{5}}=data, {{6}}=chave Pix para conferir.
update public.templates
   set conteudo = jsonb_build_object(
         'texto',
           E'Oi, {{1}}! Aqui é o Whaviso. {{2}} registrou um combinado para te pagar e pediu para você conferir os dados:\n\nQuem vai receber: {{1}}\nQuem vai pagar: {{2}}\nMotivo: {{3}}\nValor: {{4}}\nData combinada: {{5}}\nChave Pix para conferir: {{6}}\n\nSalve este contato para não perder os próximos lembretes. Como deseja responder?',
         'botoes', jsonb_build_array(
           jsonb_build_object('acao','aceite','rotulo','Aceitar'),
           jsonb_build_object('acao','dado_incorreto','rotulo','Chave Pix incorreta'),
           jsonb_build_object('acao','recusa','rotulo','Recusar combinado')
         )
       ),
       status_meta = 'pendente'::status_meta_template,
       meta_motivo = null,
       meta_submetido_em = null
 where chave = 'convite.resumo' and contexto = 'revisao';
