-- E12/E13: padroniza o CONTEÚDO dos templates MULTI-CAMPO para o formato aninhado.
--
-- Motivação: no editor (/admin/mensagens/:chave) e no WhatsApp, os lembretes vinham
-- "corridos" (campos inline numa linha só, ex.: "...do combinado: {{3}}, {{4}} para {{5}}.")
-- e NENHUM template usava negrito. A decisão de produto é apresentar as informações
-- ANINHADAS: saudação, linha em branco, e cada dado em sua linha com o rótulo em
-- *negrito* (o WhatsApp entende "*" como negrito; o preview do painel agora renderiza).
--
-- Regras de linguagem preservadas (historia 13): gênero neutro (sem artigo "O/A" antes
-- do nome), sem palavra proibida (CHECK templates_unif_linguagem_limpa), sem travessão
-- (CHECK templates_unif_sem_travessao). Emoji não é necessário para cordialidade: os
-- fechos com " 🙂" saem nos textos reescritos.
--
-- Escopo (multi-campo): lembretes do ciclo (padrao), a notificação de pagamento ao
-- cobrador, o resumo do convite (as 2 variantes), a compra de crédito, a confirmação da
-- chave pix e a notificação da chave ao devedor. Mensagens EM PROSA multivariável
-- (empurrãozinho do ciclo.d_mais_1 revisao, devedor.reengajamento) NÃO entram: não têm
-- lista natural de campos e mantêm a voz atual.
--
-- Segurança (padrão da 0071): cada linha só é reescrita se o texto AINDA for o do
-- catálogo (match exato em `antigo`). Se o owner já customizou (E12), o UPDATE não casa
-- e não sobrescreve o trabalho dele.
--
-- Meta (padrão da 0067): o corpo mudou, então a aprovação anterior não vale mais.
-- Volta status_meta='pendente' e limpa meta_submetido_em/meta_motivo para o owner
-- RE-SUBMETER pelo painel. Não enfileira submissão aqui (é ação operacional do painel).
--
-- Numeração: última migration = 0071 (templates_chave_pix); esta é a 0072.

