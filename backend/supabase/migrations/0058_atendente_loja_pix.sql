-- SEC-032 (dono aprovou): o atendente gera o BR Code do Pix DENTRO da conversa. Para isso precisa
-- LER a chave cifrada da loja (`loja_pix`) e decifra-la em memoria na hora, para montar o "copia e
-- cola" (EMV + CRC16). Mesmo molde de `credenciais_llm` (0012): o atendente e o UNICO role de
-- servico que le este segredo, com SELECT POR COLUNA nas colunas minimas do BR Code; a master key
-- mora FORA do banco (um dump do banco sozinho nao revela chave nenhuma).
--
-- Fronteira mantida: a api continua dona da chave (set/rotate em `loja_pix`); o atendente so LE.
-- Nada de insert/update/delete para o atendente aqui. `chave_hash` fica de fora (so a api precisa
-- dele, para idempotencia de cadastro). A geracao do BR Code pela api e pelo atendente usa a MESMA
-- funcao pura do kernel (`@whaviso/shared/pix`), entao as duas nunca divergem.
grant select (loja_id, tipo, chave_cifrada, titular, cidade)
  on public.loja_pix to whaviso_atendente;

create policy atendente_loja_pix on public.loja_pix for select to whaviso_atendente using (true);
