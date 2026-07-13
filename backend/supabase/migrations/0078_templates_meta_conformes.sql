-- E12/E6/E10/E11: conforma ao formato de TEMPLATE da Meta os corpos que ela recusou
-- (Graph error 100 "Invalid parameter") na submissao em massa. A Meta impoe regras
-- estruturais ao corpo de um template que o catalogo violava:
--   (a) o corpo NAO pode terminar (nem comecar) numa variavel {{n}};
--   (b) a numeracao das variaveis tem que ser 1..n SEQUENCIAL, sem buraco;
--   (c) toda variavel DECLARADA precisa aparecer no corpo (o exemplo exigido pela Meta
--       tem um valor por variavel; sobrar/faltar variavel quebra a paridade);
--   (d) duas variaveis nao podem ficar coladas (so pontuacao entre elas).
-- Isso quebraria tambem no ENVIO: o transporte manda `variaveis.length` parametros
-- posicionais, entao a contagem tem que bater com os {{n}} do corpo.
--
-- Correcoes (sem mudar o SENTIDO da copy; grounding em historias/06,07,10,11 e 13):
--   * Terminava em variavel  -> acrescenta uma frase de fecho neutra:
--       ciclo.d/padrao, ciclo.d_mais_1/padrao, ciclo.d_menos_1/padrao
--       (fecho igual ao que a versao 'revisao' ja usa: "Se voce ja pagou, pode
--        desconsiderar este aviso."), e devedor.pix_chave_recebida (fecho proprio).
--   * Variavel declarada e nao usada / numeracao com buraco -> ajusta `variaveis`
--       (e renumera o corpo onde havia buraco), SEM tocar na copy:
--       devedor.encerramento (padrao+revisao) e devedor.rejeicao (sobrava 'cobrador');
--       ciclo.d_mais_1/revisao (usava {{1}},{{4}}; vira {{1}},{{2}});
--       billing.recarga (declarava 7, usava {{1}},{{2}},{{4}},{{5}},{{6}}; vira 5 seq).
--   * Variaveis coladas -> ciclo.d_menos_2/padrao passa ao formato aninhado + fecho.
--     Ha DUAS linhas dessa chave/contexto no catalogo (uma aninhada que terminava em
--     {{5}}, outra "corrida" antiga com "O {{2}}" que ainda infere genero, historia 13):
--     as DUAS sao normalizadas para o mesmo texto conforme.
--
-- Regras de linguagem preservadas (historia 13): genero neutro, sem palavra proibida
-- (CHECK templates_unif_linguagem_limpa), sem travessao (CHECK templates_unif_sem_travessao).
--
-- Meta (padrao da 0072): o corpo mudou, entao a aprovacao/recusa anterior nao vale mais.
-- Volta status_meta='pendente' e limpa meta_submetido_em/meta_motivo. NAO enfileira a
-- submissao aqui (meta_acao fica como esta); a resubmissao e operacional.
--
-- Seguranca (padrao 0072): cada linha so e reescrita se o texto AINDA for o do catalogo
-- (match exato em `antigo`); custom do owner (E12) nao e sobrescrito.
--
-- Numeracao: ultima migration = 0077 (webhook_dedupe); esta e a 0078.

update public.templates t
   set conteudo          = jsonb_set(t.conteudo, '{texto}', to_jsonb(d.novo::text)),
       variaveis         = d.novo_vars::jsonb,
       status_meta       = 'pendente'::status_meta_template,
       meta_submetido_em = null,
       meta_motivo       = null
  from (values
    -- (a) terminavam em variavel: acrescenta fecho neutro (mesmo das versoes revisao).
    ('ciclo.d', 'padrao',
     E'Olá, {{1}}. Hoje é o dia do combinado:\n\n*Combinado*: {{2}}\n*Valor*: {{3}}',
     E'Olá, {{1}}. Hoje é o dia do combinado:\n\n*Combinado*: {{2}}\n*Valor*: {{3}}\n\nSe você já pagou, pode desconsiderar este aviso.',
     '["nome_devedor","motivo","valor"]'),
    ('ciclo.d_menos_1', 'padrao',
     E'Olá, {{1}}. Amanhã é o dia do combinado:\n\n*Combinado*: {{2}}\n*Valor*: {{3}}',
     E'Olá, {{1}}. Amanhã é o dia do combinado:\n\n*Combinado*: {{2}}\n*Valor*: {{3}}\n\nSe você já pagou, pode desconsiderar este aviso.',
     '["nome_devedor","motivo","valor"]'),
    ('ciclo.d_mais_1', 'padrao',
     E'Olá, {{1}}. Último dia do combinado:\n\n*Combinado*: {{2}}\n*Valor*: {{3}}',
     E'Olá, {{1}}. Último dia do combinado:\n\n*Combinado*: {{2}}\n*Valor*: {{3}}\n\nSe você já pagou, pode desconsiderar este aviso.',
     '["nome_devedor","motivo","valor"]'),
    ('devedor.pix_chave_recebida', 'padrao',
     E'Olá, {{1}}. {{3}} confirmou o combinado {{2}} e enviou a chave pix:\n\n*Chave*: {{4}}\n*Titular*: {{5}}\n*Banco*: {{6}}',
     E'Olá, {{1}}. {{3}} confirmou o combinado {{2}} e enviou a chave pix:\n\n*Chave*: {{4}}\n*Titular*: {{5}}\n*Banco*: {{6}}\n\nÉ só usar esses dados para pagar quando puder. 🙂',
     '["alvo","codigo","cobrador","pix_chave","pix_titular","pix_banco"]'),
    -- (c) variavel declarada e nao usada: so reduz `variaveis` (texto identico ao atual).
    ('devedor.encerramento', 'padrao',
     E'Oi, {{1}}. Tudo certo: o pagamento do combinado {{2}} foi confirmado. Combinado encerrado, obrigado! 🙂',
     E'Oi, {{1}}. Tudo certo: o pagamento do combinado {{2}} foi confirmado. Combinado encerrado, obrigado! 🙂',
     '["alvo","codigo"]'),
    ('devedor.encerramento', 'revisao',
     E'Oi, {{1}}. Pagamento deste mês do combinado {{2}} confirmado, obrigado! O próximo lembrete chega perto da próxima data. 🙂',
     E'Oi, {{1}}. Pagamento deste mês do combinado {{2}} confirmado, obrigado! O próximo lembrete chega perto da próxima data. 🙂',
     '["alvo","codigo"]'),
    ('devedor.rejeicao', 'padrao',
     E'Oi, {{1}}. Quem combinou com você ainda não localizou o pagamento do combinado {{2}}. Se você já pagou, pode aguardar ou conferir os dados; os lembretes seguem normalmente. 🙂',
     E'Oi, {{1}}. Quem combinou com você ainda não localizou o pagamento do combinado {{2}}. Se você já pagou, pode aguardar ou conferir os dados; os lembretes seguem normalmente. 🙂',
     '["alvo","codigo"]'),
    -- (b) numeracao com buraco: reduz `variaveis` e renumera o corpo p/ 1..n sequencial.
    ('ciclo.d_mais_1', 'revisao',
     E'Oi, {{1}}. A data do pagamento foi ontem. Você já informou que pagou, mas {{4}} ainda não confirmou. Qualquer coisa, manda um oi pra {{4}}. 🙂',
     E'Oi, {{1}}. A data do pagamento foi ontem. Você já informou que pagou, mas {{2}} ainda não confirmou. Qualquer coisa, manda um oi pra {{2}}. 🙂',
     '["nome_devedor","cobrador"]'),
    ('billing.recarga', 'padrao',
     E'Olá! Sua recarga de {{1}} envios foi registrada, no valor de {{2}}.\n\nPara concluir, é só pagar via Pix:\n\n*Chave*: {{4}}\n*Titular*: {{5}}\n*Banco*: {{6}}\n\nDepois, envie o comprovante aqui nesta conversa que a gente libera seus envios.',
     E'Olá! Sua recarga de {{1}} envios foi registrada, no valor de {{2}}.\n\nPara concluir, é só pagar via Pix:\n\n*Chave*: {{3}}\n*Titular*: {{4}}\n*Banco*: {{5}}\n\nDepois, envie o comprovante aqui nesta conversa que a gente libera seus envios.',
     '["quantidade","valor","pix_chave","pix_titular","pix_banco"]'),
    -- (d) variaveis coladas / termina em variavel: as DUAS linhas viram o mesmo aninhado + fecho.
    ('ciclo.d_menos_2', 'padrao',
     E'Olá, {{1}}. {{2}} pediu para eu te lembrar do combinado:\n\n*Combinado*: {{3}}\n*Valor*: {{4}}\n*Data*: {{5}}',
     E'Olá, {{1}}. {{2}} pediu para eu te lembrar do combinado:\n\n*Combinado*: {{3}}\n*Valor*: {{4}}\n*Data*: {{5}}\n\nSe você já pagou, pode desconsiderar este aviso.',
     '["nome_devedor","cobrador","motivo","valor","data"]'),
    ('ciclo.d_menos_2', 'padrao',
     E'Olá, {{1}}. O {{2}} pediu para eu te lembrar do combinado: {{3}}, {{4}} para {{5}}.',
     E'Olá, {{1}}. {{2}} pediu para eu te lembrar do combinado:\n\n*Combinado*: {{3}}\n*Valor*: {{4}}\n*Data*: {{5}}\n\nSe você já pagou, pode desconsiderar este aviso.',
     '["nome_devedor","cobrador","motivo","valor","data"]')
  ) as d(chave, contexto, antigo, novo, novo_vars)
 where t.chave = d.chave
   and t.contexto = d.contexto::template_contexto
   and t.conteudo->>'texto' = d.antigo;
