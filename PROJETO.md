# whaviso: Documento de Visão do Produto

> **Status:** Definição consolidada do produto. Reflete o estado atual do projeto (fluxos, estados e telas já existentes).
> **Data:** 15/06/2026
> **Inventário técnico (estado × desejado):** [GUIA.md](GUIA.md) · **Guia de agentes:** [backend/AGENTS.md](backend/AGENTS.md)

---

## 1. O que é o whaviso

**Automatize seus avisos de pagamento por WhatsApp e controle tudo pelo painel.**

O produto tem **dois pilares**:

1. **Avisar**: ciclo automático de mensagens por WhatsApp (D-2 a D+1), disparado assim que o combinado é aceito.
2. **Controlar**: painel completo do que está pendente, do que já entrou e do que você ainda vai pagar.

| | |
|---|---|
| **É** | Automação de avisos + registro organizado de recebimentos e pagamentos |
| **Não é** | Chat, IA, Pix automático ou régua de cobrança agressiva |

**Frase principal:** *"Avise o combinado."*

Variações: *"Cadastrou, agendou, recebeu." · "Seus recebimentos no automático." · "Agende o aviso. Saiba quando recebeu."*

### O problema que resolve

Cobrar manualmente é chato, esquecível e desgastante. O whaviso agenda e dispara os avisos automaticamente, e o painel mostra exatamente o que está pendente, o que foi confirmado e o que já venceu, sem precisar ficar lembrando na mão.

> **Por que o tom das mensagens é neutro:** para não cair em bloqueio no WhatsApp e ser juridicamente defensável como lembrete informativo. Isso é uma restrição técnica do canal, não o valor do produto.

---

## 2. Regras de Ouro (inegociáveis)

Estas regras protegem juridicamente, evitam bloqueio no WhatsApp e definem a identidade do produto:

1. **Nunca usar** as palavras: "dívida", "devendo", "atraso", "cobrança", "inadimplência".
2. **Sempre usar**: "aviso", "lembrete", "combinado", "acordo".
3. **Nunca repetir o mesmo texto**: cada mensagem tem função e redação distintas.
4. **Opt-out sempre visível**: saída clara em toda mensagem com botões.
5. **Tom informativo, não ativo**: o sistema informa, não pede.
6. **Encerramento automático**: após pagamento, opt-out ou fim do ciclo, **nunca mais envia nada**.

> **O sistema nunca cobra. Ele só lembra.** Se pagou → ótimo. Se não pagou → problema entre as partes.

A regra de linguagem vale no banco, na API **e na UI**. Há uma lista de palavras proibidas e um dicionário de linguagem versionados; mudar o padrão é mudar os três juntos.

---

## 3. Dois fluxos, mesma maquinaria

O whaviso atende às duas direções de um combinado, e ambas usam a **mesma mecânica de convite e aceite**. O que muda é quem cria e quem é convidado:

| Fluxo | Quem cria | Quem é convidado | Quem recebe os lembretes |
|---|---|---|---|
| **Receber** | O cobrador (vai receber) | O devedor | O devedor |
| **Pagar (invertido)** | O devedor (vai pagar) | O cobrador | O devedor (a si mesmo) |

No fluxo **pagar invertido** quem cria o combinado é quem vai pagar: ele convida o cobrador para confirmar os dados (inclusive a chave Pix). Não é um lembrete "para si mesmo solto": é o mesmo combinado de duas pontas, visto do outro lado.

O painel é organizado **por papel**, não por direção: *a receber* = sou o cobrador; *a pagar* = sou o devedor.

### 3.1 Cadastro do combinado

Campos do combinado:

- Nome de quem cobra e nome de quem paga
- Motivo (ex.: "mensalidade escola", "empréstimo pessoal")
- Valor (sempre em centavos internamente)
- Data combinada
- Chave Pix (de quem recebe)
- Telefone do alvo dos lembretes (sempre o devedor)

Ao criar, o sistema gera os **tokens** e o **link de aceite**, e valida o limite do plano.

### 3.2 Convite e aceite (sem conta)

O convidado confirma o combinado **sem precisar de login**, de duas formas:

- pelo **botão no WhatsApp** (Aceitar / Recusar); ou
- pela **página pública** `/aceite/:token`.

Sem conta, o vínculo é feito **só pelo telefone**; com sessão ativa, vincula ao perfil. No fluxo invertido, o cobrador informa sua chave Pix ao confirmar. Há uma CTA discreta de criar conta após o aceite, **nunca obrigatória**.

