-- Remove o emoji de rosto feliz (🙂) das mensagens do produto e ressubmete à Meta,
-- da maneira correta, os templates que INICIAM conversa.
--
-- Contexto: o 🙂 foi adicionado por edições no painel (novas versões) e vive só no
-- banco (não está em nenhuma migration nem no seed). Duas classes de mensagem, dois
-- tratamentos distintos, porque a Meta só entra numas:
--
--   (A) TEXTO LIVRE (janela de 24h): respostas a botão / wizard de Pix. O zap as envia
--       SEM `comoTemplate` (réplica dentro da janela), então NÃO precisam de aprovação
--       da Meta. Não dá para versioná-las e ressubmeter (ativar exige status aprovado, e
--       texto livre não vai à Meta). Logo, o 🙂 sai NA PRÓPRIA versão, in-place.
--       São: as 9 que nunca foram submetidas (meta_submetido_em IS NULL, família
--       resposta.*/combinado.ja_respondido) + as 4 resposta.* que estão 'aprovado'
--       por herança (resposta.aceite/ja_paguei/optout/recusa). O envio de texto livre
--       depende só de `ativo` (carregarTemplateAtivo), não de status_meta, então
--       reescrever o texto da versão ativa mantém tudo funcionando, sem emoji.
--
--   (B) TEMPLATE DE VERDADE (inicia conversa, fora da janela): ciclo.*, cobrador.*,
--       devedor.* enviados com `comoTemplate` pelos drains. Para tirar o 🙂 sem MEXER
--       na versão aprovada e sem conflitar com a Meta, criamos uma NOVA versão (mesma
--       chave/contexto) com NOME NOVO (base + próximo número), sem emoji, e enfileiramos
--       a submissão (meta_acao='criar'). Como o nome_meta é novo, o zap faz CREATE (novo
--       template na WABA), a aprovada continua no ar e envia normalmente até o owner
--       ativar a nova quando a Meta aprovar. São 18 linhas.
--
-- Segurança/idempotência (padrão 0078/0080): tudo é guardado por `texto LIKE '%🙂%'`.
-- No banco de DEV (migrations + seed) NÃO existe o emoji, então esta migration é NO-OP
-- lá (não cria versão nem mexe em status): só corrige o estado real do cloud. A remoção
-- tira o emoji e o espaço adjacente (\s*🙂) e apara as bordas (btrim), preservando o
-- resto do texto (inclusive customizações do owner). As CHECKs de linguagem/travessão
-- seguem satisfeitas (só remove caractere).
--
-- Numeração: última migration = 0086 (grant_insert_envios_zap); esta é a 0087.

-- (A) Texto livre: tira o 🙂 na própria versão (in-place).
update public.templates
   set conteudo = jsonb_set(
         conteudo, '{texto}',
         to_jsonb(btrim(regexp_replace(conteudo->>'texto', '\s*🙂', '', 'g')))
       )
 where (conteudo->>'texto') like '%🙂%'
   and (meta_submetido_em is null or chave like 'resposta.%');

-- (B) Templates iniciadores: nova versão sem 🙂 (nome base + próximo número),
--     enfileirada para submissão (CREATE), sem tocar na aprovada/ativa.
insert into public.templates
  (chave, contexto, nome_meta, idioma, conteudo, variaveis, versao, status_meta, ativo, categoria, exemplos, meta_acao)
select
  t.chave,
  t.contexto,
  -- base = nome da versão ativa sem o sufixo numérico; + próximo número da chave/contexto.
  regexp_replace(t.nome_meta, '_[0-9]+$', '')
    || '_' || ((select max(x.versao) from public.templates x where x.chave = t.chave and x.contexto = t.contexto) + 1),
  t.idioma,
  jsonb_set(
    t.conteudo, '{texto}',
    to_jsonb(btrim(regexp_replace(t.conteudo->>'texto', '\s*🙂', '', 'g')))
  ),
  t.variaveis,
  (select max(x.versao) from public.templates x where x.chave = t.chave and x.contexto = t.contexto) + 1,
  'pendente', false, t.categoria, t.exemplos, 'criar'
from public.templates t
 where t.status_meta = 'aprovado' and t.ativo
   and (t.conteudo->>'texto') like '%🙂%'
   and t.chave not like 'resposta.%';
