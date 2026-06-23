-- E2 — H2.1: Pix OBRIGATÓRIO no fluxo receber + NOME DO TITULAR e BANCO da chave.
--
-- O botão "Chave de Pag." aparece em TODA mensagem do ciclo (Épico 6), então todo
-- combinado precisa de Pix. Antes a chave era opcional (`pix_chave` nullable e o
-- contrato `nullish()`); passa a ser obrigatória no `receber`.
--
-- Titular + banco compõem a 2ª mensagem enviada ao devedor quando ele pede o Pix
-- (Épico 7 H7.3). DECISÃO de armazenamento: colunas DENORMALIZADAS no próprio aviso
-- (`pix_titular`, `pix_banco`), não em chaves_pix. Motivos: (a) E7 lê do aviso
-- diretamente (uma query, sem join); (b) o aviso é um instantâneo do combinado (se o
-- usuário mudar a chave salva depois, o aviso mantém o titular/banco daquele acordo);
-- (c) no invertido (E3) o cobrador informa a chave no aceite, sem chave salva.
--
-- ATENÇÃO modo agenda (E4): em `sem_aviso` o Pix é DIFERIDO (só ao ativar). Por isso
-- NÃO usamos NOT NULL puro; o CHECK TOLERA `sem_aviso` (e os demais estados onde a
-- chave já deveria existir). Para o create normal, a obrigatoriedade real é validada
-- no SERVICE (mensagem clara). O CHECK é a defesa em profundidade do banco.
--
-- Linhas LEGADAS: o CHECK só exige Pix em `receber` quando o estado NÃO é `sem_aviso`.
-- O ambiente é novo (sem dados de produção legados sem Pix); se houver, o backfill é
-- por estado (sem_aviso tolera). Para segurança, `not valid` + validate evitaria
-- travar com legado, mas como não há legado problemático, aplicamos direto.

-- 1) Titular e banco da chave (texto curto; nunca logados — H13/segurança).
alter table public.avisos add column if not exists pix_titular text;
alter table public.avisos add column if not exists pix_banco text;
alter table public.avisos
  add constraint avisos_pix_titular_tam check (pix_titular is null or char_length(pix_titular) <= 120);
alter table public.avisos
  add constraint avisos_pix_banco_tam check (pix_banco is null or char_length(pix_banco) <= 80);

-- 2) Pix OBRIGATÓRIO no receber, TOLERANDO sem_aviso (modo agenda, E4) onde a chave é
--    diferida até ativar. Em qualquer outro estado do fluxo receber, a chave precisa
--    existir. O fluxo `pagar` (invertido) continua livre (a chave vem no aceite).
alter table public.avisos
  add constraint avisos_receber_tem_pix
  check (
    direcao <> 'receber'
    or status = 'sem_aviso'
    or pix_chave is not null
  );
