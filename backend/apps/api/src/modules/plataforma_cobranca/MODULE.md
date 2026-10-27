# plataforma_cobranca (P-cobranca)

Cobranca **restaurante -> Whaviso**: assinatura por conta (opcionalmente por loja), faturas por
competencia, inadimplencia e **suspensao/reativacao** da loja. Conferencia de pagamento manual na v1
(o operador baixa a fatura), sem gateway. A loja enxerga apenas a propria fatura.

Fonte da verdade do comportamento: `historias/plataforma/cobranca.md`. Este arquivo cobre so a
fronteira tecnica do modulo.

## Audiencias e rotas (registry: prefixo `plataforma-cobranca` -> `/v1/plataforma-cobranca/*`)

Operador (equipe Whaviso), `config.acesso: 'plataforma'` + `escopoOperador`:
- `POST /assinaturas` cria assinatura (trial|ativa).
- `GET  /assinaturas` lista (filtros `conta_id`, `status`).
- `PATCH /assinaturas/:id` suspende/reativa/cancela (transicao validada) e altera valor/vencimento.
- `GET  /faturas` lista (filtros `status`, `competencia`, `conta_id`).
- `POST /faturas/:id/pagar` baixa manual (`reativar: true` reativa se nao restam atrasos).
- `POST /faturas/:id/cancelar` cancela (estado, nao DELETE).
- `POST /cobranca/gerar-faturas` idempotente (`ON CONFLICT (assinatura_id, competencia)`); rate-limited.
- `POST /cobranca/apurar-atrasos` marca atrasadas e suspende apos a carencia; rate-limited.

Dono da loja (membro), `config.acesso: 'conteudo_de_loja'` + `escopoLoja` + guarda de dono:
- `GET /minha-fatura` faturas da PROPRIA conta (`conta_id` vem do escopo; DTO enxuto, sem dado de
  outra conta). Membro que nao e `dono` recebe 403.

## Propriedade de dados

- **Dono de escrita (exclusivo):** `assinaturas`, `faturas`.
- **Escreve so por TRIGGER (migration 0035):** `lojas.suspensa` / `lojas.suspensa_em`. O modulo
  **nunca** faz `UPDATE lojas`; a flag deriva de `assinaturas.status` pela funcao
  `assinatura_aplica_suspensao()` (SECURITY DEFINER).
- **Le (SELECT):** `contas`, `lojas` (validar vinculo). Escreve `eventos` (append-only, sem PII).

## Suspensao derivada (0035)

`lojas.suspensa` (plataforma) e DIFERENTE de `lojas.ativo` (dono da loja). O trigger, ao mudar o
status da assinatura:
- `suspensa` | `cancelada` -> `suspensa = true` (carimba `suspensa_em`);
- `ativa` | `trial` -> `suspensa = false` (limpa `suspensa_em`).
Alvo: a loja da assinatura, ou TODAS as lojas da conta quando `loja_id` e NULL.

> **Follow-up de coordenacao (NAO e deste modulo):** `ZAP-webhook` e `AT-motor-min` devem HONRAR
> `lojas.suspensa = true` (nao processar pedidos; responder indisponibilidade). O atendente ja tem
> `SELECT` em `lojas` (migration 0002, cobre a coluna nova). **`whaviso_zap` NAO tem `SELECT` em
> `lojas` hoje**: habilitar o webhook a ler `suspensa` exige um grant novo (`grant select
> (suspensa...) on public.lojas to whaviso_zap`), decisao do integrador/revisao de seguranca. Este
> modulo so ENTREGA a flag.

## Decisoes

- **Franquia + excedente (STATUS.md):** o novo preco da Meta (out/2026) deve virar franquia +
  excedente por mensagem, apoiado em `eventos_custo` (modulo `API-custos`, futuro). Enquanto esse
  livro-razao nao existe, modelamos a **estrutura** de assinatura/fatura e a suspensao por trigger; o
  `valor_mensal_centavos` (padrao R$ 700) e o preco fixo de hoje. Quando o excedente entrar, a
  geracao de fatura soma o excedente medido ao valor-base; a estrutura (competencia, vencimento,
  estados, suspensao) nao muda.
- **Sem pro rata na v1:** a 1a fatura e cheia; o trial gratuito cobre o intervalo.
- **Carencia** `CARENCIA_DIAS_PADRAO = 7` em `regras.ts` (config, nao tabela).
- **Fatura emitida e imutavel no valor:** alterar o valor da assinatura vale so para faturas futuras.
- **Reativacao nao e automatica:** so com `reativar: true` na baixa E sem faturas atrasadas restantes.
- **Cancelada suspende a loja:** status terminal; fail-closed (loja cancelada nao atende).
- **Jobs** rodam pelas rotas de operador; o agendamento real (systemd timer) e infra, fora do modulo.

## Contratos

`@whaviso/shared/contracts/plataforma_cobranca` (fonte unica; subpath novo no `package.json` do
shared). O barrel `contracts/index.ts` ainda NAO reexporta este agregado (fiacao do integrador para o
codegen do front): adicionar `export * from './plataforma_cobranca'` + `gen:contracts`.
