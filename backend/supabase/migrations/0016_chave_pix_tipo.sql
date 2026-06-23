-- Tipo da chave Pix (cpf|cnpj|email|telefone|aleatoria). Dono: módulo `perfil`.
-- O tipo é essencial: determina como a chave é validada e exibida e o que o
-- pagador vê. A 0012 criou chaves_pix sem tipo; esta migration o adiciona.
-- Enum de domínio (padrão da 0001), mantido em sincronia com enums.ts dos dois lados.

create type tipo_chave_pix as enum ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria');

-- Coluna nullable só para permitir o backfill das linhas já existentes.
alter table public.chaves_pix add column tipo tipo_chave_pix;

-- Backfill: infere o tipo das chaves já cadastradas pelo formato (best-effort;
-- telefone é gravado em E.164, CPF tem 11 dígitos, CNPJ 14, e-mail tem "@").
update public.chaves_pix set tipo = (
  case
    when chave ~ '@'              then 'email'
    when chave ~ '^\+'           then 'telefone'
    when chave ~ '^[0-9]{11}$'   then 'cpf'
    when chave ~ '^[0-9]{14}$'   then 'cnpj'
    else 'aleatoria'
  end
)::tipo_chave_pix
where tipo is null;

-- A partir daqui o tipo é obrigatório em toda chave.
alter table public.chaves_pix alter column tipo set not null;
