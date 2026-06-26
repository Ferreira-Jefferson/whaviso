# Épico 10: Notificações ao cobrador

> Reúne **tudo que é avisado a quem gerencia o combinado** (em geral o cobrador; no fluxo invertido, também o devedor-criador): respostas ao convite, "já paguei", opt-out/reativação e problemas de convite. As mensagens **ao devedor** (lembretes, confirmações, Pix) ficam nos Épicos 6/7/8; aqui o alvo é **o lado que precisa saber/agir**.
> **Arquitetura (decidida, CLAUDE.md):** a `api` apenas **enfileira** a notificação na outbox `notificacoes_cobrador`; o `zap` **drena e envia** (claim `FOR UPDATE SKIP LOCKED`, sem Redis). A `api` nunca envia WhatsApp direto; o `zap` é o transporte.
> **Dois alvos de canal:** quem **tem conta** vê no **painel** (bloco "precisa de você", Épico 9 H9.2) e pode receber também no **WhatsApp**; quem **não tem conta** (cobrador convidado no invertido) só pode ser avisado pelo **WhatsApp** (`telefone_cobrador`), com CTA discreta de criar conta.
> **Regra de ouro deste épico:** durante o ciclo normal de lembretes, o cobrador **não** recebe nada ("o aviso D-2 saiu" não existe); só **eventos do devedor** e problemas de convite geram notificação (Épico 6 H6.5).
> Convenções de sempre: sem travessão, sem palavras proibidas, **neutras quanto a gênero**; **nunca** logar telefone/Pix/token; texto vindo de `templates` (Épico 12).

---

### H10.1: Entregar notificações pela outbox, no canal certo 🟢
Como **sistema (api + zap)**, quero enfileirar e entregar cada notificação pelo canal adequado, para o cobrador ser avisado sem acoplar a `api` ao envio.
*Critérios de aceite:*
- [ ] A `api` só **enfileira** em `notificacoes_cobrador`; o `zap` **drena** com `FOR UPDATE SKIP LOCKED` e envia (sem fila externa/Redis).
- [ ] Cada notificação é entregue **uma única vez** (idempotência): reprocessar ou reiniciar o `zap` não duplica.
- [ ] **Roteamento de canal/telefone:** com conta, o alvo é o telefone do `profile` (e o registro fica visível no painel); sem conta, o alvo é `telefone_cobrador`.
- [ ] **Retry** de envio segue a mesma política dos lembretes: até **3 tentativas**, intervalo aleatório de **20 a 60s** (Épico 6 H6.8); esgotado, marca como falho e fica visível.
- [ ] O conteúdo vem de **templates** editáveis (Épico 12), sempre neutro de gênero e sem palavras proibidas.
- [ ] **Nunca** logar telefone, Pix, valor sensível ou token.

---

### H10.2: Notificar quando o devedor informa pagamento ("já paguei") 🟢
Como **cobrador**, quero ser avisado na hora que o devedor diz que pagou, para confirmar ou rejeitar rápido.
*Critérios de aceite:*
- [ ] Ao o devedor tocar **Já paguei** (`informado_pago`, Épico 6 H6.5), o cobrador é notificado **imediatamente**.
- [ ] A notificação no **WhatsApp** leva botões de ação: **Confirmar pagamento** e **Ainda não recebi** (Épico 8 H8.5), válidos para **qualquer** cobrador (com ou sem conta).
- [ ] Para quem tem conta, o combinado também aparece em **"precisa de você" / "Aguardando sua confirmação"** no painel (Épico 9).
- [ ] Texto neutro, ex.: *"[nome de quem paga] informou que pagou o combinado: [motivo], R$ X. Você confirma o recebimento?"* (sem palavras proibidas).
- [ ] **Idempotente:** se o devedor toca "Já paguei" de novo (já em `informado_pago`), **não** gera nova notificação (Épico 7 H7.2).
- [ ] A notificação não expõe dado sensível em log.

---

