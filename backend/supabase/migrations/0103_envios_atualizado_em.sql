-- Gap encontrado em revisão (2026-07-26): `envios` não tinha `atualizado_em`, então quando
-- o zap atualiza `entrega_status` (sent -> delivered -> read, via webhook_whatsapp) o
-- carimbo de GET /sync/versao (sync/repo.ts) não avançava: o front podia achar que "nada
-- mudou" e nunca recarregar `mensagens_lidas_qtd` do painel (painel/repo.ts). Mesmo padrão
-- já usado em avisos (0003) e creditos_carteira (0057/0058).
--
-- Numeração: última migration = 0102 (reporte_nome_motivo_separados); esta é 0103.

alter table public.envios add column atualizado_em timestamptz not null default now();

-- Backfill das linhas existentes: reflete a realidade de cada uma (se já foi enviada, usa
-- enviado_em; senão criado_em) em vez de carimbar tudo com now() no momento da migration.
-- É um UPDATE direto de manutenção (não passa pela api/zap), então roda antes do trigger
-- abaixo sem risco de o trigger sobrescrever o valor: o trigger só afeta updates futuros.
update public.envios set atualizado_em = coalesce(enviado_em, criado_em);

-- Reusa a função genérica já criada em 0002_profiles.sql (não recriar).
create trigger trg_envios_atualizado_em
  before update on public.envios
  for each row execute function public.tocar_atualizado_em();

-- 0070_zap_grants_por_coluna restringiu o UPDATE do whaviso_zap em envios a colunas
-- específicas. Sem incluir atualizado_em aqui, o trigger acima bateria de frente com esse
-- privilégio por coluna sempre que o zap atualiza entrega_status/status/etc (mesmo caso já
-- resolvido para creditos_carteira no próprio 0070). Não é dado de fronteira entre módulos,
-- é só o carimbo de frescor da própria linha que o zap já está autorizado a tocar.
grant update (atualizado_em) on public.envios to whaviso_zap;
