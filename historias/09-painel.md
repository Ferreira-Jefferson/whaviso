# Épico 9: Painel de controle

> O pilar **Controlar**: onde quem tem conta vê e gerencia tudo, "o que está pendente, o que já recebeu, o que ainda vai pagar". O WhatsApp é o canal de avisos/interação (Épicos 5 a 8); o painel é o lugar de **acompanhar e agir**.
> **Organizado por papel, não por direção:** uma aba/visão **"A receber"** (sou o cobrador) e outra **"A pagar"** (sou o devedor). Um combinado aparece em "A receber" para quem recebe e em "A pagar" para quem paga, independentemente de quem criou (receber x pagar invertido).
> O painel é **só leitura do banco + solicitação de ações**: nenhuma regra de negócio roda no front (Épico 8 H8.9). Toda mudança de estado é pedida à API, validada e gravada, e o painel relê.
> Convenções de sempre: sem travessão, sem palavras proibidas (nada de "dívida/cobrança/atraso/inadimplência", **inclusive nos rótulos e resumos**), **neutras quanto a gênero**; dinheiro vem de **centavos** e é exibido em reais; datas em **America/Sao_Paulo**.
> Este épico cobre **o que o painel mostra e quais ações oferece**. O efeito de cada ação está nos épicos de origem (criar 2/3, agenda 4, aceite 5, lembretes 6, interação 7, confirmação 8); as notificações ao cobrador, no Épico 10; saldo de créditos de envio, no Épico 11.

---

### H9.1: Ver meus combinados organizados por papel 🟢
Como **usuário com conta**, quero ver meus combinados separados entre o que vou receber e o que vou pagar, para acompanhar os dois lados sem confusão.
*Critérios de aceite:*
- [ ] O painel tem duas visões claras: **"A receber"** (combinados em que sou o **cobrador**) e **"A pagar"** (combinados em que sou o **devedor**).
- [ ] A separação é por **papel**, não por fluxo: tanto o fluxo *receber* quanto o *pagar invertido* podem cair em qualquer das visões, conforme meu papel naquele combinado.
- [ ] Combinados em que entrei **sem conta e depois criei conta** (vínculo por telefone) aparecem normalmente, uma vez vinculados ao `profile.id`.
- [ ] Cada item mostra: a outra ponta (nome), motivo, valor (em reais), data combinada e **estado atual** com rótulo claro.
- [ ] A linguagem de todos os rótulos respeita as regras de ouro (sem palavras proibidas, gênero neutro).

---

