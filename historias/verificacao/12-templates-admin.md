# Verificação — Épico 12: Templates / mensagens (admin)

> Verificação READ-ONLY contra o código em `c:\Users\Jeffe\Documents\study\whaviso`. A história é a única fonte da verdade; nada de código/migration/história foi alterado.

## Veredito (37 [x] · 2 [~] · 0 [!] · 0 [+])

O épico está fortemente implementado e em paridade com a história: uma tabela `templates` por chave com conteúdo estruturado, editor único, versionamento pendente→aprovar→ativar, DELETE com guarda da ativa, preview pelo mesmo renderizador, zap como transporte genérico e hub `/admin/templates`. As duas ressalvas [~] são: (1) o botão "ver chave Pix" do ciclo NÃO é suprimido no envio (o ciclo manda os três botões sempre, por decisão do E6/H6.2, contrariando a letra de H12.3); (2) a estrutura de três opções do aceite (`dado_incorreto`) existe no enum/editor, mas a chave `convite.*` é gated (a própria história marca 🟡 em H12.10).

## Por história

### H12.1: Modelo unificado de templates 🟢
| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Uma tabela `templates` chaveada por `chave` estável (ciclo.*, cobrador.*, resposta.*) | [x] | `backend/supabase/migrations/0022_templates_unificada.sql:23-43` cria a tabela com coluna `chave`; seed `resposta.*` em :59-77; ciclo em `0024_ciclo_unificado.sql:42-59`; cobrador em `0023_cobrador_unificado.sql:18-27` | `admin.test.ts:34` (ciclo), `:200` (resposta.*) |
| Conteúdo estruturado jsonb `{ texto, botoes:[{acao,rotulo}], midia:{tipo,url} }` | [x] | coluna `conteudo jsonb` em `0022:29`; schema Zod `conteudoTemplate`/`botaoTemplate`/`midiaTemplate` em `backend/packages/shared/src/contracts/entidades.ts:119-136` | indireto via preview/criar |
| Sem tabelas paralelas por etapa/tipo (templates_mensagem e templates_cobrador unificadas) | [x] | `drop table public.templates_cobrador` em `0023:31`; `drop table public.templates_mensagem` em `0024:68`; notas históricas em `0006`/`0018` | n/a |
| Catálogo da estrutura (chaves, variáveis, ações por chave), fonte do editor | [x] | `frontend/src/modules/admin/catalogo_mensagens.ts:77-186` (seções + variáveis + ações); paleta em `templates_catalogo.ts:25-32` | n/a |
| Texto respeita regras de ouro (proibidas/travessão/gênero) — detalhe no E13 | [x] | CHECK no banco `0022:38-39` (proibidas) e `0025_templates_sem_travessao.sql:12-14` (travessão); lint na api `admin/index.ts:36-47,138-150` | `admin.test.ts:241,253,285` |

### H12.2: Edição de texto com paleta de variáveis 🟢
| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Editor `/admin/mensagens/:chave` mostra texto + paleta de variáveis da chave (catálogo) | [x] | `frontend/src/modules/admin/pages/DetalheMensagem.tsx:371-372,519-533`; rota em `router.tsx:152` | n/a |
| Variáveis disponíveis mudam por chave | [x] | `catalogo_mensagens.ts:50-55,62,97,155`; `DetalheMensagem.tsx:372` filtra `CATALOGO_VARIAVEIS` pela chave | n/a |
| Na renderização variáveis substituídas por valores reais do módulo do zap (H12.8) | [x] | `backend/apps/zap/src/shared/templates/index.ts:56-75` usa `renderizarTexto`; valores por `enviar_lembretes/render.ts` e `notificar_cobrador` | `zap` templates.test.ts |
| Valor em dinheiro a partir de centavos (formatação na borda), datas em America/Sao_Paulo | [x] | exemplos no editor `templates_catalogo.ts:29-30`; valores reais montados pelos módulos do zap (render.ts); renderizador puro `render.ts:16-26` | preview tests |

