# Épico 13: Linguagem, opt-out e compliance

> Este épico junta as **regras de ouro** que valem em todos os outros: como o Whaviso fala (linguagem), como respeita quem não quer mais ser avisado (opt-out) e o que ele nunca faz (logar dado sensível, conversar, insistir em quem já saiu).
> Não é um épico de telas novas: é o conjunto de **invariantes** que qualquer outra história tem que respeitar. Aqui descrevemos o "porquê" e o "onde se garante".
> **Escopo das regras de linguagem:** valem em tudo que chega ao produto, ao usuário e ao código (templates, copy de UI, mensagens do `zap`, nomes no banco, mensagens de erro da API, comentários de código). **Não** valem para documentação interna de trabalho (estas histórias, notas, planos).
> Fonte única na implementação: **`contracts/linguagem.ts`** (backend) e o **dicionário de linguagem do front**, espelhados, mais o **lint** que barra violação.

---

### H13.1: Palavras proibidas 🟢
Como **dono do produto**, quero banir o vocabulário de cobrança em tudo que sai e no código, para o Whaviso nunca soar como uma central de dívida.
*Critérios de aceite:*
- [ ] As palavras **"dívida", "devendo", "atraso", "cobrança", "inadimplência"** (e variações óbvias) **nunca** aparecem em: templates, copy de UI, mensagens do `zap`, **nomes no banco**, mensagens de erro da API.
- [ ] O vocabulário aprovado é **"aviso / lembrete / combinado"**; é o que se usa em todo lugar.
- [ ] A regra vale também em **comentários de código** e identificadores.
- [ ] Mudar o vocabulário padrão exige atualizar **juntos**: a migration de linguagem (`0006`), o `contracts/linguagem.ts` do backend e o dicionário de linguagem do front (CLAUDE.md).
- [ ] A regra **não** se aplica a docs internas de trabalho (estas histórias, notas, planos).

---

### H13.2: Sem travessão 🟢
Como **dono do produto**, quero proibir o travessão em tudo que chega ao produto e ao código, porque é marca de texto gerado por IA.
*Critérios de aceite:*
- [ ] O caractere de travessão (em dash) **nunca** aparece em código, copy, comentários, mensagens nem textos exibidos no front.
- [ ] No lugar dele se usa vírgula, dois-pontos, parênteses ou se reescreve a frase.
- [ ] A regra **não** se aplica a docs internas de trabalho (estas histórias, notas, planos).

---

### H13.3: Mensagens neutras quanto a gênero 🟢
Como **pessoa que recebe**, quero mensagens que não presumam meu gênero, porque o Whaviso não sabe e não deve adivinhar quem está do outro lado do número.
*Critérios de aceite:*
- [ ] **Toda** mensagem ao usuário (WhatsApp, UI, e-mail) é **neutra quanto a gênero**: nunca infere o gênero de quem recebe.
- [ ] Evita artigos e pronomes que assumam masculino/feminino; prefere o **nome direto** e construções neutras (ex.: *"aqui é [nome]"* em vez de *"sou a/o [nome]"*; *"[pessoa] pausou"* em vez de *"o/a [pessoa] pausou"*; *"até ser reativado"* em vez de *"até ele/ela reativar"*).
- [ ] A regra vale para **templates, front e mensagens do `zap`** por igual.
- [ ] É espelhada em `contracts/linguagem.ts` (backend) e no dicionário do front (hoje pode não estar garantida no código, ver divergência).

---

### H13.4: Opt-out visível em toda mensagem 🟢
Como **pessoa que recebe lembretes**, quero ter sempre, em toda mensagem, um jeito claro de parar, para nunca me sentir presa a algo que não quero.
*Critérios de aceite:*
- [ ] **Toda** mensagem do ciclo carrega o botão de **parar de receber** (opt-out sempre visível, regra de ouro), ver Épico 6 e 7 H7.4.
- [ ] O opt-out é **um toque** (botão "Desativar lembretes"), sem precisar digitar nem justificar.
- [ ] O rótulo do opt-out é editável pelo owner (Épico 12), mas a presença dele **não** é opcional.
- [ ] A linguagem do opt-out segue as regras (neutra, sem palavras proibidas).

