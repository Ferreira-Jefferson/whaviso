-- E8 (Confirmação de pagamento, `informado_pago`): eventos novos + templates ao DEVEDOR
-- (encerramento/status-alterado/rejeição/reengajamento) + botões de cobrador na
-- notificação `cobrador.pagamento_informado`.
--
-- O grosso da fundação de E8 já veio antes:
--   * estado `informado_pago` + transições `informado_pago->{pago,programado}`,
--     `programado->pago`, `pago->programado` (reabertura) no trigger (F-STATE/0028);
--   * liberação do horário no terminal preservando `_orig` (E6/0038) e reuso do `_orig`
--     na reabertura (garantirHorarioReservado, shared/datas);
--   * outbox GENERALIZADA `notificacoes_cobrador` com `agendar_para` (janela de 1min),
--     `coalesce_grupo`, dedupe_key e drainer com reconferência de estado (E10a/E10b);
--   * enviar_lembretes já PARA o ciclo em `informado_pago` (H8.8, feito em E6/E7).
--
-- Aqui adicionamos só o que falta para fechar E8:
--   1) tipo_evento: `marcado_pago_cobrador` (H8.4, distingue de `confirmado_cobrador`),
--      `reaberto_cobrador` (H8.6, distingue de `desmarcado_cobrador`),
--      `reengajamento_cobrador` (H8.3). O ATOR CONCRETO (id do cobrador ou flag de
--      telefone, B2) vai em `eventos_aviso.detalhes` (sem PII), não em coluna nova.
--   2) Templates ao DEVEDOR (família `devedor.*`, alvo = quem recebe os lembretes):
--      `devedor.encerramento` (confirmação, neutro, SEM botões, atrasado ~1min),
--      `devedor.status_alterado` (reabertura tardia, SEM botões),
--      `devedor.rejeicao` (cobrador ainda não localizou, neutro, sem acusação),
--      `devedor.reengajamento` (mensagem manual com os 3 BOTÕES do ciclo, vira o último
--      aviso). M1: a variante recorrente (`devedor.encerramento` revisao) fica GATED
--      (H8.7, depende de H6.10): criada inativa, NÃO usada no MVP.
--   3) Botões `confirmar`/`rejeitar` em `cobrador.pagamento_informado` (H8.5): a
--      notificação "já paguei" ao cobrador passa a levar Confirmar/Ainda não recebi.
--
-- Conteúdo: neutro de gênero, sem palavras proibidas (CHECK templates_conteudo_
-- linguagem_limpa), SEM travessão (CHECK de travessão). Nascem 'pendente'+inativos
-- (gated por template, igual 0029/0034): o drainer mostra 'sem_template_ativo' ao owner
-- até a versão ser ativada (H12.8). Identifica o combinado por {{codigo}}.
--
-- Numeração: última migration = 0041 (notificacoes_fila_saida); esta é 0042.
-- ADD VALUE de enum + upsert de catálogo; os valores novos só são USADOS pelo app (nunca
-- nesta migration), seguro em auto-commit por statement.

-- ---------------------------------------------------------------------------------------
-- 0) Grant: a API agora COALESCE a outbox (cancela o encerramento pendente na reabertura
--    dentro do minuto, H8.6/C1), então precisa de UPDATE em notificacoes_cobrador (antes
--    só tinha select/insert, 0014). O drainer (zap) já tinha UPDATE. RLS/policy já é
--    `api_notif_cobrador FOR ALL` (0014), basta o grant de coluna/tabela.
-- ---------------------------------------------------------------------------------------
grant update on public.notificacoes_cobrador to whaviso_api;

-- ---------------------------------------------------------------------------------------
-- 1) Eventos novos do épico (idempotente). `confirmado_cobrador`/`rejeitado_cobrador`/
--    `desmarcado_cobrador` já existem (0011/0028).
-- ---------------------------------------------------------------------------------------
alter type tipo_evento add value if not exists 'marcado_pago_cobrador';
alter type tipo_evento add value if not exists 'reaberto_cobrador';
alter type tipo_evento add value if not exists 'reengajamento_cobrador';

-- ---------------------------------------------------------------------------------------
-- 2) Templates ao DEVEDOR. Variáveis (resolvidas pela ordem em `variaveis`):
--    {{1}}=alvo (saudação do devedor), {{2}}=codigo do combinado, {{3}}=quem recebe.
-- ---------------------------------------------------------------------------------------

-- H8.1 encerramento (confirmação do pagamento). NEUTRO, SEM botões. Disparado ~1min
-- depois (janela de reversão; o agendamento é do enfileirador, não do template).
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'devedor.encerramento', 'padrao', 'whaviso_devedor_encerramento', 'pt_BR',
       jsonb_build_object('texto',
         E'Oi, {{1}}. Tudo certo: o pagamento do combinado {{2}} foi confirmado. Combinado encerrado, obrigado! 🙂'),
       '["alvo","codigo","cobrador"]'::jsonb, 'pendente', false
where not exists (select 1 from public.templates where chave = 'devedor.encerramento' and contexto = 'padrao');

