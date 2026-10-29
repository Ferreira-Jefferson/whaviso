# Regra de negócio: Ficha técnica (receita)

> Histórias de usuário para a ficha técnica: a receita que liga um item do cardápio aos insumos que ele
> consome e dá baixa automática no estoque de insumos quando o item é vendido. Depende do estoque de
> insumos (ver `02-estoque-insumos.md`) e se soma, sem substituir, ao estoque por item do cardápio
> (ver `03-estoque-item-cardapio.md`).

- **Domínio:** ficha técnica (receita item -> insumos, baixa na venda)
- **Módulo de execução relacionado:** `API-ficha-tecnica` (migration `0027`)

## Objetivo

Permitir que o dono descreva, por item do cardápio, quanto de cada insumo aquele item consome, para que
cada venda dê baixa automática na matéria-prima. É a base do custo de mercadoria real (CMV) e tira do
dono o trabalho de descontar o estoque de insumos à mão.

## Atores

- **Dono / gerente da loja:** monta e edita a ficha técnica de cada item.
- **Sistema de pedidos / estoque:** ao efetivar a venda, lê a ficha técnica do item e registra um
  movimento de consumo em cada insumo da receita.

## Histórias

- Como dono, quero montar a ficha técnica de um prato dizendo quanto de cada insumo ele usa (por exemplo,
  1 marmita usa 200 g de arroz, 150 g de feijão, 120 g de carne), para controlar meu custo e meu estoque.
- Como dono, quero que vender o prato baixe automaticamente os insumos da receita, para não precisar
  descontar à mão.
- Como dono, quero editar a ficha técnica quando mudo a receita, para a baixa refletir a preparação atual.
- Como dono, quero ver o custo estimado de um prato a partir dos insumos e das quantidades da ficha, para
  entender minha margem.
- Como dono, quero que um item sem ficha técnica simplesmente não baixe insumo, para poder adotar a ficha
  técnica aos poucos.

## Regras

1. **Ficha técnica é opcional por item:** um item pode ter receita ou não. Sem receita, a venda não baixa
   insumo. Com receita, a venda baixa cada insumo listado na quantidade da ficha vezes a quantidade
   vendida.
2. **Baixa na venda efetivada:** a baixa de insumo acontece na efetivação do pedido, junto da baixa do
   contador do item (quando houver). Vender 3 marmitas baixa 3 vezes a quantidade de cada insumo da ficha.
3. **A baixa é um movimento de consumo:** cada baixa gera um movimento de tipo `consumo` no insumo, de
   origem automática, visível no histórico do insumo (ver `02-estoque-insumos.md`). Nada é apagado.
4. **Unidade compatível:** a quantidade de insumo na ficha usa a unidade do insumo (ou uma conversão
   definida para a mesma grandeza, por exemplo g para kg). A ficha não mistura grandezas incompatíveis.
5. **Falta de insumo não trava a venda já efetivada:** se o insumo não tiver saldo suficiente, a venda
   não é desfeita; o saldo do insumo é reduzido no máximo até zero (não fica negativo) e o insumo entra na
   lista de baixo estoque para o dono acertar por ajuste de inventário. O bloqueio preventivo de venda por
   falta é regra do item do cardápio (contador), não da ficha técnica.
6. **Dois controles complementares:** o contador do item (quantas unidades do prato) e a ficha técnica
   (quanto de insumo por unidade) são independentes. Um item pode ter os dois, um, ou nenhum. A venda
   aplica os que existirem.
7. **Custo é estimativa derivada:** o custo do prato é calculado a partir das quantidades da ficha e do
   custo dos insumos; é informativo e muda quando o custo do insumo muda. Valores em centavos.
8. **Multi-tenant:** a ficha técnica é por item de uma loja; usa apenas insumos da mesma loja.

## Critérios de aceite

- Montar a ficha de um item com três insumos e vender uma unidade gera três movimentos de consumo, um por
  insumo, nas quantidades da ficha.
- Vender N unidades baixa N vezes cada insumo da ficha.
- Um item sem ficha técnica não gera nenhum movimento de insumo ao ser vendido.
- Editar a ficha técnica muda apenas as baixas futuras; as baixas já registradas permanecem.
- Se um insumo ficar sem saldo, a venda efetivada não é revertida e o saldo negativo é sinalizado.
- O custo estimado do prato muda quando o custo de um insumo da ficha muda.
- A ficha de um item de uma loja só referencia insumos daquela loja.

## Estados e transições

- **Ficha técnica do item:** `ausente` (item sem receita) -> `definida` (dono monta a receita) ->
  `definida` (editada). Pode ser esvaziada, voltando a `ausente`.
- **Baixa de insumo por venda:** disparada na efetivação do pedido; cada baixa é um movimento de consumo
  imutável no insumo. Não há transição reversa automática; correção é por ajuste de inventário no insumo.
