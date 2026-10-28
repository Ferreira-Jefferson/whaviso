# Regra de negócio: Disponibilidade da loja

> Histórias de usuário para quando a loja aceita pedidos online e quando o atendente automático
> (sistema de WhatsApp) fica ativo. Há **uma fonte única, na loja**: o horário de atendimento (quando
> a loja aceita pedido ao vivo, por WhatsApp, iFood ou qualquer canal), a janela de agendamento
> (quando aceita pedido antecipado, podendo ser 24h), e as exceções/feriados. O atendente **não tem
> horário próprio**: ele opera em cima da disponibilidade da loja. O estado derivado "aceitando agora"
> e "atendente ativo agora" é sempre calculado pelo servidor.

- **Domínio:** disponibilidade da loja (horário de atendimento, janela de agendamento, exceções/feriados)
- **Módulo de execução relacionado:** `API-lojas` (dono da disponibilidade) / motor do atendente (consome)

## O que "horário" significa aqui (importante)

O horário desta tela **não é o salão físico**. É o horário em que a loja **aceita pedido online**. Se
chega cliente no salão fora desse horário, a loja o atende na mão, à parte: isso não é modelado aqui.
Por isso **horário de atendimento da loja = horário em que o atendente responde e abre pedido**: são a
mesma coisa, não dois controles.

## Objetivo

Dar ao dono o controle de quando a loja aceita pedido online (ao vivo) e, opcionalmente, quando aceita
agendamento, cobrindo a rotina semanal e as datas especiais (feriados e exceções). O atendente fica
ativo exatamente na disponibilidade resultante. O estado "aceitando agora" / "atendente ativo agora" é
sempre derivado pelo servidor, nunca definido à mão.

## Atores

- **Dono / gerente da loja:** define o horário de atendimento semanal, liga/configura a janela de
  agendamento e cadastra exceções e feriados. É a única fonte desses horários.
- **Servidor (api):** deriva, a qualquer instante, se a loja aceita pedido ao vivo agora e se o
  atendente está ativo agora, a partir do horário, da janela de agendamento, das exceções e do relógio
  em America/Sao_Paulo.
- **Atendente (sistema de WhatsApp):** lê a disponibilidade **da loja** para decidir se responde e o
  que oferece. Não tem horário próprio. Ativo no horário de atendimento (aceita pedido imediato) e na
  janela de agendamento (aceita pedido agendado). Fora de tudo, continua recebendo mensagens mas não
  abre pedido.
- **Cliente final:** percebe a loja como aberta, fechada ou aceitando agendamento, e recebe o aviso
  correspondente.

## Histórias

### Horário de atendimento (pedido ao vivo)

- Como dono, quero definir o horário de atendimento por dia da semana, com mais de uma faixa por dia
  (por exemplo, almoço e jantar), para refletir minha operação real.
- Como dono, quero que uma faixa possa atravessar a meia-noite (por exemplo, 18:00 a 01:00), para cobrir
  quem fecha de madrugada.
- Como dono, quero marcar um dia como fechado, para não aceitar pedido ao vivo naquele dia da semana.

### Janela de agendamento

- Como dono, quero poder aceitar pedidos **agendados** fora do horário de atendimento, para o cliente
  deixar o pedido pronto para um horário futuro.
- Como dono, quero escolher entre **não aceitar agendamento**, aceitar numa **faixa própria** de
  horário/dias, ou deixar **sempre aberto (24h)** para agendamento, para casar com a minha operação.
- Como dono, quero que o atendente deixe claro ao cliente que o pedido é **agendado** e que a entrega
  sai dentro do horário de atendimento (não na hora), para não prometer o que não posso entregar agora.

### Exceções e feriados

- Como dono, quero cadastrar uma data de exceção em que a loja fica fechada (feriado, folga), para parar
  de aceitar pedidos naquele dia mesmo que seja um dia normalmente aberto.
- Como dono, quero cadastrar uma exceção com horário especial numa data (abre diferente do normal), para
  ajustar um dia específico sem mexer na rotina semanal.
- Como dono, quero remover ou recadastrar uma exceção de uma data, para corrigir um engano.

### Estado agora

- Como dono, quero ver se a loja aceita pedido ao vivo agora, se aceita agendamento agora e se o
  atendente está ativo agora, para conferir a configuração.

## Regras

1. **Fonte única na loja.** O horário de atendimento, a janela de agendamento e as exceções são
   informação da loja. **Não existe horário do atendente separado:** o atendente opera na
   disponibilidade da loja.
2. **Horário de atendimento por dia, várias faixas:** cada dia (0 = domingo a 6 = sábado) pode ter zero,
   uma ou mais faixas de abertura. Horários em America/Sao_Paulo, formato de hora e minuto.
