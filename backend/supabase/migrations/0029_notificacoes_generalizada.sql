-- E10a: GENERALIZA a outbox `notificacoes_cobrador` para virar a fundação de
-- notificação que E2/E3/E5/E7/E8 vão usar. Só INFRA: nenhum comportamento de
-- espaçamento/coalescing/janela (isso é E10b, depende do `desregistrado` do E7).
--
-- DECISÃO (menor risco): MANTER o nome da tabela `notificacoes_cobrador` e
-- GENERALIZAR as colunas. Renomear quebraria 13 arquivos (api/zap/admin/tests),
-- RLS/policies, grants, índices, a surface do admin e a 0014 — sem ganho real.
-- A generalização é aditiva: o alvo deixa de ser só o cobrador-com-conta.
--
-- O QUE MUDA:
--   - `cobrador_id` vira NULLABLE (alvo pode ser sem conta).
--   - `alvo_papel` (cobrador|devedor): a quem a notificação se dirige. No fluxo
--     `receber` o alvo é o cobrador; no `pagar` invertido, o devedor-criador.
--   - `telefone_alvo` (E.164): destino quando NÃO há `cobrador_id` (sem conta).
--     Roteamento do drainer: cobrador_id presente -> telefone do profile; senão
--     -> telefone_alvo.
--   - `dedupe_key` + índice único PARCIAL (enquanto não cancelado): antiduplicação
--     no enfileiramento. A chave incorpora aviso_id:tipo:ocorrencia; `ocorrencia`
--     avança a cada NOVO evento legítimo (toque duplo = 1; pago->rejeitado->pago = 2).
--   - CHECK de alvo: sempre há um destino (cobrador_id OU telefone_alvo).
--
-- Numeração: última migration = 0028 (maquina_estados); esta é 0029.

-- 1) cobrador_id nullable (a FK on delete cascade da 0014 é preservada).
alter table public.notificacoes_cobrador alter column cobrador_id drop not null;

-- 2) Papel do alvo. Default 'cobrador' para casar com o histórico (toda linha
--    existente da 0014 é "pagamento_informado" ao cobrador). papel_aviso (0017)
--    já existe e tem exatamente os valores cobrador|devedor.
alter table public.notificacoes_cobrador
  add column alvo_papel papel_aviso not null default 'cobrador';

-- 3) Telefone do alvo quando NÃO há conta (cobrador_id null). E.164, mesmo padrão
--    de avisos.telefone_cobrador (0017). NUNCA é logado: só roteamento de envio.
alter table public.notificacoes_cobrador add column telefone_alvo text;
alter table public.notificacoes_cobrador
  add constraint notif_cobrador_telefone_alvo_e164
  check (telefone_alvo is null or telefone_alvo ~ '^\+[1-9][0-9]{9,14}$');

-- 4) Sempre há um destino: profile (cobrador_id) OU telefone direto (telefone_alvo).
alter table public.notificacoes_cobrador
  add constraint notif_cobrador_tem_alvo
  check (cobrador_id is not null or telefone_alvo is not null);

-- 5) Antiduplicação no ENFILEIRAMENTO (H10.2/H10.8). dedupe_key =
--    'aviso_id:tipo:ocorrencia'. O índice único é PARCIAL (vale só enquanto a linha
--    NÃO foi cancelada): um par evento/contra-evento futuro (E10b) cancela a linha
--    por status='cancelado' (sem DELETE de negócio), liberando a chave para o
--    próximo ciclo legítimo. Linhas legadas (dedupe_key null) não colidem.
alter table public.notificacoes_cobrador add column dedupe_key text;
create unique index idx_notif_cobrador_dedupe
  on public.notificacoes_cobrador (dedupe_key)
  where dedupe_key is not null and status <> 'cancelado';

-- 6) Catálogo de templates dos eventos do épico (migration, NÃO seed — regra do
--    cloud). Upsert idempotente; nascem 'pendente'+inativos (gated pelo drainer:
--    sem template ativo a linha fica 'agendado' e visível ao owner). Conteúdo
--    neutro de gênero, sem palavras proibidas (CHECK templates_conteudo_linguagem_limpa),
--    sem travessão, identificando o combinado por {{...codigo...}}. Os PRODUTORES
--    (E5/E7/E8) ligam depois; aqui só garantimos as chaves + variante do invertido.
--
--    Variável de identificação do combinado em todas as chaves: {{codigo}} (os 6
--    primeiros do id, exibidos no painel/linha do tempo). Sem token/telefone.

-- H10.3 aceite — variante 'padrao' (receber: o cobrador soube que foi aceito).
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'cobrador.convite_aceito', 'padrao', 'whaviso_cobrador_convite_aceito', 'pt_BR',
       jsonb_build_object('texto',
         E'Oi, {{1}}. O combinado {{2}} foi aceito e entrou no ciclo de lembretes. 🙂'),
       '["alvo","codigo"]'::jsonb, 'pendente', false
