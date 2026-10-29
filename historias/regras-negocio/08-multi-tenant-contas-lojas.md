# Regra de negócio: Multi-tenant (Contas e Lojas)

> Histórias de usuário para o modelo multi-tenant: uma Conta (o cliente do whaviso) tem várias Lojas (por
> exemplo, 2 restaurantes e 1 lanchonete); o cliente cadastra e gerencia cada loja e tem visão geral da
> rede; a plataforma (dono do whaviso) gerencia todos os clientes de um console central. É o kernel que
> todos os demais domínios herdam: tudo é por loja de uma conta.

- **Domínio:** multi-tenant (Conta -> Lojas -> acesso; console da plataforma)
- **Módulos de execução relacionados:** `API-conta`, `API-lojas`, `API-numeros`, e a área de plataforma
  (`P-clientes`, `P-cobranca`, `P-funil`, `P-painel`)

## Objetivo

Estabelecer que o cliente do whaviso é uma Conta que pode ter várias Lojas, que cada pessoa acessa
apenas as lojas do seu escopo, e que a plataforma (operador do whaviso) administra todos os clientes
centralmente, sem enxergar o conteúdo privado de cada loja. É a fronteira de isolamento que protege os
dados de um cliente dos de outro.

## Atores

- **Dono da conta (cliente):** cadastra a própria empresa, cria e gerencia as lojas, convida membros e
  tem a visão geral da rede.
- **Gerente de loja:** gerencia uma ou mais lojas do seu escopo; não administra a conta inteira.
- **Operador de loja:** opera o dia a dia de uma loja (pedidos, salão, caixa) dentro do seu escopo.
- **Operador da plataforma (whaviso):** administra todos os clientes de um console central: contas,
  assinatura/cobrança, funil de aquisição e métricas de crescimento. Não vê conteúdo privado de loja.

## Hierarquia

- **Conta** é o cliente (uma empresa). Uma conta tem uma ou mais **Lojas**.
- **Loja** é uma unidade operacional (um restaurante, uma lanchonete), cada uma com seu cardápio,
  pedidos, equipe, caixa, salão, disponibilidade, números de WhatsApp e demais dados.
- **Membro** é a pessoa que faz login no painel, com papel e escopo (quais lojas acessa). É distinto de
  **funcionário** (dado de equipe, ver `01-funcionarios-cargos-escala.md`).
- **Plataforma** é o whaviso como operadora do SaaS: trata cada conta como um cliente.

## Histórias

### Cliente (dono da conta)

- Como dono da conta, quero cadastrar a minha empresa, para ter minha conta no whaviso.
- Como dono da conta, quero criar várias lojas (por exemplo, 2 restaurantes e 1 lanchonete), para
  gerenciar toda a minha operação num lugar só.
- Como dono da conta, quero gerenciar cada loja individualmente (cardápio, equipe, disponibilidade,
  caixa, salão), para cada unidade ter a sua configuração.
- Como dono da conta, quero uma visão geral de todas as minhas lojas, para comparar as unidades e
  acompanhar a rede.
- Como dono da conta, quero convidar membros e definir quais lojas cada um acessa e com qual papel, para
  controlar quem faz o quê.

### Membro de loja

- Como gerente, quero acessar apenas as lojas do meu escopo, para não ver nem mexer no que não é meu.
- Como operador, quero operar o dia a dia da minha loja (pedidos, salão, caixa) dentro do meu papel, para
  trabalhar sem acesso a configurações que não me cabem.

### Plataforma (operador do whaviso)

- Como operador da plataforma, quero ver e administrar todos os clientes (contas) de um console central,
  para gerir o negócio do SaaS.
- Como operador da plataforma, quero acompanhar assinatura, cobrança e métricas de crescimento (lojas
  ativas, receita recorrente, churn), sem acessar o conteúdo privado de nenhuma loja.

## Regras

1. **Isolamento por conta e por loja:** todo dado de operação pertence a uma loja de uma conta. Ninguém
   acessa dados de uma conta ou de uma loja fora do seu escopo. Essa fronteira vale para todos os
   domínios (cardápio, pedidos, equipe, estoque, caixa, salão, disponibilidade).
2. **Escopo do membro define o acesso:** o que um membro vê e faz é determinado pelo seu papel (dono,
   gerente, operador) e pelas lojas do seu escopo, resolvido pelo servidor. Conta e loja vêm do escopo,
   nunca do corpo da requisição. O detalhe de qual papel pode cada tela vive na grade de permissões
   editável (ver `10-acessos-permissoes.md`); a administração da conta e a desativação de loja ficam fora
   dessa grade, fixas de dono.
3. **Pedir recurso fora do escopo não confirma existência:** acessar uma loja ou conta fora do escopo
   responde como inexistente, para não revelar que o recurso existe.
4. **Visão geral da rede é do cliente:** o dono da conta vê o consolidado das suas lojas. Essa visão não
   cruza para outras contas.
5. **A plataforma vê o negócio, não o conteúdo:** o operador do whaviso administra contas, assinaturas e
   métricas agregadas, mas não lê o conteúdo privado da loja (conversas, clientes finais, dados
   sensíveis). O acesso da plataforma é separado do acesso de membro de loja.
6. **Membro é distinto de funcionário:** quem acessa o painel é membro; a equipe operacional da loja são
   funcionários (ver `01-funcionarios-cargos-escala.md`). Uma pessoa pode ser os dois, mas os cadastros
   não se confundem.
7. **Remoção é lógica:** conta e loja são desativadas, nunca apagadas, para preservar o histórico. Não se
   desativa a última loja ativa de uma conta sem intenção explícita.
8. **Dados sensíveis protegidos:** telefone (de cliente final e de equipe), chave Pix, token e dados de
   convite seguem as regras de proteção do produto e nunca aparecem em log.

## Critérios de aceite

- Uma conta pode ter várias lojas, cada uma com cardápio, equipe, caixa, salão e disponibilidade
  próprios.
- Um membro só enxerga e opera as lojas do seu escopo; outra loja da mesma conta fora do seu escopo não
  aparece.
- Um membro de uma conta nunca acessa dados de outra conta.
- O dono da conta tem uma visão geral que soma as suas lojas e não cruza para outras contas.
- O operador da plataforma administra todas as contas e vê métricas agregadas, sem acessar conteúdo
  privado de nenhuma loja.
- Acessar uma loja fora do escopo responde como inexistente, não como acesso negado que confirme a
  existência.
- Desativar uma loja ou conta não apaga o histórico.

## Estados e transições

- **Conta:** `ativa` -> `inativa`/`suspensa` (por decisão do dono ou por cobrança da plataforma) ->
  `ativa`. A suspensão por cobrança é da plataforma e é distinta da desativação pelo dono.
- **Loja:** `ativa` -> `inativa` (desativada pelo dono) -> `ativa`. A última loja ativa de uma conta não
  é desativada sem intenção explícita.
- **Membro (acesso):** `convidado` -> `ativo` (aceitou) -> `inativo` (acesso revogado). O detalhe de
  convite e aceite é do domínio de conta/membros.
