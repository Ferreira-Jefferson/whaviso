# whaviso: Guia de estado atual × desejado

> **Como usar:** para cada item há o que ele **faz hoje** (extraído do código/migrations em 15/06/2026) e um campo **Espero que** em branco. Preencha o que quer que mude; o que estiver vazio fica entendido como "está bom assim". Itens referenciáveis pelo número (ex.: `2.2`).
>
> Fontes de verdade do produto: [PROJETO.md](PROJETO.md) · [backend/AGENTS.md](backend/AGENTS.md) · [CLAUDE.md](CLAUDE.md).

---

## 1. Conceitos de produto (o "o quê")

### 1.1 Dois pilares
- **Faz hoje:** *Avisar* (ciclo automático D-2→D+1 no WhatsApp) + *Controlar* (painel de pendentes/recebidos/pagos/a pagar).
- **Espero que:**

### 1.2 Regras de ouro
- **Faz hoje:** nunca "dívida/atraso/cobrança/inadimplência"; opt-out sempre visível; estado terminal nunca reenvia; devedor só interage por botões.
- **Espero que:**

### 1.3 Dois fluxos (receber / pagar invertido)
- **Faz hoje:** `receber` (eu cobro, convido o devedor) e `pagar` invertido (eu pago, convido o cobrador), na mesma maquinaria de convite/aceite.
- **Espero que:**

### 1.4 Ciclo de lembretes
- **Faz hoje:** 4 mensagens fixas (D-2, D-1, D, D+1), cada uma com texto e botões próprios; "Ver Pix" só quando há chave cadastrada.
- **Espero que:**

### 1.5 Aceite sem conta
- **Faz hoje:** convidado confirma pelo botão do WhatsApp ou pela página pública `/aceite/:token`, sem login.
- **Espero que:**

### 1.6 Monetização
- **Faz hoje:** Pessoal R$9,90 (até 5 avisos) · Profissional R$29-49 (recorrentes, histórico, multi-cliente).
- **Espero que:**

---

## 2. Backend: `api` (REST p/ SPA, :3001)

### 2.1 perfil
- **Faz hoje:** dados do usuário (nome/telefone) + CRUD das chaves Pix.
- **Espero que:**

### 2.2 avisos
- **Faz hoje:** CRUD de avisos: criar (gera tokens + link de aceite, valida limite do plano), listar, detalhar, cancelar.
- **Espero que:**

### 2.3 aceite
- **Faz hoje:** fluxo de aceite por token: GET sanitizado + POST que vincula o convidado, ativa o ciclo e insere os envios.
- **Espero que:**

### 2.4 acoes_devedor
- **Faz hoje:** `POST /v1/acao/:token` público: "já paguei" / opt-out vindos da página do devedor (idempotente por estado).
- **Espero que:**

### 2.5 recebimentos
- **Faz hoje:** cobrador confirma/desmarca recebimento; devedor logado marca-pago ou encerra lembretes (pendente→cancelado).
- **Espero que:**

### 2.6 painel
- **Faz hoje:** `GET /v1/painel/resumo`: totais por categoria/período em centavos (agregação SQL, datas em SP).
- **Espero que:**

### 2.7 admin
- **Faz hoje:** métricas (período + opt-out), gestão de templates Meta (viewer/preview/lint/proposta), auditoria global read-only, troca de plano (só owner).
- **Espero que:**

### 2.8 billing
- **Faz hoje:** planos e assinatura (stub trial no MVP, sem gateway de pagamento).
- **Espero que:**

---

## 3. Backend: `zap` (scheduler + webhook, :3002)

### 3.1 enviar_lembretes
- **Faz hoje:** drena o outbox `envios` (claim `FOR UPDATE SKIP LOCKED`), renderiza o template ativo da etapa e dispara via Meta Cloud API com retry/backoff.
- **Espero que:**

### 3.2 expirar_avisos
- **Faz hoje:** sweep: `pendente` com data+2 ≤ hoje (SP) → `expirado`; aceite com token vencido → `expirado`.
- **Espero que:**

### 3.3 notificar_cobrador
- **Faz hoje:** drena `notificacoes_cobrador` e avisa o cobrador (pagamento informado / opt-out do destinatário).
- **Espero que:**

### 3.4 webhook_whatsapp
- **Faz hoje:** recebe callbacks Meta: verificação (GET hub.challenge), cliques nos botões (já paguei/opt-out, idempotentes) e statuses de entrega por wamid.
- **Espero que:**

---

## 4. Backend: kernel compartilhado (`@whaviso/shared`)

### 4.1 contracts
- **Faz hoje:** enums, schemas Zod (Aviso/Envio/Evento/payloads REST), `PALAVRAS_PROIBIDAS`, dicionário de linguagem.
- **Espero que:**

### 4.2 db / datas / config / logger
- **Faz hoje:** `criarPool`/`comTransacao` (pg); TZ fixo SP + `calcularAgendamentos`/`hojeSp`/`fimDoDiaSp`; `parseEnv` (crash no boot); `criarLogger` (pino).
- **Espero que:**

---

## 5. Banco (Supabase = Postgres + Auth): 17 migrations

### 5.1 Tabelas e máquina de estados
- **Faz hoje:** `profiles` · `avisos` (estados: aguardando_aceite/pendente/informado_pago/pago/cancelado/expirado, com trigger de transições) · `envios` (outbox) · `eventos_aviso` (auditoria) · `templates` (mensagens unificadas por chave, conteúdo estruturado; substituiu templates_mensagem/templates_cobrador) · `billing` · `chaves_pix` · `notificacoes_cobrador` · roles/RLS deny-all · `suspensao` · `convite_invertido`.
- **Espero que:**

---

## 6. Frontend: SPA React (em construção)

### 6.1 landing
- **Faz hoje:** Landing.
- **Espero que:**

### 6.2 auth
- **Faz hoje:** Login, Signup, Onboarding, Recuperar senha, Redefinir senha.
- **Espero que:**

### 6.3 painel
- **Faz hoje:** Painel (resumo financeiro).
- **Espero que:**

### 6.4 avisos
- **Faz hoje:** Lista, Novo, Detalhe.
- **Espero que:**

### 6.5 aceite (público)
- **Faz hoje:** Aceite, AçãoAviso, SairLembretes.
- **Espero que:**

### 6.6 devedor
- **Faz hoje:** MeusCombinados, DetalheCombinado, Histórico, ContaDevedor.
- **Espero que:**

### 6.7 billing / conta
- **Faz hoje:** Plano · Conta.
- **Espero que:**

### 6.8 admin
- **Faz hoje:** Usuários, Avisos globais, Envios, Métricas, Templates (hub), DetalheMensagem (editor único por chave), Planos, DesignSystem.
- **Espero que:**

---

## 7. Pendências / gated (existem mas não ligados)

### 7.1 Auto-envio do convite como template Meta
- **Faz hoje:** gated; hoje o convite é link `wa.me` + página pública de aceite.
- **Espero que:**

### 7.2 Backfill por telefone no signup
- **Faz hoje:** gated; depende de OTP de telefone (que ainda não existe).
- **Espero que:**

### 7.3 Fases 2/3 do `informado_pago`
- **Faz hoje:** gated por template Meta.
- **Espero que:**
