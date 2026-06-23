# Contexto compartilhado: planos de desenvolvimento por épico

> Documento de apoio para os agentes que escrevem e validam os planos. **Não** é texto de produto (as regras de linguagem do Épico 13 valem para código/copy, não para este doc interno).

## Regra de ouro do exercício

**As 13 histórias em `historias/*.md` são a FONTE DA VERDADE.** Quando o código, o PROJETO.md ou o CLAUDE.md divergirem da história, é o **código/doc que muda**, não a história. Cada divergência apontada nos épicos (seção "Divergências com a definição atual") é um item de trabalho do plano.

## Onde olhar primeiro

1. O arquivo do épico (`historias/NN-*.md`) — critérios de aceite + divergências + decisões.
2. O grafo do projeto (`graphify-out/`): use `graphify query "<pergunta>"`, `graphify path "<A>" "<B>"`, `graphify explain "<conceito>"` ANTES de ler/grepar arquivos crus. Isso diz o que já existe, quem chama quem, e o estado atual.
3. CLAUDE.md (regras/arquitetura) e backend/AGENTS.md (fronteiras feature-first) como referência (não autoridade).

## Layout do projeto (resumo)

- `backend/` monorepo: `apps/api` (REST p/ SPA, :3001) · `apps/zap` (scheduler + webhook WhatsApp via Baileys, :3002) · `packages/shared` (`@whaviso/shared`) · `supabase/` (migrations+seed) · `scripts/`.
- `frontend/` SPA React 19 + Vite 7 + TS estrito + Tailwind v4, standalone, contratos Zod próprios, TanStack Query. **Não** importa `@whaviso/shared`.
- Integração api↔zap só por **banco compartilhado + outbox** (`envios` p/ lembretes; `notificacoes_cobrador` p/ avisar cobrador), claim `FOR UPDATE SKIP LOCKED`, sem Redis. **Módulo nunca importa módulo** (lint barra).
- Supabase = Postgres + Auth apenas (sem PostgREST p/ dados; RLS deny-all). Dados 100% via api. supabase-js só no login.

## Invariantes (Épico 13, valem em todos os planos)

- Sem travessão; sem palavras proibidas (dívida/devendo/atraso/cobrança/inadimplência) em código, copy, banco, erros da API. Vocabulário: aviso/lembrete/combinado.
- Mensagens **neutras quanto a gênero**.
- Dinheiro em **centavos** (int); datas de negócio em **America/Sao_Paulo** (banco UTC); etapa/agendamento calculados no **servidor**, nunca no cliente.
- Tokens/números de convite só como **hash sha256**; claro nunca persiste nem loga. Botão do WhatsApp leva **`aviso_id`** no payload (webhook HMAC).
- **Nunca logar** telefone/Pix/titular/banco/token.
- Erros da API: envelope `{ error: { code, message } }`. JWT validado localmente por JWKS.
- **Sem DELETE** de negócio/auditoria (`eventos_aviso` append-only; estados, não apagar). Exceção: tabela `templates` (owner apaga versões, nunca a ativa).
- Estado terminal nunca mais envia. Opt-out visível em toda mensagem.

## Máquina de estados (alvo das histórias, espinha cross-épico)

Estados-alvo: `sem_aviso` (E4), `aguardando_aceite`, `programado` (renomeado de `pendente`), `aguardando_aprovacao_aviso_editado` (E2/E3), `pausado` (E2/E3), `informado_pago` (E8), `desregistrado` (E7, reversível), e terminais `pago`, `cancelado`, `recusado` (E5, próprio da recusa do convidado), `expirado`.
Transições novas a acrescentar (trigger no banco + app): `sem_aviso→{aguardando_aceite,cancelado,pago}`, `aguardando_aceite→recusado`, `programado↔pausado`, `programado↔aguardando_aprovacao_aviso_editado`, `programado↔desregistrado`, além das de pagamento (E8). **A varredura `pendente→programado` toca trigger + app + PROJETO.md/CLAUDE.md.**

## Índice dos épicos (dono de cada tema)

| # | Épico | Tema / o que introduz |
|---|---|---|
| 1 | Conta & Autenticação | Google OAuth + WhatsApp (botão/OTP, decisão em aberto), free read-only, conta-no-aceite, JWKS |
| 2 | Criar combinado (receber) | criação cobrador→devedor, convite 6 dígitos (hash), Pix obrigatório, editar c/ reaprovação, pausar/cancelar |
| 3 | Criar combinado (pagar invertido) | espelho de E2, papéis trocados; devedor informa Pix, cobrador confere; cobrador sem conta |
| 4 | Modo agenda | estado `sem_aviso`, separar "criar" de "gerar convite", free mantém agenda |
| 5 | Convite & Aceite (WhatsApp) | aceite 100% WhatsApp (remover site), validação número+telefone, anti-brute-force 3 tentativas, `recusado`, telefone divergente |
| 6 | Ciclo de lembretes | scheduler D-2..D+1, horário reservado por segundo + 10min/devedor, retry 3x, catch-up, `informado_pago` para o ciclo, cadência configurável (🟡 H6.10) |
| 7 | Interação do devedor | 3 botões (Já paguei/Chave de Pag./Desativar), `desregistrado` reversível, só último aviso age, idempotência |
| 8 | Confirmação de pagamento | `informado_pago→pago/programado`, marcar direto, reabrir, janela 1min, recorrência por ocorrência (🟡), botão WhatsApp p/ qualquer cobrador |
| 9 | Painel de controle | visão por papel (a receber/a pagar), totais no backend, "precisa de você", linha do tempo de eventos, status de envio, só-leitura+solicita |
| 10 | Notificações ao cobrador | outbox `notificacoes_cobrador`, roteamento conta/telefone, opt-out atraso 1min, **fila de saída espaçamento 10min + coalescing (H10.9, crítico)** |
| 11 | Planos, limites e billing | catálogo em migration (4 planos), agenda balde único, alavancas por plano, validação no servidor, stub trial |
| 12 | Templates / mensagens (admin) | tabela `templates` por chave, editor, versionamento, zap transporte genérico (em grande parte já feito) |
| 13 | Linguagem, opt-out e compliance | invariantes transversais, `contracts/linguagem.ts` + dicionário front, lint, validação ao salvar template |

