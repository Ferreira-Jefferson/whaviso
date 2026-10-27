# Regra de negócio: Disponibilidade da loja

> Histórias de usuário para quando a loja atende e aceita pedidos e quando o atendente (sistema de
> WhatsApp) pode responder: horário de funcionamento por dia da semana, exceções e feriados em que a
> loja fecha ou muda o horário, e a janela de horário do atendente. Alinhado ao que já está em
> implementação (tabelas `horarios_funcionamento`, `janela_atendente`, `excecoes_disponibilidade` e o
> estado derivado "aceitando agora").

- **Domínio:** disponibilidade da loja (horários, exceções/feriados, janela do atendente)
- **Módulo de execução relacionado:** `API-lojas` (+) / `disponibilidade` (migration `0024`)

## Objetivo

Dar ao dono o controle de quando a loja está aberta para pedidos e de quando o atendente automático
responde no WhatsApp, cobrindo a rotina semanal, as datas especiais (feriados e exceções) e a janela do
atendente. O estado "aceitando agora" é sempre calculado pelo servidor, nunca definido à mão.

## Atores

- **Dono / gerente da loja:** define horários semanais, cadastra exceções e feriados, e configura a
  janela do atendente.
- **Servidor (api):** deriva, a qualquer instante, se a loja está aceitando pedidos e se o atendente
  pode responder, a partir dos horários, das exceções e do relógio em America/Sao_Paulo.
- **Atendente (sistema de WhatsApp):** lê a disponibilidade para decidir se responde e se aceita um
  pedido novo. Fora da janela ou com a loja fechada, continua recebendo mensagens mas não abre pedido.
- **Cliente final:** percebe a loja como aberta ou fechada e recebe o aviso de fechado quando é o caso.

## Histórias

### Horário de funcionamento

- Como dono, quero definir o horário de funcionamento por dia da semana, com mais de uma faixa por dia
  (por exemplo, almoço e jantar), para refletir minha operação real.
- Como dono, quero que uma faixa possa atravessar a meia-noite (por exemplo, 18:00 a 01:00), para cobrir
  quem fecha de madrugada.
- Como dono, quero marcar um dia como fechado, para não aceitar pedidos naquele dia da semana.

### Exceções e feriados

- Como dono, quero cadastrar uma data de exceção em que a loja fica fechada (feriado, folga), para parar
  de aceitar pedidos naquele dia mesmo que seja um dia normalmente aberto.
- Como dono, quero cadastrar uma exceção com horário especial numa data (abre diferente do normal), para
  ajustar um dia específico sem mexer na rotina semanal.
- Como dono, quero remover ou recadastrar uma exceção de uma data, para corrigir um engano.

### Janela do atendente

- Como dono, quero definir a janela de horário e os dias em que o atendente pode responder, para o
  atendimento automático só funcionar quando eu quero.
- Como dono, quero que, fora da janela, o sistema continue recebendo as mensagens mas não abra pedido
  novo e responda que estamos fechados, para não perder a mensagem nem prometer o que não posso entregar.

### Estado agora

- Como dono, quero ver se a loja está aceitando pedidos agora e se o atendente pode responder agora, para
  conferir a configuração.

## Regras

1. **Horário por dia da semana, várias faixas:** cada dia (0 = domingo a 6 = sábado) pode ter zero, uma
   ou mais faixas de abertura. Horários em America/Sao_Paulo, formato de hora e minuto.
2. **Faixa pode cruzar a meia-noite:** uma faixa cujo fim é menor que o início atravessa o dia seguinte.
   Abertura e fechamento não podem ser iguais.
3. **Sem sobreposição no mesmo dia:** as faixas ativas de um mesmo dia não se sobrepõem.
4. **Exceção vence a rotina:** numa data com exceção ativa, a exceção manda. Exceção fechada fecha a loja
   naquele dia; exceção com horário especial substitui as faixas daquele dia. No máximo uma exceção ativa
   por data.
5. **Janela do atendente é independente do horário da loja:** a loja pode estar aberta e o atendente fora
   da janela, ou o atendente na janela com a loja fechada. São dois controles. A janela tem início, fim e
   os dias da semana em que vale.
6. **Fora da janela o sistema não para de ouvir:** o recebimento de mensagens (webhook) continua de pé
   sempre. Fora da janela ou com a loja fechada, o atendente não abre pedido novo e responde que estamos
   fechados. Mensagens não se perdem.
7. **"Aceitando agora" é derivado, nunca persistido:** o servidor calcula, a cada consulta, se a loja
   aceita pedido agora e se o atendente pode responder agora, a partir de horários, exceções e do relógio
   em America/Sao_Paulo. O cliente nunca define esse estado; nunca é calculado no navegador.
8. **Remoção é lógica:** horários, exceções e a janela são desativados, nunca apagados, preservando o
   histórico de configuração.
9. **Multi-tenant:** toda a disponibilidade é por loja; cada loja configura a sua.

## Critérios de aceite

- Um dia com duas faixas (almoço e jantar) mostra a loja aberta nas duas faixas e fechada entre elas.
- Uma faixa 18:00 a 01:00 mantém a loja aberta depois da meia-noite, até 01:00 do dia seguinte.
- Numa data com exceção fechada, a loja aparece como não aceitando pedidos, mesmo sendo um dia
  normalmente aberto.
- Numa data com exceção de horário especial, valem as faixas da exceção, não as do dia da semana.
- Fora da janela do atendente, uma mensagem recebida é registrada, nenhum pedido novo é aberto e a
  resposta é a de loja fechada.
- O estado "aceitando agora" e "atendente pode responder agora" vem sempre do servidor e muda sozinho
  com a passagem do horário, sem ação do usuário.
- Um usuário de uma loja não vê nem edita a disponibilidade de outra loja.

## Estados e transições

- **Aceitando pedidos (derivado):** `aberta` <-> `fechada`, resultado de horários + exceções + relógio.
  Transições acontecem pela passagem do tempo e pela mudança de configuração, não por ação direta sobre
  o estado.
- **Atendente pode responder (derivado):** `na janela` <-> `fora da janela`, a partir da janela
  configurada e do relógio. Independente do estado de aceitação de pedidos.
- **Horário / exceção / janela (configuração):** `ativo` -> `inativo` (desativado) -> `ativo`
  (reativado ou recadastrado). Nunca apagado.
