# Regra de negócio: Salão (mesas e comandas)

> Histórias de usuário para o atendimento no salão: mesas, abrir uma comanda numa mesa, lançar itens ao
> longo do atendimento e fechar a comanda. Cobre o consumo presencial enquanto o atendente de WhatsApp
> roda em paralelo, no mesmo sistema.

- **Domínio:** salão (mesas e comandas)
- **Módulo de execução relacionado:** `API-salao` + `FR-salao` (migration `0029`)

## Objetivo

Permitir que a loja atenda clientes no salão: organizar as mesas, abrir uma comanda numa mesa, lançar os
itens consumidos conforme o atendimento avança e fechar a conta ao final. O item lançado na comanda sai
do mesmo cardápio dos pedidos e respeita a disponibilidade e o estoque do item.

## Atores

- **Garçom / atendente de salão (dono, gerente ou funcionário autorizado):** abre a comanda, lança itens
  e pede o fechamento.
- **Operador de caixa:** recebe o pagamento da comanda fechada (o recebimento entra no caixa, ver
  `06-caixa-pdv.md`).
- **Dono / gerente:** organiza as mesas e acompanha o salão.

## Histórias

### Mesas

- Como dono, quero cadastrar as mesas do salão com um identificador (número ou nome), para organizar o
  atendimento presencial.
- Como dono, quero ver o estado de cada mesa (livre ou ocupada), para enxergar o salão de relance.

### Comanda

- Como garçom, quero abrir uma comanda numa mesa, para começar a registrar o consumo daquele atendimento.
- Como garçom, quero lançar itens do cardápio na comanda ao longo do atendimento, para acumular o
  consumo da mesa.
- Como garçom, quero remover um item lançado por engano enquanto a comanda está aberta, para corrigir sem
  refazer a comanda.
- Como garçom, quero ver o total parcial da comanda a qualquer momento, para informar o cliente.

### Fechamento

- Como garçom, quero fechar a comanda, para apresentar a conta e liberar a mesa.
- Como operador, quero que o pagamento da comanda fechada entre no caixa na forma de pagamento usada,
  para o dinheiro do salão fechar junto com o do balcão.

## Regras

1. **Uma comanda aberta por mesa por vez:** uma mesa ocupada tem uma comanda aberta. Abrir uma comanda
   ocupa a mesa; fechar a comanda libera a mesa. (A divisão de comandas ou várias comandas por mesa é
   evolução futura, fora deste escopo inicial.)
2. **Item da comanda sai do cardápio:** cada item lançado referencia um item do cardápio e grava um
   retrato do nome e do preço no momento do lançamento, para o total não mudar se o cardápio mudar depois.
3. **Respeita disponibilidade e estoque:** lançar um item respeita o mesmo cardápio dos pedidos; item
   inativo ou esgotado não é lançado. A baixa de estoque do item e de insumos segue as mesmas regras da
   venda (ver `03-estoque-item-cardapio.md` e `04-ficha-tecnica.md`).
4. **Correção só com a comanda aberta:** itens podem ser adicionados ou removidos enquanto a comanda está
   aberta. Depois de fechada, a comanda não muda; correção é um lançamento registrado, nunca apagar o
   histórico.
5. **Total em centavos:** o total da comanda é a soma dos itens lançados, em centavos. Horários em
   America/Sao_Paulo.
6. **Pagamento entra no caixa:** o recebimento da comanda fechada é registrado no caixa aberto da loja,
   na forma de pagamento usada (ver `06-caixa-pdv.md`).
7. **Remoção de mesa é lógica:** uma mesa é desativada, nunca apagada, para preservar o histórico de
   comandas. Não se desativa mesa com comanda aberta.
8. **Multi-tenant:** mesas e comandas são por loja; cada loja gerencia o seu salão.

## Critérios de aceite

- Abrir uma comanda numa mesa livre a deixa ocupada; fechar a comanda a deixa livre de novo.
- Não é possível abrir uma segunda comanda numa mesa que já tem comanda aberta.
- Lançar itens na comanda acumula o total parcial; remover um item lançado atualiza o total enquanto a
  comanda está aberta.
- Um item inativo ou esgotado não pode ser lançado na comanda.
- O preço do item na comanda é o do momento do lançamento e não muda se o cardápio mudar depois.
- Fechar a comanda congela os itens e o total; a comanda fechada não aceita alterações.
- O pagamento da comanda entra no caixa da loja na forma usada.
- Um usuário de uma loja não vê mesas nem comandas de outra loja.

## Estados e transições

- **Mesa:** `livre` <-> `ocupada` (ocupada quando há comanda aberta). `ativa` -> `inativa` (desativada,
  somente sem comanda aberta) -> `ativa`.
- **Comanda:** `aberta` (lançando itens) -> `fechada` (conta apresentada, mesa liberada). Não volta de
  `fechada` para `aberta`.
- **Item lançado:** adicionado e removível enquanto a comanda está `aberta`; congelado quando a comanda
  fecha.