3. **Faixa pode cruzar a meia-noite:** uma faixa cujo fim é menor que o início atravessa o dia seguinte.
   Abertura e fechamento não podem ser iguais. As faixas ativas de um mesmo dia não se sobrepõem.
4. **Exceção vence a rotina:** numa data com exceção ativa, a exceção manda. Exceção fechada fecha a loja
   naquele dia; exceção com horário especial substitui as faixas daquele dia. No máximo uma exceção ativa
   por data. A exceção afeta o horário de atendimento (o agendamento 24h segue valendo, salvo se a
   exceção fechar a loja por completo naquela data).
5. **Agendamento é opcional e tem três modos:** desligado (só pedido ao vivo), faixa própria (dias +
   horário), ou 24h. A janela de agendamento vale **além** do horário de atendimento, não no lugar dele.
6. **Atendente ativo = horário de atendimento ∪ janela de agendamento.** Se o agendamento é 24h, o
   atendente fica ativo 24h; se o agendamento está desligado, o atendente fica ativo só no horário de
   atendimento. No horário de atendimento o atendente aceita pedido imediato; na janela de agendamento
   (fora do atendimento) aceita apenas pedido agendado, avisando que é agendado e que a entrega sai no
   horário de atendimento.
7. **Fora da disponibilidade o sistema não para de ouvir:** o recebimento de mensagens (webhook)
   continua de pé sempre. Fora do horário de atendimento e da janela de agendamento, o atendente não
   abre pedido e responde que a loja está fechada. Mensagens não se perdem.
8. **"Aceitando agora" é derivado, nunca persistido:** o servidor calcula, a cada consulta, se a loja
   aceita pedido ao vivo agora, se aceita agendamento agora e se o atendente está ativo agora, a partir
   do horário, da janela de agendamento, das exceções e do relógio em America/Sao_Paulo. O cliente nunca
   define esse estado; nunca é calculado no navegador.
9. **Remoção é lógica:** horários, janela de agendamento e exceções são desativados, nunca apagados,
   preservando o histórico de configuração.
10. **Multi-tenant:** toda a disponibilidade é por loja; cada loja configura a sua.

## Critérios de aceite

- Um dia com duas faixas (almoço e jantar) mostra a loja aceitando pedido ao vivo nas duas faixas e não
  aceitando entre elas.
- Uma faixa 18:00 a 01:00 mantém a loja aceitando pedido ao vivo depois da meia-noite, até 01:00 do dia
  seguinte.
- Numa data com exceção fechada, a loja aparece como não aceitando pedido ao vivo, mesmo sendo um dia
  normalmente aberto.
- Numa data com exceção de horário especial, valem as faixas da exceção, não as do dia da semana.
- Com agendamento 24h, o atendente aparece como ativo agora a qualquer hora, mesmo fora do horário de
  atendimento, e abre apenas pedido agendado fora do horário de atendimento.
- Com agendamento desligado, fora do horário de atendimento o atendente aparece como inativo: uma
  mensagem recebida é registrada, nenhum pedido é aberto e a resposta é a de loja fechada.
- O estado "aceitando agora" / "atendente ativo agora" vem sempre do servidor e muda sozinho com a
  passagem do horário, sem ação do usuário.
- Um usuário de uma loja não vê nem edita a disponibilidade de outra loja.

## Estados e transições

- **Aceitando pedido ao vivo (derivado):** `aberta` <-> `fechada`, resultado de horário de atendimento +
  exceções + relógio. Transições pela passagem do tempo e pela mudança de configuração, não por ação
  direta sobre o estado.
- **Atendente ativo (derivado):** `ativo` <-> `inativo`, igual a (aceita pedido ao vivo) **ou** (dentro
  da janela de agendamento). Não é um controle próprio: deriva da disponibilidade da loja.
- **Horário / janela de agendamento / exceção (configuração):** `ativo` -> `inativo` (desativado) ->
  `ativo` (reativado ou recadastrado). Nunca apagado.

## Notas de implementação

- A derivação (horário + agendamento + exceções + relógio em America/Sao_Paulo) é **uma função pura
  compartilhada** (`@whaviso/shared`), consumida tanto pela `api` (endpoint "agora" e telas) quanto pelo
  **motor do atendente** (gate de aberto/fechado e de agendamento). Não pode haver duas derivações
  divergentes: o motor do atendente **não** usa um campo de horário próprio da loja; lê a mesma
  disponibilidade.
- Decisão (2026-10-27): esta regra **substitui** a versão anterior, que modelava "janela do atendente"
  como um controle independente do horário da loja. O dono confirmou que horário da loja e horário do
  atendente são a mesma coisa (aceitar pedido online), e que o único horário a mais é o de agendamento.
  O campo legado de horário solto na loja (consumido só pelo motor) é depreciado em favor da fonte única.