update public.templates t
   set conteudo          = jsonb_set(t.conteudo, '{texto}', to_jsonb(d.novo::text)),
       status_meta       = 'pendente'::status_meta_template,
       meta_submetido_em = null,
       meta_motivo       = null
  from (values
    -- Lembretes do ciclo (padrao): saudação + linha em branco + campos rotulados.
    ('ciclo.d_menos_2', 'padrao',
     E'Oi, {{1}}. {{2}} pediu pra te lembrar do combinado: {{3}}, {{4}} para {{5}}.',
     E'Olá, {{1}}. {{2}} pediu para eu te lembrar do combinado:\n\n*Combinado*: {{3}}\n*Valor*: {{4}}\n*Data*: {{5}}'),
    ('ciclo.d_menos_1', 'padrao',
     E'Oi, {{1}}. Amanhã é o dia: {{2}}, {{3}}.',
     E'Olá, {{1}}. Amanhã é o dia do combinado:\n\n*Combinado*: {{2}}\n*Valor*: {{3}}'),
    ('ciclo.d', 'padrao',
     E'Oi, {{1}}. Hoje é o dia: {{2}}, {{3}}.',
     E'Olá, {{1}}. Hoje é o dia do combinado:\n\n*Combinado*: {{2}}\n*Valor*: {{3}}'),
    ('ciclo.d_mais_1', 'padrao',
     E'Oi, {{1}}. Último aviso: {{2}}, {{3}}.',
     E'Olá, {{1}}. Último dia do combinado:\n\n*Combinado*: {{2}}\n*Valor*: {{3}}'),
    -- Notificação ao cobrador: campos rotulados + fecho, sem emoji.
    ('cobrador.pagamento_informado', 'padrao',
     E'Oi, {{1}}. {{2}} informou que pagou: {{3}}, {{4}}. Confira e confirme o recebimento no painel. 🙂',
     E'Olá, {{1}}. {{2}} informou que pagou:\n\n*Combinado*: {{3}}\n*Valor*: {{4}}\n\nConfira e confirme o recebimento no painel.'),
    -- Resumo do convite (já era rotulado em texto puro): só aplica negrito nos rótulos.
    ('convite.resumo', 'padrao',
     E'Oi, {{2}}! Aqui é o Whaviso. {{1}} registrou um combinado com você e pediu para eu te avisar:\n\nQuem vai receber: {{1}}\nQuem vai pagar: {{2}}\nMotivo: {{3}}\nValor: {{4}}\nData combinada: {{5}}\n\nSalve este contato para não perder os próximos lembretes. Como deseja responder?',
     E'Oi, {{2}}! Aqui é o Whaviso. {{1}} registrou um combinado com você e pediu para eu te avisar:\n\n*Quem vai receber*: {{1}}\n*Quem vai pagar*: {{2}}\n*Motivo*: {{3}}\n*Valor*: {{4}}\n*Data combinada*: {{5}}\n\nSalve este contato para não perder os próximos lembretes. Como deseja responder?'),
    ('convite.resumo', 'revisao',
     E'Oi, {{1}}! Aqui é o Whaviso. {{2}} registrou um combinado para te pagar e pediu para você conferir os dados:\n\nQuem vai receber: {{1}}\nQuem vai pagar: {{2}}\nMotivo: {{3}}\nValor: {{4}}\nData combinada: {{5}}\nChave Pix para conferir: {{6}}\n\nSalve este contato para não perder os próximos lembretes. Como deseja responder?',
     E'Oi, {{1}}! Aqui é o Whaviso. {{2}} registrou um combinado para te pagar e pediu para você conferir os dados:\n\n*Quem vai receber*: {{1}}\n*Quem vai pagar*: {{2}}\n*Motivo*: {{3}}\n*Valor*: {{4}}\n*Data combinada*: {{5}}\n*Chave Pix para conferir*: {{6}}\n\nSalve este contato para não perder os próximos lembretes. Como deseja responder?'),
    -- Compra de crédito: negrito nos rótulos da chave, sem emoji.
    ('billing.recarga', 'padrao',
     E'Oi! Sua recarga de {{1}} envios foi registrada, no valor de {{2}}.\n\nPara concluir, é só pagar via Pix:\nChave: {{4}}\nTitular: {{5}}\nBanco: {{6}}\n\nDepois, envie o comprovante aqui nesta conversa que a gente libera seus envios. 🙂',
     E'Olá! Sua recarga de {{1}} envios foi registrada, no valor de {{2}}.\n\nPara concluir, é só pagar via Pix:\n\n*Chave*: {{4}}\n*Titular*: {{5}}\n*Banco*: {{6}}\n\nDepois, envie o comprovante aqui nesta conversa que a gente libera seus envios.'),
    -- Confirmação consolidada da chave pix (wizard): negrito nos rótulos + espaçamento.
    ('pix.confirmar', 'padrao',
     E'Confira os dados:\nTitular: {{1}}\nBanco: {{2}}\nTipo: {{3}}\nChave: {{4}}\n\nEstá tudo certo?',
     E'Confira os dados:\n\n*Titular*: {{1}}\n*Banco*: {{2}}\n*Tipo*: {{3}}\n*Chave*: {{4}}\n\nEstá tudo certo?'),
    -- Notificação da chave ao devedor: negrito nos rótulos + espaçamento.
    ('devedor.pix_chave_recebida', 'padrao',
     E'Oi, {{1}}. {{3}} confirmou o combinado {{2}} e enviou a chave pix.\nChave: {{4}}\nTitular: {{5}}\nBanco: {{6}}',
     E'Olá, {{1}}. {{3}} confirmou o combinado {{2}} e enviou a chave pix:\n\n*Chave*: {{4}}\n*Titular*: {{5}}\n*Banco*: {{6}}')
  ) as d(chave, contexto, antigo, novo)
 where t.chave = d.chave
   and t.contexto = d.contexto::template_contexto
   and t.conteudo->>'texto' = d.antigo;
