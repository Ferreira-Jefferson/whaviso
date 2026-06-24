# whaviso: Histórias de Usuário

> **Objetivo:** descrever o sistema do ponto de vista de quem usa, em histórias testáveis, para depois validar o que já está implementado e o que falta.
> **Fonte de verdade:** estas histórias. Quando o código ou os docs (PROJETO.md / CLAUDE.md) divergirem do que está aqui, é o código/doc que deve mudar, não a história. Sempre que uma divergência aparecer, ela é sinalizada (ver legenda de validação) e explicada.
> **Base de consulta:** [PROJETO.md](../PROJETO.md) (visão de produto) e [CLAUDE.md](../CLAUDE.md) (regras e arquitetura) servem de referência, não de autoridade sobre as histórias.
> **Status:** 13 épicos escritos (fase 1 concluída). Próxima fase: validar cada história contra o código (legenda de validação).
> **Linguagem:** sem travessão (regra de ouro do produto). Sem "dívida/cobrança/atraso/devendo/inadimplência". Mensagens **neutras quanto a gênero** (ver convenções abaixo).

## Como ler

Cada história segue o formato:

> Como **[ator]**, quero **[ação]**, para **[benefício]**.
> *Critérios de aceite:* condições objetivas e testáveis.

Os **critérios de aceite** são o que será conferido contra o código na fase de validação.

### Atores

- **Cobrador**: quem vai receber. Tem conta. Cria no fluxo *receber*.
- **Devedor**: quem vai pagar e recebe os lembretes. Em geral sem conta, só interage por botões no WhatsApp.
- **Criador-devedor**: no fluxo *pagar invertido*, cria o combinado e convida o cobrador.
- **Convidado**: aceita ou recusa pelo WhatsApp, sem login.
- **Owner/Admin**: gerencia templates de mensagem e catálogo de planos.
- **Sistema (zap/scheduler)**: dispara lembretes e drena filas (histórias "de sistema").

### Legenda de escopo

- 🟢 **MVP**: faz parte do produto ativo (Baileys já habilita o canal WhatsApp).
- 🟡 **Gated/Futuro**: previsto, mas ainda não ligado (depende de Meta oficial, billing real, etc.).

### Legenda de validação (preenchida na fase 2)

- `[ ]` **não verificado**: ainda não conferimos contra o código.
- `[x]` **implementado e conferido**: existe e bate com a história.
- `[~]` **parcial**: existe parte do que a história pede; falta completar.
- `[!]` **diverge (refatorar)**: já existe algo implementado, mas precisa ser **refatorado** para o que o épico define. Não é "fazer do zero", é "mudar o que tem para bater com a história".
- `[+]` **não existe**: a história ainda não tem nada implementado; precisa ser construída.

### Convenções de mensagens (valem em todos os épicos)

Regras transversais para qualquer texto que chega ao usuário (WhatsApp, UI, e-mail):

- **Sem travessão** e **sem palavras proibidas** (dívida/cobrança/atraso/devendo/inadimplência), inclusive no banco e na API.
- **Neutras quanto a gênero:** nunca inferir o gênero de quem recebe. Evitar artigos e pronomes que assumam masculino/feminino. Preferir o nome direto e construções neutras (ex.: *"aqui é [nome]"* em vez de *"sou a/o [nome]"*; *"[pessoa] pausou"* em vez de *"o/a [pessoa] pausou"*; *"até ser reativado"* em vez de *"até ele/ela reativar"*).
- **Resposta neutra padrão** a quem responde por botão quando não há ação imediata, ex.: *"Certo, vamos comunicar sua resposta."*
- **Três opções no aceite** (todos os fluxos): aceitar / **algum dado está incorreto** / recusar. "Dado incorreto" não coleta texto livre, só notifica o criador (ver Épicos 2, 3 e 5).
- **Opt-out visível** em toda mensagem (regra de ouro); detalhe no Épico 13.

