-- Pedido agendado: instante futuro em que o cliente quer receber/retirar o pedido.
--
-- `agendado_para` e um instante absoluto (timestamptz, UTC no banco; a loja pensa em
-- America/Sao_Paulo). NULL = pedido imediato (comportamento de sempre). Aditivo: nao muda o
-- fluxo de estados nem as constraints existentes. Quem agenda e a api (modulo agendamento).
--
-- Grants: pedidos ja tem select/insert/update ao whaviso_api e ao whaviso_atendente em nivel de
-- TABELA (0005), o que cobre a coluna nova. Sem delta de grant, sem tabela nova (matriz inalterada).

alter table public.pedidos add column if not exists agendado_para timestamptz;

-- Agenda da cozinha: so pedidos agendados, por loja e instante.
create index if not exists pedidos_agendados
  on public.pedidos (loja_id, agendado_para)
  where agendado_para is not null;
