-- Item 21 (plano 2026-07-22 grupo 1B): "código do combinado", persistido em coluna
-- própria. Hoje as mensagens do zap já usam um {{codigo}} (ver
-- apps/zap/.../notificar_cobrador/repo.ts) derivado ad-hoc de `substr(id::text,1,6)`;
-- esta migration introduz o código DE VERDADE, pensado para ser lido/digitado por
-- humano: alfanumérico curto (6 caracteres), MAIÚSCULO, excluindo os caracteres
-- ambíguos 0/O/1/I/L, gerado com aleatoriedade CRIPTOGRÁFICA e NÃO sequencial (não
-- vaza volume de combinados nem exige lock de sequence). A GERAÇÃO de código para
-- avisos NOVOS acontece em `criarAviso` (service.ts, node:crypto), com retry em
-- colisão; esta migration só cria a coluna e faz o backfill dos avisos já existentes.
--
-- NOTA (fora do escopo desta migration/tarefa): trocar a derivação ad-hoc do zap
-- (apps/zap) para ler esta coluna, e expor `codigo` no contrato de resposta do Aviso
-- (backend/packages/shared/src/contracts/entidades.ts) ficam para quem for dono
-- desses arquivos numa próxima rodada (ver nota no relatório do grupo 1B). Esta api
-- expõe o código só pela rota dedicada `GET /avisos/:id/codigo` (módulo avisos).
--
-- NULLABLE (decisão desta migration): outros módulos (ex.: apps/zap) têm harness de
-- teste que insere linhas em `public.avisos` por SQL direto, fora do `criarAviso` que
-- gera o código; um NOT NULL aqui quebraria esses fixtures fora do escopo deste grupo
-- (não são arquivos que este grupo possa tocar). A coluna fica NULLABLE + índice único
-- (nulls não colidem entre si em índice único do Postgres); `criarAviso` SEMPRE
-- preenche o código para avisos novos criados pela api.
--
-- Numeração: última migration = 0093 (dado_incorreto_schema); esta é 0094.

alter table public.avisos add column if not exists codigo text;

-- Backfill dos avisos já existentes (dev/local): gera um código único por linha com
-- uma função TEMPORÁRIA (só para este backfill; random() do Postgres não é o gerador
-- "de verdade" do produto, esse é em Node com node:crypto, ver criarAviso, mas é
-- aleatoriedade suficiente para preencher um punhado de linhas legadas com retry por
-- colisão). A função é derrubada ao final da migration.
create or replace function public._gerar_codigo_combinado_backfill()
returns text
language plpgsql
as $$
declare
  alfabeto text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; -- exclui 0/O/1/I/L (ambíguos)
  v_codigo text; -- prefixo v_ evita ambiguidade com a coluna avisos.codigo no WHERE abaixo
  tentativas int := 0;
begin
  loop
    v_codigo := '';
    for i in 1..6 loop
      v_codigo := v_codigo || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
    end loop;
    exit when not exists (select 1 from public.avisos where avisos.codigo = v_codigo);
    tentativas := tentativas + 1;
    if tentativas > 200 then
      raise exception 'nao foi possivel gerar codigo unico de combinado (backfill)';
    end if;
  end loop;
  return v_codigo;
end;
$$;

update public.avisos set codigo = public._gerar_codigo_combinado_backfill() where codigo is null;

-- Índice único (NÃO NOT NULL, ver nota acima): nulls não colidem entre si num índice
-- único do Postgres, então fixtures de teste que não preenchem o código continuam OK.
create unique index if not exists idx_avisos_codigo on public.avisos (codigo);

drop function public._gerar_codigo_combinado_backfill();

comment on column public.avisos.codigo is
  'Codigo curto do combinado (6 alfanumericos maiusculos, sem 0/O/1/I/L), gerado com aleatoriedade criptografica em criarAviso (service.ts). Nao sequencial: nao vaza volume. NULLABLE por compatibilidade com fixtures de teste de outros modulos que inserem em avisos por SQL direto (ver nota da migration); a api sempre preenche em avisos novos. Identifica o combinado para humanos (ex.: mensagens do zap, item 21).';
