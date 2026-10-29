# Auditoria de queries: performance e segurança

Data: 2026-10-29.

Este documento mapeia todas as consultas ao banco do whaviso (os três serviços: `api`,
`zap`, `atendente`) e aponta onde cada uma pode ficar mais rápida, pedir menos dado,
baixar menos pela rede ou passar a paginar. Também confere a segurança de dados de cada
consulta: isolamento por loja (multi-tenant), exposição de dado pessoal (PII) e risco de
injeção.

O objetivo é achar ganho de performance antes do volume crescer. O sistema tem que
nascer pronto para volume grande, não corrigir gargalo depois.

## Como ler este documento

As mesmas regras do `pendencias-pos-corte.md`:

- Português simples. Frases curtas. Voz ativa.
- Nunca usar travessão. Vírgula, dois-pontos ou parênteses.
- Cada achado com problema segue quatro títulos:
  - **Local:** arquivo e função.
  - **Como está:** o comportamento de hoje.
  - **Como deveria:** o comportamento desejado.
  - **Exemplo:** um caso concreto e curto (pode ser SQL).
- Consulta sem problema aparece em uma linha, marcada "OK".

Severidade: **ALTA** (dói com volume, no caminho quente), **MÉDIA** (dói em telas
específicas ou jobs), **BAIXA** (ganho pequeno ou risco mitigado por quem chama).

## O que já está resolvido (não re-sinalizado)

- `clientes`: read-model com `pedidos_total` e `ordenado_em` por trigger (migration 0083);
  a listagem já usa cursor.
- Serializer global de resposta da `api` é o `fast-json-stringify`: emite só os campos
  do schema, então over-fetch no SQL que não está no schema de resposta não vaza para o
  cliente (mas ainda custa leitura e tráfego entre api e banco).
- Índices e `pg_trgm` da migration 0081.
- Coalescência single-flight no leitor de escopo.
- Drenos de outbox do `zap` (`envios`, `emails_outbox`): claim em lote de 10, com
  `FOR UPDATE SKIP LOCKED`, índice parcial no claim e colunas mínimas. Estão corretos.

## Visão geral de segurança

Resultado bom e consistente nos seis territórios:

- **Injeção: nenhuma.** Todo SQL usa `sql` parametrizado. Todo `sqlBruto` recebe só
  constante do código (nome de coluna de lista fixa, fragmento `to_char`, texto vazio).
  Nenhum valor do usuário entra cru em SQL.
- **Isolamento por loja: sólido.** Toda consulta de loja filtra `loja_id`. As únicas
  consultas globais são por desenho: a conciliação do webhook de pagamento por
  `(provider, charge_ref)`, o recibo de WhatsApp por `wamid`, e os jobs de plataforma
  (console do operador) que cruzam lojas de propósito e só devolvem metadado.
- **Chaves e tokens:** nunca saem em projeção. `chaves_api` devolve só `prefixo`/`ultimos4`
  (nunca o `hash_sha256`); número do WhatsApp, credencial LLM e credencial do PSP saem só
  cifrados, em leituras dedicadas, nunca em log.

Os pontos de atenção de segurança (todos detalhados adiante) são poucos e de risco
baixo a médio:

1. **PII, MÉDIA: `pagamentos.listar` devolve `br_code` de todas as cobranças.** O `br_code`
   é o copia-e-cola do Pix e embute a chave Pix da loja em claro. Numa lista sem teto, sai
   o payload de todas as cobranças. Omitir na lista, devolver só no detalhe. (Território D.)
2. **Defesa em profundidade, BAIXA: subqueries e `on conflict` sem `loja_id`.** Em
   `promocoes.contarUsos`/`usoExistente`, `fidelidade.descontoDoResgate`, subquery `ja` de
   `ficha_tecnica.baixarConsumo`, `on conflict` de `upsertVinculo*` (cardápio) e
   `salvarLinha` (ficha), e `conta.atualizarMembro` (update só por `id`). Hoje as guardas
   dos services protegem, e as chaves são UUID único. Se um caller novo esquecer a guarda,
   vira vazamento entre lojas. Acrescentar o filtro é barato. (Territórios B, D.)
3. **Regra de acesso, MÉDIA: `aprovarDonoPorPagamento` reabre acesso revogado sem
   auditoria.** Quando o dono paga uma fatura, o `on conflict` reaprova o e-mail na
   allowlist, mesmo que o operador tenha revogado antes, e não grava evento. Decidir a
   regra e registrar o evento. (Território E.)
4. **PII em job, por desenho: a retroalimentação passa PII de todas as lojas pela
   memória do processo** (nome, endereços e texto da mensagem), justamente para ocultar
   esses dados antes de gerar o rascunho. Manter a ocultação, limitar o `array_agg` de
   endereços e nunca logar as linhas. (Território F.)

Nenhum desses é vazamento ativo hoje. O item 1 é o único que já expõe dado além do
necessário na resposta.

## Padrões que se repetem (onde está o maior ganho)

Cinco padrões respondem pela maioria dos achados. Atacar o padrão resolve muitos pontos
de uma vez.

### P1. Função de data sobre a coluna mata o índice (o mais comum)

**Como está:** várias somas e filtros por período envolvem a coluna de data numa função
(`date_trunc(...)`, `(criado_em at time zone ...)::date`, `coalesce(entregue_em, criado_em)`).
O Postgres não usa o índice por faixa e lê todo o histórico da loja, que cresce sem parar.

**Como deveria:** comparar a coluna crua com limites calculados uma vez (faixa
`>= inicio and < fim`).

Onde aparece:
- `configuracoes_llm.totalMes`/`porOrigem`/`porModelo` (`uso_llm`, cresce a cada turno do
  atendente).
- `llm_client.gastoDoDiaCentavos` (roda antes de cada chamada de LLM, teto de gasto).
- `pedidos.listarColuna`, filtro de dia do kanban.
- `relatorios.formasPagamento` (`pago_em`), `relatorios.coortes`, `crm.itensMaisVendidos`.
- `contas_pagar.materializarEntregasPeriodo` (`(entregue_em at time zone ...)::date`).
- `custos` (quatro varreduras por período).
- `retroalimentar_base` e `drenar_conhecimento` (`coalesce` e filtros de status sem a
  coluna líder).

### P2. Subquery de contagem correlacionada por linha (N+1 dentro do SQL)

**Como está:** a listagem calcula um `count(*)` (ou `exists`) por linha devolvida. Em uma
página de N itens, são N varreduras.

**Como deveria:** agregar uma vez só para o conjunto da página (CTE paginada + `left join`
com `group by`), ou guardar o contador numa coluna mantida por trigger (igual ao read-model
de clientes da 0083).

Onde aparece:
- `pedidos.listarColuna` (`qtd_itens` por card).
- `conversas.listarConversas` (não lidas por conversa).
- `zonas_entrega.listar`/`listarAtivas` (pedidos em aberto por zona).
- `plataforma_clientes.listarContas` (5 subconsultas por conta).
- `promocoes.usos_total`/`contarUsos`, `fidelidade.saldoDe` (somam o livro inteiro).

### P3. Lista sem LIMIT nem cursor (DoS por payload e tráfego)

**Como está:** a consulta devolve todas as linhas da loja, sem teto. O payload cresce com
o histórico.

**Como deveria:** paginar por cursor keyset `(coluna, id)` com `LIMIT` de teto. Quando a
tela só precisa de total, devolver o agregado, não as linhas.

Onde aparece:
- `caixa.listarMovimentos`, `pagamentos.listar`, `contas_pagar.listarContas` e
  `lancamentosDoPeriodo`.
- `plataforma_cobranca.listarAssinaturas`/`listarFaturas`, `plataforma_funil.agenda`,
  `acessos_login.listar`.
- `estoque_itens.listarComControle`, `fiscal.listarItensComFiscal`.
- `disponibilidade.listarExcecoes`, `despacho.listarCorridasAbertas` (listas que só crescem).

### P4. Over-fetch de coluna grande na listagem

**Como está:** a lista traz uma coluna pesada (jsonb, texto longo, binário, telefone
cifrado) que a tela da lista não usa. O detalhe é que precisa dela.

**Como deveria:** na lista, selecionar só o resumo (ou um `left(coluna, 300)`); trazer a
coluna inteira só no `obter`.

Onde aparece:
- `cardapio_importacao.listar` (coluna `rascunho` jsonb de até 50 importações).
- `conhecimento.listarDocumentos` (coluna `conteudo` completa de até 200 documentos).
- `plataforma_funil.quadro`/`listarProspectos` (`contato_telefone_cifrado` e `observacoes`
  por card).