### H10.3: Notificar as respostas ao convite (aceite, dado incorreto, recusa) 🟢
Como **criador**, quero saber como o convidado respondeu ao convite, para acompanhar e agir se preciso.
*Critérios de aceite:*
- [ ] **Aceite** (Épico 5 H5.3): o criador é notificado de que o combinado foi aceito e entrou no ciclo. No invertido, inclui que a **chave Pix foi confirmada**.
- [ ] **Algum dado incorreto / chave Pix incorreta** (Épico 5 H5.4): o criador é notificado para **revisar e reenviar**; a notificação **não** traz texto livre do convidado (não existe), só o sinal.
- [ ] **Recusa** (`recusado`, Épico 5 H5.5): o criador é notificado de que o convidado recusou (estado terminal próprio, distinto de cancelado).
- [ ] Cada notificação aponta **qual combinado** e leva (para quem tem conta) ao item no painel.
- [ ] No fluxo **invertido**, o "criador" notificado é o **devedor**; no **receber**, é o **cobrador**. O roteamento de canal segue H10.1.
- [ ] Linguagem neutra, sem palavras proibidas.

---

### H10.4: Notificar problemas de convite (telefone divergente, tentativas esgotadas) 🟢
Como **criador**, quero ser avisado quando o convite não consegue ser validado, para corrigir o número e reenviar.
*Critérios de aceite:*
- [ ] **Telefone divergente** (Épico 5 H5.8): quando o número de convite confere mas o telefone de quem respondeu não bate, o criador é notificado, ex.: *"O WhatsApp de quem tentou abrir este combinado não bate com o que você cadastrou. Confira o número e reenvie o convite."*
- [ ] **3 tentativas esgotadas, telefone cadastrado** (Épico 5 H5.9): o criador é notificado de que a pessoa está com dificuldade, e que um **novo número de validação** foi gerado para reenviar.
- [ ] **3 tentativas, telefone não cadastrado** (Épico 5 H5.9): **não** há notificação a criador algum (não há convite associado).
- [ ] As notificações **não revelam** dados do combinado a quem não deve, e nada sensível vai a log.

---

### H10.5: Notificar opt-out (com atraso de 1 minuto) e reativação 🟢
Como **cobrador**, quero saber quando o devedor desativa os lembretes e quando volta atrás, para acompanhar sem ser avisado de uma saída que se desfez em seguida.
*Critérios de aceite:*
- [ ] Ao o devedor tocar **Desativar lembretes** (`desregistrado`, Épico 7 H7.4), a notificação ao cobrador é **agendada para ~1 minuto depois**, não enviada na hora.
- [ ] Se, **dentro desse 1 minuto**, o devedor **reativa** (Épico 7 H7.5), a notificação de saída é **cancelada** e o cobrador **não recebe nada** (a saída e a volta se anulam).
- [ ] Se o minuto passa e a notificação de saída é enviada, e **depois** o devedor reativa, o cobrador recebe **uma nova notificação** informando que a pessoa **voltou** ao combinado.
- [ ] As notificações de opt-out/reativação identificam o **combinado** (ex.: "do combinado xxx-xxx") e usam linguagem neutra, sem tom acusatório.
- [ ] A janela de 1 minuto é controlada pelo agendamento da outbox (não por estado preso no front); o cancelamento dentro da janela é idempotente.

---

### H10.6: Silêncio durante o ciclo normal de lembretes 🟢
Como **cobrador**, quero não ser bombardeado a cada lembrete enviado ao devedor, para só receber o que exige minha atenção.
*Critérios de aceite:*
- [ ] O cobrador **não** recebe notificação a cada envio do ciclo (não existe "o aviso D-2 foi enviado"), Épico 6 H6.5.
- [ ] As únicas notificações ao cobrador são **eventos do devedor** (já paguei, dado incorreto, recusa, opt-out, reativação) e **problemas de convite** (H10.4).
- [ ] Falhas de **entrega dos lembretes** ao devedor não viram notificação ativa ao cobrador; ficam visíveis no **status de envio** do painel (Épico 9 H9.7).
- [ ] Quando vários eventos do mesmo combinado/devedor acontecem em sequência, o cobrador não recebe uma rajada: vale o espaçamento e o cancelamento da **fila de saída** (H10.9).

