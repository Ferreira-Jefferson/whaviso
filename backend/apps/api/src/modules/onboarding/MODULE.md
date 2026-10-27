# onboarding

## Proposito
Onboarding guiado da loja: checklist (perfil, numero conectado, cardapio, primeiro pedido) e a
metrica "tempo ate o 1o pedido". Read-model calculado de dados existentes; nada e gravado.

## Entry points
- `index.ts`: `onboardingRoutes` (prefixo `onboarding` em `src/routes.ts`).
- Rota (`/v1/onboarding`): `GET /` da loja ativa (`x-loja-id`), permissao `loja:gerir`.

## Tabelas
- escreve: nenhuma (sem migration).
- le de: `lojas` (endereco, horarios, criado_em), `numeros_whatsapp` (so status/criado_em, nunca
  `token_cifrado`), `itens`, `pedidos` (so status/criado_em).

## Definicao de "etapa feita"
- perfil: `endereco` preenchido e ao menos um dia aberto em `horarios`.
- numero: algum numero com status `conectado`.
- cardapio: algum item `ativo`.
- primeiro_pedido: algum pedido fora de `rascunho`.
- inicio = `lojas.criado_em`; tempo ate 1o pedido = diferenca em minutos.

## Decisoes
- Sem tabela/coluna: etapa nao e dispensavel nem persistida; `perfil` nao tem `concluida_em`.
- Metrica agregada da plataforma (mediana por coorte) fica fora; cabe ao console da plataforma.