- `importar_cardapio.reivindicar` (baixa `arquivo_bytes` dentro do lock do claim).
- `pagamentos.listar` (`br_code` por linha, que é PII; ver segurança).

### P5. Agregado recalculado do zero quando já existe o acumulado

**Como está:** a consulta soma um livro inteiro a cada chamada, embora cada linha já
guarde o saldo corrente, ou a view recalcula tudo.

**Como deveria:** ler o último `saldo_apos`, ou persistir o agregado em tabela com índice
(como a 0083 fez para `ultimo_pedido_em`).

Onde aparece:
- `fidelidade.saldoDe` (ler o último `saldo_apos`).
- `clientes.resumoPedidos` (ler do read-model; falta `gasto_total_centavos`).
- A view `clientes_metricas` (RFM) em `crm.listar`/`resumo` e `campanhas.contarDestinatarios`/
  `enfileirar`: toda leitura reagrega todos os pedidos entregues da loja. É o maior
  recalculo do sistema.
- `salao.recalcularTotal`, `caixa.totais`, `avaliacoes.resumo` (menores).

## Prioridade sugerida (os 10 maiores ganhos)

1. **Índice `membros_user_ativo` (hot-path de toda request do módulo conta).** Resolve
   `conta.vinculosAtivos` e `plataforma_clientes.usuarioTemVinculo`. Baratíssimo, alto
   impacto. (Território E.)
2. **Persistir as métricas RFM** numa tabela (fim da view `clientes_metricas` no caminho
   de leitura). Resolve CRM e campanhas. (Território D.)
3. **`pagamentos.listar`: paginar e tirar o `br_code` da lista.** Performance + o único
   furo de PII real. (Território D.)
4. **`proximoCodigo` (api e atendente): trocar o regex por prefixo indexável ou sequência
   diária.** Caminho quente de criar pedido, nos dois serviços. (Territórios A e F.)
5. **Correção do padrão P1 (função de data)** nas tabelas que mais crescem: `uso_llm`
   (`configuracoes_llm`, `llm_client`), `pagamentos.pago_em`, `pedidos` do kanban.
6. **`caixa.listarMovimentos`: paginar por cursor.** DoS por payload num dia cheio.
   (Território A.)
7. **`contas_pagar.materializarEntregasPeriodo`: tirar a escrita do GET, por faixa de
   data e com teto de período.** (Território D.)
8. **Índices parciais das filas de entrega** (`pedidos` em aberto por status, por zona,
   por endereço, por motoboy). Resolve despacho e roteirização. (Território C.)
9. **Busca vetorial do RAG e do cache semântico: `hnsw.iterative_scan` ou índice por
   loja.** Isolamento está correto, mas recall e latência caem com muitas lojas.
   (Território F.)
10. **Over-fetch de coluna grande (P4):** `cardapio_importacao.rascunho`,
    `conhecimento.conteudo`, `importar_cardapio.arquivo_bytes` fora do lock. (Territórios
    B, E, F.)

## Índices sugeridos (lista consolidada)

Candidatos a uma migration de performance. Todos devem ser validados com `EXPLAIN` no
banco com dado de verdade antes de entrar. Nomes são sugestão.

```sql
-- Hot-path de autorização (P1/E)
create index membros_user_ativo on public.membros (user_id, criado_em) where ativo;

-- Filas de entrega em aberto (C)
create index pedidos_entrega_fila on public.pedidos (loja_id, criado_em, id)
  where modalidade = 'entrega' and status in ('novo','em_preparo')
    and corrida_id is null and motoboy_id is null;
create index pedidos_motoboy_aberto on public.pedidos (loja_id, motoboy_id)
  where status in ('novo','em_preparo','saiu_entrega');
create index pedidos_zona_aberto on public.pedidos (zona_id)
  where status in ('novo','em_preparo','saiu_entrega');
create index pedidos_endereco_aberto on public.pedidos (endereco_id)
  where status in ('novo','em_preparo') and corrida_id is null;
create index pedidos_agenda on public.pedidos (loja_id, agendado_para, id)
  where agendado_para is not null and status in ('rascunho','novo');

-- Pagamentos por data de pagamento (D)
create index pagamentos_loja_pago_em on public.pagamentos (loja_id, pago_em)
  where status = 'pago';

-- Faturas pagas por data (E, painel do operador)
create index faturas_pagas_em on public.faturas (pago_em) where status = 'paga';

-- Retroalimentação e feedback do RAG (F)
create index mensagens_humano_saida on public.mensagens (criado_em desc)
  where autor = 'humano' and direcao = 'saida';
create index mensagens_cliente_entrada on public.mensagens (criado_em desc)
  where autor = 'cliente' and direcao = 'entrada' and tipo = 'texto';
create index rag_feedback_conversa_tipo on public.rag_feedback (conversa_id, tipo)
  where conversa_id is not null;
create index rag_feedback_mensagem_tipo on public.rag_feedback (mensagem_id, tipo)
  where mensagem_id is not null;

-- Ingestão de conhecimento (F)
create index documentos_aprovado_em on public.documentos (aprovado_em)
  where status = 'aprovado';

-- Console do operador (E)
create index contas_criado_em on public.contas (criado_em desc, id desc);
create index prospectos_criado_em on public.prospectos (criado_em);
create index prospectos_tel_hash on public.prospectos (contato_telefone_hash)
  where contato_telefone_hash is not null;

-- Campanhas (D)
create index campanha_envios_loja_cliente on public.campanha_envios
  (loja_id, cliente_id, criado_em);

-- Busca por nome no console do operador, se a busca for usada (E)
create index contas_nome_trgm on public.contas using gin (nome gin_trgm_ops);
create index lojas_nome_trgm on public.lojas using gin (nome gin_trgm_ops);
```

Correção de documentação: o comentário da migration 0081 que cita
`plataforma_clientes/repo.ts:67` como coberto pelo trigram está errado. O trigram da 0081
é só de `clientes.nome`. A busca por nome de conta e de loja no console não tem índice.

---

# Território A: pedidos / clientes / salao / caixa

Segurança: toda query filtra `loja_id`. Nenhuma seleciona `telefone_hash`.
`telefone_cifrado` sai só em `clientes.listar`/`obter` e `pedidos.obterPedido` (cifrado, o
service decifra). Nenhuma injeção.

## clientes/repo.ts

`listar` (l.31): clientes com cursor, read-model (0083) e trigram (0081). OK.
`obter` (l.54), `achaPorHash` (l.62), `inserirCliente` (l.69), `atualizarNome` (l.83),
`listarEnderecos` (l.110), `ultimoEndereco` (l.119) e os CRUD de endereço: OK.

**Local:** `clientes.listar`, `telefone_cifrado` no SELECT (l.45).
**Como está:** traz o BLOB cifrado de até `limite` clientes por página.
**Como deveria:** manter (a tela mostra o telefone), mas garantir teto de `limite` no
schema da rota (ex.: 100). Sem teto, é DoS por payload.
**Exemplo:** `limite: z.coerce.number().int().min(1).max(100).default(30)`.

**Local:** `clientes.resumoPedidos` (l.91).
**Como está:** faz `count`, `max` e `sum` sobre todos os pedidos do cliente a cada abertura
do detalhe. O índice parcial `pedidos_cliente_efetivo` (0083) acha as linhas, mas o `sum`
ainda lê a tabela.
**Como deveria:** o read-model já guarda `pedidos_total` e `ultimo_pedido_em` em `clientes`.
Ler de lá. Para o gasto, somar `gasto_total_centavos` no mesmo trigger. O custo cai para O(1).
**Exemplo:**
```sql
select pedidos_total as total, ultimo_pedido_em as ultimo, gasto_total_centavos as gasto
  from public.clientes where id = $1 and loja_id = $2
```
Severidade: baixa hoje, média para cliente de alto volume.

## pedidos/repo.ts

**Local:** `pedidos.lerCardapio` (l.26), consultas `grupos`/`opcoes` (l.49-58).
**Como está:** itens e categorias são filtrados pelos ids do pedido, mas `grupos_opcoes` e
`opcoes` trazem a loja inteira. São 6 consultas em série a cada criação de pedido.
**Como deveria:** filtrar grupos e opções só pelos grupos usados no pedido.
**Exemplo:** `select ... from public.opcoes where loja_id = $1 and grupo_id = any($2::uuid[])`.
Severidade: média.