---

### H13.5: Opt-out reversível, por combinado 🟢
Como **pessoa que parou os lembretes**, quero poder voltar atrás e que minha saída valha só para aquele combinado, para não perder os outros nem ficar travada.
*Critérios de aceite:*
- [ ] Tocar opt-out leva ao estado **`desregistrado`** (não-terminal, reversível), distinto de `pausado` (quem pausa é o criador), `cancelado` (criador cancela) e `recusado` (convidado recusa o convite), ver Épico 7 H7.4/H7.5.
- [ ] A saída afeta **somente o combinado** daquele botão; os outros combinados do mesmo número seguem normais.
- [ ] O opt-out **não apaga** o combinado (regra de não-DELETE); registra evento de auditoria (append-only).
- [ ] A reativação (botão "Ativar lembretes") devolve a pessoa ao ciclo (`desregistrado → programado`), ver Épico 7 H7.5.

---

### H13.6: Estado terminal nunca mais envia 🟢
Como **pessoa que já resolveu (ou cancelou) um combinado**, quero não receber mais nada sobre ele, para o Whaviso nunca insistir no que acabou.
*Critérios de aceite:*
- [ ] Em estado **terminal** (`pago`, `cancelado`, `recusado`, `expirado`) o combinado **nunca mais envia** lembrete nem mensagem (Épico 6 / Épico 7 H7.7).
- [ ] Botão tocado num combinado terminal **não reabre** nem dispara ação; no máximo uma resposta neutra de "já encerrado" (respeitando a cortesia free/pago, H7.1).
- [ ] `desregistrado` **não** é terminal (ainda pode reativar), mas também não envia enquanto estiver nele.
- [ ] A regra é garantida no servidor (o `zap` não monta envio para combinado terminal), não só na UI.

---

### H13.7: O devedor não conversa (sem chat, IA ou Pix automático) 🟢
Como **dono do produto**, quero que o devedor só interaja por botões, para o Whaviso não virar um canal de conversa nem assumir responsabilidade sobre pagamento.
*Critérios de aceite:*
- [ ] O devedor **só age por botão**; não há chat humano, IA, nem Pix automático (Épico 7 H7.1).
- [ ] Texto livre do devedor: **silêncio** no free/sem conta; **menu de opções** no pago (Épico 7 H7.1).
- [ ] O Whaviso **não confirma pagamento sozinho**: quem confirma é sempre o cobrador (Épico 8); "Já paguei" é só um aviso, não muda dinheiro.
- [ ] Nenhuma automação financeira (cobrar, dar baixa, mover valor) existe: o Whaviso **avisa e organiza**, não transaciona.

---

### H13.8: Nunca logar dado sensível 🟢
Como **dono do produto**, quero garantir que telefone, chave Pix e token nunca apareçam em log, para proteger quem usa mesmo em caso de vazamento de log.
*Critérios de aceite:*
- [ ] **Telefone, chave Pix (e titular/banco) e token** nunca aparecem em log, em nenhum dos serviços (`api`, `zap`). Vale também para a **chave Pix DA PLATAFORMA** (recebimento de recarga, config do owner): nunca é logada, NÃO volta para o usuário no HTTP, e só viaja na mensagem de compra empurrada ao WhatsApp (o `zap` a lê da config no envio; ver Épico 11 H11.10).
- [ ] Tokens vivem **só como hash sha256** no banco; o valor claro nunca é persistido (CLAUDE.md).
- [ ] O payload do botão do WhatsApp leva **`aviso_id`** (webhook HMAC-autenticado), nunca o token.
- [ ] Erros da API usam o envelope `{ error: { code, message } }` e a mensagem **não** vaza dado sensível.
- [ ] Quando houver gateway de pagamento (🟡 futuro), o mesmo vale para dados de cartão/pagamento.

---

