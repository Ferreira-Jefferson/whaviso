# P-cobranca plataforma_cobranca

- **ID:** P-cobranca  ·  **Área:** P  ·  **Onda:** 4
- **Modelo sugerido:** Opus  ·  **Status:** `A FAZER`
- **Reivindicado por:** (livre)

## Objetivo

Cobrança **restaurante -> Whaviso**: assinatura mensal (padrão R$ 700, em centavos), faturas por
competência, controle de inadimplência e **suspensão/reativação** da loja. A conferência de pagamento é
manual na v1 (operador marca a fatura como paga), sem gateway. A loja enxerga apenas a própria fatura.

"Pronto" observável: o operador cria uma assinatura (trial ou ativa) para uma conta, o sistema gera a
fatura do mês de forma idempotente, faturas vencidas viram `atrasada`, uma assinatura atrasada além da
carência é suspensa, e a loja suspensa **para de atender** (o atendente respeita a suspensão) até a
reativação; o dono da loja vê a própria fatura e nada de outra conta.

## Dependências

- `F4` api-core: registry, erros, `shared/db`, transação por helper.
- `F3` tenant-auth: escopo de operador (rotas `/plataforma/*`) **e** escopo de membro (rota da loja
  para ver a própria fatura, papel `dono`).
- Coordenação (não bloqueante): `AT-motor-min` (e `ZAP-webhook`) precisam respeitar
  `lojas.suspensa`; registrado em Notas.

## Contratos e tabelas que toca

- **Dono de escrita:** `assinaturas`, `faturas` (exclusivo; nenhum outro módulo escreve).
- **Escreve por trigger de migration (decisão):** `lojas.suspensa` (coluna nova) via função
  `SECURITY DEFINER` disparada por mudança de `assinaturas.status`. O módulo não faz `UPDATE lojas`.
- **Lê (somente `SELECT`):** `contas`, `lojas` (id, nome, conta_id), `operadores` (autoria).
- **Migration nova:** `0013_cobranca_suspensao.sql`: `lojas.suspensa boolean not null default false`
  (+ `suspensa_em`), função/trigger `assinatura_aplica_suspensao()` (status `suspensa` liga a flag nas
  lojas da assinatura, ou em todas as da conta se `loja_id` é NULL; `ativa|trial` desliga),
  `grant select (suspensa)` já coberto pelo `select` existente do atendente em `lojas`. Índice parcial em
  `faturas (vencimento) where status in ('aberta')` para o job de atraso. Rodar
  `validate_migrations.sh whaviso_dev` e `check_rls_coverage.sh`.
- **Eventos (`eventos`, append-only, sem PII):** `assinatura.criada|ativada|suspensa|reativada|cancelada`,
  `fatura.emitida|paga|atrasada|cancelada`.
- **Contratos Zod:** `AssinaturaDTO`, `AssinaturaCriar`, `AssinaturaPatch`, `FaturaDTO`,
  `FaturaMarcarPaga`, `MinhaFaturaDTO` (visão da loja, sem dados de outras contas).
- **Rotas (operador):** `GET/POST /plataforma/assinaturas`, `PATCH /plataforma/assinaturas/:id`
  (suspender, reativar, cancelar, alterar valor/vencimento), `GET /plataforma/faturas` (filtros por
  status/competência/conta), `POST /plataforma/faturas/:id/pagar`, `POST /plataforma/faturas/:id/cancelar`,
  `POST /plataforma/cobranca/gerar-faturas` (idempotente), `POST /plataforma/cobranca/apurar-atrasos`.
  **Rota (membro dono):** `GET /conta/fatura` (faturas da própria conta).

## Arquivos (escopo de edição)

- `backend/apps/api/src/modules/plataforma_cobranca/**` (rotas, serviço, regras puras, `jobs/`,
  testes, `MODULE.md`)
- `backend/supabase/migrations/0013_cobranca_suspensao.sql`
- `backend/packages/shared/src/contracts/plataforma_cobranca.ts`
- `backend/apps/api/src/routes.ts` (1 linha)
- `backend/apps/api/test/security/plataforma_cobranca.*.test.ts`

## Etapas

- [ ] 1. Migration `0013_cobranca_suspensao.sql` (coluna, trigger de suspensão, índice) + validar
  migrations e RLS  (commit: `feat(db): suspensao de loja derivada do status da assinatura`)
- [ ] 2. Regras puras em `regras.ts`, sem I/O: `proximaCompetencia`, `calcularVencimento(dia, competencia)`
  (dia 1 a 28, America/Sao_Paulo), `proRata` do primeiro mês (decisão abaixo), `classificarFatura(hoje)`,
  `deveSuspender(faturas, carenciaDias)`, tabela de transições válidas de `status_assinatura`
  (`trial -> ativa|cancelada`, `ativa -> suspensa|cancelada`, `suspensa -> ativa|cancelada`,
  `cancelada` terminal)  (commit: `feat(plataforma-cobranca): regras puras de assinatura e fatura`)
