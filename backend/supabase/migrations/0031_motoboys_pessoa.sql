-- Motoboy = pessoa de cargo fixo 'motoboy' (0025). A pessoa (nome, telefone) vive em `pessoas`;
-- `motoboys` guarda so o que e de entrega (veiculo, placa, Pix) e o vinculo com a pessoa.
-- pessoa_id e NULL nas linhas legadas (cadastro isolado anterior); uma pessoa tem no maximo um motoboy.
alter table public.motoboys
  add column pessoa_id uuid references public.pessoas (id);
create unique index motoboys_pessoa_unica on public.motoboys (pessoa_id) where pessoa_id is not null;
