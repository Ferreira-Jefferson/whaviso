# Regra de negócio: Caixa / PDV

> Histórias de usuário para o controle de caixa do balcão (PDV como software, sem hardware pesado e sem
> nota fiscal): abrir e fechar o caixa, saldo inicial, vendas por forma de pagamento, sangria e
> suprimento, e a conferência de fechamento. Atende o uso real do dono operando o restaurante
> presencialmente enquanto o atendente de WhatsApp roda em paralelo.

- **Domínio:** caixa / PDV (abertura, fechamento, movimentos de caixa)
- **Módulo de execução relacionado:** `API-caixa` + `FR-caixa` (migration `0028`)
- **Fora de escopo:** nota fiscal / fiscal / SPED (só via emissor de terceiro em outro domínio); hardware
  de PDV pesado.

## Objetivo

Permitir que a loja controle o dinheiro do turno: abrir o caixa com um fundo, registrar as vendas por
forma de pagamento, retirar (sangria) e reforçar (suprimento) dinheiro, e fechar o caixa conferindo o
esperado contra o contado. É o controle operacional do dinheiro, não contabilidade nem fiscal.

## Atores

- **Operador de caixa (dono, gerente ou funcionário autorizado):** abre, movimenta e fecha o caixa.
- **Dono / gerente:** confere os fechamentos e as diferenças.
- **Sistema de pedidos:** quando um pedido é pago no balcão, o recebimento entra no caixa aberto na forma
  de pagamento correspondente.

## Histórias

### Abertura

- Como operador, quero abrir o caixa informando o saldo inicial em dinheiro (fundo de troco), para
  começar o turno com o valor registrado.
- Como operador, quero que só exista um caixa aberto por ponto de operação por vez, para não misturar
  turnos.

### Movimentação

- Como operador, quero registrar as vendas por forma de pagamento (dinheiro, crédito, débito, Pix), para
  saber quanto entrou em cada forma.
- Como operador, quero fazer uma sangria (retirada de dinheiro do caixa) com motivo, para tirar excesso
  de dinheiro com segurança e deixar registrado.
- Como operador, quero fazer um suprimento (reforço de dinheiro no caixa) com motivo, para repor troco e
  deixar registrado.

### Fechamento

- Como operador, quero fechar o caixa informando o valor contado em dinheiro, para conferir contra o
  esperado.
- Como dono, quero ver, no fechamento, o esperado por forma de pagamento, o contado em dinheiro e a
  diferença (sobra ou falta), para saber se o turno fechou certo.
- Como dono, quero o histórico dos caixas fechados com seus movimentos, para auditar o dinheiro.

## Regras

1. **Um caixa aberto por vez por ponto de operação:** não se abre um caixa com outro ainda aberto no
   mesmo ponto; é preciso fechar o anterior. Um pedido só entra no caixa que estiver aberto no momento do
   recebimento.
2. **Saldo inicial é só o fundo em dinheiro:** a abertura registra o dinheiro físico de troco. As demais
   formas (cartão, Pix) começam o turno em zero.
3. **Formas de pagamento:** cada venda entra numa forma (dinheiro, crédito, débito, Pix). O esperado por
   forma é a soma das vendas daquela forma no turno, mais suprimentos e menos sangrias no caso do
   dinheiro.
4. **Sangria e suprimento só afetam o dinheiro:** sangria subtrai e suprimento soma ao esperado em
   dinheiro; ambos exigem motivo e ficam registrados. Não alteram cartão nem Pix.
5. **Esperado em dinheiro:** saldo inicial + vendas em dinheiro + suprimentos - sangrias. A diferença de
   fechamento é o contado menos o esperado em dinheiro (positiva é sobra, negativa é falta).
6. **Fechamento é append-only:** fechar o caixa congela seus movimentos e registra o contado e a
   diferença. Um caixa fechado não reabre; correção é um novo caixa ou um ajuste registrado, nunca apagar
   movimento.
7. **Valores em centavos:** todo dinheiro é inteiro em centavos; datas e horários em America/Sao_Paulo.
8. **Sem fiscal:** o caixa não emite nota fiscal nem faz apuração fiscal. O recebimento é controle
   operacional de dinheiro.
9. **Multi-tenant:** o caixa é por loja; cada loja controla o seu. O recebimento de um pedido entra no
   caixa da loja daquele pedido.

## Critérios de aceite

- Abrir um caixa com fundo de 100,00 e nenhuma venda deixa o esperado em dinheiro em 100,00.
- Registrar vendas em formas diferentes acumula o esperado separado por forma.
- Uma sangria de 50,00 reduz o esperado em dinheiro em 50,00 e fica registrada com motivo.
- Um suprimento de 30,00 aumenta o esperado em dinheiro em 30,00 e fica registrado com motivo.
- No fechamento, a diferença mostrada é o contado menos o esperado em dinheiro, identificada como sobra
  ou falta.
- Não é possível abrir um segundo caixa no mesmo ponto com um ainda aberto.
- Um caixa fechado não aceita novos movimentos nem reabre; seus dados ficam no histórico.
- Um usuário de uma loja não vê o caixa de outra loja.

## Estados e transições

- **Caixa:** `aberto` (operador abriu com saldo inicial) -> `fechado` (operador fechou com o contado e a
  diferença apurada). Não há volta de `fechado` para `aberto`.
- **Movimento de caixa (venda, sangria, suprimento):** criado enquanto o caixa está `aberto`; imutável
  (append-only). Nenhum movimento é aceito em caixa `fechado`.