### H9.2: Visão geral: o que está pendente, o que recebi, o que vou pagar 🟢
Como **usuário com conta**, quero um resumo do total em cada situação, para entender minha posição num relance.
*Critérios de aceite:*
- [ ] Em **"A receber"**, vejo totais (quantidade e soma em R$) de pelo menos: **a receber** (combinados ativos ainda não pagos) e **recebido** (combinados `pago`).
- [ ] Em **"A pagar"**, vejo totais de: **a pagar** (ativos ainda não pagos) e **pago**.
- [ ] Há um destaque de **"precisa de você"** reunindo os combinados que aguardam minha ação: como cobrador, os em **`informado_pago`** ("aguardando sua confirmação") e sinalizações de **dado incorreto**/**telefone divergente** (Épico 5); como qualquer papel, edições a aprovar quando aplicável.
- [ ] Os totais são calculados no **backend** a partir do estado e do valor (centavos), nunca somados/decididos no front.
- [ ] Os rótulos dos totais **não** usam termos proibidos (ex.: "a receber"/"a pagar"/"pendente", nunca "dívida/atraso/cobrança").
- [ ] Combinados em estado **terminal não-pago** (`cancelado`, `recusado`, `expirado`) **não** entram nos totais de "a receber/a pagar" (entram só num histórico, H9.3).

---

### H9.3: Filtrar, buscar e ver por estado (incluindo "Sem aviso") 🟢
Como **usuário com conta**, quero filtrar e buscar meus combinados por estado e por texto, para achar rápido o que preciso.
*Critérios de aceite:*
- [ ] Posso **filtrar por estado**, com rótulos claros para cada um:
  - `sem_aviso` → **"Sem aviso"** (agenda; faixa/filtro próprio, não se mistura com os ativos, Épico 4 H4.2);
  - `aguardando_aceite` → **"Aguardando aceite"**;
  - `programado` → **"Programado"** (no ciclo de lembretes);
  - `informado_pago` → **"Pagamento informado"** (para o cobrador: **"Aguardando sua confirmação"**);
  - `pago` → **"Pago/Recebido"**;
  - `pausado` → **"Pausado"**;
  - `aguardando_aprovacao_aviso_editado` → **"Aguardando aprovação da edição"**;
  - `desregistrado` → **"Lembretes desativados"** (o devedor saiu, Épico 7 H7.4);
  - `cancelado` / `recusado` / `expirado` → no **histórico**.
- [ ] Consigo **buscar** por nome da outra ponta ou motivo.
- [ ] Consigo ordenar/priorizar por **data combinada** e ver com clareza o que está próximo do vencimento (sem usar a palavra "vencimento" de forma acusatória; ex.: "data combinada").
- [ ] A faixa **"Sem aviso"** é separável dos ativos (Épico 4 H4.2) e dá acesso às ações de agenda (ativar, editar, descartar, marcar pago).
- [ ] Estados terminais ficam num **histórico** consultável, sem poluir a lista ativa.

---

### H9.4: Detalhe do combinado com a linha do tempo de eventos 🟢
Como **usuário com conta**, quero abrir um combinado e ver tudo que aconteceu, para entender o histórico sem adivinhar.
*Critérios de aceite:*
- [ ] O detalhe mostra os dados do combinado, o estado atual e uma **linha do tempo** dos eventos (auditoria append-only), em ordem cronológica.
- [ ] Aparecem, com data/hora (America/Sao_Paulo) e linguagem neutra, eventos como: criado, convite gerado, aceite/recusa/dado incorreto, **lembretes enviados** (por etapa), **"já paguei"** do devedor (`informado_pago`), **`solicitou_pix`** (o devedor pediu a chave, Épico 7 H7.3), **opt-out** (`desregistrado`) e **reativação** (Épico 7 H7.4/H7.5), confirmação/rejeição de pagamento (Épico 8), pausa/reativação, edição/aprovação.
- [ ] O detalhe distingue **"pagamento informado pelo devedor"** de **"marcado/confirmado pelo cobrador"** (Épico 8 H8.4), mostrando o **ator** de cada transição.
- [ ] **Nada sensível** é exibido onde não deve nem fica em log: a **chave Pix**, telefone e número de convite seguem as regras (a chave aparece para quem é dono do dado, nunca em log; o número de convite nunca em claro).
- [ ] Eventos refletem só o que está no banco; o detalhe não recalcula nada no front.

---

### H9.5: Agir a partir do painel conforme o estado 🟢
Como **usuário com conta**, quero que cada combinado ofereça só as ações válidas para o estado dele, para eu agir sem errar.
*Critérios de aceite:*
- [ ] As ações disponíveis dependem do **estado** e do **meu papel**, e são as definidas nos épicos de origem. Exemplos:
  - `sem_aviso` (criador): **ativar**, **editar**, **descartar**, **marcar como pago** (Épico 4).
  - `aguardando_aceite` (criador): **reenviar/compartilhar convite**, **editar** (livre), **cancelar** (Épicos 2/3/5).
  - `programado` (cobrador): **marcar como pago**, **pausar**, **editar** (com reaprovação), **cancelar**, e **reengajar** após o ciclo (Épico 8 H8.3).
  - `informado_pago` (cobrador): **Confirmar** e **Rejeitar** em destaque (Épico 8 H8.1/H8.2).
  - `pago` (cobrador): **reabrir** (Épico 8 H8.6).
  - `pausado` (criador): **reativar**; `aguardando_aprovacao_aviso_editado` (criador): **desfazer a edição** (Épico 2 H2.5).
- [ ] O painel **só solicita** a ação à API; quem valida a transição é a API + trigger (Épico 8 H8.9). Se a transição for inválida, mostra o erro do envelope `{ error: { code, message } }` sem travar a tela.
- [ ] Ações que disparam mensagem ao devedor respeitam as regras dos épicos de origem (ex.: a **janela de 1 minuto** ao confirmar pagamento, Épico 8 H8.1).
- [ ] Ações indisponíveis para o estado **não aparecem** (ou aparecem desabilitadas com motivo), para não sugerir transições inválidas.
- [ ] Depois de agir, o painel **relê** o estado do banco e atualiza (não assume sucesso no front).

---

### H9.6: Acompanhar combinados recorrentes 🟢 (modelagem decidida; em implementação)
Como **usuário com conta**, quero ver o progresso de um combinado recorrente e encontrá-lo no mês certo, para acompanhar parcela a parcela.
*Critérios de aceite:*
- [ ] Um combinado recorrente mostra o **progresso** (ex.: "3 de 5 pagamentos confirmados") e o **status da ocorrência corrente** (Épico 8 H8.7).
- [ ] Cada ocorrência tem seu próprio mini-histórico (informado/confirmado/rejeitado) visível no detalhe.
- [ ] As ações (confirmar, rejeitar, marcar pago, reabrir) agem **na ocorrência corrente**, não no combinado todo.
- [ ] **No filtro por período, o recorrente aparece uma vez por ocorrência** daquele período, com o **valor e a data daquela ocorrência**:
  - [ ] Ex.: recorrente de 5 meses iniciado em janeiro, hoje em abril. Filtro de **janeiro** mostra a ocorrência de janeiro; **fevereiro** mostra a de fevereiro; e assim por diante.
  - [ ] Ocorrências **ainda não enviadas** (ex.: março/maio, conforme o caso) aparecem no filtro do **seu mês futuro**.
  - [ ] No filtro **anual**, esse mesmo recorrente aparece **5 vezes** (uma por ocorrência).
- [ ] Cada ocorrência conta nos **totais (H9.2)** do **seu próprio período** (não soma todas no mês de criação).
- [ ] Na visão **por combinado** (não temporal) e no **detalhe**, ele continua sendo **um único combinado** com suas N ocorrências; o desmembramento "uma linha por ocorrência" vale para as **visões/filtros por período**.
- [ ] A fonte do progresso e do desmembramento por período é a tabela **`aviso_ocorrencias`** (Épico 8 H8.7 / Épico 6 H6.10): cada ocorrência tem índice, data e status próprios. O painel relê do banco; nada é recalculado no front (H9.8).
- [ ] **Estado global do combinado manda nas ocorrências futuras ainda não pagas.** Quando o combinado está num estado que vale para o todo (`sem_aviso`, `aguardando_aceite`, `pausado`, `aguardando_aprovacao_aviso_editado`, `desregistrado`, `cancelado`, `recusado`, `expirado`), as ocorrências ainda `programado` aparecem (no filtro por período e nos totais) com **esse** estado: pausar/cancelar/etc. reflete nas parcelas futuras. As ocorrências que já avançaram (`informado_pago` ou `pago`) **mantêm o próprio status** (uma parcela já paga segue contando como recebido mesmo se o combinado for cancelado depois). O status por ocorrência só vale por si quando o combinado está no ciclo normal de pagamento (`programado`/`informado_pago`/`pago`), e nesse caso o `informado_pago`/`pago` da ocorrência **corrente** não contamina as futuras (que seguem `programado`).

---

### H9.7: Ver o status de entrega dos avisos 🟢
Como **usuário com conta**, quero ver se os lembretes saíram, falharam ou estão em nova tentativa, para confiar que o aviso chegou.
*Critérios de aceite:*
- [ ] Para um combinado no ciclo, o painel mostra o **status de cada envio**: enviado, falha, em **retry** (Épico 6 H6.8), com a etapa e o horário.
- [ ] O status reflete o registro da outbox (`envios`); o painel não infere entrega que o backend não registrou.
- [ ] **Nada sensível** (telefone, Pix, conteúdo) é exibido junto do status nem logado (Épico 6 H6.8).
- [ ] Falhas persistentes (esgotados os 3 retries) ficam visíveis para o usuário entender que aquele aviso não saiu.

---

### H9.8: Painel é só leitura do banco; free só visualiza; sempre atualizado 🟢
Como **sistema (api + front)**, quero que o painel seja um espelho seguro do banco, para não haver estado divergente nem regra de negócio no cliente.
*Critérios de aceite:*
- [ ] O front **exibe o que vem da API** e **solicita** mudanças; **nenhuma** regra de negócio nem cálculo de transição/totais roda no cliente (Épico 8 H8.9).
- [ ] Os dados são lidos via **API REST** (nunca PostgREST/`supabase-js` para dados; `supabase-js` só no login, ver CLAUDE.md); o estado de servidor é gerido por **TanStack Query**.
- [ ] **Plano free:** o painel é **só visualização** (incluindo a agenda "Sem aviso"); ações que exigem plano (criar/ativar/enviar) levam à **CTA de plano** (Épico 1 H1.5 e Épico 11), sem quebrar a navegação.
- [ ] Cada usuário vê **somente os seus** combinados (isolamento por `profile.id`; RLS deny-all para anon/authenticated, dados sempre via API, ver CLAUDE.md).
- [ ] Após qualquer ação, o painel **revalida** os dados (relê do banco) para refletir o estado real.
- [ ] **Estados vazios** (sem combinados, agenda vazia, histórico vazio) têm telas próprias com CTA claro (ex.: criar primeiro combinado).

---

### Divergências com a definição atual

> O painel por papel ("a receber"/"a pagar") já é a direção do produto (CLAUDE.md). As divergências vêm dos estados e eventos novos que as histórias introduziram.

- **Rótulos de novos estados no painel:** `sem_aviso` ("Sem aviso"), `programado` (renomeado de `pendente`), `pausado`, `aguardando_aprovacao_aviso_editado`, `recusado`, `desregistrado` precisam de rótulo e filtro próprios. Vários desses estados ainda não existem no código (ver Épicos 2/4/5/7).
- **"Precisa de você" (H9.2):** agregar combinados que aguardam ação do usuário (informado_pago, dado incorreto, telefone divergente, edição a aprovar) é uma visão nova de pendências.
- **Linha do tempo com eventos novos (H9.4):** exibir `solicitou_pix`, opt-out/reativação (`desregistrado`), "já paguei", confirmação/rejeição com **ator**, e distinguir "informado pelo devedor" x "marcado pelo cobrador" exige que esses eventos sejam gravados com ator (Épicos 7/8) e expostos pela API.
- **Status de entrega na tela (H9.7):** expor enviado/falha/retry por etapa depende de a outbox (`envios`) registrar esses estados (Épico 6 H6.8) e de a API servi-los.
- **Recorrência no painel (H9.6):** progresso "k de N" e ações por ocorrência usam a tabela **`aviso_ocorrencias`** (decidida no Épico 8 H8.7 / Épico 6 H6.10). O backend serve o progresso (índice atual / total) e, nos filtros por período, desmembra o recorrente **uma linha por ocorrência** daquele período (com valor e data da ocorrência). **Implementado (2026-06-26)** via a view `combinado_linhas`.
- **Free visualiza tudo, inclusive agenda:** alinhar com a mudança do Épico 4 (free mantém agenda) e Épico 1 (free só visualiza); o painel não pode oferecer ações de envio ao free.

### Decisões tomadas
- **Painel por papel** ("A receber" / "A pagar"), não por direção/fluxo.
- **Painel é uma PÁGINA ÚNICA** (`/app`): reúne, numa só tela, os totais, o "precisa de você" e a **lista de combinados** por papel (faixas Ativos/Sem aviso/Encerrados, busca e filtro de situação). Não há tela separada de "Avisos" nem card-atalho "Ver combinados": a lista vive no próprio painel. **Um único filtro de período (De/Até) rege os totais E a lista juntos** (com período: o recorrente desmembra por ocorrência, H9.6; sem período: totais gerais e um combinado por linha). A criação (`/app/avisos/novo`) e o detalhe (`/app/avisos/:id`) seguem em rotas próprias.
- **Visão geral com totais** de a receber/recebido e a pagar/pago, calculados no backend, sem termos proibidos.
- **Bloco "precisa de você"** reunindo pendências de ação (com destaque para `informado_pago`).
- **Filtro/faixa "Sem aviso"** separado dos ativos; terminais não-pagos no histórico.
- **Linha do tempo** por combinado mostrando todos os eventos (incl. `solicitou_pix`, opt-out, reativação) e o **ator** de cada transição.
- **Status de entrega** dos avisos visível (enviado/falha/retry), sem dado sensível.
- **Painel só leitura + solicitação:** nenhuma regra de negócio no front; revalida após ação; free só visualiza; isolamento por usuário.
- **Desmembramento por período: estado global manda nas ocorrências futuras.** No filtro por período, ocorrência ainda `programado` herda o estado global do combinado (pausado/cancelado/recusado/expirado/sem_aviso/etc.); ocorrência já `informado_pago`/`pago` mantém o próprio (decisão do produto, ver critério em H9.6). Sem filtro de período, o recorrente continua como **um combinado** (uma linha, badge "k de N").

### Decisões em aberto
- Nenhuma pendente. As duas anteriores foram resolvidas em 2026-06-26:
  - **Visual/UX do painel** resolvido: estudo de design feito com a skill **frontend-design**, mantendo o design system; resultou na **página única** (totais + "precisa de você" + lista) descrita em Decisões tomadas.
  - **Recorrência no painel (H9.6)** resolvida: desmembramento por ocorrência implementado via a view **`combinado_linhas`** sobre `aviso_ocorrencias` (rege totais e lista no filtro por período).

### Fora de escopo deste épico
- ❌ Efeito de cada ação (criar/ativar/editar/cancelar/pausar/confirmar/rejeitar/reabrir): definidos nos Épicos 2 a 8.
- ❌ Conteúdo, canal e janelas das notificações ao cobrador (Épico 10).
- ❌ Preço dos créditos de envio e a CTA de comprar créditos (Épico 11).
- ❌ Edição dos textos/rótulos pelo owner (Épico 12).
- ❌ Telas de login/conta (Épico 1).
