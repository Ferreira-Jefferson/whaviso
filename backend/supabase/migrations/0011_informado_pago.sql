-- Estado intermediário "Informado como pago": quando o devedor avisa que pagou,
-- o aviso NÃO vai direto para 'pago'. Fica em 'informado_pago' (em revisão) até o
-- cobrador confirmar o recebimento (informado_pago → pago) ou rejeitar
-- (informado_pago → pendente). Lembretes continuam (estado não-terminal).

alter type status_aviso add value if not exists 'informado_pago';

-- Evento do cobrador rejeitando a informação de pagamento (informado_pago → pendente).
alter type tipo_evento add value if not exists 'rejeitado_cobrador';

-- Máquina de estados atualizada (substitui a de 0003_avisos.sql).
create or replace function public.validar_transicao_aviso()
returns trigger
language plpgsql
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not (
    (old.status = 'aguardando_aceite' and new.status in ('pendente', 'cancelado', 'expirado')) or
    -- devedor avisa que pagou -> informado_pago; cobrador confirma direto -> pago.
    (old.status = 'pendente' and new.status in ('pago', 'informado_pago', 'cancelado', 'expirado')) or
    -- cobrador confirma (pago) / rejeita (pendente); devedor opt-out (cancelado); ciclo expira.
    (old.status = 'informado_pago' and new.status in ('pago', 'pendente', 'cancelado', 'expirado')) or
    (old.status = 'pago' and new.status = 'pendente') -- desmarcar recebimento
  ) then
    raise exception 'transicao de status invalida: % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
