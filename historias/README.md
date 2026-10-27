# Plano de trabalho do whaviso

Esta pasta **não guarda histórias de usuário**. Ela é o **plano de execução** do rebuild: um to-do
granular por módulo, com dependências e status, feito para **muitos subagents trabalharem em paralelo**
sem se atrapalhar. A LLM é inteligente o bastante para dispensar o detalhe cerimonial de uma história;
o que ela precisa é saber **o que fazer, em que ordem, de quem depende e quando algo já está pronto**.

## Como ler

- **[STATUS.md](STATUS.md)** é o quadro mestre: o inventário de módulos, o grafo de dependências e as
  ondas. **Comece sempre por ele.**
- Cada módulo tem um arquivo na pasta da sua área (`00-fundacao/`, `backend-api/`, `backend-zap/`,
  `backend-atendente/`, `frontend/`, `plataforma/`, `seguranca/`) com as **etapas detalhadas** e o
  **status marcado em checkboxes**. O status vivo de uma tarefa mora no arquivo do seu módulo.
- **[TEMPLATE-modulo.md](TEMPLATE-modulo.md)** é o formato que todo arquivo de módulo segue.

## Fonte da verdade do produto

Arquitetura, banco e segurança: [../docs/pivot/ARQUITETURA.md](../docs/pivot/ARQUITETURA.md),
[../docs/pivot/BANCO.md](../docs/pivot/BANCO.md), [../docs/pivot/SEGURANCA.md](../docs/pivot/SEGURANCA.md).
O plano aqui **executa** aquilo. Se o plano divergir do produto, aquilo vence (ou escale a dúvida).

## Protocolo de execução (para subagents)

1. **Escolher** uma tarefa cujas dependências estejam **concluídas** (confira no arquivo do módulo da
   dependência). Respeite a onda em STATUS.md.
2. **Reivindicar:** marcar a tarefa como `em andamento` com o seu rótulo no arquivo do módulo. Se já
   estiver reivindicada, pegue outra. Nunca duas pessoas na mesma tarefa.
3. **Tocar só os arquivos declarados** no campo `arquivos` da tarefa. Não editar arquivo de outro
   módulo; a coordenação entre módulos é por **contrato e banco**, nunca por import (o lint barra).
4. **Não esperar parado:** se uma dependência não está pronta, pegue outra tarefa sem essa dependência
   e volte depois.
5. **Concluir em partes pequenas:** rodar os testes exigidos, marcar `[x]`, e fazer um **commit
   atômico** (uma parte = um commit). Não acumular trabalho para commitar junto.
6. **Empacou? Escale, não insista.** Proibido ficar batendo a cabeça na mesma tentativa. Quando houver
   dúvida ou bloqueio, **dispare um subagent especialista (Opus 4.8)** com o objetivo do projeto, ou
   **busque na web** a informação que falta. O que o especialista recomendar é seguido.

## Qualidade (inegociável)

- **Nível profissional, sem trabalho porco.** Back, API, front e segurança, todos bem feitos e
  integrados. É o padrão de um bom profissional de cada área, não o atalho mais simples.
- **Modularização:** módulo nunca importa módulo. Código comum vai para o kernel (`packages/shared`);
  **não reescrever o que já existe**, reusar.
- **Testes de verdade** por módulo (unidade + o que o [SEGURANCA.md](../docs/pivot/SEGURANCA.md)
  exigir). Sem teste passando, a tarefa não está concluída.
- **Convenções do repo:** dinheiro em centavos, datas em America/Sao_Paulo com banco em UTC, telefone e
  segredo só como hash/cifra, **sem travessão (—)**, **sem autoria de IA** em commit ou código.

## Front-end: design primeiro, código depois

Para qualquer tela, **primeiro criar um artifact visual** (bonito, organizado, com desktop e mobile
claros), guiar-se por ele, e **só então** transpor para o código React. Buscar inspiração em referências
de design de produto. O artifact é o espelho da qualidade que o código precisa ter: a mesma tela que
ficou bonita no artifact é a que vai para o código, sem degradar.

## Qual agente para qual tarefa

- **Haiku 4.5:** mecânico e simples (scaffold, boilerplate, CRUD trivial).
- **Sonnet 5.5:** a maioria (implementar um módulo, escrever testes, transpor uma tela do artifact).
- **Opus 4.8:** projeto difícil, decisão ambígua, **revisão (sobretudo de segurança)** e escalonamento
  de dúvida.

Não usar Opus para tudo (bazuca em mosca), nem Haiku onde precisa de juízo. A sagacidade de escolher o
agente certo faz parte do trabalho.

## Commits

Atômicos, por parte concluída, no nome do humano (autor do git). Mensagem sem travessão e sem menção a
modelo de IA. Mexeu em migration? O schema no cloud só muda com `db push` manual, à parte (ver
[../CLAUDE.md](../CLAUDE.md)).
