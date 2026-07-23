-- Item 7 (wave 2 / grupo 1E): fecha o lado ZAP da "aprovação de dado incorreto" que a
-- 0092/0093 abriu (schema + decisão do cobrador via api/painel). Esta migration só
-- ajusta o que o zap precisa para: (a) o devedor REPORTAR um campo incorreto já no
-- ciclo (pós aceite, aviso `programado`); (b) o cobrador RESOLVER (aprovar/recusar)
-- diretamente pelo WhatsApp, por telefone (mesma disciplina de confirmar/rejeitar
-- pagamento, H8.5).
--
-- DECISÃO (grant column-level, não table-level): a 0093 deu ao zap só select+insert em
-- `avisos_reportes` ("zap só reporta, nunca resolve"). Resolver (aprovar/recusar) por
-- WhatsApp exige setar `resolucao`/`resolvido_em`; sem isso, uma resolução via WhatsApp
-- deixaria a linha 'pendente' presa para sempre (bloqueando um reporte futuro legítimo
-- pelo índice único parcial). Concede só as 2 colunas da resolução (privilégio mínimo,
-- espelha 0070/0099), preservando "o zap só ESCREVE reporte" como regra geral: aqui ele
-- só fecha o MESMO reporte que o cobrador decidiu, nunca aplica a correção nos dados do
-- combinado (isso continua sendo só da api/painel, decisão da 0093).
--
-- Numeração: última migration = 0099 (creditos_hold_privilegio_minimo); esta é 0100.

grant update (resolucao, resolvido_em) on public.avisos_reportes to whaviso_zap;

-- ---------------------------------------------------------------------------------------
-- Templates: ajustes de texto para os dois lados do fluxo pós-aceite (zap-side).
-- ---------------------------------------------------------------------------------------

-- `cobrador.combinado_dado_incorreto` (0029, renomeado na 0076) hoje só serve ao sinal
-- SIMPLES do aceite ("Confira e reenvie o convite"). Reusado agora também pelo reporte
-- pós-aceite (mesmo TipoNotificacao, item 7): o texto "reenvie o convite" fica ERRADO
-- depois que o combinado já foi aceito (não há convite a reenviar). Texto genérico que
-- serve aos dois contextos.
--
-- Este template é `comoTemplate: true` (notificar_cobrador/index.ts): inicia conversa
-- fora da janela de 24h, então é um template DE VERDADE da Meta. Mesma disciplina do
-- item 20 (0096): a correção nasce como NOVA VERSÃO pendente (meta_acao='criar'), nunca
-- editando a versão aprovada/ativa em uso; precisa passar pelo fluxo de submissão +
-- aprovação da Meta (H12.5) antes que o owner ative pelo painel. Guarda de ambiente
-- idêntica à 0096/0068: só roda onde já existe submissão real à Meta (meta_template_id
-- preenchido); em banco de DEV é NO-OP de propósito (o seed reativa toda linha da
-- tabela incondicionalmente, e duas versões ativas na mesma chave/contexto violam o
-- índice único).
insert into public.templates
  (chave, contexto, nome_meta, idioma, conteudo, variaveis, versao, status_meta, ativo, categoria, exemplos, meta_acao)
select
  t.chave,
  t.contexto,
  regexp_replace(t.nome_meta, '_[0-9]+$', '')
    || '_' || ((select max(x.versao) from public.templates x where x.chave = t.chave and x.contexto = t.contexto) + 1),
  t.idioma,
  jsonb_build_object(
    'texto', E'Oi, {{1}}. Foi apontado que algum dado do combinado {{2}} está incorreto. Abra o aplicativo para revisar.'
  ),
  t.variaveis,
  (select max(x.versao) from public.templates x where x.chave = t.chave and x.contexto = t.contexto) + 1,
  'pendente', false, t.categoria,
  '{"alvo":"João","codigo":"com Ana"}'::jsonb,
  'criar'
