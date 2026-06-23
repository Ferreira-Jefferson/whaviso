-- Canal de comando da sessão do WhatsApp (Baileys). A api (admin/owner) e o zap
-- são processos independentes: a api só escreve um COMANDO na linha única e o zap
-- (dono do socket) lê, executa (conectar / desconectar) e limpa o comando.
-- Assim o owner cria/derruba a conexão e pede um QR novo pela tela de admin, sem
-- a api conhecer o socket. (Transporte via Baileys até ~100 clientes.)

alter table public.whats_sessao
  add column comando text check (comando in ('conectar', 'desconectar')),
  add column comando_em timestamptz;

-- A api pode escrever SÓ as colunas de comando (nunca status/numero/qr, que são
-- do zap). Grant por coluna + policy de update: privilégio mínimo.
grant update (comando, comando_em) on public.whats_sessao to whaviso_api;
create policy api_whats_sessao_cmd on public.whats_sessao
  for update to whaviso_api using (true) with check (true);
