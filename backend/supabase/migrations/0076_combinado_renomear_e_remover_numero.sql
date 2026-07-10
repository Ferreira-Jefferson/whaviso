-- Refatoração "convite" -> "combinado enviado direto para aceite".
--
-- Contexto: a lógica de CONVITE nasceu na era Baileys, quando o Whaviso NÃO podia iniciar a
-- conversa: o criador compartilhava um link à mão e o convidado tinha que escrever primeiro
-- e digitar um NÚMERO de 6 dígitos para ser reconhecido. Toda a maquinaria em volta disso
-- (número com hash, busca por hash, anti-brute-force por telefone, detecção de telefone
-- divergente, templates de fallback) existe SÓ por causa desse caminho.
--
-- Com a Meta Cloud API oficial o Whaviso INICIA a conversa (0067): manda o resumo do
-- combinado direto ao convidado, por template aprovado, com os 3 botões (aceitar / dado
-- incorreto / recusar). Então o número e seus fallbacks viraram peso morto.
--
-- Esta migration (forward-only):
--   1) aposenta a maquinaria do número (índices, colunas de hash/contador, tabela de
--      tentativas por telefone) -- são estruturas de rate-limit/lookup, não linhas de
--      auditoria de negócio (o rastro fica em `eventos_aviso`, intocado);
--   2) renomeia o evento `convite_gerado` -> `combinado_gerado` (linhas existentes são
--      guardadas pelo id interno do enum -> sem backfill);
--   3) renomeia a CHAVE dos templates sobreviventes (`convite.* -> combinado.*`) e APAGA os
--      templates que só serviam ao caminho do número/brute-force/divergência;
--   4) remapeia as linhas de outbox `convite_*` ainda agendadas para os novos tipos.
--
-- A etapa de aceite FICA: o combinado continua nascendo em `aguardando_aceite`, o ciclo de
-- lembretes só ativa no aceite, e a expiração de 7 dias (`avisos.convite_expira_em`) segue
-- valendo -- por isso essa coluna NÃO é removida (renomeá-la mexeria em grants/SELECTs por
-- valor quase nulo, mantemos o nome físico).
--
-- nome_meta dos templates NÃO muda de propósito: é o identificador do template no lado da
-- Meta (invisível ao usuário); renomeá-lo forçaria re-aprovação de templates que funcionam,
-- sem ganho. A re-aprovação de `combinado.resumo` já é exigida pelo 0067 (o corpo mudou lá),
-- independente deste rename de chave.
--
-- Numeração: última migration = 0075 (ciclo_d_padrao_negrito); esta é a 0076.

-- ---------------------------------------------------------------------------------------
-- 1) Aposentar a maquinaria do número de convite.
-- ---------------------------------------------------------------------------------------
drop index if exists public.idx_avisos_convite_unq;            -- (telefone_devedor, convite_hash), 0030
drop index if exists public.idx_avisos_convite_cobrador_unq;   -- (telefone_cobrador, convite_hash), 0035

-- Dropar a coluna leva junto o CHECK (avisos_convite_hash_hex) e o grant por-coluna (0037).
alter table public.avisos drop column if exists convite_hash;
-- Leva junto o CHECK (avisos_convite_tentativas_nao_negativo); contador por-aviso já sem produtor.
alter table public.avisos drop column if exists convite_tentativas;

-- Rate-limit por telefone (0037): estado mutável, não auditoria. Sai com suas policies/grants.
drop table if exists public.convite_tentativas_telefone;

-- ---------------------------------------------------------------------------------------
-- 2) Renomear o valor de enum. Único convite-named em tipo_evento (0028).
--    Linhas de eventos_aviso são guardadas pelo id interno do enum -> leem como o novo nome.
-- ---------------------------------------------------------------------------------------
alter type public.tipo_evento rename value 'convite_gerado' to 'combinado_gerado';

-- ---------------------------------------------------------------------------------------
-- 3) Templates. A tabela `templates` é configuração (owner apaga versões), então DELETE é
--    permitido aqui. Renomeamos a CHAVE dos sobreviventes e apagamos os do caminho do número.
-- ---------------------------------------------------------------------------------------

-- 3.1) Sobreviventes: renomear chave (mantém nome_meta, conteúdo, status_meta, botões).
update public.templates set chave = 'combinado.resumo'            where chave = 'convite.resumo';
update public.templates set chave = 'combinado.ja_respondido'     where chave = 'convite.ja_respondido';
update public.templates set chave = 'cobrador.combinado_aceito'         where chave = 'cobrador.convite_aceito';
update public.templates set chave = 'cobrador.combinado_recusado'       where chave = 'cobrador.convite_recusado';
update public.templates set chave = 'cobrador.combinado_dado_incorreto' where chave = 'cobrador.convite_dado_incorreto';

-- 3.2) Apagar os templates que só existiam pelo caminho do número/brute-force/divergência.
delete from public.templates where chave in (
  'convite.pedir_numero',
  'convite.nao_encontrado',
  'convite.expirado',                    -- toque de botão em expirado cai em combinado.ja_respondido
  'convite.telefone_divergente',
  'convite.tentativas_cadastrado',
  'convite.bloqueado',
  'cobrador.convite_telefone_divergente',
  'cobrador.convite_tentativas_esgotadas'
);

-- ---------------------------------------------------------------------------------------
-- 4) Remapear outbox em trânsito. `notificacoes_cobrador.tipo` é text; as linhas ainda
--    agendadas precisam casar com as novas chaves de CONFIG do drainer após o deploy.
--    Os tipos de telefone_divergente/tentativas_esgotadas deixam de ter handler: as linhas
--    agendadas (se houver) são canceladas para não travar a fila.
-- ---------------------------------------------------------------------------------------
update public.notificacoes_cobrador
   set tipo = 'combinado_' || substring(tipo from 9)  -- 'convite_' tem 8 chars
 where status = 'agendado'
   and tipo in ('convite_enviar', 'convite_aceito', 'convite_recusado', 'convite_dado_incorreto');

update public.notificacoes_cobrador
   set status = 'cancelado'
 where status = 'agendado'
   and tipo in ('convite_telefone_divergente', 'convite_tentativas_esgotadas');
