-- Template da mensagem de COMPRA DE CRÉDITO (recarga), empurrada ao WhatsApp do usuário
-- quando ele confirma a recarga (outbox notificacoes_billing 0060, drenada pelo zap).
-- O texto é editável pelo owner em /admin/mensagens/billing.recarga; aqui só seedamos a
-- versão inicial. Catálogo vai em MIGRATION (o seed do supabase não roda no cloud);
-- upsert idempotente, padrão da 0029.
--
-- Variáveis (ordem = {{1}}..{{7}}): quantidade, valor (R$ formatado), e a chave Pix da
-- plataforma vinda de config_plataforma (tipo, chave, titular, banco, comentário). TODAS
-- listadas na ordem para os índices baterem, mesmo as que não aparecem no texto inicial
-- (o owner pode adicioná-las ao editar). Sem palavra proibida (CHECK
-- templates_unif_linguagem_limpa), gênero neutro, sem travessão. Nasce aprovada + ativa
-- (não há gating da Meta: o número é próprio, pareado pelo Baileys).
--
-- Numeração: última migration = 0060 (notificacoes_billing); esta é a 0061.

insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'billing.recarga', 'padrao', 'whaviso_billing_recarga', 'pt_BR',
       jsonb_build_object('texto',
         E'Oi! Sua recarga de {{1}} envios foi registrada, no valor de {{2}}.\n\n'
         || E'Para concluir, é só pagar via Pix:\n'
         || E'Chave: {{4}}\n'
         || E'Titular: {{5}}\n'
         || E'Banco: {{6}}\n\n'
         || E'Depois, envie o comprovante aqui nesta conversa que a gente libera seus envios. 🙂'),
       '["quantidade","valor","pix_tipo","pix_chave","pix_titular","pix_banco","pix_comentario"]'::jsonb,
       'aprovado', true
where not exists (
  select 1 from public.templates where chave = 'billing.recarga' and contexto = 'padrao'
);
