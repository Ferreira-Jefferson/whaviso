-- DECISÃO DO DONO (sobrepõe H3.1): no fluxo PAGAR INVERTIDO (direcao='pagar',
-- criador=devedor que convida o cobrador) a chave Pix passa a ser OPCIONAL.
--
-- Antes, a constraint `avisos_invertido_tem_pix` (criada na 0035, redefinida na 0036)
-- exigia `pix_chave` para todo aviso invertido ativo (qualquer status que não fosse
-- `sem_aviso`/`pago`/`cancelado`). Pela decisão do dono o devedor-criador PODE gerar o
-- convite sem informar a chave de quem vai receber: o cobrador valida/ajusta ao
-- confirmar (H3.3) e a chave pode entrar depois via PATCH /avisos/:id. Sem chave o
-- `ver_pix` responde `resposta.sem_pix` (nada quebra).
--
-- Por isso DERRUBAMOS a constraint do invertido. O CHECK do receber (0031) NÃO muda: no
-- receber o Pix segue OBRIGATÓRIO. A obrigatoriedade amigável (receber) continua no
-- contrato/serviço; no invertido deixa de existir.
--
-- Numeração: última migration = 0046 (plus_piso_premium_mais_envio); esta é 0047.

alter table public.avisos drop constraint if exists avisos_invertido_tem_pix;