**Local:** `pedidos.listarColuna` (l.148), subquery `qtd_itens` (l.163-164).
**Como está:** para cada card da coluna faz um `count(*)` em `itens_pedido` (N+1 no SQL). O
kanban carrega 5 a 7 colunas.
**Como deveria:** agregar uma vez para o conjunto da página, ou guardar `qtd_itens` no
pedido por trigger.
Severidade: média.

**Local:** `pedidos.listarColuna`, filtro de data (l.153).
**Como está:** `(p.criado_em at time zone TZ)::date = $data` aplica função na coluna e perde
o índice `pedidos_kanban`. Na coluna `entregue` (a que mais cresce) dói. (Padrão P1.)
**Como deveria:** converter o dia em faixa e comparar a coluna crua.
**Exemplo:**
```sql
and p.criado_em >= ($data::date)::timestamp at time zone $tz
and p.criado_em <  (($data::date) + 1)::timestamp at time zone $tz
```

`pedidos.listarColuna`, colunas `criado_em`/`cursor_ts` (l.166-167): o mesmo `to_char` sai
duas vezes por linha. Calcular uma vez. Severidade: baixa.

**Local:** `pedidos.estadoAceiteLoja` (l.105).
**Como está:** `count(*)` da janela móvel por loja a cada aceite, dentro de um advisory lock
por loja. Roda mesmo quando a loja não tem capacidade configurada.
**Como deveria:** só contar se `capacidade_por_janela is not null`.
Severidade: baixa.

`clienteDaLoja`, `enderecoAtivoDoCliente`, `travarAceiteLoja`, `obterPedido` (traz
`telefone_cifrado` por necessidade), `itensDoPedido`: OK.

## pedidos/repo_escrita.ts

**Local:** `pedidos.proximoCodigo` (l.29).
**Como está:** `max(substring(codigo from 8)::int)` com `codigo ~ '^AAMMDD-[0-9]+$'`. O
regex não usa o índice `pedidos_codigo_loja`. Varre todos os pedidos da loja (não só os do
dia) a cada pedido novo. Cresce com o histórico.
**Como deveria:** prefixo com `like`/faixa (índice `text_pattern_ops`) ou sequência diária
por loja.
**Exemplo:**
```sql
select codigo from public.pedidos
 where loja_id = $1 and codigo like $2 || '-%'   -- $2 = 'AAMMDD'
 order by codigo desc limit 1
```
Severidade: **ALTA** em volume. É a única query do território que piora com o histórico
inteiro, no caminho quente.

**Local:** `pedidos.inserirLinha` (l.93), loop de opções (l.104-112).
**Como está:** um `insert` por opção, em loop. Um pedido de 10 itens com 3 opções cada faz
40 round-trips.
**Como deveria:** insert multi-linha com `unnest`.
Severidade: média.

**Local:** `pedidos.inserirPedido`/`inserirLinha`, sem teto de linhas.
**Como está:** confirmar que o schema da rota limita `itens` e `opcoes` por item, e `ids`
em `/transicao` (`travarPedidos` faz lock em lote).
Severidade: baixa (DoS por payload).

Demais escritas (`travarPedidos`, `pedidoPorChave`, `atualizarStatus`, `recalcularTotais`,
`registrarEvento`): OK.

## salao/repo.ts e repo_escrita.ts

`listarMesas` (l.56, lateral por índice), `itensDaComanda` (l.104), e todas as escritas: OK.

**Local:** `salao.recalcularTotal` (l.90).
**Como está:** a cada item lançado, reagrega toda a comanda com `sum`.
**Como deveria:** `total = total + quantidade * preco` no lançamento, em vez de reagregar.
Severidade: baixa.

## caixa/repo.ts

`obterSessaoAberta`, `abrir`, `fechar`, `inserirMovimento` (idempotente): OK.

**Local:** `caixa.listarMovimentos` (l.146).
**Como está:** baixa todos os movimentos do caixa de uma vez, sem LIMIT nem cursor. Um dia
cheio de restaurante grande tem milhares de linhas. Os totais já vêm de `totais()`.
**Como deveria:** paginar por cursor `(criado_em, id)` com teto.
**Exemplo:**
```sql
select ... from public.movimentos_caixa
 where caixa_id = $1 and loja_id = $2
   and ($3::timestamptz is null or (criado_em, id) > ($3, $4::uuid))
 order by criado_em, id limit $5
```
Severidade: **ALTA** em volume (DoS por payload e tráfego; a rota pode servir exportação).

`caixa.totais` (l.157): 10 agregados numa passada. OK para um caixa. Se pesar, acumuladores
por trigger. Baixa.

---

# Território B: cardapio / estoque / ficha_tecnica / promocoes / fidelidade / avaliacoes

Segurança: tudo parametrizado, todo `sqlBruto` é constante, nenhuma leitura traz telefone
ou Pix. Nenhuma injeção.

## cardapio/repo.ts

**Local:** `cardapio.carregarDados` (l.89), 6 queries em `Promise.all`.
**Como está:** lê o cardápio inteiro da loja (grupos, opções, categorias, itens, 2 vínculos)
sem LIMIT. É de propósito (front e atendente precisam do catálogo). Itens trazem `descricao`
e `imagem_url` sempre. Se `exec` for uma conexão única, o `Promise.all` não ganha nada.
**Como deveria:** manter a leitura completa, mas (1) cachear por loja com invalidação na
escrita (o atendente chama a cada conversa), (2) oferecer variante enxuta (sem `descricao`)
para o atendente, (3) confirmar que `exec` é pool, senão trocar por uma query com `json_agg`.
Severidade: média (tráfego).

Demais leituras por id + `loja_id` e os `count` de pertencimento: OK.

## cardapio/repo_escrita.ts

`inserir*` calculam `ordem` com `max(ordem)+1` sem lock: empate possível, já desempatado por
`id`. Baixa. Updates "lê, funde, grava": OK.

**Segurança (baixa):** `upsertVinculoCategoria`/`upsertVinculoItem` têm `on conflict` que não
confere `loja_id` no UPDATE. Hoje a guarda `contarGruposDaLoja` protege. Acrescentar
`loja_id` por defesa em profundidade.

## cardapio_importacao/repo.ts

**Local:** `cardapio_importacao.listar` (l.73).
**Como está:** traz a coluna `rascunho` (jsonb) inteira de até 50 importações. O rascunho
guarda o cardápio extraído pelo LLM, pode ter centenas de itens. Uma lista de histórico que
só precisa de status e data pode virar vários MB. (Padrão P4.)
**Como deveria:** não selecionar `rascunho` na lista. Trazer só em `obter`.
**Exemplo:** 50 linhas x 200 KB = ~10 MB numa tela de histórico; sem o `rascunho`, poucos KB.
Severidade: **ALTA** (tráfego/over-fetch).

`recentePorHash` (over-fetch leve, 1 linha), `recuperarPresos` (índice parcial ajudaria): OK.

## estoque_itens/repo.ts

**Local:** `estoque_itens.listarComControle` (l.23).
**Como está:** lista todos os itens com `controla_estoque`, sem LIMIT. O `order by
quantidade_disponivel asc nulls last` provavelmente ordena em memória.
**Como deveria:** índice parcial `(loja_id, quantidade_disponivel) where controla_estoque`,
e LIMIT ou paginação.
Severidade: média (paginação, DoS leve).

`listarMovimentos` (teto de `limite` no schema), `vendaJaLancada`: OK.

## estoque_insumos/repo.ts

`listar` e `listarBaixoEstoque` ordenam/filtram por expressão calculada, sem LIMIT. Aceitável
pelo volume (dezenas a centenas por loja). Se crescer, coluna gerada `abaixo_minimo` com
índice. `atualizar` com patch vazio lança erro no `reduce` (robustez; o service deve barrar).
Severidade: baixa.

## ficha_tecnica/repo.ts

**Local:** `ficha_tecnica.baixarConsumo` (l.91).
**Como está:** chamada uma vez por insumo por item, em loop (N+1) dentro da transação do
pedido. A subquery `ja` não filtra `loja_id` (só `pedido_id` e `insumo_id`, ambos UUID).
**Como deveria:** receber a lista de insumos e fazer um único statement com `unnest`.
Acrescentar `loja_id` na subquery `ja`.
**Exemplo:** pedido de 5 itens x 4 insumos = 20 round-trips; com `unnest`, 1.
Severidade: média (N+1), baixa (segurança).

