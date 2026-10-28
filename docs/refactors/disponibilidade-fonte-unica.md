# Plano comum: disponibilidade com fonte única na loja

> Projeto único, executado por lanes paralelas. **Leia este arquivo inteiro antes de começar.** As
> interfaces abaixo estão **congeladas**: cada lane programa contra elas e não as renegocia. Fonte da
> verdade de produto: [../../historias/regras-negocio/05-disponibilidade-loja.md](../../historias/regras-negocio/05-disponibilidade-loja.md).

## O que estamos fazendo (uma frase)

A disponibilidade é **informação da loja** e tem fonte única: horário de atendimento (aceitar pedido ao
vivo) + janela de agendamento (opcional, `desligado|faixa|24h`) + exceções. O atendente **não tem
horário próprio**: ele deriva o **modo** (`atendimento | agendamento | fechado`) dessa disponibilidade e
muda a comunicação conforme o modo. Some a "janela do atendente" independente e o campo legado
`loja.horarios` deixa de ser a fonte do gate do atendente.

## Kernel congelado (JÁ FEITO, commit 1b05388, não mexer)

`@whaviso/shared/disponibilidade` (pura, sem I/O):

```ts
type ModoAtendente = 'atendimento' | 'agendamento' | 'fechado'
interface Agendamento { modo: 'desligado' | 'faixa' | '24h'; dias: number[]; inicio: string; fim: string }
interface FaixaHorario { dia_semana: number; abre: string; fecha: string }
interface Excecao { data: string; fechado: boolean; abre: string | null; fecha: string | null }
interface DadosDisponibilidade { horarios: FaixaHorario[]; excecoes: Excecao[] }

lojaAceitandoAgora(dados: DadosDisponibilidade, agora?: Date): boolean   // pedido ao vivo
dentroAgendamento(ag: Agendamento, agora?: Date): boolean
modoAtendente(dados: DadosDisponibilidade, ag: Agendamento, agora?: Date): ModoAtendente
faixasSobrepoem, momentoSp, paraMinutos                                   // auxiliares
```

## Migração congelada (dona: LANE A, arquivo `supabase/migrations/0060_disponibilidade_agendamento.sql`)

A antiga `janela_atendente` vira `agendamento_config` (uma linha por loja), com `modo`. `ativo` sai
(o `modo` é o interruptor). `horarios_funcionamento` e `excecoes_disponibilidade` ficam iguais.

```sql
create type modo_agendamento as enum ('desligado', 'faixa', '24h');

alter table public.janela_atendente rename to agendamento_config;

alter table public.agendamento_config add column modo modo_agendamento not null default 'desligado';
update public.agendamento_config set modo = case when ativo then 'faixa'::modo_agendamento else 'desligado'::modo_agendamento end;

alter table public.agendamento_config
  alter column inicio drop not null,
  alter column fim drop not null,
  alter column dias drop not null,
  drop constraint janela_inicio_fim_distintos,
  drop constraint janela_dias_validos,
  drop column ativo,
  add constraint agendamento_faixa_completa check (
    modo <> 'faixa' or (
      inicio is not null and fim is not null and inicio <> fim
      and dias is not null and array_length(dias, 1) between 1 and 7
      and dias <@ array[0,1,2,3,4,5,6]::smallint[]
    )
  );

alter trigger trg_janela_atendente_atualizado_em on public.agendamento_config rename to trg_agendamento_atualizado_em;

comment on table public.agendamento_config is 'Janela de agendamento da loja (modo desligado|faixa|24h). O atendente opera na disponibilidade da loja; nao ha horario proprio do atendente.';
```

Grants/policies/pk seguem no rename (whaviso_api: select/insert/update; whaviso_atendente: select). **Não**
dropar `loja.horarios` neste bloco (fica para um bloco seguinte; aqui só paramos de usá-lo como gate).

## Contrato congelado (dona: LANE A, `backend/packages/shared/src/contracts/disponibilidade.ts` + regen)