### H12.3: Botões editáveis (rótulo sim, ação não) 🟢
| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Editor lista botões da chave com ação fixa + campo de rótulo editável | [x] | `DetalheMensagem.tsx:537-568` (lista botões, ação fixa, `Input` de rótulo); `BotaoEditavel` :323-327 | n/a |
| Ação não editável; trocar rótulo não muda o que dispara | [x] | `entidades.ts:119-122` (`acao` = enum, só `rotulo` editável); render monta id `acao:refId` em `zap/.../templates/index.ts:69` | n/a |
| Catálogo define quais ações cada chave aceita; editor não inventa ação fora da lista | [x] | `catalogo_mensagens.ts:49,63` (ACOES_CICLO); `DetalheMensagem.tsx:353` itera só `meta.acoes`; enum fechado `enums.ts:91-98` | n/a |
| No ciclo, "ver chave Pix" suprimido no envio quando aviso sem Pix (decisão de envio, E6/E7) | [~] | `backend/apps/zap/src/modules/enviar_lembretes/index.ts:65-67` declara que os TRÊS botões aparecem em TODAS as etapas SEM supressão (Pix virou obrigatório, E2/E3). Diverge da letra de H12.3; é decisão do E6/H6.2 citada no código | `enviar_lembretes.test.ts` |
| No aceite, estrutura cobre as três opções (aceitar/dado incorreto/recusar) | [~] | enum tem `aceite`/`recusa`/`dado_incorreto` (`enums.ts:91-98`); rótulo padrão `DetalheMensagem.tsx:313-321`. Porém a chave `convite.*` é GATED (H12.10 🟡): hoje só `resposta.aceite`/`resposta.recusa` existem | n/a |

### H12.4: Variante de contexto (padrão / revisão) 🟢
| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Chave pode ter contexto (ciclo: padrao e revisao), cada um com sua ativa/propostas | [x] | enum `template_contexto` em `0013_templates_contexto.sql:7`; coluna `contexto` `0022:26`; unique por (chave,contexto) ativo `0022:43`; revisao do ciclo `0024:54-59` | n/a |
| Editor mostra alternador padrão/revisão só nas chaves com variante (marcadas no catálogo) | [x] | `catalogo_mensagens.ts:64` (`temRevisao:true` só no ciclo); `DetalheMensagem.tsx:124,141-155` (SegmentedControl só se `temRevisao`) | n/a |
| Variante revisao usada quando aviso em informado_pago (E8) | [x] | `backend/apps/zap/src/modules/enviar_lembretes/repo.ts:107-113` escolhe `revisao` quando `a.status='informado_pago'`, fallback `padrao`; `index.ts:37-41` (só d_mais_1) | `enviar_lembretes.test.ts` |
| Seleção do contexto no envio é do código (estado do aviso), não do owner | [x] | `repo.ts:108-112` calcula contexto por `a.status`; `carregarTemplateAtivo` faz fallback `templates/index.ts:31-46` | n/a |

### H12.5: Versionamento e publicação 🟢
| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Salvar cria nova versão; nasce pendente | [x] | `admin/index.ts:151-167` insere `status_meta='pendente', ativo=false`, `versao = max+1` | `admin.test.ts:316` |
| Passo de aprovação explícito antes de ativar (manual no MVP) | [x] | `POST /admin/mensagens/:id/aprovar` em `admin/index.ts:219-231` | `admin.test.ts:331` |
| Ativar só se aprovada; ativar não aprovada recusado (envelope error) | [x] | `admin/index.ts:204-206` lança `conflito('template_nao_aprovado', ...)` | `admin.test.ts:327-330` |
| Ativar substitui a ativa da chave/contexto; versões antigas permanecem | [x] | `admin/index.ts:207-213` (transação zera ativo da chave/contexto, ativa a nova) | `admin.test.ts:333-335` |
| A versão ativa é a única que o zap usa; editar não afeta até ativar | [x] | `carregarTemplateAtivo` filtra `where ... and ativo` (`templates/index.ts:39`) | `zap` tests |

