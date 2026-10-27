-- API-pagamentos: metadado de exibição da chave Pix.
--
-- A chave Pix é segredo (só hash + cifra em repouso, nunca em claro) e a api NUNCA a devolve
-- numa resposta. Para o painel conseguir mostrar "chave configurada (...1234)" sem decifrar
-- nada, guardamos os últimos caracteres da chave como metadado, igual a credenciais_llm.ultimos4.
-- É só máscara (poucos caracteres), não permite recompor a chave.
--
-- Aditivo: coluna nova numa tabela existente (0008). O grant de select/insert/update da api em
-- loja_pix é no nível da tabela (0008), então já cobre esta coluna automaticamente.

alter table public.loja_pix
  add column if not exists ultimos4 text;

alter table public.loja_pix
  drop constraint if exists loja_pix_ultimos4_fmt;
alter table public.loja_pix
  add constraint loja_pix_ultimos4_fmt
  check (ultimos4 is null or char_length(ultimos4) between 1 and 8);

comment on column public.loja_pix.ultimos4 is
  'Últimos caracteres da chave Pix, só para exibir a máscara no painel. Nunca a chave inteira.';
