---
name: chrome-qa-loop
description: Loop de QA exploratorio sobre o app whaviso rodando de verdade num Chrome real, via Chrome DevTools MCP. Voce dispara, o Claude navega a SPA com o contexto de cada tela vindo de historias/, escreve um relatorio markdown por achado na hora, voce revisa, devolve pro triage, e as correcoes viram tarefas com PLAN. Pega o que o vitest com mock nao pega: erro de console, request falhando, estado vazio real, authz quebrada, PII vazando. Dispare com "/chrome-qa-loop", "qa loop", "explorar o app", "testar o app rodando", "chrome qa".
---

# Chrome QA Loop (whaviso)

Ciclo de QA exploratorio com humano no meio, dirigido pelo Claude via **Chrome DevTools MCP** (`chrome-devtools-mcp`). Adaptado do plugin `chrome-qa-loop@lemon-ai-hub` para o whaviso: os "docs donos" sao as historias em `historias/`, e o triage localiza o codigo com `/graphify`.

```
voce dispara > EXPLORE (Chrome DevTools MCP) > REPORT (1 md por achado) > voce REVISA > TRIAGE > IMPLEMENTA (loop de feature) > REFLETE > (volta pra voce)
```

## Configuracao (por repo)

O loop le `chrome-qa-loop.config.json` na raiz do repo. Ja existe no whaviso apontando para:

```json
{
  "TARGET_BASE_URL": "http://localhost:5173",
  "SCREEN_MANIFEST": "docs/qa/PLAN.md",
  "OWNER_DOCS_ROOT": "historias/",
  "REPORTS_ROOT": "docs/qa/reports/",
  "RUN_MODE": "core"
}
```

O manifesto de telas (rota > historia dona > cenarios) vive em `docs/qa/PLAN.md`.

## Invocacao

```
/chrome-qa-loop [mode=guest|guest-smoke|guest-full|smoke|core|full]   # roda uma passada (default: core)
/chrome-qa-loop triage run=<run-id>                                   # transforma relatorios revisados em tarefas + stubs de PLAN
```

- **mode=guest** > so rotas publicas (sem login).
- **mode=guest-smoke** > landing + entrar. Checagem rapida da superficie publica.
- **mode=guest-full** > todas as rotas publicas.
- **mode=smoke** > primeiras 1 a 3 rotas logadas. Precisa de login.
- **mode=core** > primeiras ~6 rotas logadas. Precisa de login. Default.
- **mode=full** > todas as rotas do manifesto. Precisa de login.

## Passo 0: pre-condicoes (confira, nao assuma)

1. `chrome-qa-loop.config.json` existe na raiz (ja existe no whaviso).
2. Para `smoke`/`core`/`full`: o app esta de pe e voce esta logado. Rode `npm run dev` na raiz (sobe api :3001 + front :5173). Login e Google OAuth ou OTP por WhatsApp, feito **a mao** por voce no Chrome conectado ao MCP (nao da pra automatizar). Para `guest*`: nao precisa login.
3. As ferramentas do MCP `chrome-devtools` estao disponiveis (servidor `chrome-devtools-mcp`, registrado no config local do Claude Code via `claude mcp add`; nesta maquina aponta pro node.exe absoluto, ver memoria do projeto). Verifique com `list_pages`.
4. A pasta de relatorios `docs/qa/reports/` existe (crie se faltar).

## Passo 1: EXPLORE + REPORT (delegado)

1. Crie um `run-id`: `qa-<AAAAMMDD>-<mode>` (leia a data de hoje via Bash `date`; o runtime proibe `Date.now()`).
2. Crie `docs/qa/reports/<run-id>/`.
3. Dispare o agente **`chrome-qa-explorer`** com: o `run-id`, o `mode`, a config e um ponteiro pro PLAN (manifesto + guardrails + contrato de relatorio). Ele navega, exercita cenarios e escreve um arquivo por achado na hora, mais o `_INDEX.md`.
4. Ao voltar, mostre pra voce: contagem de achados por severidade + o caminho da pasta de relatorios.

> O explorer e read-only. Nunca cria dados reais, nunca dispara envio de WhatsApp de verdade, nunca gasta credito, nunca completa pagamento.

## Passo 2: REVISAO (portao humano)

Abra a pasta de relatorios, leia cada achado e marque `status: triaged` nos que valem agir (ou `rejected` pra descartar). Este e o checkpoint humano. Nao siga automatico.

## Passo 3: TRIAGE (delegado)

No `/chrome-qa-loop triage run=<run-id>`: dispare o agente **`qa-report-triage`**. Ele deduplica, prioriza (P0 a P3), localiza o codigo provavel via `/graphify` e emite `triage/TASKS.md` + stubs de `PLAN.md` por correcao.

## Passo 4: IMPLEMENTA (handoff, fora deste loop)

Cada stub de PLAN aceito entra num fluxo normal de implementacao de feature: planeja > implementa > testa > gate de qualidade (`npm run lint/typecheck/test` no backend, `/verify`). Este loop nao reimplementa essa maquinaria.

## Passo 5: REFLETE

Registre a rodada: o que foi corrigido, o que o explorer deixou passar, lacunas do manifesto (rotas/telas novas a adicionar). Atualize `docs/qa/PLAN.md` quando o produto mudar. Re-rode `mode=smoke` nas telas corrigidas pra verificar (use `/verify`), fechando o loop.

## Ativos que este loop usa

- **Agente** `chrome-qa-explorer` (`.claude/agents/`): o cerebro que dirige o navegador (4 lentes, por tela, por rodada).
- **Agente** `qa-report-triage` (`.claude/agents/`): ponte revisao > implementacao.
- **MCP** `chrome-devtools` (`chrome-devtools-mcp`, oficial do Google Chrome DevTools): registrado no config local do Claude Code (`claude mcp add`). Verifique com `list_pages`.
- **`/graphify`**: mapa do codigo, usado pelo triage pra apontar `file:line`.

## Guardrails (resumo; conjunto completo no PLAN)

Read-only sempre (mesmo em dev, que aponta pro Supabase cloud) - nunca disparar envio de WhatsApp real, gastar credito ou completar pagamento - nada de dialog nativo bloqueante (use `handle_dialog`) - fundamentar o "esperado" na historia dona antes de julgar - segredo/PII visivel = P0 (so a localizacao, nunca o valor) - sonda de prompt-injection so benigna - um relatorio por achado escrito na hora (auto-salvo em disco, sem download manual).
