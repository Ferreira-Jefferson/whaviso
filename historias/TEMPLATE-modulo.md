# <ID> <nome do módulo>

> Copie este arquivo para a pasta da área e preencha. Um arquivo por módulo. O status vivo das etapas
> mora aqui; o status de módulo (resumo) fica no [STATUS.md](STATUS.md).

- **ID:** <ex.: API-cardapio>  ·  **Área:** <F | API | ZAP | AT | FR | P | SEC>  ·  **Onda:** <0..5>
- **Modelo sugerido:** <Haiku | Sonnet | Opus>  ·  **Status:** `A FAZER | EM ANDAMENTO (rótulo) | CONCLUIDO`
- **Reivindicado por:** <rótulo do subagent, ao começar>

## Objetivo

<O que este módulo entrega, em 2 a 4 linhas. O "pronto" observável: o que passa a funcionar quando
ele estiver concluído.>

## Dependências

<Liste os IDs de que este módulo precisa e por quê. Não comece se alguma não estiver `CONCLUIDO`.>
- `<ID>`: <por quê>

## Contratos e tabelas que toca

<Do BANCO.md e dos contratos: quais tabelas, quais contratos Zod/eventos. Este módulo é dono de
escrita de quais tabelas? Lê quais por read-model?>

## Arquivos (escopo de edição)

<Globs que esta tarefa pode editar. NÃO toque fora disto. Módulo não importa módulo.>
- `backend/apps/<app>/src/modules/<modulo>/**`
- `backend/packages/shared/...` <só se for kernel comum e combinado>

## Etapas

<Granular. Cada etapa pequena o bastante para virar um commit atômico. Marque [x] ao concluir.>
- [ ] <etapa 1>  (commit: `<tipo>(<escopo>): <resumo>`)
- [ ] <etapa 2>
- [ ] Testes de unidade do módulo passando
- [ ] <se UI> transpor do artifact aprovado (link abaixo) sem degradar
- [ ] Revisão (Opus) se tocar segredo/segurança

## Testes e segurança exigidos

<Testes de unidade obrigatórios + os `SEC-###` do SEGURANCA.md que esta superfície precisa fazer
passar. Sem isso, não é `CONCLUIDO`.>

## Design (só para `FR-*`)

<Link do artifact visual aprovado (desktop + mobile). O código segue o artifact. Referências de
inspiração usadas.>

## Notas e decisões

<Decisões tomadas, ambiguidades resolvidas. Travou? Registre a escalada (especialista Opus ou web) e o
que foi decidido, em vez de insistir.>