---

### H10.7: Cobrador sem conta é avisado pelo WhatsApp 🟢
Como **cobrador sem conta** (entrei só por `telefone_cobrador`, típico do invertido), quero receber as notificações e poder agir pelo WhatsApp, para não precisar de conta para fechar o combinado.
*Critérios de aceite:*
- [ ] Quando `cobrador_id` é nulo, todas as notificações deste épico vão para **`telefone_cobrador`** via WhatsApp.
- [ ] As notificações **acionáveis** (principalmente "já paguei", H10.2) levam **botões** para confirmar/rejeitar pelo próprio WhatsApp (Épico 8 H8.5).
- [ ] Acompanha uma **CTA discreta** de criar conta para passar a ver tudo no painel (nunca obrigatória).
- [ ] Vale o mesmo risco de canal (botões via Baileys podem exigir fallback numerado até a Meta oficial, Épicos 7/8).

---

### H10.8: Notificações seguras, sem ruído; WhatsApp é o canal principal 🟢
Como **sistema**, quero que as notificações sejam confiáveis e não virem spam, para preservar a confiança no canal.
*Critérios de aceite:*
- [ ] Toda notificação é **idempotente** e registrada (auditoria/visibilidade), sem dado sensível em log.
- [ ] Eventos repetidos do mesmo tipo no mesmo combinado **não** geram notificações duplicadas (ex.: "já paguei" repetido, H10.2).
- [ ] As notificações ao cobrador são **universais e não consomem crédito** (notificar o criador não é lembrete ao devedor, H11.2); registram sempre o evento no painel, mesmo quando saem por WhatsApp.
- [ ] **Canal: o WhatsApp é o core do produto.** Os avisos **sempre** acontecem por WhatsApp; o **painel/site é uma segunda opção** (complementar, para quem tem conta), nunca o canal principal. Não há "preferência de canal" em que o usuário desliga o WhatsApp e fica só no site.

---

### H10.9: Fila de saída simples: espaçar e cancelar itens superados 🟢
Como **sistema (zap)**, quero uma fila simples (sem Redis) que espace os envios e cancele itens que se anulam, para ninguém receber uma rajada e para não mandar avisos que já não fazem sentido.
*Critérios de aceite:*
- [ ] A fila usa **só o banco** (as outboxes `envios` e `notificacoes_cobrador`), **sem Redis** nem fila externa, com claim `FOR UPDATE SKIP LOCKED`.
- [ ] **Espaçamento na entrega:** mensagens dirigidas ao **mesmo destinatário** (mesmo cobrador, ou mesmo devedor) saem com **intervalo mínimo de 10 minutos** entre si, para evitar rajada; quando há acúmulo, os itens são entregues em sequência respeitando o intervalo.
- [ ] **Cancelamento inteligente (coalescing):** um item ainda **não enviado** na fila pode ser **cancelado/anulado** por um evento posterior que o torna sem sentido. Caso canônico: o devedor faz opt-out e **reativa poucos minutos depois**: se a notificação de saída ainda está na fila, **os dois se anulam** e **nada** chega ao cobrador (generaliza a janela de 1 min da H10.5).
- [ ] A técnica de cancelamento vale **nas duas filas**: a do **cobrador** (`notificacoes_cobrador`) e a do **devedor** (`envios`); ex.: lembrete ainda na fila para um devedor que acabou de sair/entrar em estado terminal não é enviado (alinha com a reconferência de estado, Épico 6 H6.4).
- [ ] O cancelamento é **conservador e auditável:** só anula o que comprovadamente se tornou obsoleto (par evento/contra-evento ou estado terminal), nunca por heurística frouxa; cada cancelamento é registrado.
- [ ] **Ponto crítico → cobertura de testes forte:** casos de corrida (evento e contra-evento quase simultâneos), múltiplos itens do mesmo combinado, e limites do intervalo de 10 min devem ter testes dedicados, para **não cancelar o que não devia** nem **duplicar/perder** envio.
- [ ] O espaçamento de entrega **complementa** (não substitui) a distância de 10 min por devedor já garantida no agendamento dos lembretes (Épico 6 H6.9).

