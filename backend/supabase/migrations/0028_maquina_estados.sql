-- F-STATE: refatoração da máquina de estados do aviso.
--
-- Renomeia o estado pós-aceite `pendente` -> `programado` (palavra que descreve o que
-- está acontecendo: o ciclo de lembretes está programado) e introduz os estados novos
-- das histórias (épicos 2/3/4/5/7): `sem_aviso` (modo agenda), `pausado`,
-- `aguardando_aprovacao_aviso_editado`, `recusado` (recusa do convidado, distinto de
-- `cancelado`) e `desregistrado` (devedor desativou lembretes, reversível).
--
-- Reescreve o trigger `validar_transicao_aviso` com TODAS as transições-alvo
-- (definidas mesmo sem produtor ainda, para os épicos seguintes) e o trigger
-- `encerrar_envios_do_aviso` para cancelar os envios também nos estados de SUSPENSÃO
-- (pausado / aguardando_aprovacao_aviso_editado / desregistrado), não só nos terminais.
--
-- ATENÇÃO billing: o `pendente` de billing (`faturas.status` em 0019) e o de
-- `status_meta_template` (0001/0022) são enums/contextos DIFERENTES; NÃO são tocados
-- por este `ALTER TYPE status_aviso`.
--
-- Postgres: `ALTER TYPE ... RENAME VALUE`/`ADD VALUE` não pode ter o valor USADO em DML
-- na mesma transação. Esta migration só renomeia/adiciona valores e (re)cria funções que
-- referenciam os labels como TEXTO em comparações (não é "uso" em DML), então é seguro.
-- Nenhum UPDATE/INSERT usa os valores novos aqui. O runner aplica cada arquivo com psql
-- (auto-commit por statement), logo os ADD/RENAME comitam antes do create das funções.

-- 1) Enum status_aviso: rename + novos estados (idempotente).
do $$
begin
  if exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'status_aviso' and e.enumlabel = 'pendente'
  ) then
    alter type status_aviso rename value 'pendente' to 'programado';
  end if;
end $$;

alter type status_aviso add value if not exists 'sem_aviso';
alter type status_aviso add value if not exists 'pausado';
alter type status_aviso add value if not exists 'aguardando_aprovacao_aviso_editado';
alter type status_aviso add value if not exists 'recusado';
alter type status_aviso add value if not exists 'desregistrado';

-- 2) Enum tipo_evento: eventos dos épicos futuros (idempotente). `recusado` já existe
--    (0017); `criado`/`aceite`/`confirmado_cobrador`/`rejeitado_cobrador`/
--    `desmarcado_cobrador`/`optout`/`cancelado_cobrador`/`expirado`/`solicitou_pix`/
--    `ja_paguei_devedor` já existem (0001/0011/0010).
alter type tipo_evento add value if not exists 'convite_gerado';
alter type tipo_evento add value if not exists 'ativado';
alter type tipo_evento add value if not exists 'editado';
alter type tipo_evento add value if not exists 'editado_aprovado';
alter type tipo_evento add value if not exists 'editado_recusado';
alter type tipo_evento add value if not exists 'pausado';
alter type tipo_evento add value if not exists 'reativado';
alter type tipo_evento add value if not exists 'desregistrado';
alter type tipo_evento add value if not exists 'reregistrado';
alter type tipo_evento add value if not exists 'pago_manual';

-- 3) Máquina de estados no banco (defesa em profundidade; a app também valida p/ erros
--    amigáveis). Substitui a versão de 0011. Transições-alvo (_CONTEXTO.md / plano mestre):
--    sem_aviso                              -> aguardando_aceite | cancelado | pago
--    aguardando_aceite                      -> programado | cancelado | expirado | recusado
--    programado                             -> informado_pago | pago | cancelado | expirado
--                                              | pausado | aguardando_aprovacao_aviso_editado
--                                              | desregistrado
--    informado_pago                         -> pago | programado | cancelado | expirado
--    pago                                   -> programado            (reabertura, E8 H8.6)
--    pausado                                -> programado | cancelado | expirado
--    aguardando_aprovacao_aviso_editado     -> programado | cancelado | expirado
--    desregistrado                          -> programado | cancelado | expirado
--  Terminais (`pago` salvo reabertura, `cancelado`, `recusado`, `expirado`) não saem.
create or replace function public.validar_transicao_aviso()
returns trigger
language plpgsql
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not (
    (old.status = 'sem_aviso' and new.status in ('aguardando_aceite', 'cancelado', 'pago')) or
    (old.status = 'aguardando_aceite' and new.status in ('programado', 'cancelado', 'expirado', 'recusado')) or
    (old.status = 'programado' and new.status in (
       'informado_pago', 'pago', 'cancelado', 'expirado',
       'pausado', 'aguardando_aprovacao_aviso_editado', 'desregistrado')) or
    (old.status = 'informado_pago' and new.status in ('pago', 'programado', 'cancelado', 'expirado')) or
    (old.status = 'pago' and new.status = 'programado') or -- reabertura (E8 H8.6)
    (old.status = 'pausado' and new.status in ('programado', 'cancelado', 'expirado')) or
    (old.status = 'aguardando_aprovacao_aviso_editado' and new.status in ('programado', 'cancelado', 'expirado')) or
    (old.status = 'desregistrado' and new.status in ('programado', 'cancelado', 'expirado'))
  ) then
    raise exception 'transicao de status invalida: % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- 4) Encerramento dos envios. Cancela todo envio ainda pendente ao entrar:
--    - em estado TERMINAL (`pago`, `cancelado`, `recusado`, `expirado`): "nunca mais
--      envia" definitivo (regra de ouro nº6);
--    - em estado de SUSPENSÃO (`pausado`, `aguardando_aprovacao_aviso_editado`,
--      `desregistrado`): os lembretes ficam suspensos enquanto durar o estado; ao voltar
--      a `programado` o ciclo é reprogramado a partir da etapa aplicável (E6 H6.7).
--  NÃO mexe em `horario_reservado_seg`: essa coluna ainda não existe (criada no E6, que
--  adicionará aqui a liberação/suspensão do segundo reservado).
create or replace function public.encerrar_envios_do_aviso()
returns trigger
language plpgsql
as $$
begin
  if new.status in (
       'pago', 'cancelado', 'recusado', 'expirado',
       'pausado', 'aguardando_aprovacao_aviso_editado', 'desregistrado'
     ) and old.status <> new.status then
    update public.envios
      set status = 'cancelado'
      where aviso_id = new.id and status in ('agendado', 'processando');
  end if;
  return new;
end;
$$;
