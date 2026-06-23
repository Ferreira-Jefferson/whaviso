-- E10b: COMPORTAMENTO da fila de saída (H10.5, H10.6, H10.8, H10.9). Só INFRA de
-- dados aqui; a lógica (espaçamento, coalescing, janela, limite de plano) vive no
-- enfileirador (api/zap) e no drainer (zap). Numeração: última migration = 0040
-- (interacao_devedor); esta é a 0041.
--
-- O QUE MUDA:
--   1) `notificacoes_cobrador.agendar_para` (timestamptz, default now()): janela de
--      1min do opt-out (H10.5) e base do espaçamento de 10min por destinatário (H10.9).
--      O claim do drainer passa a respeitar `agendar_para <= now()`.
--   2) `notificacoes_cobrador.enviado_em` (timestamptz): carimbo do envio efetivo,
--      usado para calcular o espaçamento de 10min/destinatário NO CLAIM (subquery do
--      último envio ao mesmo alvo). Runtime, sem coluna `liberado_apos` separada
--      (decisão: mais simples e "só banco"; o índice por alvo torna a subquery barata).
--   3) `notificacoes_cobrador.coalesce_grupo` (text): chave do PAR evento/contra-evento
--      que se anula (H10.5/H10.9). Para o opt-out: 'aviso_id:optout_reativa'. A
--      reativação dentro da janela cancela (status='cancelado') a linha optout do
--      MESMO grupo ainda não enviada; o índice parcial acelera o lookup.
--   4) `tipo_evento` ganha 'notificacao_coalescida' (M5): auditoria APPEND-ONLY de cada
--      cancelamento por coalescing em `eventos_aviso` (sem PII; detalhes em jsonb com
--      o tipo da notificação e o motivo). Adicionado como valor de enum em statement
--      próprio; só é USADO pelo app (nunca nesta migration, p/ não consumir na mesma tx).
--
-- DECISÕES de modelagem:
--   * Espaçamento de 10min: RUNTIME no claim (subquery do MAX(enviado_em) por alvo),
--     não coluna persistida. Vale entre processos e sobrevive a restart (lê do banco),
--     complementa (não substitui) a distância de 10min/devedor do agendamento (H6.9).
--   * Limite de plano (H10.8): NÃO é um novo status de enum (evita ALTER TYPE no enum
--     compartilhado `status_envio`). A linha que bate no limite vira status='cancelado'
--     com erro='bloqueado_plano' (VISÍVEL/auditável, fora do claim, fora do retry, não
--     conta como falha de entrega) + evento de auditoria. Coerente com "sem DELETE".

-- 1) Agendamento da linha (janela de 1min do opt-out + base do espaçamento).
alter table public.notificacoes_cobrador
  add column if not exists agendar_para timestamptz not null default now();

-- 2) Carimbo do envio efetivo (base do espaçamento de 10min por destinatário).
alter table public.notificacoes_cobrador
  add column if not exists enviado_em timestamptz;

-- 3) Grupo de coalescing do par evento/contra-evento (opt-out/reativação).
alter table public.notificacoes_cobrador
  add column if not exists coalesce_grupo text;

-- Índice do claim revisto: só linhas DEVIDAS (agendar_para <= now()), ordenadas por
-- agendar_para. Substitui o índice por criado_em (a ordem de saída passa a ser por
-- agendamento, não por criação).
drop index if exists public.idx_notif_cobrador_due;
create index idx_notif_cobrador_due on public.notificacoes_cobrador (agendar_para)
  where status in ('agendado', 'processando');

-- Índice para o espaçamento de 10min (MAX enviado_em por destinatário) e para o
-- lookup do coalesce_grupo. Parcial nas linhas que importam.
create index if not exists idx_notif_cobrador_alvo_enviado
  on public.notificacoes_cobrador (cobrador_id, telefone_alvo, enviado_em)
  where status = 'enviado';
create index if not exists idx_notif_cobrador_coalesce
  on public.notificacoes_cobrador (coalesce_grupo)
  where coalesce_grupo is not null and status in ('agendado', 'processando');

-- 4) Auditoria do coalescing (M5): novo valor de enum, em statement próprio. Usado só
--    pelo app (eventos_aviso.tipo = 'notificacao_coalescida', detalhes sem PII).
alter type tipo_evento add value if not exists 'notificacao_coalescida';

-- 5) Limite de plano para a notificação ao alvo (H10.8). O drainer (whaviso_zap) NÃO
--    tem acesso às tabelas de billing (planos/assinaturas, por privilégio mínimo). Esta
--    função SECURITY DEFINER expõe SÓ o booleano "esta conta pode ENVIAR notificações
--    por WhatsApp", sem vazar dado de billing. Alavanca usada: `somente_leitura` do
--    catálogo (E11) — o plano FREE é somente leitura (mantém agenda/painel, NÃO envia).
--    Quando NULL (alvo sem conta / criador sem profile), retorna true: cobrador/devedor
--    sem conta só tem o WhatsApp como canal (H10.7), não há plano a limitar.
create or replace function public.notificacao_pode_enviar(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when uid is null then true
    else coalesce(
      (select not al.somente_leitura from public.alavancas_do_plano(uid) al limit 1),
      true
    )
  end;
$$;

grant execute on function public.notificacao_pode_enviar(uuid) to whaviso_zap;