### H12.6: Apagar versão (exceção de DELETE) 🟢
| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Owner pode apagar uma versão (DELETE físico) | [x] | `DELETE /admin/mensagens/:id` em `admin/index.ts:234-252` (`delete from public.templates`) | `admin.test.ts:44` (owner-only) |
| Nunca apaga a ativa; recusa com error (409) | [x] | `admin/index.ts:243-248` lança `conflito('template_ativo', ...)` | `admin.test.ts:372-382` |
| Role whaviso_api tem DELETE só nesta tabela | [x] | `0022:48` grant delete em `public.templates` p/ whaviso_api; nota `0018:1-17`; zap só SELECT `0022:49` | n/a |
| Apagar versão pendente/antiga não afeta o que está no ar | [x] | DELETE atinge só a linha do id; ativa protegida em :243-248 | `admin.test.ts:372` |

### H12.7: Pré-visualização da mensagem 🟢
| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Preview renderiza texto com valores de exemplo e mostra botões com rótulos | [x] | `POST /admin/mensagens/preview` em `admin/index.ts:175-191`; front `DetalheMensagem.tsx:483-495` | `admin.test.ts:210` |
| Preview não envia nada (não toca outbox nem WhatsApp) | [x] | `admin/index.ts:179` só chama `renderizarTexto`/lint, sem insert em envios/notificacoes nem socket | n/a (por construção) |
| Preview usa o mesmo renderizador do envio real | [x] | api e zap usam o mesmo `renderizarTexto`; fonte única `render.ts:16-26` (api :179, zap `templates/index.ts:63`) | `admin.test.ts:226-240` (paridade valor ausente) |

### H12.8: zap como transporte genérico 🟢
| Critério | Status | Evidência | Teste |
|---|---|---|---|
| zap não contém texto de negócio; carrega versão ativa por chave/contexto e renderiza | [x] | `templates/index.ts:1-5` (sem strings fixas); webhook `service.ts:76`; cobrador `notificar_cobrador/index.ts:215`; ciclo `enviar_lembretes/index.ts:71` | `zap` tests |
| Transporte entende texto + botões + mídia genericamente (abstração MensagemWhats) | [x] | `renderMensagem` em `templates/index.ts:56-75` monta texto/botoes/midia | `zap` templates.test.ts |
| Cada módulo que envia monta o mapa de valores e chama o renderizador; nenhum monta string própria | [x] | ciclo `enviar_lembretes/index.ts:71-75`; cobrador `notificar_cobrador/index.ts:228`; webhook `service.ts:75-81` | `zap` tests |
| Sem versão ativa → falha controlada, registrada para o owner corrigir | [x] | ciclo `marcarFalhou('sem_template_ativo')` `enviar_lembretes/index.ts:55-58`; cobrador `MOTIVO_SEM_TEMPLATE` `notificar_cobrador/index.ts:7-9,216`; surface admin `admin/repo.ts:127-155` | `notificar_cobrador.test.ts` |
| Troca de provider (Baileys→Meta) não muda templates; transporte trocável atrás da abstração | [x] | `templates/index.ts` depende de `ClienteWhats`/`MensagemWhats` (`baileys_client`), não de provider concreto | n/a |

### H12.9: Hub de navegação das mensagens 🟢
| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Tela hub `/admin/templates` com trilha do ciclo (D-2 a D+1) e demais famílias | [x] | `frontend/src/modules/admin/pages/Templates.tsx:14-35`; seções em `catalogo_mensagens.ts:77-186` | n/a |
| Cada item leva ao editor da chave `/admin/mensagens/:chave` | [x] | `ListaMensagens.tsx`/`CicloTemplates.tsx` linkam por chave; rota `router.tsx:151-152` | n/a |
| Hub e editor são área admin/owner (acesso restrito) | [x] | `router.tsx:142-152` envolve `/admin` em `<RequireRole role="owner">`; backend `admin/index.ts:58` `requireRole('owner')` | `admin.test.ts:27,44,53,171` (não-owner → 403) |
| Navegação reflete o catálogo (chave nova aparece sem tela nova) | [x] | `Templates.tsx:30-32` itera `SECOES_MENSAGENS`; situação viva dos templates da API (`construirResumo` :41-56) | n/a |

