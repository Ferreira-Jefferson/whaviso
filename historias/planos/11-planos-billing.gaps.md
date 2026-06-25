# Relatório de validação: Épico 11 (Planos, limites e billing)

> **ATUALIZAÇÃO 2026-06-25 (supera trechos abaixo):** o Plus é **por volume de envios** (26 a 200; R$ 31,10 a R$ 140,00), o Profissional é **R$ 29,90**, e há tetos de **vagas de aviso ativo** ("envios de aviso") Free 0 / Start 10 / Profissional 25 / Plus 26-200 (migration 0049). A história canônica já reflete isso; menções a "Plus por unidade" abaixo são do plano original e foram superadas.
>
> Revisão adversarial do plano `11-planos-billing.plano.md` contra a história
> `11-planos-billing.md` (fonte da verdade), o `_CONTEXTO.md` e o código real
> (migrations `0007`/`0019`, `modules/billing`, `modules/avisos`).

## 1. Veredito

**Aprovado com ressalvas.**

O plano é forte: leu o código corretamente (estado atual fiel), cobre a
divergência estrutural grande (4 planos balde único), trata corrida com lock por
conta, separa criar de ativar, modela arquivamento como soft-delete e respeita
não-DELETE. Mas há **gaps técnicos e de cobertura** que, se não corrigidos,
deixam furos: a contagem de agenda usa um `criador_id` que **não existe** como
coluna, uma **constraint antiga (>= 16) bloqueia o Plus**, e alguns critérios de
aceite (H11.2 menu free, H11.5 reengajamento, H11.5 cadência do devedor
invertido, H11.6 linguagem) ficam sem passo explícito.

## 2. Gaps por severidade

### Críticos

- **C1 — Índice/contagem de agenda usa coluna inexistente `criador_id`
  (H11.4, H11.8).** O plano (§3.1.2) cria
  `idx_avisos_agenda on avisos (criador_id) where arquivado_em is null` e fala em
  "criador_id = coalesce lógico de cobrador_id/devedor_profile_id". **Não existe
  coluna `criador_id`** em `avisos`; o dono se resolve pela dupla condição
  `(criador_papel='cobrador' and cobrador_id=$1) or (criador_papel='devedor' and
  devedor_profile_id=$1)` (ver `repo.contarAtivos`/`avisosDoUsuario`). Um índice
  sobre uma coluna inexistente quebra a migration; e a `contar_agenda(uid)` (§3.1.3)
  precisa replicar essa dupla condição, senão **conta errado no fluxo invertido**
  (devedor-criador) e libera/bloqueia agenda indevidamente. *Correção:* índice
  parcial por expressão sobre `coalesce(cobrador_id, devedor_profile_id)` **ou**
  dois índices, e `contar_agenda` com a mesma condição dupla de `contarAtivos`.

- **C2 — A constraint `assinaturas_quantidade_minima (>= 16)` da `0019` bloqueia o
  Plus por unidade (H11.1, H11.3).** O Plus pode ter `unidades = 1` (1 ativável +
  10 de agenda). O plano (§3.1.1) fala em "renomear/adicionar `unidades`
  (substitui `quantidade`)" mas **não declara o drop da constraint
  `assinaturas_quantidade_minima`** nem da `assinaturas_preco_nao_negativo` se o
  modelo mudar. Se `unidades` reaproveitar `quantidade`, a checagem `>= 16` recusa
  qualquer Plus < 16 unidades. *Correção:* a `0025` deve **explicitamente** dropar
  `assinaturas_quantidade_minima` e criar a nova (`unidades >= 1`).

