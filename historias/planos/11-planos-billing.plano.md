# Plano de desenvolvimento: Épico 11 (Planos, limites e billing)

> **ATUALIZAÇÃO 2026-06-25 (supera trechos abaixo):** o modelo do Plus passou de "por unidade" para **por volume de envios** (26 a 200 envios; piso R$ 31,10, topo R$ 140,00, R$/envio caindo de 1,196 a 0,70) e foram definidos: Profissional **R$ 29,90** e os tetos de **vagas de aviso ativo** (vendidas como "envios de aviso") Free 0 / Start 10 / Profissional 25 / Plus 26-200 (migration 0049, imposto por `exigirVagaDeAtivo`). A história canônica `11-planos-billing.md` já reflete isso. As referências abaixo a "Plus por unidade", "R$ 29/49" ou "preços em aberto" são do plano original e foram superadas.
>
> Fonte da verdade: `historias/11-planos-billing.md`. Onde o código diverge, o plano
> manda mudar o código. Estado atual aferido lendo migrations `0007`/`0019`, módulo
> `billing` da api, `avisos/service.ts`+`repo.ts`, e o front `modules/billing`.

## 1. Resumo do épico e escopo

O Whaviso é SaaS: o plano da conta define **alavancas** (vagas de aviso ativo,
capacidade de agenda, recorrência, cadência configurável, menu de texto livre,
confirmação de pagamento, totais por período) e um **preço**. No MVP a cobrança em
dinheiro é **stub trial**: os limites valem de verdade, o gateway não existe.

Regra-mãe: **free mantém agenda e visualiza, mas não ativa envio**. A **agenda é um
balde único**: toda anotação conta igual (ativa, pausada, só anotação `sem_aviso`,
ou já terminal), e o plano define **quantas anotações** a conta mantém.

**MVP (🟢):** catálogo de 4 planos em migration (Free/Start/Profissional/Plus),
agenda balde único com limite por plano, free cria agenda mas não ativa, validação
de limite no servidor sem corrida, CTA de upgrade nos bloqueios, gating de recursos
(menu/cadência/totais/`informado_pago`) por alavanca lida do catálogo, billing stub
(conta nasce free).

**Gated (🟡):** gateway de pagamento real, faturas, assinatura recorrente, dunning
(H11.7); estado de assinatura e o que ocorre com avisos ativos na queda (H11.9);
upgrade/downgrade com dinheiro (H11.9). A **mecânica** de cada recurso (recorrência
H6.10/H8.7, cadência H6.10, menu H7.1) é de outros épicos; aqui só o liga/desliga.

**Divergência estrutural grande:** o catálogo atual (`pessoal`/`profissional`/
`personalizado`, migration `0019`) **não bate** com o épico. O plano reescreve o
catálogo para 4 planos com agenda balde único; o `personalizado` por fórmula é
**substituído** pelo `plus` por unidade (1 unidade = 1 ativável + 10 de agenda).

## 2. Estado atual vs história (por critério)

Legenda: `[x]` ok · `[~]` parcial · `[!]` diverge (refatorar) · `[+]` não existe.

**H11.1 Catálogo de planos**
- `[!]` Catálogo existe em migration `0019` (upsert idempotente) mas com **3 planos
  errados** (`pessoal`/`profissional`/`personalizado`). Faltam `free`/`start`/`plus`;
  `pessoal`→`start`, `personalizado`→`plus` por unidade.
- `[+]` Alavancas: hoje só `max_avisos_ativos` + `permite_recorrente`. Faltam
  `capacidade_agenda`, `cadencia_configuravel`, `menu_texto_livre`,
  `informado_pago_habilitado`, `totais_periodo`, `vagas_ativas` (vs agenda).
- `[~]` Chave estável + nome + preço em centavos existem (estrutura ok).
- `[x]` Vive em migration upsert (padrão correto, só o conteúdo muda).
- `[~]` "Toda conta referencia um plano vigente, default free": hoje o default
  implícito é `pessoal` (em `repo.limiteDoPlano` e no front). Refatorar para `free`.
- `[~]` Linguagem: catálogo atual já evita palavras proibidas; revalidar nomes novos.

**H11.2 Free visualiza e agenda sem ativar**
- `[+]` Estado `sem_aviso` não existe (enum `status_aviso` não o tem). Hoje criar
  aviso já nasce `aguardando_aceite` (envia). Não há "criar anotação sem ativar".
