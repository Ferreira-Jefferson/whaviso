# Verificação — Épico 13: Linguagem, opt-out e compliance

## Veredito (8 [x] · 2 [~] · 0 [!] · 0 [+])

H13.1 [x] · H13.2 [~] · H13.3 [x] · H13.4 [x] · H13.5 [x] · H13.6 [x] · H13.7 [x] · H13.8 [x] · H13.9 [x] · H13.10 [~]

As regras de ouro estão implementadas e guardadas por teste no servidor e por CHECK no banco. As duas divergências ([~]) são na GARANTIA AUTOMÁTICA / referência de migration: o lint (`npm run lint` = `eslint .`) NÃO barra travessão nem palavras proibidas em código/copy (quem barra é um teste de vitest + CHECK do banco); e o critério H13.1 cita a migration `0006`, que foi dropada (CHECKs vivem em `0022`/`0025`).

## Por história

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| **H13.1** palavras proibidas nunca em templates/UI/zap/banco/erros | [x] | Padrão único `PALAVRAS_PROIBIDAS_PATTERN` em `backend/packages/shared/src/contracts/linguagem.ts:19`; CHECK no banco `backend/supabase/migrations/0022_templates_unificada.sql:39`; lint do POST de template `backend/apps/api/src/modules/admin/index.ts:139-144`. Varredura de produção limpa. | sim: `linguagem.test.ts:94-102` (varre apps/api, apps/zap, packages/shared); front `frontend/src/shared/contracts/linguagem.test.ts:54-61` (.ts/.tsx/.css/.html) |
| **H13.1** vocabulário aprovado aviso/lembrete/combinado | [x] | comentário-fonte `linguagem.ts:5-6`; copy dos templates usa "lembrete/combinado" (`0024_ciclo_unificado.sql`, `0039_ciclo_botoes_empurrao.sql`) | indireto (varredura) |
| **H13.1** vale em comentários/identificadores | [x] | varredura lê o arquivo cru (inclui comentários); `billing/` deixou de ser exceção (`linguagem.test.ts:66-72`) | sim |
| **H13.1** mudar vocabulário = atualizar juntos (migration `0006`, backend, front) | [~] | A 0006 (`templates_mensagem`) foi DROPADA na consolidação; os CHECKs vivem em `0022`/`0025` e `linguagem.ts:15-17` documenta isso. O critério cita `0006` literalmente: divergência de citação (intento "atualizar juntos" garantido pelo teste de espelho). | sim: espelho `linguagem.test.ts:116-156` |
| **H13.1** não vale em docs internas | [x] | varredura restrita a `apps/*/src` + `packages/*/src` + `frontend/src`; `.claude`/`historias` fora (`linguagem.test.ts:62`) | sim |
| **H13.2** travessão nunca em código/copy/comentários/mensagens/front | [x] | `TRAVESSAO_PATTERN='[—–]'` (`linguagem.ts:26`); CHECK no banco `0025_templates_sem_travessao.sql:13-14`; lint do POST `admin/index.ts:145-150`. Varredura de produção e migrations limpa. | sim: `linguagem.test.ts:104-111`; front `linguagem.test.ts:63-70` |
| **H13.2** usa vírgula/dois-pontos/parênteses no lugar | [x] | regra documentada `linguagem.ts:7-8`; cumprida em todo o código (sem violação) | indireto |
| **H13.2** não vale em docs internas | [x] | mesmo escopo de varredura de H13.1 | sim |
| **H13.3** toda mensagem neutra quanto a gênero | [x] | nenhuma construção gendered nos templates-semente (grep `\bsou (a\|o)\b`, `bem-vind[oa]`, `obrigad[oa]`, artigo+papel = 0 em `backend/supabase/migrations` e em `frontend/src`) | parcial: só ALERTA, não bloqueio (ver H13.10) |
| **H13.3** evita artigos/pronomes gendered, usa nome direto | [x] | `GENERO_ALERTA_PATTERNS` (`linguagem.ts:33-43`) codifica os anti-padrões ("sou a/o", "o/a", artigo+papel, "bem-vindo/a", "obrigado/a") | sim: `linguagem.test.ts:52-56` |
| **H13.3** vale em templates/front/zap | [x] | padrão espelhado no front `frontend/src/shared/contracts/linguagem.ts:23-29`; aplicado no zap pelo conteúdo dos templates (banco) | sim (espelho) |
| **H13.3** espelhada em contracts + dicionário do front | [x] | os TRÊS padrões (incl. gênero) idênticos nos dois lados; a "divergência" da história ("hoje pode não estar garantida") foi RESOLVIDA | sim: `linguagem.test.ts:148-154` compara `GENERO_ALERTA_PATTERNS` dos dois lados |
| **H13.4** toda mensagem do ciclo carrega botão de opt-out | [x] | templates do ciclo trazem `{acao:'optout'}` (`0024:22,37`; `0039:71`; `0040:92`; `0042:107`) | indireto (testes de ciclo) |
| **H13.4** opt-out é um toque, sem digitar/justificar | [x] | botão único `acao:optout` aplica direto (`webhook_whatsapp/repo.ts:733-761`) | sim: `interacao_devedor.test.ts` |
| **H13.4** rótulo editável pelo owner, presença não opcional | [x] | rótulo vem do template editável (`0039:35` renomeia o rótulo); a `acao` (comportamento) é fixa no código (`0022:20`) | sim (templates) |
| **H13.4** linguagem do opt-out segue as regras | [x] | rótulo "Desativar lembretes" (`0039:71`), sem proibida/travessão; coberto pela varredura de migrations | sim |
| **H13.5** opt-out leva a `desregistrado` (não-terminal), distinto de pausado/cancelado/recusado | [x] | transição `programado→desregistrado` (`webhook_whatsapp/repo.ts:743-750`); enum + máquina `0028_maquina_estados.sql:40,82-89` | sim: `transicao_estado.test.ts:60,72` |
| **H13.5** saída afeta só aquele combinado | [x] | opt-out opera por `avisoId` (`repo.ts:743`), nunca por telefone em massa | sim (compliance/interacao) |
| **H13.5** não apaga (sem DELETE) + evento append-only | [x] | só `update status` + `insert eventos_aviso ('optout')` (`repo.ts:743-754`); nenhum DELETE | sim |
| **H13.5** reativação `desregistrado→programado` | [x] | `acao:ativar` (`repo.ts:705-731`); transição válida `0028:89` | sim: `transicao_estado.test.ts:72` |
| **H13.6** terminal nunca mais envia | [x] | trigger `encerrar_envios_do_aviso` cancela envios em terminal/suspensão (`0028:107-122`); cinto no drainer `enviar_lembretes/index.ts:42-47` (estado != programado → cancela) | sim: `enviar_lembretes.test.ts:107-128`; `transicao_estado.test.ts` |
| **H13.6** botão em terminal não reabre nem dispara | [x] | `ESTADOS_ATIVOS` (`repo.ts:84,595-605`) devolve `encerrado` sem mudar estado; resposta neutra "encerrado" só no pago (`service.ts:119-123`) | sim: `compliance.test.ts:57-119` (cancelado/pago/expirado/recusado) |
| **H13.6** `desregistrado` não é terminal mas não envia enquanto nele | [x] | suspensão no trigger (`0028:112-118` inclui `desregistrado`); aceita só `ativar` (`repo.ts:705-708`) | sim: `transicao_estado.test.ts` |
| **H13.6** garantido no servidor, não só UI | [x] | trigger no banco + check no drainer (acima) | sim |
| **H13.7** devedor só por botão; sem chat/IA/Pix automático | [x] | texto livre não casa `acao:avisoId` → `parsearPayloadBotao` retorna null (`service.ts:42-55,94-96`); texto livre só vira menu no pago, senão silêncio (`service.ts:245-268`) | sim: `compliance.test.ts:30-54` (texto livre não muda estado/evento/outbox) |
| **H13.7** texto livre: silêncio no free, menu no pago | [x] | `listarCombinadosParaMenu` + `menuLiberado` (`repo.ts:812-830`; `service.ts:252-259`) | sim: `interacao_devedor.test.ts` |
| **H13.7** Whaviso não confirma pagamento sozinho (cobrador confirma) | [x] | "ja_paguei"→`informado_pago` (não `pago`) (`repo.ts:630-657`); só `confirmar` do cobrador →`pago` (`repo.ts:484-502`) | sim: `confirmacao_pagamento` / `recebimentos.test.ts` |
| **H13.7** nenhuma automação financeira | [x] | nenhuma rota/ação move dinheiro; só estados + outbox de avisos | sim (ausência) |
| **H13.8** telefone/Pix(titular/banco)/token nunca em log | [x] | `REDACT.paths` cobre telefone(_devedor/_cobrador), pix_chave/titular/banco, titular, banco, chave, token, otp, codigo em 0/1/2 níveis (`backend/packages/shared/src/logger/index.ts:11-27`) | sim: `logger/index.test.ts:24-57` (raiz + 2 níveis) |
| **H13.8** token só como hash sha256, claro nunca persiste | [x] | `gerarToken`/`sha256Hex` (`backend/apps/api/src/shared/tokens/index.ts`); convite por `sha256ConviteHex` (`webhook_whatsapp/service.ts`) | sim (tokens/convite tests) |
| **H13.8** payload do botão leva `aviso_id`, não token | [x] | `id: ${acao}:${refId}` com refId=aviso_id (`backend/apps/zap/src/shared/templates/index.ts:69`) | sim: `templates.test.ts:35-41` |
| **H13.8** erros usam `{error:{code,message}}` sem vazar | [x] | `tratadorDeErros` (`backend/apps/api/src/shared/http_errors/index.ts:25-59`); 500 manda só "Erro interno" | sim: `admin.test.ts`/`auth.test.ts` |
| **H13.8** gateway de pagamento (🟡 futuro) | 🟡 | a própria história marca futuro (linha 87); fora do escopo atual | n/a |
| **H13.9** backend tem `contracts/linguagem.ts` (vocab + proibidas + neutras) | [x] | `backend/packages/shared/src/contracts/linguagem.ts` (os 3 padrões + funções) | sim |
| **H13.9** front tem dicionário espelhando, sem importar @whaviso/shared | [x] | `frontend/src/shared/contracts/linguagem.ts` (cópia manual dos 3 padrões) | sim: espelho `linguagem.test.ts:136-155` |
| **H13.9** mudança feita junto nos dois lados (e migration de banco) | [x] | teste de igualdade falha se divergir; CHECKs em 0022/0025 | sim |
| **H13.9** gênero neutro entra na fonte única | [x] | `GENERO_ALERTA_PATTERNS` nos dois lados (resolve a divergência da linha 97) | sim |
| **H13.10** lint do backend E front barra travessão e palavras proibidas (parte do `npm run lint`) | [~] | `npm run lint` = `eslint .` nos dois (`backend/package.json:10`, `frontend/package.json:11`). Os `eslint.config.mjs` (backend e front) só têm `boundaries` + recomendado: NENHUMA regra `no-restricted-syntax`/plugin que detecte travessão/proibida. A guarda existe, mas via VITEST (`linguagem.test.ts`) + CHECK no banco, NÃO via lint. A história pede explicitamente o lint. | guarda existe (teste/CHECK), não no lint |
| **H13.10** 🟡 validar regras no servidor ao salvar template | [x] | POST `/admin/mensagens` bloqueia proibida e travessão com `{error:{code,message}}` (`admin/index.ts:138-150`); preview informa sem bloquear (`:175-191`) | sim: `admin.test.ts` |
| **H13.10** 🟡 checagem de gênero = lista de alerta (warning) | [x] | `alertaGenero` retorna trechos, não bloqueia (POST salva com `avisos_genero`, `admin/index.ts:166-168`) | sim: `linguagem.test.ts:52-56` |
| **H13.10** garantia automática complementa a fonte única | [x] | lint(parcial)/teste/CHECK consomem os mesmos padrões de `linguagem.ts` | sim |

