# P-taxas taxa_intermediacao

- **ID:** P-taxas  ·  **Área:** P  ·  **Onda:** 4
- **Modelo sugerido:** Opus  ·  **Status:** `A FAZER`
- **Reivindicado por:** (livre)

## Objetivo

A taxa que o whaviso cobra por transação intermediada (Pix intermediado e cartão) vira **configuração de
banco, nunca hardcoded**: um **valor padrão de plataforma** (editável pelo operador) e, por cima, um
**override opcional por plano** (NULL = herda o padrão). O valor é **fixo em centavos** (padrão inicial
`50` = R$ 0,50) e serve de parâmetro de diferenciação entre planos (ex.: plano mais barato cobra R$ 0,50,
intermediário R$ 0,40, premium R$ 0,30). A taxa aplicada a um pedido é **resolvida ao vivo** a partir do
plano da assinatura da conta, com cache em processo para não bater no banco a cada transação.

"Pronto" observável: o operador abre a tela de administração da plataforma, vê e edita a taxa padrão e a
taxa de cada plano; dado um pedido de uma conta, a api resolve a taxa correta (override do plano, senão o
padrão) sem ler o banco toda vez (cache com invalidação ao salvar); nenhum valor de taxa aparece no
código; a mudança fica auditada em `eventos`.

## Dependências

- `F4` api-core: registry, erros, `shared/db`, transação por helper.
- `F3` tenant-auth: escopo de **operador** para as rotas `/plataforma/*` (membro de loja nunca edita taxa).
- `0071_planos` (CONCLUIDO, já no cloud): catálogo de `planos` e `assinaturas.plano_id`.
- `0009_plataforma`: `assinaturas` (lido para achar o plano da conta).
- Coordenação (não bloqueante): `API-pagamentos` é o **consumidor** desta taxa (lê por read-model/kernel);
  registrado em Notas. Este módulo só entrega o valor e o resolvedor; quem aplica `absorve/repassa` e gera
  a cobrança é o `pagamentos`.

## Contratos e tabelas que toca

- **Dono de escrita:** `config_plataforma` (tabela nova, singleton) e a **nova coluna**
  `planos.taxa_intermediacao_centavos` (o módulo de planos já existe; esta tarefa só adiciona a coluna e
  a edição dela). Nenhum outro módulo escreve esses valores.
- **Lê (somente `SELECT`):** `assinaturas` (status, `conta_id`, `loja_id`, `plano_id`), `planos`
  (`taxa_intermediacao_centavos`) para o resolvedor.
- **Eventos (`eventos`, append-only, sem PII):** `taxa.padrao_alterada`, `taxa.plano_alterada` (valor
  antigo e novo, operador autor).
- **Migration nova** (próxima livre, ex.: `0073_taxa_intermediacao.sql`):
  - `create table public.config_plataforma` singleton: `id smallint primary key default 1 check (id = 1)`,
    `taxa_intermediacao_padrao_centavos integer not null`, `atualizado_em timestamptz`,
    `check (taxa_intermediacao_padrao_centavos >= 0)`; trigger `tocar_atualizado_em`; RLS + policy +
    `grant select, update on config_plataforma to whaviso_api` (sem insert/delete: a linha única nasce
    na própria migration por upsert). **Sem grant** para `whaviso_zap` nem `whaviso_atendente`.
  - `alter table public.planos add column taxa_intermediacao_centavos integer`
    `check (taxa_intermediacao_centavos is null or taxa_intermediacao_centavos >= 0)`;
    **NULL = herda o padrão da plataforma** (não é "taxa zero").
  - **Semeadura do padrão por migration** (não pelo seed, que não roda no cloud): `insert into
    config_plataforma (id, taxa_intermediacao_padrao_centavos) values (1, 50) on conflict (id) do nothing`.
  - Rodar `validate_migrations.sh whaviso_dev` e `check_rls_coverage.sh`.
- **Contratos Zod:** `ConfigTaxaDTO`, `ConfigTaxaPatch`, extensão do `PlanoDTO`/`PlanoPatch` com
  `taxaIntermediacaoCentavos: number | null`. `.strict()` nas saídas.
- **Rotas (operador):** `GET /plataforma/config/taxa`, `PUT /plataforma/config/taxa`; a taxa por plano
  entra no CRUD de plano já existente (`POST/PATCH /plataforma/planos...`), só mais um campo.
- **Resolvedor (kernel reutilizável):** função de leitura `resolverTaxaIntermediacao(contaId)` com cache
  em processo, em `packages/shared` (ver Notas), consumida pela api (pagamentos) sem importar este módulo.

## Arquivos (escopo de edição)

