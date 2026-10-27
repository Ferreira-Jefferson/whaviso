-- Handoff human-in-the-loop: estado "aguardando atendente" (a IA pediu ajuda e ninguem
-- assumiu ainda). Antes, o pedido da IA so aparecia como status='humano' com
-- atendido_por_membro_id nulo; 'aguardando' torna o estado explicito e deixa a transicao
-- 'assumir' partir dele. A regra de 'assumir' tambem aceita 'humano' sem dono, mantendo
-- compatibilidade com o que o atendente ja escreve hoje.
--
-- ADD VALUE roda em autocommit (as migrations sao aplicadas com `psql -f`, sem bloco de
-- transacao envolvente): o novo valor fica disponivel apos o commit deste arquivo e nao pode
-- ser USADO numa mesma transacao com o ALTER. Este arquivo so altera o tipo, nada o usa.
alter type status_conversa add value if not exists 'aguardando' before 'humano';