## Violações encontradas na varredura (travessão / palavras proibidas / redaction)

Nenhuma violação de CONTEÚDO encontrada:
- **Travessão (— U+2014 / – U+2013):** zero ocorrências em `backend/apps/api/src`, `backend/apps/zap/src`, `backend/packages/shared/src`, `frontend/src` (exceto `linguagem.*` por definição) e em `backend/supabase` (migrations + seed).
- **Palavras proibidas (dívida/devendo/atraso/cobrança/inadimplência):** zero em código de produto e nas migrations (fora dos próprios padrões/CHECKs).
- **Gênero:** nenhuma construção gendered nos templates-semente nem na copy do front (greps de "sou a/o", "bem-vindo/a", "obrigado/a", artigo+papel = 0).
- **Redaction:** `REDACT` cobre telefone, telefone_devedor, telefone_cobrador, pix_chave, pix_titular, pix_banco, titular, banco, chave, token, otp, codigo, em raiz, `*.x` (1 nível) e `*.*.x` (2 níveis). Limitação conhecida e documentada (`logger/index.ts:6-9`): paths além de 2 níveis só somem se o objeto cru não for logado; a regra de uso é "logar só ids/códigos", testada em `logger/index.test.ts:51-57`.

Único ponto a observar (não é violação de conteúdo, é de FERRAMENTA): a garantia que a história atribui ao **lint** está feita por **teste vitest + CHECK do banco**, não pelo `eslint`.