`itemDaLoja` usa `count(*)` para existência (trocar por `exists`): desprezível.
`salvarLinha`: `on conflict` sem `loja_id` (mesma observação dos vínculos).

## promocoes/repo.ts

**Local:** `promocoes.usos_total` (l.27-30), em `listar`/`obter`/`obterPorCodigo`.
**Como está:** subquery `count(*)` em `promocao_usos` por promoção retornada. `promocao_usos`
só cresce. (Padrão P2.)
**Como deveria:** contador `usos_total` na própria `promocoes` (incrementado em `inserirUso`),
ou agregação única para a página. Garantir índice `(promocao_id)`.
**Exemplo:** cupom com 50.000 usos: cada abertura da lista conta 50.000 linhas por cupom.
Severidade: média.

`listar` (l.39): cursor correto. OK.

**Local:** `promocoes.contarUsos` (l.175)/`usoExistente` (l.185).
**Como está:** filtram só por `promocao_id`/`pedido_id`, sem `loja_id`. `contarUsos` conta
tudo da promoção a cada aplicação de cupom.
**Como deveria:** acrescentar `loja_id` (defesa em profundidade) e usar contador/índice.
Severidade: baixa.

## fidelidade/repo.ts

**Local:** `fidelidade.saldoDe` (l.86).
**Como está:** soma todo o livro de movimentos do cliente a cada chamada, embora cada
movimento já guarde `saldo_apos`. (Padrão P5.)
**Como deveria:** ler o `saldo_apos` do último movimento (`order by seq desc limit 1`). O(1).
**Exemplo:** cliente com 800 movimentos: hoje soma 800 linhas; com `saldo_apos`, lê 1.
Severidade: média.

`descontoDoResgate` (l.95): filtra só `pedido_id`/`tipo`, sem `loja_id`. Acrescentar.
Baixa. `listarMovimentos` (cursor por `seq`): OK.

## avaliacoes/repo.ts

`listar`/`obter` (cursor, joins para `pedido_codigo` e `cliente_nome`): OK. `cliente_nome` é
PII leve e intencional (só o dono vê). `resumo` (l.73) agrega todas as avaliações da loja a
cada chamada: aceitável até dezenas de milhares; se a tela abrir muito, cachear. Baixa.

---

# Território C: despacho / roteirizacao / zonas_entrega / agendamento / disponibilidade / conversas

Tudo parametrizado com `loja_id`. Nenhum `sqlBruto` com valor do usuário. Nenhuma injeção.
Os problemas são de índice e de crescimento.

## despacho/repo.ts

Leituras por id/corrida e escritas com `loja_id`: OK. `listarMotoboysSeletor` sem LIMIT
(dezenas por loja, LIMIT defensivo fecha o risco).

**Local:** `despacho.pedidosProntos` (l.316).
**Como está:** fila de entrega aberta (`status in (novo, em_preparo)`, `corrida_id is null`,
`motoboy_id is null`), LIMIT 200. Usa `pedidos_kanban`, mas o `in` de dois status obriga
merge/sort, e os `is null` são checados linha a linha.
**Como deveria:** índice parcial `pedidos_entrega_fila` (ver lista consolidada). Serve também
`roteirizacao.elegiveis`.
Severidade: média.

**Local:** `despacho.motoboysComCarga` (l.337).
**Como está:** dois `count(*)` correlacionados por motoboy; o de pedidos varre o histórico do
motoboy.
**Como deveria:** índice parcial `pedidos_motoboy_aberto`, ou `group by` sobre os pedidos
abertos da loja.
Severidade: média.

**Local:** `despacho.listarCorridasAbertas` (l.265) e `paradasDasCorridas` (l.304).
**Como está:** sem LIMIT. Corrida nunca concluída fica "aberta" para sempre; as paradas saem
proporcionais a isso, com endereço por parada.
**Como deveria:** LIMIT defensivo e índice parcial por status aberto. PII: logradouro+número
do cliente sai na tela de despacho (necessário ao motoboy, exige permissão de despacho).
Severidade: baixa/média.

## roteirizacao/repo.ts

**Local:** `roteirizacao.enderecosPendentes` (l.536).
**Como está:** `order by exists(select 1 from pedidos ...) desc, ...` roda o `exists` para
todos os endereços pendentes antes do LIMIT, e `pedidos` não tem índice em `endereco_id`.
Com milhares de endereços sem geocode (ex.: importação de clientes), são milhares de lookups.
**Como deveria:** índice `pedidos_endereco_aberto`, ou dividir em duas queries e unir no código.
Severidade: média.

**Local:** `roteirizacao.elegiveis` (l.464).
**Como está:** mesmo filtro de `pedidosProntos`, LIMIT 50, com subquery em `itens_pedido` por
pedido (50 linhas, barato). Devolve endereço completo de cada pedido.
**Como deveria:** mesmo índice parcial. O schema de resposta já corta o que não declara (o
fjs), então o endereço completo não vaza se não estiver no schema.
Severidade: média (índice), baixa (PII, mitigada pelo serializer).

`coordenadasDosPedidos`, `contarPendentes`, `gravarGeocode` e o resto: OK.

## zonas_entrega/repo.ts

**Local:** `zonas_entrega.listar`/`listarAtivas`, via `COLUNAS` (l.25).
**Como está:** cada zona executa `count(*) from pedidos where zona_id = z.id and status in
(...)`, sem índice em `pedidos.zona_id`. `listarAtivas` é base do resolver (caminho quente) e
traz o count e o `area` (polígono JSON) mesmo sem precisar.
**Como deveria:** índice `pedidos_zona_aberto`; em `listarAtivas`, colunas sem o `count` (o
resolver não usa `pedidos_em_aberto`).
Severidade: média.

## agendamento/repo.ts

**Local:** `agendamento.listar` (l.212).
**Como está:** cursor e LIMIT corretos, mas sem índice em `agendado_para`. Filtra os pedidos
`novo`/`rascunho` da loja e ordena em memória. Aceitável hoje (poucos pedidos `novo`).
**Como deveria:** índice `pedidos_agenda`. Serve também o job que libera agendados.
Severidade: baixa/média.

## disponibilidade/repo.ts

Horários e exceções por loja (poucas linhas): OK.

**Local:** `disponibilidade.listarExcecoes` (l.379).
**Como está:** devolve todas as exceções ativas desde sempre; exceção passada nunca sai da
lista.
**Como deveria:** filtrar `data >= current_date` por padrão e LIMIT.
Severidade: baixa.

## conversas/repo.ts

**Local:** `conversas.listarConversas` (l.510).
**Como está:** cursor, LIMIT e índice `conversas_loja_atualizado` corretos. Mas cada linha da
página faz (1) um `count(*)` de mensagens de entrada mais novas que a última saída (com um
`max` por conversa) e (2) um lateral da última mensagem. O `count` de não lidas é
O(mensagens desde a última resposta): conversa em que a loja nunca respondeu varre tudo. Roda
a cada refresh/polling. Devolve `telefone_hash`, talvez sem uso. (Padrão P2.)
**Como deveria:** coluna `nao_lidas` mantida por trigger, ou limitar a contagem (cap 100).
Remover `telefone_hash` da lista se o front não usa. Exigir `min(2)` no texto da busca.
**Exemplo:**
```sql
(select count(*) from (
   select 1 from mensagens mn
    where mn.conversa_id = c.id and mn.direcao = 'entrada' and mn.criado_em > $ultima_saida
    limit 100) t) as nao_lidas
```
Severidade: **ALTA** (cresce com o histórico, no caminho quente da lista).

`conversas.listarMensagens` (l.597): cursor correto. Traz `conteudo` e `transcricao` inteiros
(é a conversa em si). Garantir teto de `limite` no schema. Baixa.

## conversas/repo_escrita.ts

**Local:** `conversas.respostaJaEnfileirada` (l.706).
**Como está:** parte de `envios` pelo índice único (rápido), mas junta `eventos` por
`loja_id + tipo + entidade_id` e compara `detalhes->>'envio_id'`. O índice `eventos_entidade`
não cobre `tipo` nem o JSON: lê todos os eventos da conversa e filtra linha a linha. Roda só
em retry de idempotência.
**Como deveria:** índice `eventos ((detalhes->>'envio_id')) where tipo =
'conversa.resposta_enviada'`, ou guardar `mensagem_id` em `envios`.
Severidade: baixa (só em retry).

`inserirMensagemHumana` faz insert + select (poderia ser `insert ... returning`): ganho
mínimo. Resto: OK.