---

### Divergências com a definição atual

> A outbox `notificacoes_cobrador` (api enfileira, zap drena) já é a arquitetura decidida (CLAUDE.md). As divergências vêm dos eventos e janelas novos.

- **Notificação de opt-out atrasada 1 min + reativação (H10.5):** janela de agendamento nova; o cancelamento da notificação dentro da janela e a 2ª notificação (volta) não existem hoje.
- **"Já paguei" com botões de ação para qualquer cobrador (H10.2/H10.7):** notificar com **Confirmar / Ainda não recebi** e processar a resposta por WhatsApp (não só painel) é construção nova, ligada ao Épico 8 H8.5.
- **Cobrador sem conta notificado por `telefone_cobrador` (H10.7):** hoje as notificações pressupõem `profile`; é preciso rotear por `telefone_cobrador` quando `cobrador_id` é nulo (também citado nos Épicos 3/5/8).
- **Problemas de convite (H10.4):** notificações de telefone divergente (H5.8) e tentativas esgotadas (H5.9) são comportamento novo do Épico 5.
- **Silêncio no ciclo (H10.6):** confirmar que nada é notificado por envio de lembrete (alinhado ao Épico 6 H6.5).
- **Conteúdo via templates (Épico 12):** os textos das notificações ao cobrador entram na tabela `templates` unificada, garantidos neutros/sem proibidas.
- **Fila de saída com espaçamento de 10 min + cancelamento (H10.9):** comportamento novo sobre as outboxes, valendo para as duas filas (cobrador e devedor). O coalescing (par opt-out/reativação se anulando, item obsoleto por estado terminal) e o intervalo de 10 min entre envios ao mesmo destinatário não existem hoje e são **ponto crítico** (exigem testes fortes).
- **Distância de 10 min por devedor no agendamento (Épico 6 H6.9):** soma-se a esta fila; o agendamento já separa os lembretes de um mesmo devedor, e a fila cuida do acúmulo em runtime (incluindo notificações ad-hoc ao cobrador).

### Decisões tomadas
- **Arquitetura:** `api` enfileira em `notificacoes_cobrador`, `zap` drena (`SKIP LOCKED`) e envia; retry 3x/20-60s; nunca loga dado sensível.
- **Canais por alvo:** com conta = painel (+ WhatsApp); sem conta = só WhatsApp (`telefone_cobrador`) com CTA de criar conta.
- **Eventos que notificam:** aceite, dado incorreto, recusa, telefone divergente, tentativas esgotadas (cadastrado), "já paguei", opt-out (atraso 1 min), reativação.
- **"Já paguei" notifica na hora, com botões Confirmar / Ainda não recebi** para qualquer cobrador.
- **Opt-out atrasa 1 minuto** (cancela se reativar dentro do minuto; 2ª notificação se reativar depois).
- **Silêncio no ciclo normal:** nenhuma notificação por envio de lembrete; falha de lembrete só no status do painel.
- **Idempotência e antiduplicação** por evento/combinado.
- **Canal principal é o WhatsApp:** avisos sempre por WhatsApp; o painel/site é segunda opção, não substitui o canal. Não há preferência que desligue o WhatsApp.
- **Fila de saída simples (H10.9):** só banco (sem Redis), espaçamento de 10 min por destinatário e **cancelamento conservador** de itens superados, nas duas filas (cobrador e devedor); ponto crítico com testes dedicados.

### Decisões em aberto
- Nenhuma pendente neste épico.

### Fora de escopo deste épico
- ❌ Mensagens **ao devedor** (lembretes, confirmações, Pix, empurrãozinho de D+1) (Épicos 6/7/8).
- ❌ O efeito das ações que o cobrador toma a partir da notificação (confirmar/rejeitar) (Épico 8).
- ❌ Como as pendências aparecem no painel ("precisa de você") (Épico 9).
- ❌ Limites de envio (saldo de créditos) e o que conta como envio (Épico 11).
- ❌ Edição dos textos das notificações pelo owner (Épico 12).
