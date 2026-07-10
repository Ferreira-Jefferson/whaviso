-- Sincroniza no catálogo de `templates` a terminologia unificada "chave de pagamento" ->
-- "chave pix" (historias 06/07/14) e o rótulo do botão ver_pix "Chave de Pag." -> "Chave
-- Pix". A precaução de evitar a palavra "Pix" no rótulo era da época do WhatsApp não
-- oficial (Baileys); resolvida com a migração para a Meta Cloud API oficial e aprovada.
--
-- Migrations 0029/0031/0039/0040/0042/0048 já rodaram no cloud com o texto antigo; como o
-- Supabase não reaplica migration já registrada, o ajuste do texto precisa vir aqui, num
-- UPDATE novo. Nenhum destes templates foi submetido/aprovado na Meta ainda (status_meta
-- = 'pendente', sem meta_template_id), então não há ressubmissão a fazer.
--
-- Ambos os UPDATE só tocam linhas que ainda têm o texto/rótulo antigo: não sobrescrevem
-- customização feita pelo owner (Épico 12).

-- 1) Corpo de mensagem: "chave de pagamento" -> "chave pix".
update public.templates
set conteudo = jsonb_set(
  conteudo, '{texto}',
  to_jsonb(replace(conteudo->>'texto', 'chave de pagamento', 'chave pix'))
)
where conteudo ? 'texto'
  and conteudo->>'texto' like '%chave de pagamento%';

-- 2) Rótulo do botão ver_pix: "Chave de Pag." -> "Chave Pix".
update public.templates
set conteudo = jsonb_set(
  conteudo, '{botoes}',
  (
    select jsonb_agg(
      case
        when b->>'acao' = 'ver_pix' and b->>'rotulo' = 'Chave de Pag.'
          then jsonb_set(b, '{rotulo}', '"Chave Pix"')
        else b
      end
    )
    from jsonb_array_elements(conteudo->'botoes') b
  )
)
where conteudo ? 'botoes'
  and exists (
    select 1 from jsonb_array_elements(conteudo->'botoes') b
    where b->>'acao' = 'ver_pix' and b->>'rotulo' = 'Chave de Pag.'
  );

-- 3) Comentário de coluna (documentação; não afeta runtime).
comment on column public.avisos.entrega_chave_status is
  'E7/H7.3: marca a entrega da chave pix uma vez por combinado. NULL = reentregável; entregue = as duas mensagens (chave; titular+banco) saíram. Nunca guarda a chave.';