Trocar o bloco `JanelaAtendente*` por `Agendamento*` e mudar `DisponibilidadeAgoraSaida`:

```ts
export const ModoAgendamento = z.enum(['desligado', 'faixa', '24h'])
export const ModoAtendente = z.enum(['atendimento', 'agendamento', 'fechado'])

export const AgendamentoEntrada = z.strictObject({
  modo: ModoAgendamento,
  inicio: Hhmm.nullable().optional(),
  fim: Hhmm.nullable().optional(),
  dias: z.array(DiaSemana).max(7).optional(),
}).refine((a) => a.modo !== 'faixa' || (!!a.inicio && !!a.fim && a.inicio !== a.fim && !!a.dias && a.dias.length >= 1),
  { message: 'modo faixa exige inicio, fim distintos e ao menos um dia' })

export const AgendamentoSaida = z.strictObject({
  modo: ModoAgendamento,
  inicio: Hhmm.nullable(),
  fim: Hhmm.nullable(),
  dias: z.array(DiaSemana),           // [] quando nao e faixa
  atualizado_em: DataHoraIso,
})
export const AgendamentoGetSaida = z.strictObject({ agendamento: AgendamentoSaida })  // default desligado quando nao ha linha

export const DisponibilidadeAgoraSaida = z.strictObject({
  agora: DataHoraIso,
  aceitando_agora: z.boolean(),        // pedido ao vivo
  modo_atendente: ModoAtendente,       // atendimento|agendamento|fechado (substitui atendente_pode_responder)
})
```

Rodar o codegen (`gen_contracts`) para reemitir `_generated` no backend e no front. **Só a Lane A** mexe
em contrato e em `_generated`.

## Endpoints congelados (api `/v1/disponibilidade`)

- Horários e exceções: **inalterados** (listar/criar/patch/desativar).
- `GET /v1/disponibilidade/agendamento` -> `AgendamentoGetSaida` (substitui `/janela`).
- `PUT /v1/disponibilidade/agendamento` body `AgendamentoEntrada` -> `AgendamentoSaida` (substitui `/janela`).
- `GET /v1/disponibilidade/agora` -> `DisponibilidadeAgoraSaida` (agora com `modo_atendente`).

## Mapa de propriedade de arquivos (SEM sobreposição)

- **LANE A — dados/backend:** `backend/supabase/migrations/0060_*.sql` (a ÚNICA migration deste bloco),
  `backend/packages/shared/src/contracts/disponibilidade.ts`, `_generated` (regen back+front),
  `backend/apps/api/src/modules/disponibilidade/**` (schemas, repo, service, routes, testes).
- **LANE B — motor do atendente:** `backend/apps/atendente/src/modules/motor_fluxo/**` (contexto.ts,
  tipos.ts, nodes/saudacao.ts e demais nós que mudam a copy por modo, repo_leitura.ts, testes).
- **LANE C — front:** `frontend/src/modules/lojas/**` (absorve a disponibilidade como seções),
  `frontend/src/modules/disponibilidade/**` (APAGAR), `frontend/src/app/rotas.ts` (remover a rota
  `disponibilidade`).

## Regras de execução (inegociáveis, foi onde deu conflito da última vez)

1. **Só a LANE A escreve migration e contrato/_generated.** B e C programam contra as formas acima; não
   criam migration nem editam `_generated`.
2. **Subagente não roda git** (nem `commit`, `stash`, `checkout`). Cada lane entrega e **reporta**; o
   integrador (orquestrador) verifica e commita cada lane, uma a uma.
3. **Nada de `db push` enquanto as lanes trabalham.** O integrador aplica a 0060 no cloud só depois de
   integrar a Lane A e rodar `validate_migrations` local.
4. Gate por lane antes de reportar pronto: backend `npm run lint/typecheck/test`; front
   `npm run lint/typecheck/build`. Sem verde não está pronto.
