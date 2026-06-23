-- E3 (Criar combinado, fluxo PAGAR INVERTIDO) — espelho do E2 com papéis trocados.
--
-- O que este épico fecha no banco (a maquinaria de estados/edição/pausa/notificação
-- já veio de F-STATE/E2/E10a; aqui só o que é ESPECÍFICO do invertido):
--
--  1) Pix OBRIGATÓRIO na CRIAÇÃO do invertido (H3.1): quem cria é o DEVEDOR e informa
--     a chave Pix de quem vai RECEBER. Antes (0017) o cobrador preenchia a chave no
--     aceite; pela história o devedor a informa na criação e o cobrador só confirma ou
--     aponta incorreta (H3.3). O CHECK exige Pix no `pagar` quando criado pelo devedor,
--     tolerando `sem_aviso` (modo agenda, E4, Pix diferido). Defesa em profundidade; a
--     obrigatoriedade amigável é validada no contrato/serviço.
--
--  2) UNICIDADE do número de convite POR TELEFONE DO COBRADOR (H3.2 / M1): no invertido
--     o convite vai ao COBRADOR, então a chave de unicidade é (telefone_cobrador,
--     convite_hash), espelhando o índice (telefone_devedor, convite_hash) do receber
--     (0030). Dois avisos com o mesmo telefone de cobrador não podem ter o mesmo número.
--
--  3) Evento `cancelado_criador` (C2): no invertido o ator do cancelamento é o
--     DEVEDOR-criador, não o cobrador. O evento herdado `cancelado_cobrador` é
--     semanticamente errado nesse fluxo (a linha do tempo do E9 mostraria "cobrador"
--     cancelando algo que o devedor cancelou). Adicionamos `cancelado_criador` ao enum
--     `tipo_evento` e o serviço passa a gravar o evento conforme o papel do criador.
--
--  4) Evento `pix_incorreto` (H3.3): sinal do cobrador "algum dado/chave incorreta"
--     (sem texto livre): não aceita nem recusa, só sinaliza para o devedor revisar.
--
-- ATENÇÃO: o estado terminal `recusado` (recusa do convidado) e a notificação ao
-- criador (outbox generalizada `notificacoes_cobrador` com `alvo_papel`/`telefone_alvo`
-- e os templates `cobrador.convite_aceito|convite_dado_incorreto|convite_recusado`) já
-- existem (0028 / 0029). Este épico apenas LIGA os produtores (api aceite + zap webhook).
--
-- Numeração: última migration = 0034 (templates_aviso_estado); esta é 0035.

-- 1) Pix obrigatório no invertido (criador = devedor), tolerando sem_aviso (E4).
--    O receber já tem o seu CHECK (0031). Aqui é o espelho para o pagar invertido.
alter table public.avisos
  add constraint avisos_invertido_tem_pix
  check (
    not (direcao = 'pagar' and criador_papel = 'devedor')
    or status = 'sem_aviso'
    or pix_chave is not null
  );

-- 2) Unicidade do número de convite por telefone do COBRADOR (alvo do convite no
--    invertido). Parcial: vale só quando ambos existem. Casa com o loop de geração
--    com retry no service (colisão 23505 -> regenera), igual ao do receber.
create unique index if not exists idx_avisos_convite_cobrador_unq
  on public.avisos (telefone_cobrador, convite_hash)
  where telefone_cobrador is not null and convite_hash is not null;

-- 3) Evento de cancelamento pelo CRIADOR (C2): ator correto no invertido. O
--    `cancelado_cobrador` (0001) permanece para compatibilidade do receber (não
--    apagamos valores de enum), mas o serviço passa a usar `cancelado_criador`.
alter type tipo_evento add value if not exists 'cancelado_criador';

-- 4) Sinal "algum dado / chave Pix incorreta" do cobrador no aceite (H3.3): não muda
--    o status (segue aguardando_aceite), só notifica o devedor para revisar/reenviar.
alter type tipo_evento add value if not exists 'pix_incorreto';

-- 5) RESPOSTA imediata e NEUTRA ao cobrador que tocou "Chave Pix incorreta" (H3.3):
--    "Certo, vamos comunicar sua resposta." É o texto vigente do botão (família
--    resposta.*, aprovada+ativa, igual a resposta.aceite/recusa da 0022). Sem palavra
--    proibida, sem travessão, neutro de gênero. Catálogo via migration (cloud não roda
--    seed). Idempotente.
insert into public.templates (chave, nome_meta, conteudo, variaveis, status_meta, ativo)
select 'resposta.dado_incorreto', 'resposta_dado_incorreto',
       '{"texto":"Certo, vamos comunicar sua resposta. 🙂"}'::jsonb,
       '[]'::jsonb, 'aprovado', true
where not exists (select 1 from public.templates where chave = 'resposta.dado_incorreto' and contexto = 'padrao');
