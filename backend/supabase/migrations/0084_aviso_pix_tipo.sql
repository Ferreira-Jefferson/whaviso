-- Snapshot do TIPO da chave Pix no combinado (E7/H7.3). A 0031 guardou chave/titular/
-- banco denormalizados no aviso, mas NÃO o tipo (cpf|cnpj|email|telefone|aleatoria):
-- ele só vivia em chaves_pix (cadastro do cobrador, 0016) e em config_plataforma (0059).
-- Sem o tipo no aviso, a resposta "Ver Pix" (resposta.ver_pix) não conseguia informar ao
-- devedor QUE tipo de chave está pagando. Esta coluna guarda o tipo no momento da escolha
-- (fluxo receber: vem do cadastro; invertido/wizard E14: vem do tipo confirmado), para o
-- envio usar o tipo REAL, sem reinferir. Enum tipo_chave_pix já existe (0016).
--
-- Nullable de propósito: nem todo combinado tem chave (invertido sem chave). Quando há
-- chave mas o tipo ficou nulo (linha antiga ambígua), o zap resolve no envio (inferência
-- + fallback neutro), então a coluna não precisa ser NOT NULL.
--
-- Numeração: última migration = 0083 (aviso_itens); esta é a 0084.

alter table public.avisos add column if not exists pix_tipo tipo_chave_pix;

-- Backfill (best-effort) das linhas já existentes que TÊM chave:
-- 1) Autoritativo: casa a chave do aviso com a chave do cadastro do MESMO cobrador
--    (fluxo receber) e copia o tipo CONFIRMADO. Precisão máxima no caso ambíguo
--    (11 dígitos: CPF x celular), que o cobrador já resolveu no cadastro.
update public.avisos a
set pix_tipo = cp.tipo
from public.chaves_pix cp
where a.pix_tipo is null
  and a.pix_chave is not null
  and cp.profile_id = a.cobrador_id
  and cp.chave = a.pix_chave
  and not cp.arquivada;

-- 2) Fallback por formato SÓ nos casos inequívocos (fluxo pagar/externa, chave de terceiro
--    fora de qualquer cadastro). De propósito NÃO trata 11 dígitos: CPF e celular BR sem
--    país colidem, e chutar aqui mostraria um tipo ERRADO ao pagador. Esses (e o resto)
--    ficam nulos e o zap resolve no envio com a inferência precisa (checksum de CPF em
--    @whaviso/shared). Sem chave => segue nulo.
update public.avisos set pix_tipo = (
  case
    when pix_chave ~ '@'            then 'email'
    when pix_chave ~ '^\+'          then 'telefone'
    when pix_chave ~ '^[0-9]{14}$'  then 'cnpj'
  end
)::tipo_chave_pix
where pix_tipo is null and pix_chave is not null
  and (pix_chave ~ '@' or pix_chave ~ '^\+' or pix_chave ~ '^[0-9]{14}$');

-- O zap grava pix_tipo no snapshot ao concluir o wizard de cadastro de chave (E14,
-- H14.7), junto de pix_chave/titular/banco (grant da 0048). A api já tem grant de tabela
-- em avisos (0008), então a criação/edição pela api já cobre a coluna nova.
grant update (pix_tipo) on public.avisos to whaviso_zap;

comment on column public.avisos.pix_tipo is
  'E7/H7.3: tipo da chave Pix (snapshot). Copiado do cadastro no fluxo receber, do tipo confirmado no wizard E14. Nullable: sem chave = nulo; chave sem tipo resolvido = zap reinferre no envio.';
