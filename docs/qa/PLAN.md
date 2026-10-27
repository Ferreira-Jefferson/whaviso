# QA PLAN: manifesto de telas do whaviso (produto restaurante)

Manifesto do Chrome QA Loop: mapeia **rota do painel -> doc dono -> cenarios** e carrega os guardrails e o contrato de relatorio. O explorador (`chrome-qa-explorer`) le este arquivo, navega o app rodando (`http://localhost:5173`) e escreve um relatorio por achado.

> O comportamento esperado e o contrato de seguranca vem de `docs/pivot/` (ARQUITETURA, BANCO, SEGURANCA, HARNESS-ATENDENTE, RAG). A lente de Security cita o catalogo `SEC-###` de `docs/pivot/SEGURANCA.md`. `historias/` e plano de execucao, nao especificacao de tela.

## Estado do ambiente (ler antes de rodar)

- O dev local (5173 -> api 3001) aponta para o **Supabase cloud rebaseado para o restaurante** (projeto `exxczsyjvgjsxmwlrwww`, migrations 0001-0051). **Read-only continua obrigatorio.**
- Login e **manual** (Google OAuth ou OTP por WhatsApp), feito a mao na janela do Chrome conectada ao MCP. O explorador nao automatiza login.
- O cloud nasceu **sem conta/loja do restaurante**: no primeiro login a api cria a conta via `POST /v1/conta`, e a loja some ate ser criada (o shell mostra "Vamos criar sua primeira loja"). Para QA com dados, logar e **ter uma loja com cardapio** (criada pela UI ou semeada).
- Worker IA (atendente) ainda nao roda contra o cloud: telas de IA (Atendente/Conhecimento/Fluxo) exibem config, mas a conversa ao vivo nao processa.

## Guardrails (read-only, sempre)

Nunca, mesmo em dev: disparar envio de WhatsApp real ao cliente; confirmar, criar ou alterar pedido; mudar preco ou cardapio; completar Pix; gerar chamada de LLM que custe na chave da loja; aceitar/despachar corrida real; criar campanha que dispare. Nada de dialog nativo bloqueante (usar `handle_dialog`). Sonda de prompt-injection so **benigna** e so nas superficies de IA do painel. Fundamentar o "esperado" no doc dono antes de julgar.

## Severidade

- **P0** segredo ou PII visivel (foco: chave de LLM, token da Meta, Pix da loja, telefone do cliente/cobrador), quebra de fronteira de dados entre loja/operador, acao destrutiva sem guarda. Um arquivo `.md` proprio, imediato.
- **P1** funcao quebrada, erro nao tratado, estado impossivel, contrato violado. Arquivo proprio.
- **P2** UX ruim, acessibilidade, copy fora do guia (travessao, genero, mencao a IA). Arquivo proprio.
- **P3** polimento. So linha no `_INDEX.md`.

## Contrato de relatorio

