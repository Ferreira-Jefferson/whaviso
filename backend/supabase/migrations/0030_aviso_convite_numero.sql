-- E2 (Criar combinado, fluxo receber) — H2.2: NÚMERO DE CONVITE de 6 dígitos.
--
-- O devedor não recebe token: recebe um NÚMERO de convite de 6 dígitos, exibido como
-- xxx-xxx (o hífen é só visual). No banco fica APENAS o hash sha256 do número (regra
-- de ouro: número/token só como hash; claro nunca persiste/loga). O claro só sai uma
-- vez, na RESPOSTA da criação, para o cobrador compartilhar.
--
-- DECISÃO (coluna dedicada, não reuso de aceite_token_hash): o `aceite_token_hash`
-- (0003) é o token OPACO do link público de aceite (semântica diferente: link, não
-- número curto; unicidade GLOBAL com 256 bits). O número de convite é curto (6
-- dígitos = 1M de espaço) e precisa de unicidade REAL por telefone do devedor. Misturar
-- os dois numa coluna confundiria semântica e quebraria a unicidade por telefone. Por
-- isso: coluna própria `convite_hash`. O aceite_token continua existindo (a página/
-- webhook do E5 ainda o usam até o E5 reformular o aceite 100% no WhatsApp).
--
-- G-C1 (anti-brute-force): o CONTADOR de tentativas de validação do número nasce AQUI
-- (estrutura), embora o EFEITO (incrementar/bloquear ao receber a mensagem no WhatsApp)
-- seja do E5. Sem isto, o E5 teria de abrir migration só para a coluna. Default 0.
--
-- Numeração: última migration = 0029 (notificacoes_generalizada); esta é 0030.

-- 1) Hash do número de convite (sha256 hex, 64 chars). Nullable: o invertido (E3) e o
--    modo agenda (E4, `sem_aviso`) podem não ter convite ainda; só o create normal do
--    receber gera o número. O service garante a presença quando aplicável.
alter table public.avisos add column if not exists convite_hash text;
alter table public.avisos
  add constraint avisos_convite_hash_hex
  check (convite_hash is null or convite_hash ~ '^[0-9a-f]{64}$');

-- 2) Contador anti-brute-force (G-C1). Estrutura só; a LÓGICA (3 tentativas, bloqueio)
--    é do E5. Nasce 0; nunca decrementa (auditável).
alter table public.avisos add column if not exists convite_tentativas integer not null default 0;
alter table public.avisos
  add constraint avisos_convite_tentativas_nao_negativo check (convite_tentativas >= 0);

-- 3) UNICIDADE do número POR TELEFONE DO DEVEDOR (H2.2): dois avisos com o mesmo
--    telefone_devedor não podem ter o mesmo número de convite. Telefones DIFERENTES
--    podem repetir o número (o índice é pelo par). Parcial: só vale quando ambos
--    existem. Casa com o loop de geração com retry no service (colisão 23505 -> regenera).
create unique index if not exists idx_avisos_convite_unq
  on public.avisos (telefone_devedor, convite_hash)
  where telefone_devedor is not null and convite_hash is not null;