## O que o código precisa mudar para seguir a história (mudanças de CÓDIGO)

1. **H13.10 (lint):** A história pede que `npm run lint` barre travessão e palavras proibidas em código/copy. Hoje `eslint .` não faz isso. Para cumprir literalmente, adicionar uma regra `no-restricted-syntax` (ou plugin/regra custom) nos dois `eslint.config.mjs` que rejeite `[—–]` e o `PALAVRAS_PROIBIDAS_PATTERN` em literais de string/comentários. Severidade baixa: a regra HOJE não escapa (o teste verde a barra no CI), mas não no momento do lint como a história nomeia.

2. **H13.1 (referência à migration `0006`):** o critério cita `0006` como o lugar a atualizar junto; essa migration foi dropada e os CHECKs migraram para `0022`/`0025`. O comentário-fonte de `linguagem.ts:15-17` já aponta para 0022/0025; nada a corrigir no comportamento, apenas a citação literal da história diverge do código. Marco [~] só pela citação.

## Itens que a própria história marca como 🟡/fora de escopo (com a linha)

- **H13.8, linha 87:** "Quando houver gateway de pagamento (🟡 futuro), o mesmo vale para dados de cartão/pagamento." Futuro, fora do escopo atual.
- **H13.10, linha 105:** "🟡 Ao salvar um template (Épico 12)... validadas no servidor... confirmar se essa validação já existe." Confirmado que EXISTE (`admin/index.ts:138-150`).
- **H13.10, linha 106:** "🟡 A checagem de gênero neutro é mais difícil de automatizar; pelo menos os padrões mais comuns... entram numa lista de alerta." Implementado como alerta (`GENERO_ALERTA_PATTERNS` / `alertaGenero`).
- **Fora de escopo, linhas 133-135:** mecânica de botão/estado (E6/7/8), edição de textos (E12), LGPD/contratos formais. Não verificados aqui por decisão da própria história.
- **Divergências (linhas 113, 114, 115):** as três marcadas como pendentes pela história foram RESOLVIDAS no código: gênero neutro está em `linguagem.ts` (linha 113); validação ao salvar template existe (linha 114); `desregistrado` é estado reversível na máquina de estados `0028` (linha 115).

## Observações

- O backend usa o MESMO `PALAVRAS_PROIBIDAS_PATTERN` em três camadas (código TS, CHECK do banco em 0022, lint do POST de template): defesa em profundidade real, não só documentação.
- As "Divergências" que a própria história listava como pendentes (gênero não garantido, validação ao salvar, `desregistrado` reversível) já estão TODAS implementadas; vale atualizar a história em revisão futura (não neste relatório, que não reescreve história).
- A única lacuna real é de FERRAMENTA (H13.10): a barreira de linguagem está no `vitest` e no banco, não no `eslint` como a história nomeia. Como a barreira de fato impede regressão no CI, é divergência de baixa severidade, porém literal.
