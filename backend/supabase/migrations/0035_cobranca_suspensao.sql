-- Suspensao de loja derivada do status da assinatura (modulo P-cobranca).
--
-- lojas.suspensa e DIFERENTE de lojas.ativo:
--   - lojas.ativo    = controle do DONO da loja (ligar/desligar a propria operacao);
--   - lojas.suspensa = controle da PLATAFORMA (Whaviso), derivado da cobranca. Um dono NAO
--     mexe em suspensa; ela so muda por este trigger, a partir de assinaturas.status.
-- Ter dois campos evita dois donos do mesmo bit e deixa a reativacao sem ambiguidade.
--
-- Quem deve HONRAR a flag (coordenacao, fora deste modulo): ZAP-webhook e AT-motor-min, ao ver
-- lojas.suspensa = true, nao processam pedidos e respondem indisponibilidade. Este modulo so
-- ENTREGA a flag; aqueles consumidores a leem (o atendente ja tem SELECT em lojas, migration 0002).

alter table public.lojas
  add column if not exists suspensa    boolean     not null default false,
  add column if not exists suspensa_em timestamptz;

-- Funcao do trigger: reflete o status da assinatura na(s) loja(s) alvo.
--   - suspensa | cancelada  => suspensa = true  (carimba suspensa_em na 1a vez);
--   - ativa    | trial       => suspensa = false (limpa suspensa_em).
-- Alvo: a loja da assinatura; se loja_id e NULL (assinatura da conta inteira), TODAS as lojas
-- da conta. SECURITY DEFINER: a suspensao e escrita pelo dono da funcao (nao pelo role da api),
-- mantendo a regra "o modulo nunca faz UPDATE em lojas". search_path fixo (defesa de SECURITY DEFINER).
create or replace function public.assinatura_aplica_suspensao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deve boolean;
begin
  -- So reage a MUDANCA de status (INSERT sempre; UPDATE so quando o status mudou de fato).
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  deve := new.status in ('suspensa', 'cancelada');

  if new.loja_id is not null then
    update public.lojas
       set suspensa = deve,
           suspensa_em = case when deve then coalesce(suspensa_em, now()) else null end
     where id = new.loja_id
       and suspensa is distinct from deve;   -- evita escrita redundante (e nao bump de atualizado_em)
  else
    update public.lojas
       set suspensa = deve,
           suspensa_em = case when deve then coalesce(suspensa_em, now()) else null end
     where conta_id = new.conta_id
       and suspensa is distinct from deve;
  end if;

  return new;
end;
$$;

create trigger trg_assinaturas_suspensao
  after insert or update of status on public.assinaturas
  for each row execute function public.assinatura_aplica_suspensao();

-- Indice parcial para o job de apuracao de atraso (varre faturas 'aberta' por vencimento).
create index if not exists faturas_abertas_vencimento
  on public.faturas (vencimento) where status = 'aberta';

-- Grants: NADA novo. whaviso_api ja tem select/insert/update em lojas e em assinaturas/faturas
-- (migrations 0002 e 0009, no nivel da tabela, cobrindo as colunas novas de lojas). whaviso_atendente
-- ja tem SELECT em lojas (0002), cobrindo a coluna suspensa; whaviso_zap NAO lia nem passa a ler
-- assinaturas/faturas (SEC-032 intacto). A escrita de lojas.suspensa e feita pelo trigger (definer),
-- nao por grant adicional.