Só **depois do aceite** o ciclo de lembretes é ativado e os envios são programados.

### 3.3 Sequência de lembretes (4 mensagens, máximo)

| Quando | Objetivo | Botões |
|---|---|---|
| **D-2** (2 dias antes) | Aviso antecipado, sem urgência | ❌ Sair dos lembretes |
| **D-1** (1 dia antes) | Organização: Pix sob demanda | 💳 Ver Pix *(se cadastrado)* · ❌ Sair |
| **D** (no dia) | Confirmação | ✅ Já paguei · 💳 Ver Pix · ❌ Sair |
| **D+1** (1 dia depois) | Encerramento: último aviso | ✅ Já paguei · 💳 Ver Pix · ❌ Sair |

**"Ver Pix":** ao tocar, o sistema envia uma mensagem separada só com a chave Pix (fácil de copiar). Cada toque registra um evento `solicitou_pix`, sinal de intenção de pagamento, visível no painel. Aparece só quando há chave cadastrada.

#### Textos aprovados

- **D-2:** *"Oi, [Nome]. [Cobrador] pediu pra te lembrar do combinado: [motivo], R$ X para [data]."*
- **D-1:** *"Oi, [Nome]. Amanhã é o dia: [motivo], R$ X."*
- **D:** *"Oi, [Nome]. Hoje é o dia: [motivo], R$ X."*
- **D+1:** *"Oi, [Nome]. Último aviso: [motivo], R$ X."*
- **Resposta ao "Ver Pix":** *"Chave Pix: [chave]"*

### 3.4 O devedor não conversa

O devedor **só interage por botões**: não existe diálogo, chat humano, IA ou Pix automático. As ações possíveis são: "Já paguei", "Ver Pix" e "Sair dos lembretes".

---

## 4. Máquina de estados do combinado

```
sem_aviso                          → aguardando_aceite | cancelado | pago
aguardando_aceite                  → programado | cancelado | expirado | recusado
programado                         → informado_pago | pago | cancelado | expirado
                                     | pausado | aguardando_aprovacao_aviso_editado | desregistrado
informado_pago                     → pago | programado | cancelado | expirado
pago                               → programado   (reabertura por correção)
pausado                            → programado | cancelado | expirado
aguardando_aprovacao_aviso_editado → programado | cancelado | expirado
desregistrado                      → programado | cancelado | expirado
```

| Estado | Significado |
|---|---|
| **sem_aviso** | Anotação criada na agenda (modo agenda), sem convite gerado ainda. Não dispara lembretes. |
| **aguardando_aceite** | Convite gerado, esperando o convidado aceitar. Não dispara lembretes ainda. |
| **programado** | Aceito e dentro do ciclo de lembretes (antes chamado `pendente`). |
| **aguardando_aprovacao_aviso_editado** | Combinado editado após o aceite, aguardando nova aprovação. Lembretes suspensos. |
| **pausado** | Lembretes pausados pelo criador. Suspenso (não terminal). |
| **informado_pago** | O devedor clicou "Já paguei". **Estado não-terminal**: o cobrador então **confirma** (→ pago) ou **rejeita** (→ programado). |
| **desregistrado** | O devedor desativou os lembretes. Suspenso e **reversível** (→ programado). |
| **pago** | Recebimento confirmado pelo cobrador (ou marcado manualmente). |
| **cancelado** | Cancelamento pelo criador (ou opt-out que encerra). |
| **recusado** | O convidado **recusou** o convite (terminal próprio, distinto de `cancelado`). |
| **expirado** | Ciclo encerrou sem confirmação (fica como "não confirmado"). |

Estados **terminais** (`pago`, `cancelado`, `recusado`, `expirado`) **nunca mais enviam nada** (o `pago` só "sai" na reabertura `pago→programado`). Os estados de **suspensão** (`pausado`, `aguardando_aprovacao_aviso_editado`, `desregistrado`) também param os envios enquanto durarem. As transições são garantidas por trigger no banco **e** pela aplicação.

> 📌 A confirmação "✅ Já paguei" do devedor **não é prova de pagamento**. Por isso existe o `informado_pago`: o cobrador é quem confere o Pix e decide. O sistema registra ambos os eventos (informe do devedor + confirmação do cobrador).

---

## 5. Painel de controle (segundo pilar)

Todo combinado vira um registro gerenciável. O painel mostra:

- **A receber**: combinados onde sou o cobrador (com indicador "Solicitou Pix" e "Informou pagamento" quando houver).
- **A pagar**: meus compromissos como devedor.
- **Recebidos / Pagos**: histórico do que já entrou e do que já paguei.
- **Totais**: soma por categoria/período (visão simples, em centavos; não é contabilidade).