from public.templates t
where t.chave = 'cobrador.combinado_dado_incorreto'
  and t.contexto = 'padrao'
  and t.versao = (
    select max(x2.versao) from public.templates x2
    where x2.chave = t.chave and x2.contexto = t.contexto
  )
  and exists (
    select 1 from public.templates x3
    where x3.chave = t.chave and x3.contexto = t.contexto and x3.meta_template_id is not null
  )
  and not exists (
    select 1 from public.templates x
    where x.chave = 'cobrador.combinado_dado_incorreto'
      and x.contexto = 'padrao'
      and x.conteudo->>'texto' = E'Oi, {{1}}. Foi apontado que algum dado do combinado {{2}} está incorreto. Abra o aplicativo para revisar.'
  );

-- `resposta.menu_opcoes`: acrescenta, no corpo, a instrução do novo caminho por texto
-- (sem botão novo: a Meta limita a 3 botões rápidos por template e os 3 já estão
-- ocupados). O devedor digita o número da opção seguido da informação correta.
update public.templates
  set conteudo = jsonb_build_object(
        'texto', E'Como posso ajudar com este combinado? Toque em uma das opções abaixo, ou, se algum dado deste combinado está incorreto, envie o número da opção seguido da informação correta: 1 (valor), 2 (data) ou 3 (nome ou motivo). Exemplo: 1 250,00',
        'botoes', conteudo->'botoes'
      )
  where chave = 'resposta.menu_opcoes' and contexto = 'padrao';

-- Confirmação ao devedor de que o reporte foi registrado (o ciclo fica suspenso até o
-- cobrador decidir, igual à edição em reaprovação).
insert into public.templates (chave, nome_meta, conteudo, variaveis, status_meta, ativo)
select 'resposta.dado_incorreto_registrado', 'resposta_dado_incorreto_registrado',
       '{"texto":"Registrei sua observação. Os lembretes ficam pausados até quem fez o combinado revisar. Obrigado!"}'::jsonb,
       '[]'::jsonb, 'aprovado', true
where not exists (
  select 1 from public.templates where chave = 'resposta.dado_incorreto_registrado' and contexto = 'padrao'
);

-- Formato não reconhecido (ex.: "1 abc" para valor, ou data fora de dd/mm/aaaa): pede
-- para tentar de novo, sem criar reporte nem mudar o estado do combinado.
insert into public.templates (chave, nome_meta, conteudo, variaveis, status_meta, ativo)
select 'resposta.dado_incorreto_formato_invalido', 'resposta_dado_incorreto_formato_invalido',
       '{"texto":"Não entendi a informação. Envie o número da opção seguido da informação correta: 1 (valor, ex.: 1 250,00), 2 (data, ex.: 2 20/08/2026) ou 3 (nome ou motivo, ex.: 3 Aluguel de agosto)."}'::jsonb,
       '[]'::jsonb, 'aprovado', true
where not exists (
  select 1 from public.templates where chave = 'resposta.dado_incorreto_formato_invalido' and contexto = 'padrao'
);

-- Resposta ao COBRADOR que digitou "aprovar" (fallback de texto por telefone, mesma
-- disciplina dos botões de confirmar/rejeitar pagamento). Aprovar não aplica a correção
-- por si só (decisão da 0093): abre o combinado para edição pré-preenchida no painel.
insert into public.templates (chave, nome_meta, conteudo, variaveis, status_meta, ativo)
select 'resposta.correcao_aprovada', 'resposta_correcao_aprovada',
       '{"texto":"Correção aprovada. Abra o aplicativo para revisar e confirmar os novos dados deste combinado."}'::jsonb,
       '[]'::jsonb, 'aprovado', true
where not exists (
  select 1 from public.templates where chave = 'resposta.correcao_aprovada' and contexto = 'padrao'
);

-- Resposta ao COBRADOR que digitou "recusar": os dados seguem como estavam.
insert into public.templates (chave, nome_meta, conteudo, variaveis, status_meta, ativo)
select 'resposta.correcao_recusada', 'resposta_correcao_recusada',
       '{"texto":"Tudo bem, os dados deste combinado seguem como estavam. Os lembretes voltam a valer."}'::jsonb,
       '[]'::jsonb, 'aprovado', true
where not exists (
  select 1 from public.templates where chave = 'resposta.correcao_recusada' and contexto = 'padrao'
);