> Esta lista de convenções deve ser refletida nas regras de ouro do produto (`contracts/linguagem.ts` no backend e dicionário de linguagem do front) na fase de implementação; o gênero neutro é uma adição que hoje pode não estar garantida no código.

## Índice de épicos

| # | Épico | Arquivo | Status |
|---|---|---|---|
| 1 | Conta & Autenticação | [01-conta-autenticacao.md](01-conta-autenticacao.md) | escrito |
| 2 | Criar combinado (fluxo receber) | [02-criar-combinado-receber.md](02-criar-combinado-receber.md) | escrito |
| 3 | Criar combinado (fluxo pagar invertido) | [03-criar-combinado-pagar.md](03-criar-combinado-pagar.md) | escrito |
| 4 | Modo agenda (cadastrar sem enviar e ativar depois) | [04-modo-agenda.md](04-modo-agenda.md) | escrito |
| 5 | Convite & Aceite pelo WhatsApp | [05-convite-aceite.md](05-convite-aceite.md) | escrito |
| 6 | Ciclo de lembretes (D-2 a D+1) | [06-ciclo-lembretes.md](06-ciclo-lembretes.md) | escrito |
| 7 | Interação do devedor (Já paguei / Chave de Pag. / Desativar) | [07-interacao-devedor.md](07-interacao-devedor.md) | escrito |
| 8 | Confirmação de pagamento (informado_pago) | [08-confirmacao-pagamento.md](08-confirmacao-pagamento.md) | escrito |
| 9 | Painel de controle | [09-painel.md](09-painel.md) | escrito |
| 10 | Notificações ao cobrador | [10-notificacoes-cobrador.md](10-notificacoes-cobrador.md) | escrito |
| 11 | Planos, limites e billing | [11-planos-billing.md](11-planos-billing.md) | escrito |
| 12 | Templates / mensagens (admin) | [12-templates-admin.md](12-templates-admin.md) | escrito |
| 13 | Linguagem, opt-out e compliance | [13-compliance.md](13-compliance.md) | escrito |
| 14 | Cadastro da chave de pagamento pelo cobrador (fluxo invertido) | [14-cadastro-chave-pix-cobrador.md](14-cadastro-chave-pix-cobrador.md) | escrito |

## Dívidas técnicas levantadas durante a escrita

- **Remover aceite via site:** página pública `/aceite/:token` e a rota `POST` pública de aceite devem sair do código. O aceite passa a ser **100% pelo WhatsApp** (ver Épico 5). *Pendente de execução na fase de implementação.*
- **Estudo de UX da cadência configurável (H6.10):** dar ao criador total flexibilidade de janela/cadência de envio (por dia/semana/mês ou datas avulsas) sem poluir a tela exige estudo de design e modelagem de dados. *Pendente.*
- **Renomear estado `pendente` → `programado`:** já aplicado nas histórias (épicos 2, 3, 5 e 6). Falta a varredura no **código** (máquina de estados: trigger no banco + app) e em **PROJETO.md/CLAUDE.md** (ver Épico 6). *Pendente na fase de implementação.*
- **Fila de saída com espaçamento de 10 min + cancelamento (Épico 10 H10.9):** ponto **crítico**. Espaçar envios ao mesmo destinatário e anular itens superados (par opt-out/reativação, item obsoleto por estado terminal), nas duas outboxes, só com banco (sem Redis). Exige **testes dedicados** de corrida para não cancelar o que não devia. Soma-se à distância de 10 min por devedor no agendamento (Épico 6 H6.9). *Pendente.*
- **Catálogo de planos diverge do PROJETO.md (Épico 11):** PROJETO.md (seção 8) descreve pessoal/profissional; as histórias decidiram **4 planos (Free/Start/Profissional/Plus)** com a **agenda como balde único** (50/100/150/10-por-unidade). Reescrever PROJETO.md seção 8, mover limites para **migration** (não hardcode/seed) e ligar recursos (recorrência/cadência/menu/confirmação) às alavancas do plano. Preços = os de hoje (Free R$ 0, Start R$ 9,90, Profissional R$ 29/49, Plus por unidade). *Pendente.*