## Dependências entre épicos (para coerência dos planos)

- **Fundações (implementar antes):** E13 (linguagem) · E12 (templates) · E11 (planos) · E1 (auth) · máquina de estados.
- E2/E3 dependem de: E1 (limites), E11 (alavancas), máquina de estados, E12 (mensagem de convite).
- E4 depende de: E2/E3 (criação), `sem_aviso`, E11 (free cria agenda).
- E5 depende de: E2/E3 (número de convite), E12 (rótulos de botão), E1 (conta no aceite).
- E6 depende de: E5 (aceite ativa ciclo), E12 (textos), máquina de estados; alimenta E9 (status).
- E7 depende de: E6 (botões nas mensagens), E12, `desregistrado`, E10 (notificar cobrador).
- E8 depende de: E7 (já paguei), E10 (notificar c/ botões), E6 (horário reservado), recorrência 🟡.
- E9 depende de: praticamente tudo (espelha estados/eventos); precisa que eventos sejam gravados com ator.
- E10 depende de: outbox, E8 (botões confirmar), E5/E7 (eventos), E12 (templates).

## Pontos críticos (exigem testes dedicados)

- **E10 H10.9 / E6 H6.9:** fila de saída com espaçamento 10min por destinatário + **coalescing** (par opt-out/reativação se anula; item obsoleto por estado terminal), nas duas outboxes, só com banco. Corrida → testes fortes.
- **Horário reservado por segundo** (busca de segundo livre, wrap 18h→8h, fallback aleatório, 10min/devedor, campo recuperável para reabertura).
- **Idempotência** de webhook (toque duplo), claim `SKIP LOCKED`, "só o último aviso age".
- **Validação de limite no servidor** sem janela de corrida (E11 H11.8).
- **Reconferência de estado no disparo** (terminal/pausado descarta envio).

## Decisões em aberto que o plano deve sinalizar (não inventar)

- E1: login WhatsApp por **botão** (UX melhor, mas Supabase não emite sessão de clique) **vs OTP por código** (Supabase emite JWT). Decidir antes de implementar.
- E6 H6.10 cadência configurável e E8 H8.7 recorrência: **🟡 gated**, dependem de estudo de UX/modelagem. Plano deve separar o MVP (ciclo fixo D-2..D+1) do gated.
- Risco de canal: botões interativos via Baileys podem ser instáveis → prever **fallback** (resposta numerada).

## Formato de saída de cada plano (`historias/planos/NN-<slug>.plano.md`)

1. **Resumo do épico e escopo** (o que entra MVP 🟢 vs gated 🟡).
2. **Estado atual vs história** por critério/história: `[x]` ok · `[~]` parcial · `[!]` diverge (refatorar) · `[+]` não existe. Baseado no grafo/código real.
3. **Trabalho por camada:** Arquitetura/Dados (migrations, estados, índices) · Backend api · Backend zap · Frontend · Segurança · Testes (unit + integração + corrida onde crítico).
4. **Sequência de passos** numerados, cada um com: objetivo, arquivos prováveis, critério de aceite ligado à história (HNN.x), e **modelo recomendado** (`sonnet` para tarefas simples/mecânicas; `opus` para máquina de estados, scheduler, fila/coalescing, segurança). Justifique a escolha do modelo em 1 linha.
5. **Dependências** de outros épicos (o que precisa estar pronto antes).
6. **Riscos e pontos de teste dedicado.**
7. **Decisões em aberto** a confirmar com o humano (não inventar).

## Formato do relatório de validação (`historias/planos/NN-<slug>.gaps.md`)

1. **Veredito:** aprovado / aprovado com ressalvas / precisa revisão.
2. **Gaps por severidade** (crítico/médio/baixo): cada um com a história/critério (HNN.x) que o plano deixou de cobrir ou contrariou, e a correção sugerida.
3. **Cobertura:** confirme que todo critério de aceite do épico tem passo no plano (liste os não cobertos).
4. **Testes:** confirme que pontos críticos têm teste dedicado.
5. **Coerência cross-épico:** dependências corretas, sem contradição com outros épicos.
6. **Aderência às invariantes do Épico 13.**