Quando o devedor informa pagamento, o cobrador é **notificado** (fila própria, drenada pelo serviço de WhatsApp). O mesmo vale para opt-out.

---

## 6. O que NÃO implementar (escopo negativo)

- ❌ Mensagem recorrente automática além do ciclo de 4
- ❌ Linguagem de cobrança em qualquer ponto
- ❌ Resposta manual pelo número (chat humano) / encaminhar mensagem
- ❌ IA / chatbot conversacional
- ❌ Pix automático / processamento de pagamento
- ❌ App mobile (MVP é web)
- ❌ Fila pesada de mensageria (Redis/broker); integração entre serviços é via banco + outbox

---

## 7. Por que esse modelo funciona

- 4 mensagens distribuídas no tempo ≠ spam: cada uma tem função distinta.
- Linguagem humana, não robótica; o destinatário pode parar a qualquer momento.
- Opt-out explícito + sem diálogo + sem pressão = **exatamente o limite do que o WhatsApp tolera bem**.
- Reduz denúncia, bloqueio e carga emocional.
- Defensável juridicamente: lembrete informativo consentido, não atividade de cobrança.

---

## 8. Monetização

A conta nasce no **Free** e o plano define **alavancas** (capacidade de agenda, vagas de aviso ativo, recorrência, cadência configurável, menu de texto livre, confirmação de pagamento, totais por período). A **agenda é um balde único**: toda anotação conta igual (ativa, pausada ou só anotação), e o plano define quantas a conta mantém. O catálogo vive em **migration upsert** (não no seed), lido em runtime (não fixado em código).

| Plano | Preço | Capacidade de agenda | Inclui |
|---|---|---|---|
| **Whaviso Free** | R$ 0 | 50 itens | Agenda e visualização; **não envia avisos** (somente leitura) |
| **Whaviso Start** | R$ 9,90/mês | 100 itens | Avisos automáticos no WhatsApp, menu de texto livre, confirmação de pagamento |
| **Whaviso Profissional** | R$ 29/mês | 150 itens | Tudo do Start + recorrência, cadência configurável, totais por período |
| **Whaviso Plus** | R$ 29/unidade ao mês | 10 itens por unidade | Vendido por unidade (1 unidade = 1 combinado ativável + 10 de agenda); todos os recursos |

Free mantém a agenda e visualiza, mas qualquer envio leva à CTA de upgrade (nada se perde). No MVP o billing é um **stub trial** (limites valem de verdade; cobrança em dinheiro e troca de plano com pagamento ficam para a fase de gateway real, 🟡). Validação de limite **sempre no servidor**, sem janela de corrida.

---

## 9. Público-alvo

- Prestadores de serviço autônomos (mensalidade, consulta, aula, serviço recorrente)
- Pais separados (pensão, despesas combinadas)
- Acordos informais entre pessoas físicas (empréstimos, vaquinhas, mensalidades)

Conexão de marketing: *"Para quem já se cansou de cobrar na mão."*

---

## 10. Identidade e Branding

- **Nome:** whaviso (WhatsApp + aviso)
- **Promessa do MVP:** "Cadastrou, agendou, recebeu."
- **Domínios candidatos:** whaviso.com / whaviso.app / whaviso.io
- **Logo:** simples, ícone de sino, estética WhatsApp-like sem copiar, verde suave (não agressivo)
- **Tom de voz (produto/painel/emails):** direto, prático, sem enrolação; quem usa quer resultado.
- **Tom de voz (mensagens ao devedor):** neutro e informativo (restrição do canal, não identidade do produto).

---

## 11. Funcionalidades pendentes / gated

Existem no produto mas ainda **não estão ligadas**:

1. **Auto-envio do convite** como template Meta com botões Aceitar/Recusar: hoje o convite é compartilhado por link `wa.me` + página pública de aceite.
2. **Backfill por telefone no signup** (puxar combinados de um número ao criar conta): depende de **OTP de telefone**, que ainda não existe; ligar sem verificação abriria risco de sequestro de combinados.
3. **Fases 2/3 do `informado_pago`**: dependem de template Meta aprovado.

---

*Este documento consolida a visão de produto. Decisões de stack e arquitetura estão em [backend/AGENTS.md](backend/AGENTS.md) e [CLAUDE.md](CLAUDE.md); o mapa estado × desejado de cada peça está em [GUIA.md](GUIA.md).*
