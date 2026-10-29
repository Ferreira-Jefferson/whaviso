# Regra de negócio: Estoque de insumos (matéria-prima)

> Histórias de usuário para o controle de matéria-prima do restaurante (arroz, feijão, carne, pão,
> embalagem): quantidade atual, estoque mínimo, movimentos (entrada, saída, ajuste, consumo) e alerta de
> baixo estoque. É distinto do estoque por item do cardápio (ver `03-estoque-item-cardapio.md`) e do
> consumo automático por ficha técnica (ver `04-ficha-tecnica.md`).

- **Domínio:** estoque de insumos (matéria-prima)
- **Módulo de execução relacionado:** `API-estoque-insumos` (migration `0026`)

## Objetivo

Dar ao dono o controle da matéria-prima que entra e sai da cozinha, com unidade de medida, saldo atual,
estoque mínimo e um histórico de movimentos que explica cada mudança de saldo. É a base para enxergar o
custo de mercadoria e para a ficha técnica dar baixa automática ao vender.

## Atores

- **Dono da loja:** cadastra insumos, registra entradas de compra, ajustes e perdas; define o mínimo.
- **Gerente / funcionário autorizado:** registra movimentos do dia a dia (entrada de compra, perda).
- **Sistema (ficha técnica):** registra automaticamente o consumo de insumo quando um item vendido tem
  receita (ver `04-ficha-tecnica.md`). Esse consumo é um movimento como os outros, de origem automática.

## Histórias

- Como dono, quero cadastrar um insumo com nome e unidade de medida (kg, g, L, mL, unidade), para
  controlar a matéria-prima da cozinha.
- Como dono, quero definir um estoque mínimo por insumo, para ser avisado quando estiver acabando.
- Como gerente, quero registrar uma entrada de insumo quando recebo uma compra, para o saldo subir e
  ficar registrado quando e quanto entrou.
- Como gerente, quero registrar uma saída ou perda (quebra, vencimento), para o saldo refletir a
  realidade com o motivo registrado.
- Como dono, quero fazer um ajuste de inventário quando a contagem física difere do saldo do sistema,
  para acertar o saldo deixando o ajuste registrado.
- Como dono, quero ver o saldo atual e o histórico de movimentos de um insumo, para entender como o
  saldo chegou onde está.
- Como dono, quero uma lista dos insumos abaixo do mínimo, para saber o que comprar.

## Regras

1. **Saldo é derivado dos movimentos:** o saldo atual de um insumo é a soma dos seus movimentos. Nenhum
   movimento é apagado; corrigir é lançar outro movimento (estorno ou ajuste). O histórico é append-only.
2. **Tipos de movimento:** `entrada` (compra, soma), `saida` (uso manual ou perda, subtrai), `ajuste`
   (acerto de inventário, pode somar ou subtrair até o valor contado) e `consumo` (baixa automática pela
   ficha técnica na venda, subtrai). Todo movimento guarda quantidade, tipo, data/hora e origem.
3. **Unidade de medida fixa por insumo:** cada insumo tem uma unidade (kg, g, L, mL, unidade). Os
   movimentos usam a mesma unidade do insumo. Conversão de unidade, se houver, acontece na ficha técnica,
   não no movimento.
4. **Estoque mínimo e alerta:** quando o saldo cai para o mínimo ou abaixo, o insumo entra na lista de
   baixo estoque. O alerta é informativo e não bloqueia a venda por si só (o bloqueio de venda por falta
   é regra do item do cardápio e da ficha técnica).
5. **Saldo não fica negativo por consumo automático:** se a ficha técnica consumir mais do que há em
   estoque (por configuração incompleta ou contagem atrasada), o saldo é reduzido no máximo até zero, em
   vez de travar a venda já efetivada. O insumo entra na lista de baixo estoque e o dono acerta a contagem
   real por ajuste de inventário.
6. **Quantidade em unidade inteira ou fracionária conforme a unidade:** kg e L aceitam fração; unidade
   é inteiro. Valores monetários de custo, quando houver, ficam em centavos.
7. **Multi-tenant:** insumos e movimentos pertencem a uma loja de uma conta; ninguém vê o estoque de
   outra loja fora do seu escopo.
8. **Remoção é lógica:** insumo é desativado, nunca apagado, para preservar o histórico de movimentos.

## Critérios de aceite

- Cadastrar um insumo exige nome e unidade; o saldo inicial começa em zero e sobe com a primeira entrada.
- Registrar uma entrada de 10 kg e depois uma saída de 2 kg deixa o saldo em 8 kg, com os dois movimentos
  visíveis no histórico.
- Um ajuste de inventário acerta o saldo para o valor contado e registra a diferença como movimento de
  ajuste com motivo.
- Um insumo com saldo igual ou abaixo do mínimo aparece na lista de baixo estoque.
- Vender um item com ficha técnica gera um movimento de `consumo` no insumo correspondente, de origem
  automática, visível no histórico.
- Nenhum movimento pode ser apagado; corrigir um erro é lançar outro movimento.
- Um usuário de uma loja não vê insumos nem movimentos de outra loja.

## Estados e transições

- **Insumo:** `ativo` -> `inativo` (desativado) -> `ativo` (reativado). Nunca apagado.
- **Saldo:** não é um estado persistido editável; é sempre recalculado a partir dos movimentos.
- **Situação de estoque (derivada):** `normal` (acima do mínimo) <-> `baixo` (no mínimo ou abaixo,
  inclusive em zero), derivado do saldo corrente. O saldo não vai abaixo de zero: o consumo automático
  reduz no máximo até zero.
- **Movimento:** criado e imutável (append-only); nunca editado nem apagado.