Um arquivo por achado em `docs/qa/reports/<run-id>/`, escrito na hora (nao acumular). Frontmatter: `id`, `severidade` (P0-P3), `rota`, `lente` (QA|Produto|Engenharia|Seguranca), `status: novo`, `doc_dono`, `sec` (codigo SEC-### quando Seguranca). Corpo: o que se esperava (ancorado no doc), o que aconteceu, passos, evidencia (screenshot/trecho de rede sem PII), hipotese unica. Mais um `_INDEX.md` com a tabela de todos os achados.

## Rotas publicas (mode=guest, sem login)

| rota | doc dono | cenarios |
|---|---|---|
| `/entrar` | ARQUITETURA.md (auth) | carrega; botao Google e campo OTP presentes; sem erro de console; title da aba (nao deve citar "avisos de pagamento", resquicio do produto antigo) |
| `/politica-de-privacidade` | SEGURANCA.md | carrega como pagina legal; sem shell autenticado |
| `/termos-de-uso` | SEGURANCA.md | carrega; idem |

## Rotas logadas (ordem = prioridade; mode=core cobre as ~6 primeiras)

| # | rota | grupo | doc dono | cenarios-chave |
|---|---|---|---|---|
| 1 | `/pedidos` | painel | BANCO.md (pedidos), ARQUITETURA.md | kanban por status carrega; abrir um pedido mostra itens/opcoes/total em centavos formatado; telefone do cliente **mascarado** (SEC PII); estados loading/vazio/erro |
| 2 | `/conversas` | painel | HARNESS-ATENDENTE.md | lista de conversas; abrir uma mostra mensagens; conteudo do cliente nao vaza em log; botao assumir/devolver (handoff) coerente; sem acao que dispare WhatsApp |
| 3 | `/cardapio` | painel | BANCO.md (cardapio) | categorias/itens/grupos/opcoes carregam; precos em centavos; **nao alterar** (read-only) |
| 4 | `/clientes` | painel | SEGURANCA.md (PII) | lista; telefone mascarado; ficha sem vazar dado sensivel |
| 5 | `/caixa` | painel | BANCO.md (caixa) | abrir/fechar/registrar visiveis; valores em centavos; nao registrar de verdade |
| 6 | `/dashboard` | painel | BANCO.md | KPIs do periodo; campos financeiros nulos p/ atendente mostram "Disponivel para dono e gerente"; sem PII |
| 7 | `/pagamentos` | painel | SEGURANCA.md (Pix) | **chave Pix write-only**: so tipo/titular/`••••ultimos4`, nunca a chave; BR Code so no dialog, nunca em log/URL/storage (SEC Pix) |
| 8 | `/agendamento` | painel | BANCO.md (pedidos.agendado_para) | agenda por janela; datas em America/Sao_Paulo |
| 9 | `/relatorios` | painel | BANCO.md | abas Vendas/Pagamentos/Problemas/Retencao; 403 vira "Relatorios restritos" |
| 10 | `/custos` | painel | BANCO.md (eventos_custo) | custos por periodo/categoria; so agregado |
| 11 | `/crm` | painel | SEGURANCA.md (PII, consentimento) | segmentos; **nenhum telefone trafega**; opt-out com confirmacao |
| 12 | `/campanhas` | painel | SEGURANCA.md | aviso de que opt-out nunca entra; **nao disparar**; previa de destinatarios sem PII em log |
| 13 | `/avaliacoes` | painel | BANCO.md (avaliacoes) | resumo e lista; so leitura |
| 14 | `/onboarding` | painel | historias/ | checklist perfil/numero/cardapio/1o pedido com atalhos |
| 15 | `/despacho` | entrega | BANCO.md (corridas) | pedidos prontos; montar corrida; **nao despachar** real |
| 16 | `/motoboys` | entrega | BANCO.md (motoboys) | cadastro + fechamento do dia; Pix do motoboy mascarado; **nao marcar pago** real |
| 17 | `/zonas` | entrega | BANCO.md (zonas_entrega) | zonas por bairro/raio/poligono; taxas em centavos |
| 18 | `/roteirizacao` | entrega | BANCO.md (despacho_config) | sugestoes efemeras; **nao aceitar** corrida real |
| 19 | `/lojas` | config | BANCO.md (lojas) | perfil/horarios/area |
| 20 | `/numeros` | config | BANCO.md (numeros_whatsapp) | numeros conectados; numero_hash nunca em claro |
| 21 | `/pessoas` | config | BANCO.md (pessoas/cargos) | equipe, cargos, escalas |
| 22 | `/estoque` | config | BANCO.md (insumos/ficha) | insumos e fichas tecnicas |
| 23 | `/disponibilidade` | config | BANCO.md (janela_atendente) | horarios de atendimento |
| 24 | `/fidelidade` | config | BANCO.md (fidelidade) | programa pontos/cashback; exemplo e so ilustrativo |
| 25 | `/promocoes` | config | BANCO.md (promocoes) | cupons/combos; testar cupom simula, nao aplica |
| 26 | `/cardapio-importacao` | config | RAG.md / historias | upload foto/PDF; **nao aprovar** o lote de verdade |
| 27 | `/canais` | config | SEGURANCA.md (credencial) | iFood/Outro; **credencial write-only** (`••••ultimos4`); sync 501 vira aviso, nao erro |
| 28 | `/fiscal` | config | SEGURANCA.md (credencial) | emissor; **credencial write-only**; link do documento so se https |
| 29 | `/llm` (Atendente) | config | docs/pivot/ (cifra LLM) | **chave do provedor write-only** (SEC LLM): so provedor/"termina em ####"; "Testar" nao salva; consumo em centavos |
| 30 | `/conhecimento` | config | RAG.md | documentos/golden/feedback; bloqueio de conteudo instavel tratado |
| 31 | `/fluxo` | config | HARNESS-ATENDENTE.md | editor do grafo; validacao e do servidor; publicar/ativar |
| 32 | `/fatura` (Minha fatura) | config | BANCO.md (faturas/assinaturas) | assinatura e faturas da propria loja (escopo de loja) |

## Console do operador (plataforma Whaviso; exige usuario operador)

> So entra quem e operador: o guard `RequireOperador` sonda `/plataforma-painel/resumo`; quem nao e operador e redirecionado para a loja. **Fronteira critica (SEC):** nenhuma tela de operador pode mostrar conteudo de loja nem contato do cliente; so agregados, papel e id curto.

| rota | doc dono | cenarios |
|---|---|---|
| `/plataforma/painel` | BANCO.md (plataforma) | KPIs de crescimento; so agregado; MRR aproximado rotulado |
| `/plataforma/clientes` | SEGURANCA.md | contas/lojas/membros por papel; **sem conteudo de loja nem contato** |
| `/plataforma/cobranca` | BANCO.md (faturas) | faturas/assinaturas/rotinas; **nao rodar rotina** de verdade |
| `/plataforma/funil` | BANCO.md (prospectos) | quadro/lista/agenda; telefone do prospecto em claro so no detalhe (aquisicao, nao cliente) |

## Fluxo da rodada

1. `run-id` = `qa-<AAAAMMDD>-<mode>`; pasta `docs/qa/reports/<run-id>/`.
2. EXPLORE+REPORT: agente `chrome-qa-explorer` (4 lentes por tela), um md por achado + `_INDEX.md`.
3. REVISAO humana (portao): marcar `status: triaged` ou `rejected`.
4. TRIAGE: `/chrome-qa-loop triage run=<run-id>` -> agente `qa-report-triage` -> `triage/TASKS.md` + stubs de PLAN.
5. IMPLEMENTA (fora do loop) -> REFLETE -> re-roda `mode=smoke` nas telas corrigidas.