- `[+]` "Free não ativa, leva a CTA de upgrade": hoje free nem existe; criar conta
  cai em `pessoal` implícito que **ativa** dentro do limite.
- `[+]` Menu de texto livre = silêncio no free: gating não existe (Épico 7).
- `[+]` Recursos free bloqueados aparecem como CTA: não existe.

**H11.3 Ativação de envio por plano**
- `[!]` "Ativar" como transição `sem_aviso → aguardando_aceite` não existe; criar já
  é ativar. Precisa separar criar-anotação de ativar (Épico 4).
- `[+]` Free não ativa: não existe.
- `[~]` Start/Profissional ativam dentro do limite: a validação de limite existe
  (`limiteDoPlano`+`contarAtivos`), mas conta só `ativos`, não agenda balde único.
- `[!]` Plus por unidade: hoje `personalizado` usa `quantidade` como limite de
  ativos; precisa virar `plus`: unidades → ativáveis + (unidades*10) de agenda.
- `[!]` `pausado` ocupa vaga: estado `pausado` não existe; `contarAtivos` conta só
  `aguardando_aceite`+`pendente`.
- `[~]` Recusa com envelope `{error:{code,message}}` + manter item: a recusa existe
  (`limite_plano_atingido`), mas hoje recusa **criar**, não **ativar**, e apaga a
  intenção (não há item de agenda a manter).
- `[~]` Contagem por conta validada no servidor: existe (transação em `criarAviso`).

**H11.4 Limite de capacidade de agenda**
- `[+]` Agenda balde único: não existe; só se conta "ativos".
- `[+]` Item ativado continua ocupando: não há conceito de agenda separada.
- `[!]` Valores Free 50/Start 100/Profissional 150/Plus 10 por unidade: hoje
  10/15/quantidade (errados e na dimensão errada).
- `[+]` Recusar criar nova anotação ao encher: hoje recusa só ativos.
- `[+]` Terminais continuam contando na agenda: hoje terminais **saem** da contagem
  (`contarAtivos` só conta `aguardando_aceite`/`pendente`).
- `[+]` "Excluir da agenda" = arquivamento, não DELETE: não existe campo/estado de
  arquivamento de aviso (existe `arquivada` só em `chaves_pix`, não em `avisos`).

**H11.5 Recursos por plano**
- `[~]` Recorrência: alavanca `permite_recorrente` existe no catálogo, mas não está
  amarrada a nenhum ponto de checagem (recorrência em si é gated, 🟡).
- `[+]` Cadência configurável (só Profissional/Plus): alavanca não existe; gating
  não existe.
- `[+]` Menu texto livre por plano (silêncio no free): não existe.
- `[+]` `informado_pago` como recurso de plano (free não recebe como cobrador):
  estado `informado_pago` existe (mig. `0011`), mas não há gating por plano.
- `[+]` Totais por período só pago: gating não existe.
- `[+]` Reengajamento pós-ciclo até 3 envios, nunca 2/dia: não existe (Épico 8).
- `[+]` Recurso bloqueado vira CTA: não existe.

**H11.6 CTA de upgrade**
- `[~]` Front tem `ContadorUso`/Banner de "atingiu o limite" no `/app/plano` e o
  form de novo aviso trata `limite_plano_atingido`. Mas é só p/ ativos; falta CTA
  no ativar, na agenda cheia e em cada recurso bloqueado.

**H11.7 Billing stub trial**
- `[x]` Stub trial: `assinar` grava `'trial'`, sem gateway real. Tabelas
  `pagamentos`/`eventos_pagamento` e adaptador agnóstico existem (mig. `0019`).
- `[!]` "Conta nasce free": hoje nasce sem assinatura → `pessoal` implícito. Mudar
  para `free` (criar linha de assinatura no signup, ou default implícito `free`).
- `[~]` Gateway/estado de assinatura 🟡: estrutura pronta, fora do MVP (ok).
- `[x]` Não logar dado sensível de pagamento: respeitado.

**H11.8 Validação no servidor**
- `[~]` Limite validado em transação no servidor (`comTransacao`+`contarAtivos`).
  **Risco de corrida não tratado** (sem lock/constraint; dois POST simultâneos podem
  passar do limite). Precisa de teste + travamento. Lê do catálogo (ok), mas só
  `max_avisos_ativos`; precisa ler todas as alavancas.