where not exists (select 1 from public.templates where chave = 'cobrador.convite_aceito' and contexto = 'padrao');

-- H10.3 aceite no INVERTIDO (M3): o devedor-criador é avisado de que a chave Pix
-- foi confirmada pelo cobrador. Variante 'revisao' da MESMA chave (o drainer
-- escolhe a variante pelo papel: invertido => 'revisao'); o produtor (E5) liga depois.
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'cobrador.convite_aceito', 'revisao', 'whaviso_cobrador_convite_aceito_pix', 'pt_BR',
       jsonb_build_object('texto',
         E'Oi, {{1}}. O combinado {{2}} foi aceito e a chave de pagamento foi confirmada. 🙂'),
       '["alvo","codigo"]'::jsonb, 'pendente', false
where not exists (select 1 from public.templates where chave = 'cobrador.convite_aceito' and contexto = 'revisao');

-- H10.3 algum dado incorreto / chave Pix incorreta (sinal, sem texto livre do convidado).
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'cobrador.convite_dado_incorreto', 'padrao', 'whaviso_cobrador_convite_dado_incorreto', 'pt_BR',
       jsonb_build_object('texto',
         E'Oi, {{1}}. Quem recebeu o convite do combinado {{2}} apontou que algum dado está incorreto. Confira e reenvie o convite. 🙂'),
       '["alvo","codigo"]'::jsonb, 'pendente', false
where not exists (select 1 from public.templates where chave = 'cobrador.convite_dado_incorreto' and contexto = 'padrao');

-- H10.3 recusa (estado terminal `recusado`, F-STATE).
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'cobrador.convite_recusado', 'padrao', 'whaviso_cobrador_convite_recusado', 'pt_BR',
       jsonb_build_object('texto',
         E'Oi, {{1}}. O convite do combinado {{2}} foi recusado. 🙂'),
       '["alvo","codigo"]'::jsonb, 'pendente', false
where not exists (select 1 from public.templates where chave = 'cobrador.convite_recusado' and contexto = 'padrao');

-- H10.4 telefone divergente (não revela dados do combinado a quem não deve; vai só ao criador).
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'cobrador.convite_telefone_divergente', 'padrao', 'whaviso_cobrador_convite_telefone_divergente', 'pt_BR',
       jsonb_build_object('texto',
         E'Oi, {{1}}. O WhatsApp de quem tentou abrir o combinado {{2}} não bate com o que você cadastrou. Confira o número e reenvie o convite. 🙂'),
       '["alvo","codigo"]'::jsonb, 'pendente', false
where not exists (select 1 from public.templates where chave = 'cobrador.convite_telefone_divergente' and contexto = 'padrao');

-- H10.4 tentativas esgotadas, telefone cadastrado (novo número de validação gerado).
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'cobrador.convite_tentativas_esgotadas', 'padrao', 'whaviso_cobrador_convite_tentativas_esgotadas', 'pt_BR',
       jsonb_build_object('texto',
         E'Oi, {{1}}. Quem recebeu o convite do combinado {{2}} está com dificuldade para abrir. Geramos um novo número de validação para você reenviar. 🙂'),
       '["alvo","codigo"]'::jsonb, 'pendente', false
where not exists (select 1 from public.templates where chave = 'cobrador.convite_tentativas_esgotadas' and contexto = 'padrao');

-- H10.5 opt-out (o devedor desativou os lembretes). Tom neutro, sem acusação.
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'cobrador.optout', 'padrao', 'whaviso_cobrador_optout', 'pt_BR',
       jsonb_build_object('texto',
         E'Oi, {{1}}. Os lembretes do combinado {{2}} foram desativados por quem recebe. 🙂'),
       '["alvo","codigo"]'::jsonb, 'pendente', false
where not exists (select 1 from public.templates where chave = 'cobrador.optout' and contexto = 'padrao');

-- H10.5 reativação (voltou ao combinado).
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'cobrador.reativacao', 'padrao', 'whaviso_cobrador_reativacao', 'pt_BR',
       jsonb_build_object('texto',
         E'Oi, {{1}}. Os lembretes do combinado {{2}} foram reativados. 🙂'),
       '["alvo","codigo"]'::jsonb, 'pendente', false
where not exists (select 1 from public.templates where chave = 'cobrador.reativacao' and contexto = 'padrao');

-- NOTE E10b: o espaçamento de 10min por destinatário, o coalescing do par
-- opt-out/reativação, a janela de 1min e a 2a notificação na reativação NÃO entram
-- aqui (precisam do `desregistrado` do E7). Quando entrarem, o cancelamento será por
-- status='cancelado' (auditável em eventos_aviso), nunca DELETE; o índice único
-- parcial acima já libera a dedupe_key ao cancelar.
