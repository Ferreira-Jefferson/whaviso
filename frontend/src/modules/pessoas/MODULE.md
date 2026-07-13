# pessoas (frontend)

## Propósito
Visão por pessoa/contato (E15): tela de detalhe de uma pessoa (rota `/app/pessoa/:avisoId`)
com os quatro totais e todos os combinados daquele NÚMERO, agrupados por nome, mais o
atalho "Novo combinado" (pré-preenche nome/telefone via state de navegação, nunca na URL).

A identidade é o TELEFONE (o nome é rótulo): a rota carrega um id de COMBINADO (UUID) e a
api resolve o telefone no servidor (H15.1/H15.7). Só leitura + solicitação (H9.8).

## Entry points
- `index.ts`: `PessoaPage` (lazy), montada em `app/router.tsx` sob `/app`
- `api.ts`: hooks TanStack Query (usePessoaResumo, usePessoaCombinados)
- `pages/Pessoa.tsx`: tela (reaproveita StatCard/TableResponsive/StatusBadge de `@/shared/ui`)

## Fronteiras
- NÃO importa outros módulos (lint feature-first). Reaproveita só `@/shared/*`.
- A entrada "Ver tudo com [nome]" vem do painel (module painel) e do detalhe do combinado
  (module avisos), que apenas navegam para esta rota por id de combinado.

## Contratos
- `@/shared/contracts`: pessoaResumoResposta, pessoaCombinadosResposta.