**H11.9 Mudar de plano 🟡**
- `[~]` `assinar` troca o plano e aplica limite imediatamente (upgrade funciona em
  parte). Downgrade com excedente não tem regra ("mantém ativo, trava criar/ativar
  novos"); hoje a checagem é só no criar. Gated junto com billing real.

## 3. Trabalho por camada

### 3.1 Arquitetura / Dados (migrations)

1. **Nova migration `0025_planos_balde_unico.sql`** (catálogo + alavancas):
   - `alter table planos` adicionando colunas de alavanca:
     `capacidade_agenda int`, `vagas_ativas int null` (null = ilimitado dentro da
     agenda; usado só p/ separar Plus por unidade), `cadencia_configuravel bool`,
     `menu_texto_livre bool`, `informado_pago_habilitado bool`, `totais_periodo bool`.
     Manter `permite_recorrente`. **Despromover** `max_avisos_ativos`/`parametrico`/
     `precos por fórmula`: o Plus deixa de ser fórmula e passa a `por_unidade bool`
     com `agenda_por_unidade int default 10` e `ativaveis_por_unidade int default 1`.
   - **Upsert idempotente dos 4 planos** (substitui as linhas da `0019`):
     `free` (R$ 0, agenda 50, vagas_ativas 0, sem recursos pagos),
     `start` (R$ 990, agenda 100, vagas = agenda, sem cadência/totais),
     `profissional` (R$ 2900/4900, agenda 150, cadência+totais+recorrência+menu+`informado_pago`),
     `plus` (por_unidade, agenda 10/un, ativáveis 1/un, todos os recursos).
     **Remover/aposentar** `pessoal`/`personalizado`: como a regra é não-DELETE de
     negócio mas `planos` é catálogo, e há FKs em `assinaturas`/`pagamentos`,
     **migrar** assinaturas existentes (`pessoal`→`start`, `personalizado`→`plus`
     com `unidades = ceil(quantidade/?)`) **antes** de mexer; documentar mapping.
   - Migrar `assinaturas`: renomear/adicionar `unidades int` (substitui `quantidade`
     no novo modelo), manter `preco_centavos` congelado. Constraint nova de unidade.
   - Preços finais em aberto (ver §7): usar placeholders comentados se não decididos.
   - *Critério:* H11.1 (4 planos, alavancas, migration upsert), H11.4 (valores).

2. **Migration `0026_aviso_sem_aviso_agenda.sql`** (estado de agenda + arquivar):
   - `alter type status_aviso add value if not exists 'sem_aviso'` (e `'pausado'`,
     se ainda não vier do épico de máquina de estados; **coordenar** com cross-épico).
   - `alter table avisos add column arquivado_em timestamptz null` (arquivamento =
     soft, não-DELETE; sai da contagem/visão da agenda quando preenchido).
   - Atualizar a função `validar_transicao_aviso` para incluir
     `sem_aviso → {aguardando_aceite, cancelado, pago}` (ativar/cancelar/marcar) e o
     que mais a máquina de estados cross-épico exigir. **Não** reescrever
     `pendente→programado` aqui (é varredura do épico de máquina de estados; este
     épico só consome o estado). *Critério:* H11.2, H11.3 (transição ativar).
   - Índice parcial `idx_avisos_agenda on avisos (criador_id) where arquivado_em is null`
     para a contagem de agenda ser barata. (criador_id = `coalesce` lógico de
     cobrador_id/devedor_profile_id conforme `criador_papel`.)

3. **Função SQL de limite/contagem atômica** (defesa contra corrida, H11.8):
   - Criar `public.contar_agenda(uid)` e `public.alavancas_do_plano(uid)` (lê
     catálogo + assinatura, resolve Plus por unidade). A contagem de agenda inclui
     **terminais e pausados não-arquivados** (balde único), exclui `arquivado_em`.
   - Para a ativação sem corrida: a transação que ativa faz
     `select ... for update` na linha de assinatura do usuário (lock por conta) antes
     de contar ativos, evitando dois ativares simultâneos passarem da vaga.
   - *Critério:* H11.8 (sem janela de corrida — ponto de teste dedicado).

### 3.2 Backend api

4. **`shared/planos` (kernel, não módulo)**: helper único que resolve as alavancas
   do plano vigente de uma conta a partir do catálogo (não fixar em código). Como
   módulo nunca importa módulo, isto vive em `apps/api/src/shared/` e é chamado por
   `avisos`, `recebimentos`, `painel`, `acoes_devedor`. *Critério:* H11.1, H11.8.

5. **Módulo `billing` (api)**: reescrever `GET /billing/planos`,
   `GET /billing/assinatura`, `POST /billing/assinar` para o novo catálogo (4 planos,
   alavancas, `unidades` no Plus). Remover/aposentar `precos.ts` (fórmula do
   personalizado) e a cotação por fórmula; Plus tem preço por unidade simples.
   Conta nasce `free` (criar linha em `assinaturas` no signup ou default `free`).
   *Critério:* H11.1, H11.7.

6. **Módulo `avisos` (api)**: separar **criar anotação** (nasce `sem_aviso`, valida
   só capacidade de agenda) de **ativar** (`POST /avisos/:id/ativar`: `sem_aviso →
   aguardando_aceite`, gera tokens/link, valida vaga ativa do plano com lock). Free:
   ativar sempre recusa com `plano_sem_envio` (CTA upgrade). `contarAtivos` passa a
   incluir `pausado`; nova `contarAgenda` (balde único, exclui arquivado).
   `cancelarAviso`/arquivar: adicionar `POST /avisos/:id/arquivar` (set
   `arquivado_em`, sai da contagem; nunca DELETE). *Critério:* H11.2, H11.3, H11.4.

7. **Gating de recursos** nos módulos donos, consultando o helper §4:
   - `recebimentos`/`acoes_devedor`: free como cobrador não recebe `informado_pago`
     (não ativa avisos, então não chega lá; garantir que a ativação free é barrada
     resolve por construção). Confirmação como cobrador exige plano que ative.
   - `painel`: totais por período só quando `totais_periodo` true (free vê básico).
   - Cadência/menu/recorrência: pontos de checagem ligados às alavancas (mecânica é
     dos épicos 6/7/8; aqui só o `if alavanca`). *Critério:* H11.5.

### 3.3 Backend zap

8. **Scheduler/menu respeitam o estado**: o `zap` drena `envios`; como free não ativa
   (não gera `envios`), nada dispara — resolvido por construção no api. Garantir que
   o zap, ao reconferir o estado no disparo, descarta `sem_aviso`/`pausado`/terminal
   (defesa em profundidade). Menu de texto livre = silêncio no free decorre de não
   haver aviso ativo desse cobrador; nenhuma mudança própria de plano no zap.
   *Critério:* H11.2 (nada no free dispara), H11.5 (menu silêncio).

### 3.4 Frontend

9. **`modules/billing` (Plano.tsx + api.ts)**: reescrever para 4 planos. Remover
   slider/`useCotacao` da fórmula do personalizado; Plus vira cartão com seletor de
   **unidades** (preço por unidade, agenda/ativáveis derivados). Contador de uso vira
   **uso de agenda** (não só ativos): "X de N anotações". Espelhar todas as alavancas
   vindas do catálogo. *Critério:* H11.1, H11.4, H11.6.

10. **CTA de upgrade nos pontos de bloqueio**: ao **ativar** sem vaga
    (`plano_sem_envio`/`vaga_ativa_esgotada`), ao **criar** com agenda cheia
    (`agenda_cheia`), e em cada **recurso** bloqueado (recorrência/cadência/totais),
    mostrar CTA discreta que não destrói trabalho (item fica na agenda). Recursos
    bloqueados aparecem cinza com selo "no plano X", não somem. *Critério:* H11.6.

11. **Contratos Zod do front** (`shared/contracts`): atualizar `enums` (status com
    `sem_aviso`/`pausado`), `Plano`/`Assinatura` (novas alavancas, `unidades`), e o
    dicionário de linguagem se preciso. *Critério:* H11.1, H11.2.

### 3.5 Segurança

12. Validação **sempre no servidor** (H11.8): front só antecipa; api+banco decidem.
    Tentativa de chamar a api direto recusa com envelope. Limite lido do catálogo,
    nunca fixado em código. Não logar dado de pagamento. Lock por conta na ativação.

### 3.6 Testes

- **Unit** (vitest): `alavancas_do_plano`/`contar_agenda` por plano (Free 50, Start
  100, Profissional 150, Plus N*10); resolução de alavancas (cadência só Prof/Plus).
- **Integração api**: free não ativa (`plano_sem_envio`); criar até a capacidade e o
  N+1 recusar (`agenda_cheia`); terminal continua contando; arquivar libera slot;
  pausado ocupa vaga; ativar conta vaga ativa do plano; Plus por unidade.
- **Corrida (dedicado, H11.8)**: dois ativares concorrentes na última vaga → só um
  passa (lock por conta). Dois criares concorrentes na última posição de agenda → só
  um. *Reproduzir com transações paralelas no `whaviso_dev`.*
- **Gating**: free não recebe `informado_pago` como cobrador; totais por período
  ausentes no free; recorrência/cadência barradas fora do plano.

## 4. Sequência de passos

> Cada passo: objetivo · arquivos prováveis · critério (HNN.x) · modelo + porquê.

1. **Decidir mapping de migração de planos antigos** (`pessoal`→`start`,
   `personalizado`→`plus`) e preços finais com o humano (ver §7). Sem código.
   `H11.1`. — **opus** (decisão estrutural de dados/billing com FKs e snapshot de
   preço; erro aqui corrompe assinaturas existentes).

2. **Migration `0025`**: alavancas em `planos` + upsert dos 4 planos + migração das
   assinaturas existentes + ajuste de `assinaturas` (`unidades`).
   `backend/supabase/migrations/0025_*.sql`. Rodar
   `bash scripts/validate_migrations.sh whaviso_dev`. `H11.1`, `H11.4`. — **opus**
   (catálogo + migração de dados com FK e snapshot; idempotência e não-DELETE).

3. **Migration `0026`**: estado `sem_aviso` (+`pausado` coordenado), coluna
   `arquivado_em`, atualizar `validar_transicao_aviso`, índice de agenda.
   `backend/supabase/migrations/0026_*.sql`. `H11.2`, `H11.3`. — **opus** (máquina de
   estados no trigger; transição inválida quebra ciclo; coordenação cross-épico).

4. **Funções SQL `contar_agenda`/`alavancas_do_plano`** + estratégia de lock por
   conta na ativação. Mesma migration `0026` ou `0027`. `H11.4`, `H11.8`. — **opus**
   (contagem balde único correta + ausência de corrida é o ponto crítico do épico).

5. **Helper `shared/planos` na api** (resolve alavancas do catálogo, default free).
   `backend/apps/api/src/shared/planos/`. `H11.1`, `H11.8`. — **sonnet** (leitura de
   catálogo e mapeamento; lógica direta, sem concorrência).

6. **Reescrever módulo `billing` da api** (catálogo novo, assinar grava free/plano,
   Plus por unidade, remover fórmula). `backend/apps/api/src/modules/billing/*`.
   `H11.1`, `H11.7`. — **sonnet** (CRUD de catálogo/assinatura; regras simples).

7. **Conta nasce free**: garantir linha `assinaturas` free no signup (ou default
   implícito free no helper). `modules/perfil` ou hook de criação. `H11.7`. —
   **sonnet** (ajuste pontual de default).

8. **Criar-anotação vs ativar no módulo `avisos`**: criar nasce `sem_aviso`
   (valida agenda), novo `POST /avisos/:id/ativar` (`sem_aviso→aguardando_aceite`,
   valida vaga ativa com lock, free recusa), `contarAtivos` inclui `pausado`,
   `contarAgenda` balde único. `backend/apps/api/src/modules/avisos/{service,repo,index}.ts`.
   `H11.2`, `H11.3`, `H11.4`. — **opus** (transição de estado + limite sob lock; coração
   da regra de plano, sensível a corrida e a não-DELETE).

9. **Arquivar anotação** (`POST /avisos/:id/arquivar`, set `arquivado_em`, sai da
   contagem, nunca DELETE; só o usuário). `modules/avisos`. `H11.4`. — **sonnet**
   (set de flag + guarda de dono; mecânica simples uma vez modelado o campo).

10. **Gating de recursos** nos donos via helper: `painel` (totais por período),
    `recebimentos`/`acoes_devedor` (`informado_pago` por construção do free), pontos
    de cadência/recorrência. `modules/painel`, `modules/recebimentos`. `H11.5`. —
    **opus** (espalha por vários módulos respeitando fronteiras; risco de furo de
    gating se um caminho escapar).

11. **Reconferência no zap** (descarta `sem_aviso`/`pausado`/terminal no disparo;
    defesa em profundidade). `backend/apps/zap/src/.../scheduler`. `H11.2`. —
    **opus** (reconferência de estado no disparo é ponto crítico de corrida do canal).

12. **Front: reescrever `modules/billing`** (4 planos, Plus por unidade, contador de
    agenda). `frontend/src/modules/billing/{api.ts,pages/Plano.tsx}`,
    `frontend/src/shared/contracts/*`. `H11.1`, `H11.4`. — **sonnet** (telas e
    espelho do backend; sem lógica de decisão).

13. **Front: CTAs de upgrade** nos bloqueios (ativar, agenda cheia, recurso pago) +
    recursos cinza com selo. `frontend/src/modules/{avisos,billing,painel}`. `H11.6`.
    — **sonnet** (copy/UI de bloqueio, sem regra de negócio nova).

14. **Atualizar PROJETO.md seção 8 e CLAUDE.md** para o modelo de 4 planos balde
    único (a divergência do épico manda reescrever o doc). `PROJETO.md`,
    `CLAUDE.md`. `H11.1` (divergência). — **sonnet** (edição de doc).

15. **Testes**: unit das funções de alavanca/agenda; integração free-não-ativa /
    agenda-cheia / terminal-conta / arquivar-libera / pausado-ocupa / Plus-unidade;
    **teste de corrida** dedicado (ativar e criar concorrentes). `backend/apps/api/src/modules/avisos/tests/`,
    `billing/tests/`. `H11.3`, `H11.4`, `H11.8`. — **opus** (os testes de corrida e
    de balde único exigem montar concorrência e raciocinar sobre o lock).

## 5. Dependências de outros épicos

- **E13 (linguagem)** e **E12 (templates)**: invariantes de copy nas CTAs e catálogo.
- **E1 (auth)**: "conta nasce free" depende do fluxo de signup/conta-no-aceite.
- **Máquina de estados (cross-épico)**: este épico **introduz** `sem_aviso` e o
  arquivamento, mas **consome** `pausado` e a varredura `pendente→programado` (donos
  do épico de máquina de estados / E2/E3). Coordenar a edição do trigger
  `validar_transicao_aviso` para não conflitar.
- **E4 (modo agenda)**: separar "criar" de "ativar/gerar convite" é compartilhado com
  E4 (H4.3); alinhar quem implementa a rota de ativar.
- **E6/E7/E8**: a **mecânica** de recorrência/cadência/menu/`informado_pago` é deles;
  E11 só fornece a alavanca e o ponto de gating.
- **E9 (painel)**: totais por período/visão por papel; E11 gate-eia o "totais".

## 6. Riscos e pontos de teste dedicado

- **Corrida na ativação/criação (H11.8, crítico):** dois requests na última vaga.
  Mitigação: `select ... for update` na linha de assinatura por conta dentro da
  transação. Teste dedicado com transações paralelas.
- **Balde único correto:** terminais e pausados **contam**; arquivados e
  `sem_aviso`-distinção não confundir. Risco de contar errado → upgrade indevido ou
  bloqueio falso. Teste por estado.
- **Migração de planos antigos:** `pessoal`/`personalizado` têm assinaturas e
  pagamentos com FK; migrar mapeando para `start`/`plus` sem DELETE e sem quebrar
  snapshot de preço congelado. Risco financeiro/dados.
- **Furo de gating:** um caminho que ative envio sem passar pelo helper de plano
  (ex.: aceite ativando ciclo) fura o free. Auditar todos os pontos que mudam status
  para `aguardando_aceite`/geram `envios`.
- **Coordenação do trigger:** outro épico também reescreve `validar_transicao_aviso`;
  conflito de migration. Sequenciar.

## 7. Decisões em aberto a confirmar com o humano

- **Preços finais** (RESOLVIDO 2026-06-25, migration 0049): Free R$ 0, Start R$ 9,90,
  Profissional **R$ 29,90**, **Plus por volume de envios** (26 a 200): piso R$ 31,10,
  topo R$ 140,00 (R$/envio de 1,196 a 0,70). Não há degrau "R$ 49".
- **Mapping de migração** das assinaturas atuais: `pessoal`→`start` ok;
  `personalizado` (limite = `quantidade` de ativos por fórmula) → `plus` por unidade:
  como converter `quantidade` em `unidades` (cada unidade = 1 ativável + 10 agenda)?
  Arredondar para cima? Honrar preço congelado antigo?
- **`vagas_ativas` para Start/Profissional:** o épico diz que nesses planos "não há
  contagem de vaga ativa separada da agenda" (agenda é o teto). Confirmar que o limite
  de **ativos** nesses planos é = capacidade de agenda (nunca trava ativar enquanto
  couber na agenda). Só o **Plus** tem vaga ativa < agenda (1 ativável/unidade vs 10
  agenda/unidade).
- **`pausado`:** quem cria o estado `pausado` (este épico ou E2/E3)? Para não duplicar
  a migration do enum, definir o dono.