- `backend/apps/api/src/modules/plataforma_taxas/**` (rotas, serviço, `MODULE.md`, testes)
- `backend/apps/api/src/modules/plataforma_planos/**` (apenas o campo novo no DTO/rota de plano, se o
  módulo de planos existir separado; se planos mora dentro de `plataforma_cobranca`, editar lá o mínimo)
- `backend/supabase/migrations/0073_taxa_intermediacao.sql`
- `backend/packages/shared/src/contracts/plataforma_taxas.ts`
- `backend/packages/shared/src/taxas/**` (resolvedor puro + cache, sem I/O de módulo)
- `backend/apps/api/src/routes.ts` (1 linha)
- `backend/apps/api/test/security/plataforma_taxas.*.test.ts`

## Etapas

- [ ] 1. Migration `0073_taxa_intermediacao.sql` (tabela singleton, coluna no plano, upsert do padrão 50,
  RLS/grants) + `validate_migrations.sh` + `check_rls_coverage.sh`  (commit: `feat(db): taxa de intermediacao configuravel por plataforma e plano`)
- [ ] 2. Contratos Zod (`ConfigTaxaDTO`, `ConfigTaxaPatch`, campo no `PlanoDTO/Patch`) + `gen_contracts`
  (commit: `feat(contracts): config de taxa de intermediacao`)
- [ ] 3. Resolvedor puro em `packages/shared/src/taxas`: `resolverTaxa({plano, padrao})` (regra
  `plano.taxa ?? padrao`), sem I/O, com teste de unidade (override, herança por NULL, zero explicito)
  (commit: `feat(shared): resolvedor puro de taxa de intermediacao`)
- [ ] 4. Cache em processo do valor: provider que carrega `config_plataforma` + taxas de plano, com TTL
  curto (ex.: 60s) e **invalidacao explicita** ao salvar; nunca consulta o banco por transacao
  (commit: `feat(shared): cache em processo da taxa de intermediacao`)
- [ ] 5. Rotas de operador `GET/PUT /plataforma/config/taxa` (valida `>= 0`, grava `eventos`, invalida o
  cache)  (commit: `feat(plataforma-taxas): editar taxa padrao da plataforma`)
- [ ] 6. Campo de taxa no CRUD de plano (aceita `null` = herda; grava `eventos`; invalida o cache)
  (commit: `feat(plataforma-taxas): taxa por plano`)
- [ ] 7. Leitura `resolverTaxaIntermediacao(contaId)` exposta pelo kernel para o `pagamentos` consumir
  (acha a assinatura ativa da conta, pega o plano, aplica o resolvedor com cache)
  (commit: `feat(plataforma-taxas): resolucao da taxa por conta com cache`)
- [ ] 8. Testes de integracao: edicao do padrao reflete na resolucao; override de plano vence o padrao;
  conta sem plano cai no padrao; invalidacao de cache apos salvar  (commit: `test(plataforma-taxas): resolucao e cache`)
- [ ] 9. Registro em `routes.ts`, `MODULE.md`  (commit: `feat(plataforma-taxas): registrar rotas`)
- [ ] Testes passando; lint, typecheck, test
- [ ] Revisao (Opus) de seguranca (escopo de operador, sem vazamento, cache) antes de `CONCLUIDO`

## Testes e segurança exigidos

- **SEC-041**: membro de loja (não operador) recebe 403 em qualquer rota `/plataforma/config/taxa` e no
  campo de taxa do plano; `conta_id`/`plano_id` forjado não muda taxa de terceiro.
- **SEC-032**: `whaviso_zap` e `whaviso_atendente` **não** têm grant em `config_plataforma`; confirmar na
  matriz `SET ROLE`. O resolvedor roda só na api.
- **SEC-030/033**: sem DELETE em `config_plataforma` (muda de valor, não some); `eventos` append-only.
- **SEC-081**: Zod rejeita taxa negativa; `null` só é aceito no plano (herança), nunca no padrão.
- **SEC-101**: rate limit nas rotas de escrita da taxa.
- Unidade: `plano.taxa ?? padrao` cobre override, herança por NULL e zero explicito (0 != NULL);
  dinheiro inteiro em centavos; arredondamento não se aplica (valor fixo, não percentual).
- Integração: invalidação do cache apos PUT/PATCH (a próxima resolução já vê o novo valor); TTL expira e
  recarrega; duas instâncias da api convergem dentro do TTL.

## Notas e decisões