---

# Território D: relatorios / dashboard / crm / custos / contas_pagar / pessoas / pagamentos / fiscal / campanhas

Tudo parametrizado; `sqlBruto` só literal fixo. Nenhuma injeção.

## relatorios/repo.ts

**Local:** `relatorios.vendasFlexivel` (l.86) e `totalVendasFiltrado` (l.131).
**Como está:** `vendasFlexivel` parte de `itens_pedido` com 4 joins fixos (`pedidos`,
`itens`, `categorias`, `motoboys`), mesmo quando a dimensão não usa `categorias`/`motoboys`.
`totalVendasFiltrado` repete a mesma varredura numa segunda query a cada relatório.
**Como deveria:** montar os joins só quando a dimensão/filtro precisar; calcular o total na
mesma passada (`grouping sets ()`).
Severidade: média. Período limitado a 366 dias e LIMIT 500: OK.

**Local:** `relatorios.coortes` (l.300).
**Como está:** o CTE varre TODOS os pedidos da loja, de todos os tempos, agrupando por
cliente e mês; o período só filtra depois. (Padrão P1.)
**Como deveria:** guardar o mês do primeiro pedido em `clientes` (como a 0083 fez com
`ultimo_pedido_em`), ou cachear por loja e mês.
**Exemplo:** loja com 300 mil pedidos: pedir "últimos 30 dias" lê os 300 mil.
Severidade: média/alta.

**Local:** `relatorios.formasPagamento` (l.225).
**Como está:** o ramo de `pagamentos` filtra `status='pago'` e `pago_em` no período, mas o
índice é `(loja_id, status, criado_em)`, que não cobre `pago_em`. Lê todos os pagos de todos
os tempos. (Padrão P1.)
**Como deveria:** índice `pagamentos_loja_pago_em`.
Severidade: média.

`vendasPorMesa`, `totalComandas`, `cancelamentoTotais`, `motivosProblema` (LIMIT 100): OK.
`motivos`/`problema_motivo` é texto livre da loja; pode conter dado pessoal, validar no front.

## dashboard/repo.ts

`resumo` (l.357): uma passada com 13 contadores. OK.

**Local:** `dashboard.seriePorDia` (l.391)/`seriePorHora` (l.420).
**Como está:** `resumo`, `seriePorDia` e `seriePorHora` leem as MESMAS linhas de `pedidos` do
período, três vezes.
**Como deveria:** uma leitura com `grouping sets (dia, hora, ())`, ou CTE reaproveitada.
Severidade: baixa/média.

**Local:** `dashboard.conversas` (l.472).
**Como está:** os contadores `abertas`/`em_humano` não têm filtro de data e leem todas as
conversas da loja, para sempre.
**Como deveria:** filtrar `status <> 'encerrada'`, ou índice parcial.
**Exemplo:** loja com 100 mil conversas encerradas lê tudo só para contar 12 abertas.
Severidade: baixa/média.

`topItens`, `autonomia`: OK.

## crm/repo.ts

**Local:** `crm.listar` (l.41), `resumo` (l.66), `metricasDoCliente` (l.58).
**Como está:** `clientes_metricas` é uma VIEW que agrega todos os pedidos `entregue` da loja
a cada chamada. A ordem por `gasto_total_centavos` é calculada, então nenhum índice ajuda, e
o cursor keyset não evita o trabalho: cada página refaz tudo. `resumo` lê a view inteira para
devolver ~7 linhas. (Padrão P5.)
**Como deveria:** persistir as métricas em tabela com índice `(loja_id, gasto_total_centavos
desc, cliente_id desc)`, atualizada por trigger ou rotina.
**Exemplo:** loja com 100 mil pedidos entregues: cada página de 20 clientes agrega os 100 mil.
Severidade: **ALTA**.

**Local:** `crm.itensMaisVendidos` (l.79).
**Como está:** o filtro `coalesce(p.entregue_em, p.criado_em) >= now() - ...` envolve função
nas colunas e não usa índice de tempo. (Padrão P1.)
**Como deveria:** filtrar por coluna direta com folga, ou índice funcional.
Severidade: média.

`itensFavoritos`, `ultimosPedidos`, `obterConsentimento` e as escritas: OK.

## custos/repo.ts

**Local:** `custos.total`/`porCategoria`/`porOrigem`/`porDia` (l.239-269).
**Como está:** quatro queries leem as mesmas linhas do período, uma vez cada. Na visão do
operador agregam o razão da plataforma inteira (uma linha por mensagem). O contrato
`CustosPeriodoQuery` só aplica o teto de 366 dias quando `de` E `ate` vêm juntos: com só
`de=2000-01-01`, o período não tem teto.
**Como deveria:** uma passada com `grouping sets`; tabela de resumo diário para a visão do
operador; teto de 366 dias aplicado depois de resolver os defaults.
**Exemplo:** `GET /custos/resumo?de=2000-01-01` agrega a tabela inteira.
Severidade: média.

`resolverPeriodo` (l.218): ida ao banco só para aritmética de datas; calcular em JS.
`listarEventos` (cursor, LIMIT 100): OK. `metricasPlataforma`: `count(distinct loja_id)` sem
índice de `(criado_em, loja_id)`; resolve com a tabela de resumo diário.

## contas_pagar/repo.ts e repo_escrita.ts

**Local:** `contas_pagar.materializarEntregasPeriodo` (repo_escrita.ts l.399), chamada no GET
`/acertos` (service l.288).
**Como está:** escreve dentro de uma rota de leitura. O filtro `(p.entregue_em at time zone
TZ)::date between de and ate` não usa índice (P1), e o período não tem teto. Lê e escreve
sobre toda a história de entregas da loja numa requisição GET, travando
`motoboy_lancamentos`.
**Como deveria:** filtrar por faixa de `entregue_em`; materializar no momento da entrega
(trigger ou fluxo); impor teto de período; tirar a escrita do GET.
**Exemplo:** `GET /contas-pagar/acertos?de=2020-01-01&ate=2026-10-29` processa toda a base
numa transação, numa leitura.
Severidade: **ALTA**.

**Local:** `contas_pagar.listarContas` (l.90).
**Como está:** sem LIMIT nem cursor; sem filtro, devolve todas as contas da loja de todos os
tempos. O `order by vencimento desc nulls last, criado_em desc` não bate com o índice
(ordena em memória).
**Como deveria:** cursor `(vencimento, id)`, LIMIT e período padrão.
Severidade: média (paginação).

`acertoAgregadoBase`/`acertosDoPeriodo` (lateral por motoboy, sem teto de período),
`lancamentosDoPeriodo` (sem LIMIT): impor teto de período; a lista de entregas só é
necessária no detalhe. `listarFornecedores`/`listarPessoas` trazem `telefone_cifrado` só para
mascarar (CPU por linha): guardar `telefone_ultimos4` em coluna. Demais escritas: OK.

## pessoas/repo.ts

`listarPessoas` (l.78): sem LIMIT, traz `telefone_cifrado` para mascarar. O índice
`pessoas_loja` é parcial `where ativo`: com `incluirInativos` não serve. Guardar
`telefone_ultimos4`, LIMIT de segurança. Demais leituras: OK (telefone e Pix saem só
mascarados pelo service).

**Robustez (baixa):** `atualizarCargo` (l.173) e `atualizarEscala` (l.317) chamam
`montarSets(partes)` sem checar lista vazia; o `reduce` sem valor inicial vira 500. Retornar
cedo quando `partes.length === 0` (igual a `atualizarPessoa`).

## pagamentos/repo.ts

**Local:** `pagamentos.listar` (l.272).
**Como está:** sem LIMIT nem cursor. Cada linha traz `br_code`, o copia-e-cola do Pix, que
embute a chave Pix da loja em claro. A lista devolve o payload de todas as cobranças. (Padrão
P3 + P4, e PII.)
**Como deveria:** cursor `(criado_em, id)` com LIMIT, e omitir `br_code` na lista (devolver
só no detalhe de uma cobrança pendente).
**Exemplo:** `GET /pagamentos` de uma loja com 20 mil cobranças devolve 20 mil `br_code`.
Severidade: **ALTA** (é o furo de PII mais claro da auditoria).

`upsertPix`/`buscarPixEstado`/`lerChaveParaBrCode`: a projeção pública não traz
`chave_cifrada` nem `chave_hash`. OK. `marcarPagoPorCharge`/`buscarPorCharge` (l.463/479)
conciliam por `(provider, charge_ref)` global, sem `loja_id`, por desenho (o webhook vem do
PSP). Confirmar que a autenticidade do webhook é validada antes (o commit `b290680`
endureceu). `expirarVencidas` roda um UPDATE dentro de um GET: baixo impacto. Demais: OK.