-- M1/H8.7 (GATED): variante RECORRENTE do encerramento ("pagamento deste mês confirmado").
-- Criada INATIVA; NÃO usada no MVP (recorrência depende de H6.10). Quando a recorrência
-- ligar, o produtor escolhe a variante 'revisao' para a ocorrência intermediária.
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'devedor.encerramento', 'revisao', 'whaviso_devedor_encerramento_recorrente', 'pt_BR',
       jsonb_build_object('texto',
         E'Oi, {{1}}. Pagamento deste mês do combinado {{2}} confirmado, obrigado! O próximo lembrete chega perto da próxima data. 🙂'),
       '["alvo","codigo","cobrador"]'::jsonb, 'pendente', false
where not exists (select 1 from public.templates where chave = 'devedor.encerramento' and contexto = 'revisao');

-- H8.6 status alterado (reabertura DEPOIS da janela de 1min: a confirmação já saiu).
-- NEUTRO, SEM botões.
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'devedor.status_alterado', 'padrao', 'whaviso_devedor_status_alterado', 'pt_BR',
       jsonb_build_object('texto',
         E'Oi, {{1}}. Houve um ajuste: o combinado {{2}} voltou a ficar ativo. Em caso de dúvida, fale com {{3}}. 🙂'),
       '["alvo","codigo","cobrador"]'::jsonb, 'pendente', false
where not exists (select 1 from public.templates where chave = 'devedor.status_alterado' and contexto = 'padrao');

-- H8.2 rejeição (cobrador ainda não localizou o pagamento). NEUTRO, SEM ACUSAÇÃO, SEM
-- palavras proibidas. SEM botões (os lembretes do ciclo seguem com os seus botões).
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'devedor.rejeicao', 'padrao', 'whaviso_devedor_rejeicao', 'pt_BR',
       jsonb_build_object('texto',
         E'Oi, {{1}}. Quem combinou com você ainda não localizou o pagamento do combinado {{2}}. Se você já pagou, pode aguardar ou conferir os dados; os lembretes seguem normalmente. 🙂'),
       '["alvo","codigo","cobrador"]'::jsonb, 'pendente', false
where not exists (select 1 from public.templates where chave = 'devedor.rejeicao' and contexto = 'padrao');

-- H8.3 reengajamento (mensagem manual do cobrador pós-ciclo). Leva os TRÊS botões do
-- ciclo (Já paguei / Chave de Pag. / Desativar lembretes) e VIRA o último aviso (o
-- webhook casa os botões pelo identificador deste reengajamento, M2). Sem palavra proibida.
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'devedor.reengajamento', 'padrao', 'whaviso_devedor_reengajamento', 'pt_BR',
       jsonb_build_object(
         'texto',
         E'Oi, {{1}}. {{3}} pediu para avisar que ainda não localizou o pagamento do combinado {{2}}. 🙂',
         'botoes', jsonb_build_array(
           jsonb_build_object('acao', 'ja_paguei', 'rotulo', 'Já paguei'),
           jsonb_build_object('acao', 'ver_pix', 'rotulo', 'Chave de Pag.'),
           jsonb_build_object('acao', 'optout', 'rotulo', 'Desativar lembretes')
         )
       ),
       '["alvo","codigo","cobrador"]'::jsonb, 'pendente', false
where not exists (select 1 from public.templates where chave = 'devedor.reengajamento' and contexto = 'padrao');

-- Respostas imediatas ao COBRADOR após confirmar/rejeitar por botão (H8.5), família
-- resposta.* (texto vigente, aprovado+ativo, igual às demais resposta.* da 0022/0040).
-- Sem variáveis: confirmação curta na janela 24h. CTA discreta de criar conta fica no
-- texto da própria NOTIFICAÇÃO (cobrador.pagamento_informado, para sem-conta), não aqui.
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'resposta.confirmado', 'padrao', 'whaviso_resposta_confirmado', 'pt_BR',
       jsonb_build_object('texto', E'Pagamento confirmado. Combinado encerrado, obrigado! 🙂'),
       '[]'::jsonb, 'aprovado', true
where not exists (select 1 from public.templates where chave = 'resposta.confirmado' and contexto = 'padrao');

insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'resposta.rejeitado', 'padrao', 'whaviso_resposta_rejeitado', 'pt_BR',
       jsonb_build_object('texto', E'Tudo bem, registramos que você ainda não localizou o pagamento. Os lembretes seguem normalmente. 🙂'),
       '[]'::jsonb, 'aprovado', true
where not exists (select 1 from public.templates where chave = 'resposta.rejeitado' and contexto = 'padrao');

-- ---------------------------------------------------------------------------------------
-- 3) Botões de cobrador na notificação "já paguei" (H8.5): Confirmar / Ainda não recebi.
--    A chave `cobrador.pagamento_informado` já existe (0023, só texto). Acrescenta o
--    array `conteudo.botoes` SEM tocar no texto (jsonb_set cria a chave). As ações
--    `confirmar`/`rejeitar` são tratadas no webhook (E8); o render monta o id
--    "acao:<aviso_id>" (HMAC no webhook leva o aviso_id, nunca token).
--    Vale para TODAS as versões da chave (com ou sem conta); idempotente (só seta se
--    ainda não há botões).
-- ---------------------------------------------------------------------------------------
update public.templates
  set conteudo = jsonb_set(
        conteudo,
        '{botoes}',
        jsonb_build_array(
          jsonb_build_object('acao', 'confirmar', 'rotulo', 'Confirmar pagamento'),
          jsonb_build_object('acao', 'rejeitar', 'rotulo', 'Ainda não recebi')
        ),
        true
      )
  where chave = 'cobrador.pagamento_informado'
    and (conteudo -> 'botoes') is null;