- **Não é segredo, então sem cifra.** A taxa é preço, mostrado ao restaurante (e, quando repassada, ao
  cliente). O pedido original falava em "cache seguro que não pode ser interceptado"; o reenquadramento
  correto é: o que precisa ser garantido é **integridade** (só o operador altera, via rota de operador e
  grant de banco, com auditoria em `eventos`) e **disponibilidade barata** (cache em processo), não
  confidencialidade. O valor trafega só do banco para a api pela conexão TLS já existente (pooler
  verify-full) e vive em memória do processo da api; não há nova superfície de interceptação. Cifrar um
  não-segredo seria custo sem ganho. (Chave Pix da loja, essa sim, continua cifrada em `loja_pix`, ver
  `../backend-api/pagamentos.md`.)
- **Resolução ao vivo, não congelada na assinatura.** O `valor_mensal_centavos` é gravado na assinatura
  porque a fatura é um compromisso mensal discreto; a taxa por transação é contínua e de baixo valor
  unitário, então resolvê-la ao vivo do plano atual é mais simples e mantém a fronteira: este módulo é
  dono de `config_plataforma`/`planos.taxa`, e o `pagamentos` só **lê**, sem ninguém escrever em
  `assinaturas` por causa de taxa. Alternativa descartada: snapshot em `assinaturas.taxa_...` (espelharia
  o `valor_mensal`, mas custaria coluna nova e escrita cruzada no módulo de cobrança, para pouco ganho).
  Consequência aceita: baixar a taxa de um plano beneficia na hora quem já está nele; subir a taxa de
  quem já assinou é ação deliberada e rara do operador.
- **Herança por NULL.** `planos.taxa_intermediacao_centavos` NULL significa "usa o padrão da plataforma",
  diferente de `0` (taxa zero explícita). O exemplo 0,50 / 0,40 / 0,30 é: padrão 50 e dois planos com
  override 40 e 30 (ou os três com override explícito, tanto faz).
- **Padrão por migration, não seed.** O seed não roda no cloud; o valor inicial `50` entra por upsert na
  migration (igual aos demais dados de catálogo), e dali em diante muda só pela tela de admin.
- **Cache:** TTL curto (ex.: 60s) com invalidação explícita ao salvar. Na v1, uma ou poucas instâncias da
  api no VPS; o TTL dá convergência limitada entre instâncias sem precisar de pub/sub. Evolução possível
  (não agora): `LISTEN/NOTIFY` do Postgres para invalidar na hora entre instâncias.
- **Escopo:** esta história entrega só a **configuração e resolução da taxa**. Um único valor fixo serve
  hoje para Pix intermediado e cartão (decisão do produto: R$ 0,50 para os dois). Se no futuro o produto
  quiser taxa diferente por meio, o mínimo é desdobrar em duas colunas (pix/cartão) sem mudar o resto.

### Contexto do modelo maior (PSP / Asaas) de onde esta taxa nasce

Decidido em conversa com o dono, registrado aqui para as histórias irmãs (cada parte vira sua própria
tarefa, esta história não as implementa):

- **Cartão:** sempre intermediado via PSP (Asaas), com split; o whaviso retém a taxa desta história.
- **Pix:** escolha por loja entre **chave própria do restaurante** (dinheiro direto, sem taxa, conciliação
  manual, modelo atual da v1 em `pagamentos.md`) e **Pix intermediado** (via Asaas, com webhook de
  conciliação automática e a taxa desta história). A taxa vende **automação**, não "deixar o dinheiro
  passar pelo whaviso".
- **Quem paga a taxa do Asaas:** config por loja `absorve | repassa` (restaurante absorve, ou repassa ao
  cliente). **Regra de ouro:** o percentual de adquirência do Asaas é sempre do restaurante (absorve ou
  repassa); o whaviso **nunca** absorve o percentual do cartão, senão a taxa fixa de R$ 0,50 daria
  prejuízo. Repasse no **cartão** só como preço diferenciado (Lei 13.455/2017), transparente como linha
  ao cliente, a validar com jurídico/contador antes de habilitar.
- **PSP atrás de interface isolada** (como o `ClienteWhats` do zap): o `pagamentos` ganha duas estratégias
  (chave própria = BR Code puro já existente; intermediado = chama o PSP), sem o resto do código conhecer
  o Asaas. Subconta no PSP só para quem usa cartão ou Pix intermediado; quem só usa chave própria não
  precisa de subconta.
- **Empresa como ME (não MEI):** o whaviso nunca centraliza o dinheiro do cliente final (split entrega
  direto à subconta do restaurante), o que mantém a operação limpa; a retenção de taxa (intermediação)
  cabe no Simples, não no MEI. Migrar de MEI para ME **não troca o CNPJ**, então a integração com o PSP
  sobrevive à mudança de regime.
- Histórias irmãs a abrir: `pagamentos` (interface de PSP + split + webhook + `absorve/repassa` por loja)
  e front (campo de taxa no editor de plano, toggle de Pix e de `absorve/repassa` na loja).