## fiscal/repo.ts

`listarItensComFiscal` (l.163): sem LIMIT, devolve todo o catálogo com dado fiscal; o join com
`categorias` não usa `loja_id` (a FK garante, mas o planner não usa o índice composto). Teto
ou paginação por categoria. `listarDocumentos` (l.319): `(${x}::text is null or ...)` gera
plano genérico; sem cursor (só `limite`). Cursor por `(criado_em, id)` e `where` dinâmico.
Config fiscal, itens, reserva idempotente: OK (credencial cifrada não sai; CNPJ e `ultimos4`
são da própria loja).

## campanhas/repo.ts

**Local:** `campanhas.contarDestinatarios` (l.463) e `enfileirar` (l.491).
**Como está:** `contarDestinatarios` conta sobre a view `clientes_metricas` (RFM completo).
`enfileirar` lê a view inteira no CTE `alvo`, aplica limite de frequência num `left join
lateral` sobre `campanha_envios` sem índice útil (o índice é `(campanha_id, cliente_id)`, com
`campanha_id` na frente; o lateral filtra por `loja_id`+`cliente_id`), e insere todos os
destinatários de uma vez, com a campanha travada. (Padrões P5 + P2.)
**Como deveria:** usar a tabela persistida de métricas; criar `campanha_envios_loja_cliente`;
inserir em lotes, fora de uma transação longa (ou deixar o job).
**Exemplo:** loja com 50 mil clientes e 500 mil envios: o lateral faz 50 mil varreduras.
Severidade: **ALTA**. Segurança: só `telefone_hash` vai à outbox, nunca o telefone. OK.

`listar` (LIMIT 200), `entregaResumo`, escritas idempotentes: OK.

---

# Território E: plataforma_* / acessos / conta / lojas / chaves_api / canais / numeros_whatsapp / onboarding / configuracoes_llm / conhecimento / fluxo / shared

Tudo parametrizado; `sqlBruto` só texto fixo. Nenhuma injeção. Nenhuma falta de `loja_id`/
`conta_id` nas queries de loja. Nenhum token/hash em projeção. Nenhum conteúdo de cliente no
console do operador (as leituras de `plataforma_*` são só metadado, com guarda em
`escopo.test.ts`).

## conta/repo.ts

**Local:** `conta.vinculosAtivos` (l.56), usada por `resolverAtor` (toda request do módulo
conta e nos fluxos de convite).
**Como está:** `where user_id = $1 and ativo`. Os índices por usuário são parciais
(`membros_user_loja` com `loja_id is not null`, `membros_user_conta_todas` com `is null`), e a
consulta não repete esse predicado, então o planner cai em varredura. Cresce com o total de
membros da plataforma.
**Como deveria:** índice dedicado por usuário. Resolve também `plataforma_clientes.
usuarioTemVinculo`.
**Exemplo:** `create index membros_user_ativo on public.membros (user_id, criado_em) where ativo;`
Severidade: **ALTA** (hot-path, barato de corrigir).

`emailDoUsuario`/`emailAprovado` (SECURITY DEFINER por PK, só na criação de conta),
`contaDoDono`, convites (só `token_hash`, nunca o token), auditoria: OK. `atualizarMembro`
(l.185) atualiza só por `id`: acrescentar `and conta_id = $n` (defesa em profundidade).

## plataforma_clientes/repo.ts e repo_escrita.ts

**Local:** `plataforma_clientes.listarContas` (l.61).
**Como está:** cada conta da página dispara 2 `count(*)` em `lojas`, 2 `exists` em
`numeros_whatsapp` e 1 lateral em `assinaturas` (5 subconsultas correlacionadas). O filtro
`situacao` roda sobre a lateral, então o banco não para cedo no LIMIT. Não há índice em
`contas (criado_em desc, id desc)`, então o ORDER BY ordena a tabela inteira. A busca `ILIKE`
em `contas.nome`/`lojas.nome` não tem trigram. (Padrão P2.)
**Como deveria:** índice `contas (criado_em desc, id desc)`; trigram em `contas`/`lojas` se a
busca for usada; agregar lojas e números numa única `left join lateral`; aplicar o LIMIT numa
CTE paginada antes de agregar.
**Exemplo:**
```sql
with p as (select c.* from contas c where ... order by criado_em desc, id desc limit 21)
select p.*, l.* from p
  left join lateral (select count(*) total, count(*) filter (where ativo) ativas
                       from lojas where conta_id = p.id) l on true
```
Severidade: média/alta.

`userIdPorEmail` (l.188): `lower(u.email) = lower(trim(...))` não usa o índice de
`auth.users.email` (o Supabase já grava em minúsculas; comparar `u.email = lower(trim(...))`).
`authInfoDeUsuarios` (SECURITY DEFINER, bem feita): sem teto no tamanho do array (hoje a lista
vem de `operadores`, curta; impor `array_length <= 100` se um endpoint passar ids do cliente).
Demais leituras (metadado, ids opacos, sem e-mail/telefone): OK.

## plataforma_cobranca/repo.ts

`listarAssinaturas` (l.96)/`listarFaturas` (l.179): sem LIMIT nem cursor; `($1 is null or
...)` atrapalha o índice em plano genérico. Paginar por keyset e compor o `where` só com os
filtros presentes. `assinaturasAtivas` + laço de `gerarFaturas` (service l.241): um `insert
... on conflict` por assinatura numa transação única; trocar por um `insert ... select` com
`returning`. CRUD por id/chave com guarda de status: OK.

## plataforma_funil/repo.ts

**Local:** `plataforma_funil.quadro` (l.131).
**Como está:** calcula `count(*) over` e `row_number() over` sobre TODOS os prospectos, com
os dois joins e todas as colunas (inclusive `observacoes` e `contato_telefone_cifrado`), e só
depois filtra `rn <= N`. Cada card leva o telefone cifrado (o service só mascara). `select *`
na camada externa. (Padrões P2 + P4.)
**Como deveria:** calcular `rn`/`total` só com `id, estagio, atualizado_em`, filtrar, e só
então juntar as colunas de exibição. Não trazer `observacoes` nem telefone cifrado no card.
Severidade: média.

`agenda` (l.193)/`followUpConcluido` (l.177): a conclusão é guardada como JSON em texto dentro
de `descricao` e lida por regex `substring(... from '^\{"conclui":([0-9]+)')`, sem índice; o
`not exists` varre as atividades por regex. `agenda` sem LIMIT. Criar coluna
`conclui_atividade_id bigint` com índice parcial e `limit`. `listarProspectos` (l.109): keyset
correto, mas traz telefone cifrado e `observacoes` na lista (deixar para `obterProspecto`).
`prospectoPorHash` (l.86): `contato_telefone_hash` sem índice (varre a cada criar/editar);
criar índice.

## plataforma_painel/repo.ts

**Local:** `plataforma_painel.serieMensal` (l.142) e os agregados (l.33-114).
**Como está:** `serieMensal` roda 7 subconsultas escalares por mês; com `n=24`, são 168
varreduras de `assinaturas`/`faturas`/`contas` por abertura do painel. Os agregados varrem as
mesmas tabelas inteiras, sem cache e sem índices de `pago_em`/`criado_em`.
**Como deveria:** uma agregação por tabela com `group by date_trunc('month', ...)`, mais cache
de 30 a 60 s por processo, mais índices `faturas_pagas_em`, `contas_criado_em`,
`prospectos_criado_em`. Só agregados saem (sem PII): bom.
Severidade: média/alta (do operador, tolera cache curto).

## acessos_login/repo.ts

`listar` (l.29): toda a allowlist, sem LIMIT nem cursor. Keyset com `limit` e `where` só com o
filtro presente.
**Local:** `acessos_login.aprovar` (l.64)/`revogar` (l.93).
**Como está:** sem guarda do status de origem. `aprovar` reaprova quem estava revogado, mas o
`coalesce` mantém o `aprovado_por` antigo (a auditoria mostra o aprovador da primeira vez). Não
grava evento.
**Como deveria:** atualizar `aprovado_por`/`aprovado_em` ao reaprovar um `revogado`, e gravar
evento em `eventos`.
Severidade: baixa (regra).

## lojas/repo.ts

