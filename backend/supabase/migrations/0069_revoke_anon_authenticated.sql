-- M3 (defesa em profundidade): REVOKE explicito de anon/authenticated no schema public.
--
-- Hoje a protecao contra a anon key (publica no bundle do front) ler dados via PostgREST
-- depende 100% de "RLS habilitado + nenhuma policy para anon/authenticated". Isso e correto,
-- mas fragil: se uma migration futura criar uma tabela e ESQUECER o `enable row level
-- security`, os grants padrao do Supabase (ALTER DEFAULT PRIVILEGES concede a anon/
-- authenticated em objetos novos do public) deixariam essa tabela legivel/gravavel por
-- qualquer visitante do site (que carrega a anon key). Este REVOKE tira o teto de privilegio
-- de anon/authenticated de forma explicita; o ALTER DEFAULT PRIVILEGES impede que objetos
-- FUTUROS nascam com esse grant. Cinto e suspensorio junto do RLS.
--
-- Nao quebra o app: o front so usa supabase-js para LOGIN; todo dado trafega pela api com
-- Bearer (nunca supabase.from()/PostgREST). service_role (bypassa RLS por design) e os roles
-- de servico (whaviso_api / whaviso_zap) NAO sao tocados aqui. O outro lado da defesa e o
-- check_rls_coverage.sh (backend/scripts) rodado no CI: garante que toda tabela de public
-- tem RLS ligado.

-- 1. Objetos JA existentes no schema public.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- 2. Objetos FUTUROS criados pelo role que aplica as migrations (postgres, tanto no cloud via
--    `supabase db push` quanto no harness local): nascem sem grant para anon/authenticated.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