### H12.10: Famílias ainda sem editor 🟡
| Critério | Status | Evidência | Teste |
|---|---|---|---|
| 🟡 `convite.*` ainda sem chave editável (gated Meta); convite sai por link wa.me | [x] | `catalogo_mensagens.ts:106-112` estado `gated`; sem chave `convite.*` no banco | n/a |
| 🟡 `conta.*` (OTP/boas-vindas) ainda sem editor (gated Meta) | [x] | `catalogo_mensagens.ts:171-184` (Código de acesso `gated`, Boas-vindas `planejado`) | n/a |
| 🟡 Quando ligadas, entram na mesma tabela e mesmo editor, sem modelo paralelo | [x] | enum `acaoBotaoTemplate` já reserva `dado_incorreto` (`enums.ts:82-98`); catálogo prevê inclusão na mesma tela; sem tabela paralela | n/a |

## O que o código precisa mudar para seguir a história (mudanças de CÓDIGO)

1. **H12.3 (botão "ver chave Pix" no ciclo):** a história (linha 38) exige supressão do botão "ver chave Pix" no envio quando o aviso não tem Pix. O código `enviar_lembretes/index.ts:65-67` deliberadamente envia os três botões sempre, justificando que o Pix virou obrigatório (E2/E3, decisão do E6/H6.2). Como a história de E12 é a fonte da verdade e este critério não está marcado 🟡, o código deveria reintroduzir o filtro condicional do botão `ver_pix` quando não houver Pix, OU este conflito entre épicos precisa ser conciliado. Classificado [~] porque é decisão tomada por outro épico dentro do próprio código, não falha clara.

2. **H12.3 (três opções do aceite):** o enum e o editor já comportam `dado_incorreto`, mas não há chave `convite.*` ativa hoje. A própria história marca isso 🟡 em H12.10 (depende da Meta). Sem mudança obrigatória agora; a estrutura está pronta. Mantido [~] só para sinalizar que a cobertura plena depende de destravar E5.

## Itens que a própria história marca como 🟡/fora de escopo (com a linha)

- H12.3, linha 38: "o botão 'ver chave Pix' é suprimido no envio quando o aviso não tem Pix (decisão de envio, não de template), ver Épico 6/7." A própria história delega a decisão ao E6/E7; o E6 (H6.2) tornou o Pix obrigatório e removeu a supressão. Conflito entre épicos, registrado.
- H12.10, linha 107: "🟡 A família `convite.*` ... ainda não tem chave editável: depende da Meta oficial (gated...)." Confere com `catalogo_mensagens.ts:106-112` (estado `gated`).
- H12.10, linha 108: "🟡 A família `conta.*` (OTP de login, boas-vindas) ainda não tem editor." Confere com `catalogo_mensagens.ts:171-184`.
- H12.10, linha 109: "🟡 Quando ligadas, essas famílias entram na mesma tabela e no mesmo editor." Enum já reserva `dado_incorreto` (`enums.ts:82-98`); sem modelo paralelo.
- Fora de escopo, linhas 136-139: textos finais (copy), regras de linguagem em si (E13), aprovação Meta/convite por template (gated E1/E5), catálogo de variável por chave (dado). Não verificados como critérios deste épico.

## Observações

- A consolidação prevista na seção "Divergências" da história (uma tabela, um editor, zap genérico) está completa: `templates_mensagem` (0024) e `templates_cobrador` (0023) foram dropadas e migradas para `templates`.
- "Aprovação manual vs Meta" (divergência da história): o passo manual existe (`/aprovar`) e o front explica que enquanto o WhatsApp roda via Baileys a aprovação é manual (`DetalheMensagem.tsx:294-298`). Coerente com a história.
- "Garantia de linguagem no editor" (divergência da história): a validação roda ao salvar no backend (`admin/index.ts:138-150`, bloqueia proibida e travessão; gênero só alerta), no preview (:175-191) e no front (`DetalheMensagem.tsx:393-398`), além de CHECK no banco (0022, 0025). Defesa em profundidade presente.
- Cobertura de teste do épico é boa: `admin.test.ts` cobre criar/aprovar/ativar/apagar, recusa de ativar não aprovada, apagar ativa (409 template_ativo), preview, paridade de valor ausente, lint de proibida e travessão, gênero, e owner-only.
- O editor de DetalheMensagem hoje edita texto + botões; mídia existe no modelo/transporte mas não no editor de UI (comentário `DetalheMensagem.tsx:9-11`). A história não exige editor de mídia nos critérios, então não conta como [!].
