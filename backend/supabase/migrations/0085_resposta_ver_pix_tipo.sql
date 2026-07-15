-- E7/H7.3: o "Ver Pix" passa a INFORMAR o tipo da chave (CPF/telefone/e-mail/...) junto da
-- chave. Ajuste feito por MIGRATION (não pelo editor do owner) porque o painel ainda não
-- está no ar; quando estiver, o owner segue editando normalmente por /admin/mensagens.
--
-- Corpo novo (indexado {{1}}..{{n}}, variaveis mapeiam posicao->chave):
--   variaveis = [pix_tipo, pix_chave]  ->  {{1}} = tipo (rótulo legível), {{2}} = chave.
--   "Chave Pix ({{1}}):\n{{2}}\n\nConfira antes de pagar."
-- Estrutura escolhida para passar na revisão da Meta (o resposta.ver_pix é texto livre na
-- janela 24h, mas o produto só ATIVA versão aprovada, 0073): {{1}} embutido em texto, {{2}}
-- separado por "):" + quebra de linha (nada de variáveis coladas), e nada no começo/fim.
--
-- O tipo é resolvido no ENVIO pelo zap: snapshot avisos.pix_tipo (0084) e, no fallback,
-- inferência por formato; ambíguo -> rótulo vazio (texto livre, só some o "(...)", sem
-- quebrar). Variável nova pix_tipo já existe no catálogo do editor (paleta).
--
-- Só toca o padrao ainda no formato antigo (1 variável), para não sobrescrever eventual
-- customização do owner. Não mexe em status_meta/ativo: na cloud segue "não enviado" para o
-- owner submeter/ativar; no dev o seed reativa o catálogo (ativo+aprovado) para os testes.
--
-- Numeração: última migration = 0084 (aviso_pix_tipo); esta é a 0085.

update public.templates
set conteudo = jsonb_set(
      conteudo, '{texto}',
      to_jsonb(E'Chave Pix ({{1}}):\n{{2}}\n\nConfira antes de pagar.'::text)
    ),
    variaveis = '["pix_tipo","pix_chave"]'::jsonb
where chave = 'resposta.ver_pix'
  and contexto = 'padrao'
  and variaveis = '["pix_chave"]'::jsonb;