- **C3 — Furo de gating no aceite (free não ativa) não tem passo próprio (H11.2,
  H11.3).** O plano cita o risco (§6 "furo de gating", §3.2.7 "garantir que a
  ativação free é barrada resolve por construção") mas **não há passo que audite o
  caminho aceite → ciclo**. Hoje o aviso já nasce `aguardando_aceite` no
  `criarAviso`; ao introduzir `sem_aviso`, a ativação passa por `POST
  /avisos/:id/ativar`, mas o **aceite pela página pública / webhook** (`acoes_*`,
  sem login) também muda estado e gera `envios`. Se o convidado aceita um aviso
  que um free conseguiu deixar como `aguardando_aceite` por outro caminho, fura.
  *Correção:* passo explícito que lista TODOS os pontos que setam
  `aguardando_aceite`/`pendente`/geram `envios` e confirma que cada um passa pelo
  gate de plano (ou que `sem_aviso` é a única porta de entrada do ciclo no free).

### Médios

- **M1 — Menu de texto livre no free = silêncio: sem passo de checagem real
  (H11.2, H11.5).** O plano resolve "por construção" (§3.3.8: free não tem aviso
  ativo, logo o devedor não interage). Mas o critério é sobre **mensagem fora dos
  botões** chegando ao zap; se um free for **devedor** de outra conta (cenário que
  o próprio épico admite em H11.5), há aviso ativo e o menu de texto livre é do
  Épico 7. O gating "silêncio no free" é da **conta dona do aviso**, não do
  devedor. *Correção:* esclarecer que o gate `menu_texto_livre` é avaliado pelo
  plano da conta-cobradora dona do aviso, e que o passo de gating (§3.2.7) inclui
  esse ponto, mesmo que a mecânica seja do Épico 7.

- **M2 — Reengajamento manual pós-ciclo (até 3 envios, nunca 2/dia) sem passo
  (H11.5).** É critério de aceite explícito de H11.5. O plano só o marca como
  "não existe (Épico 8)" no §2 e cita em §3.6 testes, mas **não há passo de
  implementação nem nota de que a alavanca/limite pertence a este épico**. Embora
  a mecânica seja do Épico 8, o **limite de 3** é regra de plano/negócio deste
  épico. *Correção:* registrar quem é dono do "3 envios" (alavanca de catálogo vs
  constante do Épico 8) como decisão, e referenciar no plano.

- **M3 — Cadência configurável do DEVEDOR do fluxo invertido (H11.5) omitida.**
  H11.5 diz: cadência configurável = "o cobrador escolhe quais D-avisos **e** o
  devedor do fluxo invertido também pode configurar como recebe". O plano só fala
  de "cadência" genérica e gating Prof/Plus. Não distingue o lado do devedor
  invertido (que é o **criador** no invertido e pode estar em outro plano).
  *Correção:* nota explicitando que a alavanca `cadencia_configuravel` vale para
  ambos os lados e qual plano governa (o do criador do aviso invertido).

- **M4 — Linguagem das CTAs e do catálogo sem validação concreta (H11.1, H11.6).**
  H11.6 exige CTA "sem dívida/cobrança, gênero neutro, sem travessão"; H11.1 exige
  o mesmo do catálogo. O plano cita E13 nas dependências (§5) mas **nenhum passo
  roda lint de linguagem / valida copy das CTAs**. *Correção:* nos passos 13
  (CTAs) e 6 (catálogo) acrescentar critério "passa no `contracts/linguagem.ts` /
  dicionário front e no lint de travessão".

- **M5 — H11.9 "downgrade com excedente mantém ativo, trava criar/ativar"
  (regra de não-DELETE) sem nota mesmo sendo 🟡.** O plano marca H11.9 como gated
  (correto), mas o **comportamento de não desligar nada no downgrade** interage
  com a contagem de agenda balde único deste MVP: se a contagem barra ativar
  quando `ativos >= vagas`, a regra "mantém os ativos existentes acima do limite"
  já precisa estar coerente com o lock. *Correção:* nota de que a checagem de
  limite deve ser ">= ao criar/ativar novo" e nunca retroativa (não desliga
  existentes), deixando H11.9 só com a UX/billing para o futuro.

- **M6 — Default `free` x assinatura implícita inconsistente com o código atual
  (H11.7).** O plano oferece duas saídas (criar linha no signup OU default
  implícito free no helper) sem decidir. Hoje `GET /billing/assinatura` retorna
  `pessoal` implícito quando não há linha. Se ficar implícito, é fácil esquecer um
  caminho e cair no plano errado. *Correção:* decidir por **uma** estratégia
  (preferir linha real no signup para evitar default espalhado) e listar todos os
  pontos que hoje assumem plano implícito (`billing/index.ts`, `repo.limiteDoPlano`,
  front) para trocar de `pessoal`→`free`.

### Baixos

- **B1 — `precos.ts`/`/billing/cotacao`/`useCotacao` a remover sem passo de limpeza
  do webhook/checkout.** O plano remove a fórmula do personalizado, mas
  `/billing/checkout` e `/billing/webhook` referenciam `quantidade`/`preco`
  congelado; ao trocar para `unidades`, revisar esses endpoints (passo 6 cita
  "reescrever billing" mas não nomeia checkout/webhook). Baixo porque é gated.

- **B2 — `vagas_ativas` semântica ambígua.** O plano usa `vagas_ativas null =
  ilimitado dentro da agenda` e `free = vagas_ativas 0`. Mas o épico diz que em
  Start/Profissional o limite de ativos **é** a capacidade de agenda. Modelar como
  `null` está ok, mas documentar que o helper trata `null` como "= capacidade de
  agenda", não "infinito real". Já está como decisão em aberto (§7), aceitável.

- **B3 — `informado_pago_habilitado` no catálogo é redundante para o free.** O
  épico diz que free não recebe `informado_pago` **porque não ativa** (por
  construção), não por uma alavanca. Criar a coluna não é errado, mas o plano deve
  deixar claro que o gate real é "ativa envio?", e a coluna serve só para planos
  pagos que queiram desligar (não há nenhum hoje). Risco de gating duplicado.

## 3. Cobertura dos critérios de aceite

| História | Critérios | Cobertura |
|---|---|---|
| H11.1 catálogo | 6 | OK (linguagem fraca, ver M4) |
| H11.2 free agenda | 5 | Parcial: menu silêncio (M1) frágil |
| H11.3 ativação | 7 | Parcial: furo aceite (C3) |
| H11.4 agenda | 7 | Parcial: contagem invertido (C1) |
| H11.5 recursos | 8 | Parcial: reengajamento (M2), cadência devedor (M3) |
| H11.6 CTA | 4 | Parcial: linguagem (M4) |
| H11.7 billing stub | 5 | OK (default M6) |
| H11.8 servidor | 4 | OK (corrida com teste dedicado) |
| H11.9 mudar plano 🟡 | 4 | OK como gated (M5) |

**Critérios sem passo explícito no plano:**
- H11.2: "menu de texto livre no free é silêncio" (resolvido só por construção).
- H11.5: "reengajamento manual pós-ciclo, até 3 envios, nunca 2 no mesmo dia".
- H11.5: "devedor do fluxo invertido também configura como recebe".
- H11.6/H11.1: validação de linguagem (sem travessão/palavra proibida) das CTAs e
  nomes de plano contra `contracts/linguagem.ts`.

## 4. Testes

Os pontos críticos têm teste dedicado:
- **Corrida na ativação/criação (H11.8):** sim (§3.6, passo 15) — dois requests na
  última vaga, lock por conta. Bom.
- **Balde único por estado (H11.4):** sim — terminal conta, pausado ocupa,
  arquivar libera.
- **Plus por unidade:** sim.

**Lacunas de teste:**
- Falta teste do **fluxo invertido** na contagem de agenda (devedor-criador) — é
  exatamente o caso que C1 quebra. Sem teste, o bug do `criador_id` passa.
- Falta teste do **furo de gating no aceite** (C3): aceitar um aviso não deve
  ativar envio para conta free.
- Coalescing/horário reservado/idempotência **não são deste épico** (E6/E10) — o
  plano corretamente não os reivindica.

## 5. Coerência cross-épico

- Dependências (E13, E12, E1, máquina de estados, E4, E6/7/8, E9) estão corretas e
  o plano marca bem o que **introduz** (`sem_aviso`, arquivamento) vs **consome**
  (`pausado`, varredura `pendente→programado`).
- **Conflito de migration sinalizado** (trigger `validar_transicao_aviso` também
  tocado por E2/E3/máquina de estados): bom, mas o plano deve **sequenciar
  explicitamente** quem roda primeiro, senão duas migrations editam a mesma função.
- **Decisão em aberto legítima:** dono do estado `pausado` (este épico ou E2/E3) —
  bem levantada, não inventada.
- Sem contradição com outros épicos detectada. O renome `pendente→programado` é
  corretamente deixado fora deste épico.

## 6. Invariantes do Épico 13

- Centavos: OK (catálogo e snapshot em centavos).
- Fuso/servidor: OK (nada calculado no cliente).
- Não-DELETE: OK (arquivamento por `arquivado_em`, migração de planos sem DELETE).
- Sem travessão / palavras proibidas / gênero neutro: **não verificado por passo**
  (ver M4) — risco nas CTAs e nomes de plano novos.
- Não logar sensível: OK (H11.7 respeitado).
- HMAC/JWKS/hash de convite/idempotência: **não pertencem a este épico** (billing
  webhook já tem segredo + índice de idempotência na 0019); o plano corretamente
  não reabre isso.

## 7. Recomendação de modelo por passo

Sensata no geral: `opus` para migrations de catálogo+dados, trigger de estado,
funções de contagem/lock, criar-vs-ativar, gating espalhado, reconferência no zap
e testes de corrida; `sonnet` para CRUD de billing, helper de leitura, arquivar,
front e docs. **Ajuste sugerido:** o passo 5 (helper `shared/planos`) está como
`sonnet`, mas é o **ponto único** de que dependem C1/C3 (resolução de dono no
invertido + default free); merece atenção de `opus` ou pelo menos revisão extra,
pois um erro aqui propaga para todos os gates.
