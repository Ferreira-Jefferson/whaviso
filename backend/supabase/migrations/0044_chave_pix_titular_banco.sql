-- Titular e banco passam a pertencer à CHAVE (chaves_pix), não só ao aviso.
--
-- A 0031 guardou titular/banco DENORMALIZADOS no aviso (pix_titular/pix_banco) como
-- instantâneo do combinado, e isso continua valendo (E7 lê do aviso, sem join; o
-- invertido informa a chave no aceite). Esta migration é ADITIVA: a chave salva passa
-- a carregar seu próprio titular/banco, para o usuário preenchê-los UMA vez por chave
-- (agrupados no cadastro) e o aviso herdar esses valores ao escolher/criar a chave.
--
-- Colunas NULLABLE: linhas legadas (backfill da 0012) não têm titular/banco; a
-- obrigatoriedade ao criar uma nova chave é validada no contrato/serviço (api), não
-- por NOT NULL. CHECKs de tamanho espelham os do aviso (titular <= 120, banco <= 80).
-- Grants inalterados: a 0012 já deu insert/update à whaviso_api (sem DELETE; zap não acessa).

alter table public.chaves_pix add column if not exists titular text;
alter table public.chaves_pix add column if not exists banco text;

alter table public.chaves_pix
  add constraint chaves_pix_titular_tam check (titular is null or char_length(titular) <= 120);
alter table public.chaves_pix
  add constraint chaves_pix_banco_tam check (banco is null or char_length(banco) <= 80);
