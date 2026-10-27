# Regra de negócio: Funcionários, Cargos e Escala

> Histórias de usuário (fonte da verdade do produto) para a gestão da equipe da loja: cadastro de
> funcionários (sem folha de pagamento), catálogo de cargos editável com o cargo fixo de sistema
> "motoboy", e a escala por dia da semana e horários. Linguagem de produto, não de implementação.
> Domínio de equipe, distinto de `membros` (quem faz login no painel).

- **Domínio:** equipe da loja (funcionários, cargos, escala)
- **Módulo de execução relacionado:** `API-funcionarios` (migration `0025`), que reconcilia com `API-motoboys`

## Objetivo

Permitir que o dono do restaurante registre e organize quem trabalha na operação (cozinha, salão,
atendimento, entrega) com seus cargos e sua escala de trabalho, sem entrar em folha de pagamento nem
RH burocrático. O cadastro de funcionários é a base da operação de salão, da cozinha e da entrega: o
motoboy da entrega é um funcionário com o cargo fixo "motoboy".

## Atores

- **Dono da loja:** cadastra e gerencia funcionários, cargos e escalas; tem acesso total.
- **Gerente:** cadastra e edita funcionários e escalas; não apaga cargos de sistema.
- **Funcionário:** é dado de equipe gerenciado pelo dono. Não faz login no painel (quem faz login é
  `membro`). Um funcionário pode também ser membro, mas são cadastros distintos.
- **Atendente (sistema de WhatsApp):** não gerencia equipe; no máximo lê o nome do motoboy para avisar
  o cliente quem está levando o pedido (domínio de entrega).

## Distinção que não pode ser perdida

- **Membro** faz login no painel e tem papel de acesso (dono, gerente, operador). É identidade de
  software.
- **Funcionário** é pessoa da operação que o dono administra. É dado de equipe. Pode nunca acessar o
  sistema.
- Um motoboy é um **funcionário** com o cargo de sistema "motoboy"; não é um membro por ser motoboy.

## Histórias

### Funcionários

- Como dono, quero cadastrar um funcionário com nome, telefone de contato e cargo, para montar o quadro
  da minha loja.
- Como dono, quero marcar um funcionário como inativo quando ele deixa a operação, para tirá-lo das
  listas sem apagar o histórico.
- Como gerente, quero editar os dados de um funcionário (nome, telefone, cargo), para manter o cadastro
  correto.
- Como dono, quero que um funcionário com cargo "motoboy" tenha os campos de entrega (veículo, placa,
  chave Pix para acerto), para que ele apareça na operação de entrega e no fechamento do dia.

### Cargos

- Como dono, quero um catálogo de cargos da minha conta, já com presets úteis (cozinheira, ajudante de
  cozinha, atendente, marmiteira, recepção, garçom), para não começar do zero.
- Como dono, quero criar, renomear e desativar cargos próprios, para refletir a realidade da minha
  operação.
- Como dono, quero que o cargo "motoboy" exista sempre e não possa ser apagado nem desativado, para que
  a operação de entrega nunca fique sem o cargo que a habilita.

### Escala

- Como dono, quero definir a escala de um funcionário por dia da semana e faixas de horário (por
  exemplo, só no almoço, ou no pico do jantar), para organizar quem trabalha quando.
- Como gerente, quero registrar a diária combinada de um turno, para somar quanto foi trabalhado no
  período, sem que isso seja folha de pagamento.
- Como dono, quero ver a escala da semana por funcionário e por dia, para enxergar buracos de cobertura.

## Regras

1. **Cargo de sistema "motoboy" é fixo:** sempre existe por conta/loja, não pode ser apagado nem
   desativado, e seu identificador é estável. Toda loja o tem. Os presets restantes são sugestões
   editáveis; só "motoboy" é protegido.
2. **Motoboy é funcionário:** o cadastro de motoboy da entrega é um funcionário de cargo "motoboy". Não
   há cadastro de motoboy separado do de funcionário. O cargo motoboy habilita os campos de entrega
   (veículo, placa, chave Pix de acerto). A operação de entrega lê os funcionários de cargo motoboy.
3. **Sem folha de pagamento:** a escala guarda dias, turnos e, opcionalmente, a diária combinada. Não
   calcula encargos, holerite, imposto nem ponto eletrônico. A soma de diárias por período é apenas um
   total informativo.
4. **Diária do motoboy cruza com o fechamento da entrega:** o pagamento do motoboy do dia é apurado no
   fechamento da entrega (domínio de entrega), não duplicado na escala. A escala registra o turno; o
   acerto financeiro do dia é um lugar só.
5. **Remoção é lógica:** funcionário e cargo não próprio são desativados, nunca apagados. O histórico de
   quem trabalhou permanece.
6. **Multi-tenant:** funcionários, cargos e escalas pertencem a uma loja de uma conta. Ninguém vê a
   equipe de outra loja fora do seu escopo.
7. **Dado de contato é sensível:** telefone de funcionário segue a mesma regra de não ser exposto em log.
8. **Horários em America/Sao_Paulo:** faixas de turno são do fuso da operação; uma faixa pode cruzar a
   meia-noite (por exemplo, 18:00 a 01:00). Sem sobreposição de faixas do mesmo funcionário no mesmo dia.

## Critérios de aceite

- Toda loja nova já tem o cargo "motoboy" disponível; tentar apagá-lo ou desativá-lo é recusado com
  mensagem clara.
- Cadastrar um funcionário com cargo "motoboy" expõe os campos de entrega; com outro cargo, não.
- Desativar um funcionário o remove das listas de seleção ativas mas preserva o histórico de escala.
- A escala de um funcionário aceita várias faixas por dia e recusa faixas sobrepostas no mesmo dia.
- A soma de diárias de um período bate com a soma das diárias registradas nos turnos daquele período.
- Um usuário de uma loja não enxerga funcionários, cargos ou escalas de outra loja.

## Estados e transições

- **Funcionário:** `ativo` -> `inativo` (desativado pelo dono/gerente) -> `ativo` (reativado). Nunca
  apagado.
- **Cargo próprio:** `ativo` -> `inativo` -> `ativo`. Nunca apagado.
- **Cargo de sistema "motoboy":** sempre `ativo`; não há transição para `inativo` nem remoção.
- **Turno de escala:** `planejado` (cadastrado) -> opcionalmente marcado como `cumprido` para somar a
  diária do período. A apuração financeira do dia do motoboy acontece no fechamento da entrega.