`listar`/`buscar` (l.41/51): `l.id = any($1) or (... and l.conta_id = $2 and not l.ativo)`; o
`OR` entre id e conta pode levar a varredura. O escopo existe (sem vazamento). Separar em
`union all` com índice por ramo. Demais escritas por `id` + `conta_id`: OK.

## chaves_api/repo.ts

`listar`/`inserir`/`revogar`: projeção só `prefixo`/`ultimos4`, nunca o `hash_sha256`. OK.
`registrarEvento` (l.62) grava `ator = 'operador'` mesmo quando quem cria é o dono da conta, e
sem `conta_id`: a trilha fica com o ator trocado. Gravar o ator real e `conta_id` em `detalhes`.

## canais/repo.ts

`pedidoJaImportado` + `criarPedido`/`criarItem`/`mapear`: importação de 100 pedidos com 3
itens faz ~700 queries (N+1). Checar duplicados em lote (`id_externo = any($2)`) e inserir
itens com `unnest`. `buscarCredencial` (única leitura da credencial cifrada, só para o pull):
OK. `listarPedidos` (LIMIT 100): OK.

## numeros_whatsapp/repo.ts

Gravam `token_cifrado`/`numero_hash`, retornam só `COLS_PUBLICAS` (sem token nem hash). OK.
`trocarToken` (l.107) não valida `status <> 'removido'` (poderia reviver um número removido);
confirmar com a história antes de mudar.

## onboarding/repo.ts