- [ ] 3. Testes de unidade das regras (virada de mês, fevereiro, fuso, valor zero, transições
  inválidas)  (commit: `test(plataforma-cobranca): regras puras`)
- [ ] 4. Contratos Zod no kernel + `gen_contracts`  (commit: `feat(contracts): contratos de plataforma_cobranca`)
- [ ] 5. Criar/alterar assinatura (operador): valida transição, grava `trial_ate`/`inicio_em`,
  `eventos`. Alteração de valor vale para faturas **futuras** (fatura emitida é imutável no valor)
  (commit: `feat(plataforma-cobranca): ciclo de vida da assinatura`)
- [ ] 6. Geração de faturas `gerarFaturasDoMes(competencia)`: para cada assinatura `ativa`, `INSERT ...
  ON CONFLICT (assinatura_id, competencia) DO NOTHING` (índice único já existe); `trial` não fatura.
  Executável por rota de operador e por CLI `jobs/gerar_faturas.ts` (para systemd timer futuro, fora de
  escopo)  (commit: `feat(plataforma-cobranca): geracao idempotente de faturas`)
- [ ] 7. Apuração de atraso `apurarAtrasos(hoje)`: `aberta` com `vencimento < hoje` vira `atrasada`; se
  `atrasada` há mais de `carencia_dias` (config, padrão 7), suspende a assinatura (o trigger propaga à
  loja). Idempotente e transacional  (commit: `feat(plataforma-cobranca): apuracao de atraso e suspensao`)
- [ ] 8. Marcar fatura paga: exige `status in (aberta, atrasada)`, grava `pago_em`, `eventos`; se a
  assinatura estava suspensa por atraso e não restam faturas atrasadas, **reativa** (ação explícita
  confirmada no payload `reativar: true`, não automática)  (commit: `feat(plataforma-cobranca): baixa manual de fatura`)
- [ ] 9. Rota da loja `GET /conta/fatura` (dono, escopo por `conta_id` do membro; nunca aceita `conta_id`
  do cliente) com DTO enxuto  (commit: `feat(plataforma-cobranca): fatura visivel ao dono da conta`)
- [ ] 10. Testes de integração: ciclo completo trial -> ativa -> fatura -> atraso -> suspensa -> paga ->
  reativada; trigger reflete em `lojas.suspensa`; idempotência de jobs rodando 2 vezes
  (commit: `test(plataforma-cobranca): integracao do ciclo`)
- [ ] 11. Registro em `routes.ts`, `MODULE.md`  (commit: `feat(plataforma-cobranca): registrar rotas`)
- [ ] Testes passando; lint, typecheck, test
- [ ] Revisão (Opus) de segurança e de consistência monetária antes de `CONCLUIDO`

## Testes e segurança exigidos

- **SEC-003**: nenhum endpoint do módulo devolve conteúdo de loja; só valores de cobrança.
- **SEC-001/002**: `GET /conta/fatura` de uma conta nunca retorna fatura de outra; `conta_id` forjado
  é ignorado. Membro que não é `dono` recebe 403.
- **SEC-032**: `whaviso_atendente` e `whaviso_zap` não têm acesso a `assinaturas`/`faturas` (matriz
  `SET ROLE`); o atendente lê só `lojas.suspensa`. Confirmar que a 0013 não amplia grants.
- **SEC-030/033**: sem DELETE em `assinaturas`/`faturas` (cancelamento é estado); `eventos` append-only.
- **SEC-041**: membro não executa nenhuma rota `/plataforma/cobranca/*`.
- **SEC-081/101**: Zod rejeita valor negativo, dia fora de 1..28, competência não dia 1; rate limit nas
  rotas de job (execução manual).
- Unidade/integração: dinheiro sempre inteiro em centavos; idempotência dos jobs; transições inválidas
  retornam 409; trigger de suspensão cobre `loja_id` NULL (conta inteira).

## Notas e decisões

- **Sem gateway na v1:** operador confere o Pix da Whaviso e baixa a fatura. Interface de gateway
  fica como evolução; o módulo isola a baixa em um serviço para trocar depois.
- **Suspensão por flag derivada**, não por `lojas.ativo` (que é do dono da loja). Evita dois donos do
  mesmo campo e deixa a reativação sem ambiguidade. **Follow-up de coordenação:** `AT-motor-min` e
  `ZAP-webhook` devem, ao ver `lojas.suspensa = true`, não processar pedidos e responder mensagem
  padrão de indisponibilidade; abrir a tarefa no arquivo desses módulos (este módulo só entrega a flag).
- **Pro rata:** decidido **sem pro rata** na v1: a primeira fatura é cheia e vence no próximo
  `dia_vencimento`; trial gratuito cobre o intervalo. Simples e previsível; revisar se o produto pedir.
- **Carência:** `carencia_dias` padrão 7, constante em `config` do módulo (não tabela nova).
- **Jobs:** o agendamento real (systemd timer chamando o CLI) é infra e fica fora deste módulo; as rotas
  manuais bastam para operar.
- Migration nova: ao commitar, **perguntar** se aplica no cloud (`supabase db push`).
