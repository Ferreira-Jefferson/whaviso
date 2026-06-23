-- E4 (Modo agenda), H4.1: relaxar a CONSTRAINT DE DESTINO do convite para o estado
-- `sem_aviso` (anotação de agenda, anterior ao convite).
--
-- A constraint `avisos_convite_tem_destino` (0017) exige o telefone do ALVO do convite
-- já na criação (receber -> telefone_devedor; pagar invertido -> telefone_cobrador).
-- No modo agenda o item NASCE sem convite e o telefone da outra ponta é OPCIONAL: só
-- passa a ser obrigatório ao ATIVAR (H4.3, validado no serviço). Por isso o CHECK passa
-- a TOLERAR `status = 'sem_aviso'`, mantendo a exigência em todos os demais estados
-- (defesa em profundidade: um aviso fora da agenda nunca fica sem destino de convite).
--
-- Os CHECKs de Pix (0031 receber / 0035 invertido) já toleravam `sem_aviso`; este
-- fecha o último ponto que ainda exigia telefone na criação. Sem mudança de enum
-- (status_aviso já tem `sem_aviso`, F-STATE/0028) nem de tipo_evento (ativado/editado/
-- pago_manual já existem, 0028). Só recria a constraint.
--
-- Numeração: última migration = 0035 (aviso_invertido_pix_convite); esta é 0036.

-- Tolera tambem os TERMINAIS do caminho de agenda (`pago` por H4.5 / `cancelado` por
-- H4.4): uma anotacao fechada manualmente nunca enviou nada, logo pode nao ter destino
-- de convite. Um aviso que saiu da agenda ativando teve o destino exigido ao ativar.
alter table public.avisos drop constraint if exists avisos_convite_tem_destino;
alter table public.avisos
  add constraint avisos_convite_tem_destino check (
    status in ('sem_aviso', 'pago', 'cancelado')
    or case
         when direcao = 'receber' then telefone_devedor is not null
         when direcao = 'pagar' and criador_papel = 'devedor' then telefone_cobrador is not null
         else true
       end
  );

-- H4.5: MARCAR PAGO MANUAL (sem_aviso -> pago) fecha uma anotação que NUNCA enviou
-- nada, logo pode não ter Pix. As constraints de Pix (0031 receber / 0035 invertido)
-- exigiam Pix em todo estado != sem_aviso, o que barraria esse fechamento manual. O
-- Pix é exigência de quem ENVIA (convite/lembretes precisam da chave); um TERMINAL
-- alcançado sem nunca ativar não precisa. Recriamos as duas constraints tolerando
-- também `pago` e `cancelado` (terminais do caminho de agenda). Um aviso que chegou a
-- `pago` PELO ciclo sempre teve Pix (foi exigido ao ativar), então nada se perde.
alter table public.avisos drop constraint if exists avisos_receber_tem_pix;
alter table public.avisos
  add constraint avisos_receber_tem_pix
  check (
    direcao <> 'receber'
    or status in ('sem_aviso', 'pago', 'cancelado')
    or pix_chave is not null
  );

alter table public.avisos drop constraint if exists avisos_invertido_tem_pix;
alter table public.avisos
  add constraint avisos_invertido_tem_pix
  check (
    not (direcao = 'pagar' and criador_papel = 'devedor')
    or status in ('sem_aviso', 'pago', 'cancelado')
    or pix_chave is not null
  );