5. Sem travessão; sem menção a IA; dinheiro em centavos; datas America/Sao_Paulo; não logar PII.

## Tarefas por lane

### LANE A (dados/backend)
1. Criar a migration 0060 (exata acima). Rodar `bash scripts/validate_migrations.sh whaviso_dev`.
2. Trocar o contrato (exato acima) e rodar o codegen.
3. `disponibilidade/schemas.ts`: Agendamento no lugar de JanelaAtendente.
4. `repo.ts`: `obterAgendamento`/`upsertAgendamento` sobre `agendamento_config` (com `modo`);
   `carregarHorariosAtivos`/`excecaoAtivaNaData` inalterados.
5. `service.ts`: usar `@whaviso/shared/disponibilidade` (apagar o `calculo.ts` local; mover os testes de
   `calculo` para o kernel se ainda não cobertos lá). `agora()` devolve `modo_atendente` via
   `modoAtendente(dados, agendamento, agora)`. `definirAgendamento`/`obterAgendamento` no lugar de janela.
6. `routes`: `/agendamento` (GET/PUT) no lugar de `/janela`; `/agora` com o novo shape.
7. Testes: CRUD de agendamento (modos), `agora` devolve modo certo.

### LANE B (motor do atendente)
1. `repo_leitura.ts`: ler horários ativos + exceção ativa de hoje + `agendamento_config` da loja.
2. `contexto.ts`: computar `modo = modoAtendente(dados, agendamento, agora)` com
   `@whaviso/shared/disponibilidade`; pôr `loja.modo: ModoAtendente` em `EntradaTurno` no lugar de
   `loja.horarios`. **Preservar** `pausada_agora`.
3. `tipos.ts`: `EntradaTurno.loja` ganha `modo`, perde `horarios`.
4. `nodes/saudacao.ts`: ramificar por `loja.modo` — `fechado` responde loja fechada e não abre pedido;
   `agendamento` saúda deixando claro que é pedido **agendado** (entrega sai no horário de atendimento,
   nunca promete "sai em X min"); `atendimento` segue o fluxo normal. Ajustar os nós de
   confirmação/acompanhamento para não prometerem entrega imediata quando `modo === 'agendamento'`.
5. **Preservar** o matcher de janela usado por `montarCardapio` para a **programação de categoria** (é
   agendamento de categoria, não horário de loja): não remover essa lógica; só o gate de loja aberta
   deixa de usar `loja.horarios`/`horario.ts`.
6. Remover o uso de `loja.horarios` como gate e o `horario.ts` se ele ficar só para o gate (se ainda
   servir à programação de categoria, manter apenas essa parte).
7. Testes: saudação por modo; agendamento não promete entrega imediata; categoria por programação segue
   funcionando.

### LANE C (front)
1. Em `modules/lojas`, absorver a disponibilidade como seções da tela da loja (abas/seções **Horário de
   atendimento**, **Agendamento**, **Exceções**, com o estado "agora"), reaproveitando os editores de
   `modules/disponibilidade` (mover para dentro de `lojas`). O editor de agendamento tem os três modos
   (`desligado|faixa|24h`); o de "janela do atendente" deixa de existir como conceito separado.
2. Remover o `EditorHorarios` legado de `lojas` (o que editava `loja.horarios` via PATCH /lojas); o
   horário passa a ser o de atendimento (disponibilidade).
3. Apagar `modules/disponibilidade` e remover a rota `disponibilidade` de `app/rotas.ts`.
4. Consumir o contrato novo (`_generated/disponibilidade`): `agendamento` e `modo_atendente`.
5. Gate verde (lint/typecheck/build).

## Integração (orquestrador)

Ordem: integra **A** primeiro (aplica 0060 no cloud após `validate_migrations`, regen commitado), depois
**B** e **C**. Um commit atômico por lane. Gate integral verde ao final; QA no navegador da tela de Lojas
(seções de disponibilidade) e do modo do atendente.