`sinais` (l.16): 3 `min(criado_em)` correlacionados; o de `itens` varre os itens da loja. É
uma loja por id, baixo impacto. Se virar hot-path, trocar por `exists` (só precisa de "tem
cardápio").

## configuracoes_llm/repo.ts

**Local:** `configuracoes_llm.totalMes` (l.144)/`porOrigem` (l.172)/`porModelo` (l.184).
**Como está:** `FILTRO_MES` aplica `date_trunc('month', criado_em at time zone ...)` sobre a
coluna e inutiliza o índice `uso_llm_loja_tempo`. `uso_llm` cresce a cada turno do atendente,
então vira a tabela mais gorda do território. (Padrão P1.)
**Como deveria:** comparar a coluna crua com limites calculados uma vez.
**Exemplo:**
```sql
where loja_id = $1
  and criado_em >= date_trunc('month', now() at time zone 'America/Sao_Paulo')
                     at time zone 'America/Sao_Paulo'
  and criado_em <  (date_trunc('month', now() at time zone 'America/Sao_Paulo')
                     + interval '1 month') at time zone 'America/Sao_Paulo'
```
Severidade: média (alta com o crescimento de `uso_llm`).

`porDia` (l.157): coluna crua, usa índice. OK. Projeção `SAIDA_META` sem `chave_cifrada`: OK.

## conhecimento/repo.ts

**Local:** `conhecimento.listarDocumentos` (l.57), via `COLUNAS` (l.32).
**Como está:** a lista seleciona `d.conteudo` completo de até 200 documentos, e por linha roda
2 subconsultas (`count(*)` de chunks e busca de duplicado por hash). `order by atualizado_em
desc` sem índice. Nenhum embedding é lido (bom). (Padrões P4 + P2.)
**Como deveria:** devolver só um trecho (`left(d.conteudo, 300)` ou só o tamanho); agregar os
chunks num `left join` com `group by`; índice `documentos (loja_id, atualizado_em desc, id)`.
Severidade: média.

`listarFeedback` (l.262): `rag_feedback.texto` deriva de conversa de cliente; fica no escopo da
loja (dono/gerente), não no console do operador. Manter fora do alcance do operador (vale uma
guarda `escopo.test.ts` igual à de clientes). Demais (versões, `idsDaLoja`, escritas): OK.

## fluxo/repo.ts

`listarFluxos` (l.36): 2 subconsultas por fluxo, não traz o `grafo` (bom). `inserirRascunho`
(l.100): `max(versao)+1` sob a trava `travarFluxo` (serializado); ter `unique (fluxo_id,
versao)` como rede. Demais filtram `loja_id`: OK.

## shared/tenant/grade.ts

`permite` (l.35): decisão síncrona pelo Map, sem query. OK (ótimo para o hot-path).
**Local:** `grade.recarregarGrade` (l.60).
**Como está:** o listener (`iniciarEscutaGrade`, l.108) chama `recarregarGrade()` fora do
single-flight do `garantirGradeFresca`. Com NOTIFY seguidos, rodam leituras paralelas, e uma
leitura velha pode terminar depois de uma nova e sobrescrever `explicitas` com dado velho até
o próximo TTL (30 s).
**Como deveria:** passar a recarga do listener pelo mesmo single-flight e carimbar cada
leitura com um número de geração; só gravar o resultado se for a geração mais recente.
**Exemplo:** `const ger = ++geracao; const novo = await ler(); if (ger === geracao) explicitas = novo`.
Severidade: baixa (janela de staleness curta; não é fail-open para permissão nova).

## shared/emails_outbox/index.ts

**Local:** `emails_outbox.aprovarDonoPorPagamento` (l.54), na transação da baixa de fatura.
**Como está:** o `on conflict (lower(email)) do update` reabre o acesso para `aprovado`
mesmo quando a linha estava **revogada** pelo operador, sem gravar evento. Se o operador
revogou e depois o dono paga outra fatura, o acesso volta sozinho.
**Como deveria:** decidir a regra. Se a revogação manual deve prevalecer, acrescentar `where
acessos_permitidos.status <> 'revogado'`. Em qualquer caso, gravar evento quando o acesso
mudar de estado.
Severidade: média (regra de acesso + auditoria).

`enfileirarEmail` (idempotente; e-mail na coluna `para`, necessário): OK.

---

# Território F: zap (outbox) + atendente (RAG/LLM)

Todo SQL parametrizado; o único `sqlBruto` é `HM(col)` constante. Nenhuma injeção. O RAG
filtra `loja_id` em todo lugar (nenhum vazamento entre lojas). Os drenos de outbox do `zap`
estão corretos.

## zap/modules/enviar/repo.ts e enviar_email/repo.ts

Os claims `reivindicar` (lote de 10, `FOR UPDATE SKIP LOCKED`, índice parcial `*_due`,
colunas mínimas): OK.

**Local:** `enviar/service.ts` (l.139) e `repo.ts` (l.88-119).
**Como está:** o claim é em lote, mas cada envio faz 3 a 4 leituras em série (`lerNumero`,
`lerTelefoneCliente`, `lerUltimaEntrada`, `lerTemplateAtivo`) e um envio por vez. Envios da
mesma loja repetem `lerNumero` e `lerTemplateAtivo`.
**Como deveria:** juntar numero, telefone e ultima_entrada na CTE do claim (já há join), ou
cachear por tick o que se repete por loja.
Severidade: baixa.

`enviar_email.reivindicar`: o `returning e.para` traz o e-mail do destinatário (necessário).
Garantir que o service nunca logue o objeto inteiro (só `id`).

## zap/modules/webhook_whatsapp/repo.ts

`reivindicarWamid`, `resolverNumero` (índice único), `upsertCliente`, `resolverConversa`
(índice parcial), `inserirMensagemEntrada`: OK.
`aplicarRecibo` (l.138): update por `wamid` global, sem `loja_id` (o wamid é único por
mensagem na Meta; o webhook valida a assinatura antes). Juntar `numero_whatsapp_id` como
defesa em profundidade. Baixa.

## atendente/shared/rag (retriever, cache, ingestor, uso, avaliacao)

**Local:** `retriever.consultaHibrida` (l.100), CTE `vetor`; e `cache.consultarCache`, ramo
vetorial (l.86).
**Como está:** o índice `chunks_embedding` (e o do cache) é HNSW global (todas as lojas
juntas), e o filtro `loja_id` vem depois. O pgvector busca os `ef_search` vizinhos no índice
global e só então filtra por loja. Com muitas lojas, uma loja pequena recebe poucos ou zero
resultados (perda de recall), e a busca pode varrer muito. O isolamento está correto (sem
vazamento), mas a qualidade e a velocidade caem com escala.
**Como deveria:** `set local hnsw.iterative_scan = relaxed_order` (pgvector 0.8+) na transação
da busca, ou índice por loja (parcial para loja grande, ou tabela particionada por `loja_id`).
Medir com `explain` com 50+ lojas.
**Exemplo:** 200 lojas de 150 chunks: o HNSW devolve 40 vizinhos globais e quase nenhum é da
loja; o braço vetorial volta vazio e cai no BM25.
Severidade: **ALTA** (recall + latência).

**Local:** `cache.gravarCache`/`consultarCache`.
**Como está:** só há índice `cache_semantico_loja` e o HNSW global. Nenhum código apaga linhas
expiradas: a tabela (e o HNSW) só crescem, com linhas vencidas.
**Como deveria:** job que apaga `expira_em < now()` (precisa de DELETE para o role; cache não
é auditoria), ou limitar linhas por loja.
Severidade: média.

**Local:** `ingestor.ingerirDocumento` (l.109-133).
**Como está:** insere chunks num loop (um round-trip por chunk); o delete + N inserts corre
sem transação explícita (falha no meio deixa chunks parciais).
**Como deveria:** um `insert ... select unnest(...)` dentro de uma transação junto com o
delete.
**Exemplo:** documento de 40 chunks faz 41 round-trips; deveria fazer 2.
Severidade: baixa.

`consultaLexical` (BM25, isolamento OK, não baixa embedding), `uso.registrarUsoRag`,
`avaliacao.lerGoldenSet`: OK.

## atendente/shared/llm_client/uso.ts

**Local:** `llm_client.gastoDoDiaCentavos` (l.37).
**Como está:** o filtro `(criado_em at time zone 'America/Sao_Paulo')::date = (now() at time
zone ...)::date` cobre a coluna e impede o índice `uso_llm_loja_tempo`. Varre todo o histórico
`uso_llm` da loja. Roda antes de cada chamada de LLM (é o teto de gasto). (Padrão P1.)
**Como deveria:** comparar a coluna com o início do dia calculado.
**Exemplo:** `where loja_id = $1 and criado_em >= (date_trunc('day', now() at time zone
'America/Sao_Paulo') at time zone 'America/Sao_Paulo')`.
Severidade: média.

`seriePorDiaCentavos` (coluna crua, usa índice), `credencial.lerCredencialAtiva` (chave
cifrada, não loga): OK.

## atendente/shared/harness/repo.ts

`lerLoja`, `ultimasSaidasIa`, `historicoRecente`: por PK e por `mensagens_conversa`, com LIMIT
e colunas mínimas. OK.

## atendente/drenar_conhecimento.ts

**Local:** seleção de pendentes (l.36-44).
**Como está:** o `not exists` em `eventos` filtra `tipo` e `entidade_id` sem `entidade`, então
`eventos_entidade` (que começa por `entidade`) não serve, e sobra `eventos_tipo`, que varre
todos os eventos `documento_ingerido` por candidato (custo quadrático). E `documentos`
filtrado só por `status = 'aprovado'` (sem `loja_id`) não usa `documentos_loja_status` (a
coluna líder é `loja_id`). Roda a cada tick. Não há `SKIP LOCKED`: duas instâncias ingerem o
mesmo documento.
**Como deveria:** incluir `e.entidade = 'documento'` no `not exists`; índice
`documentos_aprovado_em`; claim com `skip locked` ou advisory lock por documento.
**Exemplo:** `... where e.tipo = $1 and e.entidade = 'documento' and e.entidade_id = d.id`.
Severidade: **ALTA**.

Seleção de arquivados (l.66): `select distinct ... join chunks` por `status='arquivado'` sem
`loja_id`; trocar por `exists` e índice parcial. Baixa.

## atendente/modules/motor_fluxo

**Local:** `motor_fluxo/repo_leitura.lerCardapioRaw` (l.263-292).
**Como está:** o motor baixa o cardápio inteiro (6 queries: categorias, itens, grupos, opções
e 2 vínculos) a cada mensagem de cada cliente, sem cache, dentro da transação com `FOR UPDATE`
na conversa. Um cardápio grande vira milhares de linhas por turno e segura a trava durante 6
round-trips. (Padrão P4.)
**Como deveria:** cache em memória por `loja_id` com TTL curto (30 a 60 s) ou invalidação por
`atualizado_em`; carregar o cardápio antes de abrir a transação. Em turnos que só precisam de
um item, usar `buscarItens`.
**Exemplo:** loja com 300 itens e 2000 opções faz 6 queries e ~2500 linhas por mensagem.
Severidade: média.

**Local:** `motor_fluxo/repo_escrita.proximoCodigo` (l.100-106).
**Como está:** o mesmo regex do `pedidos/repo_escrita` da api: `max(substring(codigo from
8)::int) ... codigo ~ '^AAMMDD-[0-9]+$'`. Não usa o índice `pedidos_codigo_loja`, varre todos
os pedidos da loja a cada pedido novo, e tem corrida (dois pedidos calculam o mesmo número; um
falha no índice único e o chamador faz retry).
**Como deveria:** prefixo indexável (`codigo >= 'AAMMDD-' and codigo < 'AAMMDD.'`) ou sequência
diária por loja.
**Exemplo:** `where loja_id = $1 and codigo >= $2 and codigo < $3` com `$2='261029-'`,
`$3='261029.'`.
Severidade: média/alta (caminho quente, nos dois serviços; ver o mesmo achado no território A).

`inserirLinha` (l.121): insert por item e por opção em loop (N+1); usar `unnest`.
`claimMensagem` (1 por vez, serializa por conversa, OK), `lockConversa`, `lerPixLoja`
(cifrada), `lerCliente` (`telefone_hash`): OK.

## atendente/modules/retroalimentar_base/repo.ts (job entre lojas)

O job lê todas as lojas de propósito; cada linha carrega sua `loja_id`.

**Local:** `coletarRespostasHumanas` (l.68-90) e `coletarPerguntasClientes` (l.105-121).
**Como está:** filtram `mensagens` por `autor`, `direcao` e `criado_em`, sem `conversa_id`.
Nenhum índice serve (`mensagens_conversa` começa por `conversa_id`), então varrem a tabela
inteira de mensagens (a maior do sistema) e ordenam por `criado_em desc`. (Padrão P1/P3.)
**Como deveria:** índices parciais `mensagens_humano_saida` e `mensagens_cliente_entrada` (ver
lista consolidada); processar em janelas incrementais por cursor.
Severidade: **ALTA**.

**Local:** `coletarConversasHandoff` (l.24-47).
**Como está:** os `not exists` em `rag_feedback` (por `conversa_id`/`tipo` e `mensagem_id`/
`tipo`) varrem a tabela (só há índice `(loja_id, status)`). O filtro `coalesce(c.humano_desde,
c.atualizado_em) >= $1` impede índice.
**Como deveria:** índices `rag_feedback_conversa_tipo` e `rag_feedback_mensagem_tipo`; índice
parcial `conversas (humano_desde) where status = 'humano'`.
Severidade: alta.

**Segurança (por desenho):** essas três coletas baixam `nome` do cliente, os `logradouros`
(array de endereços) e o texto da mensagem para o processo, justamente para ocultar antes de
gerar o rascunho. Passa PII de todas as lojas pela memória do job. Manter a ocultação, limitar
o `array_agg` (ex.: 5 endereços) e nunca logar as linhas.

`sinaisPendentesGeracao` (l.161): `rag_feedback.status = 'novo'` sem `loja_id` não usa o
índice líder; `order by ocorrencias desc` ordena todos os 'novo'. Índice parcial
`rag_feedback (ocorrencias desc, criado_em) where status='novo' and documento_rascunho_id is
null`. `documentosParaDedup` (l.184): baixa `conteudo` completo de todos os documentos da loja
para comparar em memória, sem LIMIT; dedup por hash direto no banco (`where hash_conteudo =
$2`) e similaridade só com título/trecho. `recorrentesExistentes`, `rascunhosExpirados`:
índices parciais menores.

## atendente/modules/importar_cardapio/repo.ts

**Local:** `importar_cardapio.reivindicar` (l.22-31).
**Como está:** o claim baixa `arquivo_bytes` (a imagem ou PDF inteiro) dentro da transação com
o lock, antes do update de status. Segura a trava durante o download do binário. (Padrão P4.)
**Como deveria:** claim só com colunas leves (`UPDATE ... RETURNING`), e ler `arquivo_bytes`
numa segunda query fora da trava. `limit 1` está correto (o job é pesado por arquivo).
**Exemplo:** `update ... set status='processando' where id = (select id ... for update skip
locked limit 1) returning id, loja_id, tipo_arquivo, mime, tentativas;` depois `select
arquivo_bytes where id = $1`.
Severidade: média.

`concluirRascunho`/`concluirErro` (zeram o binário ao concluir, retenção mínima): OK.
