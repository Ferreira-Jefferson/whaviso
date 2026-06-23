-- E7 (Interação do devedor): controle de ENTREGA da chave de pagamento (H7.3) e
-- templates novos das respostas/menu deste épico (H7.1/H7.3/H7.5/H7.7).
--
-- O grosso da fundação de E7 já veio antes:
--   * estado `desregistrado` + transições `programado<->desregistrado` e o trigger
--     `encerrar_envios_do_aviso` que suspende os envios (F-STATE/0028, horário em 0038);
--   * eventos `desregistrado`/`reregistrado`/`optout`/`solicitou_pix`/`ja_paguei_devedor`
--     no enum `tipo_evento` (0028/0001/0010/0011);
--   * colunas `pix_titular`/`pix_banco` no aviso (E2/E3, 0031/0035);
--   * outbox generalizada com tipos `optout`/`reativacao` (E10a, 0029) e o enfileirador.
--
-- Aqui adicionamos só o que falta para fechar E7:
--   1) `avisos.entrega_chave_status`: marca a entrega da chave "uma vez por combinado"
--      (H7.3). 'entregue' SÓ depois que as DUAS mensagens (chave; titular+banco) saíram
--      com sucesso; se a 2a falhar, fica NULL (reentregável), G-C3. Não muda estado.
--   2) Templates novos (catálogo via migration; o seed não roda no cloud):
--      resposta.ver_pix_titular (2a msg do Pix), resposta.reativacao (sem botão),
--      resposta.menu_opcoes (texto livre no plano pago), resposta.encerrado (combinado
--      já encerrado). Linguagem neutra, sem travessão, sem palavra proibida.
--   3) Botão "Ativar lembretes" (acao `ativar`) na confirmação do opt-out: como
--      resposta.optout ganha um botão, ele precisa do `aviso_id` no refId; o texto fica
--      no template e o botão é montado pelo render (o service passa refId no opt-out).
--      O rótulo/estrutura do botão vai no `conteudo.botoes` do resposta.optout.
--
-- Numeração: última migration = 0039 (ciclo_botoes_empurrao); esta é 0040.
-- Só ADICIONA coluna/índice e faz upsert de catálogo; não usa valores de enum novos em
-- DML, segura em auto-commit por statement.

-- ---------------------------------------------------------------------------------------
-- 1) Status de entrega da chave de pagamento (H7.3 / G-C3).
--    NULL      = ainda não entregue (ou entrega parcial que falhou -> reentregável);
--    'entregue'= as DUAS mensagens (chave; titular+banco) saíram com sucesso.
--    Reenvio só acontece quando NÃO está 'entregue'. Não altera o estado do aviso.
-- ---------------------------------------------------------------------------------------
alter table public.avisos add column if not exists entrega_chave_status text
  constraint avisos_entrega_chave_status_chk
    check (entrega_chave_status is null or entrega_chave_status = 'entregue');

comment on column public.avisos.entrega_chave_status is
  'E7/H7.3: marca a entrega da chave de pagamento uma vez por combinado. NULL = reentregável; entregue = as duas mensagens (chave; titular+banco) saíram. Nunca guarda a chave.';

-- O zap (webhook) marca a entrega; a api tem update amplo (0008). Acrescenta a coluna
-- à lista de UPDATE do zap.
grant update (entrega_chave_status) on public.avisos to whaviso_zap;

-- H7.1: o zap consulta o plano da conta dona do combinado para decidir menu (pago) vs
-- silêncio (free) no texto livre. `alavancas_do_plano` foi criada com grant só p/ a api
-- (0026); o zap também precisa executá-la (leitura de catálogo, sem dado sensível).
grant execute on function public.alavancas_do_plano(uuid) to whaviso_zap;

-- ---------------------------------------------------------------------------------------
-- 2) Botão "Ativar lembretes" na confirmação do opt-out (H7.4). O texto continua o
--    mesmo da 0022, mas agora o template carrega um botão `ativar` (o render monta o id
--    `ativar:<aviso_id>` a partir do refId que o service passa). Rótulo neutro.
-- ---------------------------------------------------------------------------------------
update public.templates
  set conteudo = jsonb_build_object(
        'texto', conteudo->>'texto',
        'botoes', jsonb_build_array(
          jsonb_build_object('acao','ativar','rotulo','Ativar lembretes')
        )
      )
  where chave = 'resposta.optout' and contexto = 'padrao';

-- ---------------------------------------------------------------------------------------
-- 3) Templates novos (idempotentes; nascem aprovados+ativos = texto vigente).
-- ---------------------------------------------------------------------------------------

-- 2a mensagem do Pix: titular + banco (H7.3). {{1}}=titular, {{2}}=banco.
insert into public.templates (chave, nome_meta, conteudo, variaveis, status_meta, ativo)
select 'resposta.ver_pix_titular', 'resposta_ver_pix_titular',
       '{"texto":"Em nome de {{1}}, banco {{2}}."}'::jsonb,
       '["titular","banco"]'::jsonb, 'aprovado', true
where not exists (select 1 from public.templates where chave = 'resposta.ver_pix_titular' and contexto = 'padrao');

-- Confirmação da reativação, SEM botão (H7.5).
insert into public.templates (chave, nome_meta, conteudo, variaveis, status_meta, ativo)
select 'resposta.reativacao', 'resposta_reativacao',
       '{"texto":"Tudo certo! Você voltou a receber os lembretes deste combinado. 🙂"}'::jsonb,
       '[]'::jsonb, 'aprovado', true
where not exists (select 1 from public.templates where chave = 'resposta.reativacao' and contexto = 'padrao');

-- Menu de opções para texto livre no plano pago (H7.1). Texto curto, neutro; as ações
-- vêm como botões (acoes do ciclo) amarradas ao aviso pelo refId que o service passa.
insert into public.templates (chave, nome_meta, conteudo, variaveis, status_meta, ativo)
select 'resposta.menu_opcoes', 'resposta_menu_opcoes',
       jsonb_build_object(
         'texto', 'Como posso ajudar com este combinado? Toque em uma das opções abaixo. 🙂',
         'botoes', jsonb_build_array(
           jsonb_build_object('acao','ja_paguei','rotulo','Já paguei'),
           jsonb_build_object('acao','ver_pix','rotulo','Chave de Pag.'),
           jsonb_build_object('acao','optout','rotulo','Desativar lembretes')
         )
       ),
       '[]'::jsonb, 'aprovado', true
where not exists (select 1 from public.templates where chave = 'resposta.menu_opcoes' and contexto = 'padrao');

-- Resposta neutra para combinado já encerrado / botão de mensagem antiga (H7.7).
insert into public.templates (chave, nome_meta, conteudo, variaveis, status_meta, ativo)
select 'resposta.encerrado', 'resposta_encerrado',
       '{"texto":"Este combinado já foi encerrado, não há mais nada a fazer por aqui. 🙂"}'::jsonb,
       '[]'::jsonb, 'aprovado', true
where not exists (select 1 from public.templates where chave = 'resposta.encerrado' and contexto = 'padrao');
