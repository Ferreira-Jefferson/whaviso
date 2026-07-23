-- Grupo 1G (docs/feedback-2026-07-22.md, item 22): "Ver Pix" passa a informar a QUE
-- combinado e a QUE valor a chave se refere, alem do tipo/chave ja adicionados na 0085.
--
-- resposta.ver_pix e texto livre (respondido dentro da janela de 24h; o zap o envia
-- SEM `comoTemplate`), entao nao passa por aprovacao da Meta: a versao ATIVA pode ser
-- editada IN PLACE, mesmo precedente ja usado na migration 0087 (parte A) e na propria
-- 0085 que criou este template. Nao mexe em status_meta/ativo.
--
-- Corpo novo (indexado {{1}}..{{n}}, variaveis mapeiam posicao->chave):
--   variaveis = [pix_tipo, pix_chave, motivo, valor]
--     -> {{1}} tipo (rotulo legivel), {{2}} chave, {{3}} motivo, {{4}} valor.
--   segue o mesmo formato aninhado (rotulo em negrito por linha) ja usado no ciclo de
--   lembretes e no resumo do combinado, para o devedor reconhecer do que se trata sem
--   abrir o combinado.
--
-- Coordenacao (fora do escopo desta migration, so nota): motivo/valor so chegam
-- preenchidos de fato quando o grupo 1E (zap/webhook_whatsapp/service.ts,
-- entregarChaveDePagamento) passar a resolver e enviar esses valores em `valores` no
-- render. Ate la esta migration fica inerte em producao (o texto so aparece completo
-- quando as duas mudancas subirem juntas); os dois grupos devem ir para o cloud na
-- MESMA leva de deploy.
--
-- Seguranca (padrao 0085): so reescreve se `variaveis` ainda for exatamente o estado
-- conhecido da 0085 (pix_tipo, pix_chave); customizacao do owner via painel nao e
-- sobrescrita.
--
-- Numeracao: 0096 (deste mesmo grupo) fecha o item 20; 0092-0095/0098/0099 sao de
-- outros grupos. Esta e a 0097.

update public.templates
set conteudo = jsonb_set(
      conteudo, '{texto}',
      to_jsonb(E'Chave Pix ({{1}}):\n{{2}}\n\n*Combinado*: {{3}}\n*Valor*: {{4}}\n\nConfira antes de pagar.'::text)
    ),
    variaveis = '["pix_tipo","pix_chave","motivo","valor"]'::jsonb
where chave = 'resposta.ver_pix'
  and contexto = 'padrao'
  and variaveis = '["pix_tipo","pix_chave"]'::jsonb;
