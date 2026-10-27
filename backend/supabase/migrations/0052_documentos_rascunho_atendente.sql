-- SEC-032 (trava de banco): o role whaviso_atendente so pode INSERIR `documentos` com
-- status='rascunho'. O unico escritor atendente de `documentos` e o produtor da realimentacao
-- (retroalimentar_base / AT-realimentar), que por desenho so gera rascunhos; a aprovacao e exclusiva
-- do dono via `whaviso_api`. O grant da 0018 (select, insert) ja nega UPDATE/DELETE ao atendente, mas
-- nao impedia um INSERT com status='aprovado'. Este gatilho fecha o buraco por CONSTRUCAO.
--
-- So vale para o role de servico do atendente: `whaviso_api` (curadoria) e o superusuario (migrations,
-- seed, testes de integracao do rag que semeiam docs aprovados via postgres) seguem livres. A trava
-- tripla do RAG.md 3 (validador + aprovacao humana + versionamento) depende desta barreira: a producao
-- automatica nunca pode, por si, virar documento ativo.

create or replace function public.documentos_atendente_so_rascunho()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'whaviso_atendente' and new.status is distinct from 'rascunho' then
    raise exception 'whaviso_atendente so insere documentos com status rascunho (SEC-032)'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_documentos_atendente_so_rascunho on public.documentos;
create trigger trg_documentos_atendente_so_rascunho
  before insert on public.documentos
  for each row execute function public.documentos_atendente_so_rascunho();
