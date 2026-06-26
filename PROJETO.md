# whaviso: Documento de Visão do Produto

> **Status:** Definição consolidada do produto. Reflete o estado atual do projeto após a implementação dos 13 épicos de histórias de usuário (migrations 0001..0043).
> **Data:** 23/06/2026
> **Histórias de usuário (fonte de verdade):** [historias/](historias/) · **Guia de agentes:** [backend/AGENTS.md](backend/AGENTS.md)

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

> **Uso secundário (não é a promessa central):** como cada combinado fica anotado na agenda (modo agenda: registrar sem enviar, Épico 4 / Épico 11), o whaviso também serve de **agenda leve de pedidos e de vendas a receber**. É um uso possível, citável na comunicação, mas não o coração do produto: a promessa central segue "avisar + controlar", não "gestão de vendas". Não vender como sistema de gestão de vendas nem prometer recursos de ERP.

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
- Chave Pix de quem recebe (**obrigatória**, com titular e banco)
- Telefone do alvo dos lembretes (sempre o devedor)

Ao criar, o sistema gera o **número de convite** (6 dígitos, guardado só como hash) e o **link `wa.me`** de convite, e valida o limite do plano. Editar o combinado depois do aceite abre um sub-ciclo de aprovação (estado `aguardando_aprovacao_aviso_editado`), com limite de edições por plano.

### 3.2 Convite e aceite (sem conta, 100% pelo WhatsApp)

O convidado confirma o combinado **sem precisar de login**, dentro do próprio WhatsApp:

- pelo **botão** Aceitar / Recusar; ou
- respondendo o **número de convite** (6 dígitos) junto com o telefone certo do papel.

A página pública `/aceite/:token` **não existe mais**: o aceite migrou inteiro para o WhatsApp. Há proteção anti-tentativa (3 erros de número regeneram/bloqueiam o convite). Sem conta, o vínculo é feito **só pelo telefone**; com sessão ativa, vincula ao perfil. No fluxo invertido, o cobrador informa sua chave Pix ao confirmar. Recusar leva ao estado terminal `recusado`. Há uma CTA discreta de criar conta após o aceite, **nunca obrigatória**.

Só **depois do aceite** o ciclo de lembretes é ativado e os envios são programados.

### 3.3 Sequência de lembretes (4 etapas, máximo)

| Quando | Objetivo | Botões |
|---|---|---|
| **D-2** (2 dias antes) | Aviso antecipado, sem urgência | ✅ Já paguei · 💳 Ver Pix *(se houver chave)* · ❌ Sair |
| **D-1** (1 dia antes) | Organização | ✅ Já paguei · 💳 Ver Pix · ❌ Sair |
| **D** (no dia) | Confirmação | ✅ Já paguei · 💳 Ver Pix · ❌ Sair |
| **D+1** (1 dia depois) | Encerramento: último aviso | ✅ Já paguei · 💳 Ver Pix · ❌ Sair |

Toda etapa traz os **três botões** (a saída fica sempre visível). Cada devedor tem um **horário reservado** no dia (janela 08-18h, slot fixo por devedor), e cada envio tenta no máximo **3 vezes** com backoff curto antes de marcar falha. Se o devedor já informou pagamento (`informado_pago`), o ciclo para: vai só um empurrãozinho discreto em D+1.

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
- **Precisa de você**: bloco que junta o que aguarda uma ação minha (ex.: pagamento informado a confirmar).
- **Recebidos / Pagos**: histórico do que já entrou e do que já paguei.
- **Totais**: soma por categoria/período (visão simples, em centavos; não é contabilidade).
- **Timeline com ator**: cada evento mostra quem agiu (distingue "informado pelo devedor" de "marcado pelo cobrador"), e o status de envio separa retry temporário de falha persistente.

Quando o devedor informa pagamento, o cobrador é **notificado** (fila própria, drenada pelo serviço de WhatsApp), com espaçamento por destinatário e coalescing conservador. O mesmo vale para opt-out.

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
| **Whaviso Plus** | de R$ 30,90 a R$ 79,90/mês | escala com os envios | Vendido por **volume de envios/mês** (16 a 200); piso = preço do Profissional (R$ 29) + 1 envio (R$ 1,90); o preço por envio cai conforme o volume (de ~R$ 1,93 a ~R$ 0,40), desconto visível; todos os recursos |

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

Existem no produto mas ainda **não estão ligadas** (dependem em geral da migração do transporte de WhatsApp de Baileys para a Meta Cloud API oficial):

1. **Auto-envio do convite** como template Meta com botões Aceitar/Recusar: hoje o convite é compartilhado por link `wa.me` e o aceite acontece dentro do WhatsApp (por botão ou número de convite).
2. **Backfill por telefone no signup** (puxar combinados de um número ao criar conta): depende de **OTP de telefone** entregue a +55, gated por verificação Meta; ligar sem verificação abriria risco de sequestro de combinados.
3. **Cadência configurável** (E6), **recorrência por ocorrência** (E8/E9) e **billing real com gateway de pagamento** (E11): hoje o billing é um stub trial e a cadência/recorrência ficam para uma fase posterior de UX/modelagem.

---

*Este documento consolida a visão de produto. Decisões de stack e arquitetura estão em [backend/AGENTS.md](backend/AGENTS.md) e [CLAUDE.md](CLAUDE.md); o detalhamento por épico (fonte de verdade) está em [historias/](historias/).*