### H13.9: Fonte única de linguagem (contrato espelhado) 🟢
Como **time**, quero as regras de linguagem num lugar único de cada lado, para não divergirem entre backend e front com o tempo.
*Critérios de aceite:*
- [ ] O backend tem **`contracts/linguagem.ts`** com o vocabulário aprovado, as palavras proibidas e as construções neutras de referência.
- [ ] O front tem um **dicionário de linguagem** espelhando o do backend (o front não importa `@whaviso/shared`, tem contratos próprios, CLAUDE.md).
- [ ] Mudança de padrão de linguagem é feita **junto** nos dois lados (e na migration de linguagem `0006` quando toca dado de banco).
- [ ] O gênero neutro entra nessa fonte única (hoje pode não estar garantido, ver divergência).

---

### H13.10: Garantia automática (lint / validação ao salvar) 🟢 / 🟡
Como **time**, quero que a violação de linguagem seja barrada por ferramenta, não só por revisão humana, para a regra não escapar com o tempo.
*Critérios de aceite:*
- [ ] O **lint** do backend e do front barra travessão e palavras proibidas em código/copy (parte do `npm run lint`, CLAUDE.md).
- [ ] 🟡 Ao **salvar um template** (Épico 12), as regras de linguagem (proibidas, travessão, gênero neutro) são **validadas no servidor**, recusando o salvamento com `{ error: { code, message } }` se violar; confirmar se essa validação já existe.
- [ ] 🟡 A checagem de **gênero neutro** é mais difícil de automatizar; pelo menos os padrões mais comuns (artigos/pronomes gendered) entram numa lista de alerta.
- [ ] A garantia automática complementa, não substitui, a fonte única (H13.9).

---

### Divergências com a definição atual (precisam de refatoração)

- **Gênero neutro pode não estar garantido no código:** a regra está documentada (README, convenções), mas templates/strings podem ter texto gendered. Varrer templates e copy do front, e incluir o gênero neutro em `contracts/linguagem.ts` e no dicionário do front (hoje as regras de linguagem podem cobrir só proibidas/travessão).
- **Validação de linguagem ao salvar template:** o Épico 12 prevê que salvar template valide as regras no servidor; confirmar se existe ou criar (amarra H12.5/H13.10).
- **`desregistrado` como estado reversível:** PROJETO.md trata opt-out como `cancelado` (terminal); as histórias decidiram estado próprio reversível (Épico 7). Refatorar a máquina de estados (trigger + app) e PROJETO.md.

### Decisões tomadas
- **Escopo das regras de linguagem:** valem em código, prompts, templates, front, banco, erros da API; **não** valem em docs internas de trabalho.
- **Vocabulário:** aprovado = aviso/lembrete/combinado; proibido = dívida/devendo/atraso/cobrança/inadimplência.
- **Sem travessão** em nada que chega ao produto/código.
- **Gênero neutro** em toda copy; entra na fonte única de linguagem.
- **Opt-out:** sempre visível, um toque, reversível (`desregistrado`), por combinado, sem DELETE.
- **Estado terminal nunca mais envia;** garantido no servidor.
- **Devedor só por botão;** sem chat/IA/Pix automático; o Whaviso não transaciona dinheiro.
- **Nunca logar** telefone/Pix/titular/banco/token; token só como hash sha256; payload do botão leva `aviso_id`.
- **Fonte única:** `contracts/linguagem.ts` (backend) + dicionário do front, espelhados; mudança feita junto (e na migration `0006` quando toca banco).
- **Garantia automática:** lint barra travessão/proibidas; validação ao salvar template e checagem de gênero neutro são alvos a confirmar/criar (🟡).

### Decisões em aberto
- Nenhuma pendente neste épico.

### Fora de escopo deste épico
- ❌ Mecânica de cada botão/estado (Épicos 6, 7, 8): aqui é a regra transversal, não o fluxo.
- ❌ Edição dos textos em si (Épico 12): aqui é a regra que o texto tem que obedecer, não o conteúdo.
- ❌ LGPD/contratos/termos de uso formais (jurídico), além do que toca linguagem e dado sensível em log.
