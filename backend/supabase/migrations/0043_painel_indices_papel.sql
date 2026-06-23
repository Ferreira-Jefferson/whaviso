-- 0043: índices do PAINEL (E9) por PAPEL + estado + data combinada.
-- O painel filtra avisos por papel (cobrador_id / devedor_profile_id), por estado, e
-- ordena por data_combinada (H9.1/H9.3). Índices parciais por papel (ignoram linhas em
-- que aquele slot é nulo, ex.: cobrador_id null no invertido sem conta) cobrem a
-- listagem por papel, o resumo por papel (E9 H9.2) e a ordenação por data combinada.
-- Append-only ao schema (nenhum DELETE, nenhuma mudança de dado). Compatível com o
-- runtime atual; não altera a unicidade global de horário (D-HORARIO: na lógica).

create index if not exists idx_avisos_cobrador_status_data
  on public.avisos (cobrador_id, status, data_combinada)
  where cobrador_id is not null;

create index if not exists idx_avisos_devedor_status_data
  on public.avisos (devedor_profile_id, status, data_combinada)
  where devedor_profile_id is not null;
