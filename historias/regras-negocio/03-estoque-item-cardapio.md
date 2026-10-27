# Regra de negócio: Estoque por item do cardápio

> Histórias de usuário para a quantidade disponível de um item do cardápio ("15 marmitas hoje"): o item
> pode controlar estoque, tem uma quantidade disponível e dá baixa a cada venda, esgotando quando chega a
> zero. É distinto do estoque de insumos (ver `02-estoque-insumos.md`) e complementar a ele.

- **Domínio:** estoque de venda do próprio item do cardápio
- **Módulo de execução relacionado:** `API-cardapio` (+) e `API-pedidos` (+) (migration `0023`)

## Objetivo

Permitir que o item do cardápio tenha uma quantidade numérica disponível para o dia (ou período), que
cai a cada venda e tira o item do ar quando acaba, para o restaurante não vender o que não tem. É o
contador direto do produto, não o estoque de matéria-prima.

## Atores

- **Dono / gerente da loja:** liga o controle de estoque de um item e define a quantidade disponível.
- **Sistema de pedidos:** dá baixa na quantidade a cada item vendido e marca o item como esgotado ao
  chegar a zero.
- **Atendente (sistema de WhatsApp) e cardápio digital:** leem a disponibilidade para não oferecer item
  esgotado.

## Histórias

- Como dono, quero marcar que um item controla estoque e informar quantas unidades tenho hoje (por
  exemplo, 15 marmitas), para não vender além do que preparei.
- Como dono, quero que o item saia do ar sozinho quando a quantidade chega a zero, para o cliente não
  conseguir pedir o que acabou.
- Como dono, quero repor ou ajustar a quantidade disponível a qualquer momento, para abrir mais unidades
  ou corrigir uma contagem.
- Como dono, quero que um item sem controle de estoque continue sempre disponível (ilimitado), para não
  ser obrigado a contar o que não quero contar.
- Como atendente (sistema), quero saber a quantidade restante na hora de montar o pedido, para não
  prometer item indisponível.

## Regras

1. **Controle é opcional por item:** o item pode controlar estoque ou não. Sem controle, a quantidade é
   ilimitada e o item nunca esgota por contagem. Com controle, existe uma quantidade disponível numérica.
2. **Baixa na venda efetivada:** a quantidade cai quando o pedido é efetivado (o item entra no pedido
   confirmado), na mesma quantidade pedida. A baixa é atômica para evitar vender a mesma unidade duas
   vezes em pedidos simultâneos.
3. **Esgota em zero:** ao chegar a zero, o item fica esgotado e sai da oferta (cardápio e atendente). Não
   fica negativo por venda: um pedido que excederia o saldo é recusado ou ajustado antes de efetivar.
4. **Reposição e ajuste são explícitos:** aumentar a quantidade é ação do dono (nova remessa, correção).
   O esgotamento por contagem não reabre sozinho; o dono repõe.
5. **Distinto do estoque de insumos:** este contador é do item vendável. A baixa de matéria-prima
   (arroz, feijão) acontece em paralelo pela ficha técnica, se houver (ver `04-ficha-tecnica.md`). Um
   item pode ter os dois controles, um só, ou nenhum.
6. **Convive com os liga-desliga existentes:** o item já pode ser desativado (`ativo`) ou marcado como
   esgotado até um horário. A quantidade disponível é um terceiro mecanismo e não substitui esses; o
   item é ofertável somente se ativo, não esgotado por horário e com saldo (quando controla estoque).
7. **Multi-tenant:** a quantidade é por item de uma loja; cada loja controla a sua.

## Critérios de aceite

- Um item com controle de estoque e quantidade 15 fica indisponível automaticamente após 15 unidades
  vendidas.
- Dois pedidos simultâneos não conseguem, juntos, vender mais unidades do que havia em saldo.
- Um item sem controle de estoque permanece disponível independentemente do volume de vendas.
- Repor a quantidade de um item esgotado o traz de volta à oferta.
- O cardápio e o atendente não oferecem item com saldo zero.
- A baixa do item ocorre na efetivação do pedido, não no rascunho da conversa.

## Estados e transições

- **Item (quanto à disponibilidade por estoque):**
  - `ilimitado` (não controla estoque): sempre ofertável por este critério.
  - `disponivel` (controla, saldo > 0): ofertável.
  - `esgotado` (controla, saldo = 0): fora da oferta até reposição.
- **Transições:** `disponivel` -> `esgotado` (saldo chega a zero por vendas) -> `disponivel` (dono
  repõe). `ilimitado` <-> `disponivel` quando o dono liga/desliga o controle de estoque.
- A oferta efetiva do item é a combinação deste estado com `ativo` e com o esgotamento por horário.
