# Pendências pós corte de produção

Anotações do que falta fazer. Nada aqui foi implementado ainda.

Data do corte: 2026-10-28 (a `main` recebeu o pivô do restaurante e subiu em produção).

---

## Como escrever neste arquivo

Siga estas regras em toda anotação nova:

- Escreva em **português simples**. Use o estilo ASD-STE100, mas sem o rigor total.
  Uns 80% já está ótimo.
- **Frases curtas.** Uma ideia por frase.
- **Voz ativa.** Diga quem faz o quê. Exemplo: "o admin cria o cliente", não
  "o cliente é criado".
- Use **palavras comuns**. Evite termo difícil quando um fácil serve.
- Use o **mesmo termo** para a mesma coisa no texto todo. Não troque de sinônimo.
- **Nunca** use travessão (o traço longo). Use vírgula, dois pontos ou parênteses.
- Todo item segue esta ordem, com estes quatro títulos:
  - **Local:** onde fica (tela, arquivo, serviço).
  - **Como está:** o comportamento de hoje.
  - **Como deveria:** o comportamento desejado.
  - **Exemplo:** um caso concreto e curto (pode ser um bloco de código ou um passo a passo).
- Deixe exemplos **curtos e concretos**. Prefira mostrar a explicar.

---

## 1. Painel "Equipe Whaviso": faltam o e-mail e o método de login

**Local:** console de admin, aba "Equipe Whaviso".
Front: `frontend/src/modules/plataforma_clientes/components/PainelEquipe.tsx`.
Dados: `backend/apps/api/src/modules/plataforma_clientes/repo.ts` (leitura dos operadores).

**Como está:** a tabela mostra só Pessoa, Papel e Desde. Não dá para saber com qual
e-mail cada pessoa entra, nem se é Google ou WhatsApp.

**Como deveria:** mostrar também o **e-mail de acesso** e o **método de login**
(Google, WhatsApp ou E-mail). Assim o admin sabe quem é cada um e como entra.

**Exemplo:**

```
PESSOA   EMAIL             MÉTODO     PAPEL          DESDE
xyz      xyz@gmail.com     Google     Administrador  14/07/2026
abc      abc@whaviso.com   WhatsApp   Administrador  14/07/2026
```

Observação: o e-mail e o provedor vêm de `auth.users` (campo `email`) e de
`auth.identities` (campo `provider`). A leitura do operador precisa juntar essas
tabelas (hoje ela não traz esses campos).

---

## 2. "Adicionar à equipe" deveria aceitar e-mail, não o UUID

**Local:** console de admin, aba "Equipe Whaviso", botão "Adicionar à equipe".
Front: `PainelEquipe.tsx` (o formulário).
Back: `backend/apps/api/src/modules/plataforma_clientes/routes.ts` e `service.ts`
(rota `POST /v1/plataforma-clientes/operadores`).

**Como está:** o formulário pede o **Id do usuário** (um UUID do Auth). O admin
precisa descobrir esse UUID no banco antes. Não existe busca por e-mail na tela.

**Como deveria:** o admin digita o **e-mail** da pessoa. O servidor acha o `user_id`
desse e-mail e cria o operador. Se o e-mail ainda não logou nenhuma vez, o servidor
avisa com uma mensagem clara (a pessoa precisa entrar uma vez primeiro, para existir
no Auth).

**Exemplo:**

```
Campo "E-mail":  fulano@gmail.com
Campo "Nome":    Fulano da Silva
Campo "Papel":   Operador

Se o e-mail nunca entrou:
  "Esta pessoa ainda não acessou o Whaviso. Peça para ela entrar uma vez e tente de novo."
```

---

## 3. Provisionar restaurante cliente pelo console (vender plano)

**Local:** console de admin, aba "Contas".
Back: já existe `POST /v1/conta` (cria conta + membro dono) e o módulo `convites`.
Falta a ligação no console.

**Como está:** o admin vê a lista de contas, mas **não tem como criar** um restaurante
cliente novo. Hoje isso só é possível mexendo direto no banco. O fluxo "vendi um
plano, agora libero o acesso do dono" não existe na tela.

**Como deveria:** o admin cria o cliente no console: informa o restaurante e o e-mail
do dono. O sistema cria a conta, a primeira loja e vincula o dono (por convite ou
vínculo direto). Depois o dono entra e já cai na loja dele.

**Exemplo:**

```
Botão "Novo cliente":
  Restaurante:   Pizzaria do Zé
  E-mail do dono: ze@pizzaria.com
  Plano:         (o que for)

Resultado:
  conta "Pizzaria do Zé" criada
  loja criada e ativa
  ze@pizzaria.com vira dono
  ao entrar, ele vê o painel da loja (não mais "sem acesso a nenhuma loja")
```

---

## 4. Cliente novo não consegue criar a própria conta/loja no front

**Local:** fluxo do dono de loja (não admin).
Front: `frontend/src/modules/lojas/` (botão "Criar loja").
Back: `POST /v1/lojas` exige conta de dono prévia; `POST /v1/conta` faz o bootstrap,
mas **nada no front chama** `POST /v1/conta`.

**Como está:** um usuário logado sem conta clica em "Criar loja" e toma erro 403
("Apenas o dono da conta pode fazer isto"). Beco sem saída.

**Como deveria:** decidir o modelo e deixar coerente. Duas opções:
(a) Só o admin provisiona (item 3). Então o dono nunca cria loja sozinho, e a tela
mostra uma mensagem explicando isso, sem botão que leva a erro.
(b) O dono pode criar a primeira loja sozinho. Então o front chama `POST /v1/conta`
antes de `POST /v1/lojas`.

Hoje o produto parece ser o modelo (a): o admin cadastra. Então o mais provável é
ajustar a tela do dono para não oferecer "Criar loja" quando não há conta.

**Exemplo:**

```
Usuário sem conta abre /lojas:
  Hoje:    botão "Criar loja" -> clica -> erro 403
  Modelo (a): sem botão; texto "Sua loja é liberada pela equipe Whaviso."
```

---

## 5. Serviço do atendente (IA/RAG) não existe em produção

**Local:** VPS (systemd) e `/etc/whaviso/`.

**Como está:** o servidor roda só `whaviso-api` e `whaviso-zap`. Não há
`whaviso-atendente` (porta 3003). O atendente de IA e o RAG não funcionam em produção.

**Como deveria:** criar a unit `whaviso-atendente` e o arquivo
`/etc/whaviso/atendente.env`. Esse `.env` precisa de: `MASTER_KEY` (a mesma da api e
do zap), `LLM_MASTER_KEY`, `OPEN_ROUTER` (chave da plataforma para embeddings/RAG) e
`DATABASE_URL` do papel `whaviso_atendente`.

**Exemplo:**

```
/etc/systemd/system/whaviso-atendente.service  (nova unit, igual às outras)
/etc/whaviso/atendente.env:
  MASTER_KEY=...        (igual api/zap)
  LLM_MASTER_KEY=...
  OPEN_ROUTER=...
  DATABASE_URL=...      (papel whaviso_atendente)
```

---

## 6. Backup do banco está falhando em produção

**Local:** VPS, serviço `whaviso-backup.service`.

**Como está:** o serviço aparece como `failed`. O backup do banco pode não estar
rodando.

**Como deveria:** achar a causa da falha e deixar o backup voltar a rodar no horário.
Ver a memória [[whaviso-backup-banco]].

**Exemplo:**

```
systemctl status whaviso-backup  -> deveria terminar sem erro no horário agendado
```

---

## 7. Badge "Offline" (tempo real) no painel em produção

**Local:** shell do painel (canto superior), conexão SSE do realtime.

**Como está:** o painel mostra "Offline" no topo. A conexão de tempo real (SSE) não
sobe. No dev isso vinha de um erro de CORS no `/realtime/stream` (cabeçalho não
liberado no preflight). Falta confirmar se é a mesma causa em produção.

**Como deveria:** o tempo real conecta e o badge fica "Online". Pedidos e conversas
atualizam sozinhos, sem recarregar a página.

**Exemplo:**

```
Topo do painel:  "Online" (verde), em vez de "Offline"
```

---

## 8. Limpar operadores de teste antigos

**Local:** tabela `public.operadores` (banco).

**Como está:** existem operadores de teste antigos ativos
(`jeffersonkira1500@gmail.com`, `qa@whaviso.com`). Eles têm papel admin.

**Como deveria:** revisar quem deve continuar. Operador não se apaga; sai da equipe
com `ativo = false`. Fazer isso pelo console (aba Equipe) quando o item 1 e 2
estiverem prontos, ou direto no banco se precisar antes.

**Exemplo:**

```
Na aba Equipe:  desativar os logins de teste que não forem usar
```

---

## 9. Não dá para trocar entre a visão de loja e o console da plataforma

**Local:** os dois shells do app.
Front: `frontend/src/app/layouts/OperadorShell.tsx` (console da plataforma) e o shell
da loja (mesma pasta `frontend/src/app/layouts/`). O menu de cada um.

**Como está:** ao entrar, o usuário cai na tela de pedidos da loja. De lá não há
nenhum link para ir ao `/plataforma`. E, estando no `/plataforma`, o menu não tem
como voltar para a visão de loja. As duas áreas ficam isoladas.

**Como deveria:** quem tem acesso às duas áreas (por exemplo um operador que também
é membro de uma loja) consegue trocar de uma para a outra. Cada menu mostra um link
ou um botão para a outra área.

**Exemplo:**

```
No menu da loja:      item "Console da plataforma"  -> leva para /plataforma
No menu do console:   item "Ver loja"               -> leva para a visão de loja

Regra: o link só aparece para quem tem acesso àquela área.
Quem é só operador (sem loja) não vê "Ver loja".
Quem é só dono de loja (sem operador) não vê "Console da plataforma".
```

---

## 10. Falta uma landing page em https://whaviso.com/

**Local:** rota raiz do app.
Front: `frontend/src/app/arvore.tsx` (a rota `/`, que hoje faz `Navigate` para a home).

**Como está:** quem abre `https://whaviso.com/` é redirecionado na hora. A raiz manda
para a home (`/pedidos`). Sem sessão, o guard manda para o login. Resultado: cai em
`https://whaviso.com/entrar?next=%2Fpedidos`. Não existe uma página pública de
apresentação.

**Como deveria:** `https://whaviso.com/` mostra uma **landing page** pública. Ela
apresenta o produto e tem um botão "Entrar". Só quem clica em Entrar vai para o login.

**Exemplo:**

```
https://whaviso.com/        -> página de apresentação (pública), com botão "Entrar"
botão "Entrar"              -> https://whaviso.com/entrar
```

---

## 11. A página de login não deveria mostrar o "next" na URL

**Local:** guard de rota e página de login.
Front: `frontend/src/app/guards.tsx` (monta `/entrar?next=...`) e a página em
`frontend/src/modules/auth/`.

**Como está:** ao exigir login, a URL vira `https://whaviso.com/entrar?next=%2Fpedidos`.
O `next` aparece na barra de endereço.

**Como deveria:** a página de login fica limpa, só `https://whaviso.com/entrar`, sem o
`next` visível. Depois de logar, a "home" é `https://whaviso.com/pedidos`. O destino
pode ser guardado por dentro (sem ir para a URL), ou o login manda direto para a home
padrão.

**Exemplo:**

```
Hoje:     https://whaviso.com/entrar?next=%2Fpedidos
Deveria:  https://whaviso.com/entrar
Depois de logar:  https://whaviso.com/pedidos
```

---

## 12. Logotipo da tela de login com fundo cinza

**Local:** página de login `https://whaviso.com/entrar`.
Front: o logo é o `BellLogo` em `frontend/src/shared/ui/BellLogo.tsx`.

**Como está:** o logotipo aparece sobre um **fundo cinza**. Fica feio e não representa
bem a marca.

**Como deveria:** sem fundo nenhum (nem cinza, nem verde): só o próprio logo (o círculo
vazado com o sino), em **dourado** (token `dourado`, `#b8860b`), ocupando todo o espaço.
O logo continua em **SVG**, nunca uma imagem (nada de PNG ou JPG).

**Exemplo:**

```
Hoje:     logo sobre fundo cinza
Deveria:  só o logo (círculo + sino) em dourado, sem fundo, desenhado em SVG

Regra: só SVG. Não usar arquivo de imagem (png/jpg) para o logo nem para o fundo.
```

---

## 13. Console não tem aba para definir os planos

**Local:** console de admin, rota `/plataforma`.
Front: `frontend/src/modules/plataforma_cobranca/` (tela de cobrança) e
`frontend/src/app/layouts/OperadorShell.tsx` (menu do console).
Back: `backend/apps/api/src/modules/plataforma_cobranca/`.
Dados: `assinaturas` em `backend/supabase/migrations/0009_plataforma.sql`.

**Como está:** o sistema não tem o conceito de plano. A tabela `assinaturas` guarda só o
valor mensal, o status e o dia de vencimento. Para vender um plano novo, o admin digita o
valor em cada assinatura. Não existe catálogo e não existe lista do que cada plano inclui.

**Como deveria:** ter uma aba "Planos" no console. Nela o admin cria e edita planos com
nome, valor mensal e a lista do que está incluído (por exemplo: atendente com IA, API do
Whaviso, quantidade de lojas, quantidade de números de WhatsApp). O plano fica ativo ou
inativo. Ao criar uma assinatura, o admin escolhe o plano. O valor combinado fica gravado
na assinatura, para o reajuste do plano não mudar a fatura de quem já assinou.

**Exemplo:**

```
Aba "Planos":
  NOME       VALOR     INCLUI                        SITUAÇÃO
  Essencial  R$ 450    atendente, 1 loja, 1 número   ativo
  Pro        R$ 900    tudo do Essencial + API       ativo
  Trial      R$ 0      14 dias, sem API              ativo

Nova assinatura -> escolhe "Pro" -> R$ 900 fica gravado na assinatura
```

---

## 14. Papéis de acesso: faltam níveis e uma tela para ver o que cada um pode

**Local:** papéis do console e da loja.
Back: `backend/apps/api/src/shared/tenant/papeis.ts` (tabela de permissões da loja) e
`papel_operador` em `backend/supabase/migrations/0009_plataforma.sql` (papéis do console).
Front: aba "Equipe Whaviso" em
`frontend/src/modules/plataforma_clientes/components/PainelEquipe.tsx`.

**Como está:** o console tem dois papéis, `operador` e `admin`. A loja tem três, `dono`,
`gerente` e `atendente`. A lista de permissões de cada papel fica fixa no código e não
aparece em nenhuma tela. Não existe papel de só leitura, como "convidado". Para criar um
nível novo, é preciso mudar o código e a migration.

**Como deveria:** ter mais níveis e uma tela única para entender e ajustar cada um. A tela
"Acessos" no console lista os papéis e uma grade de permissões, em dois grupos: acesso ao
console e acesso à loja. Cada linha é uma permissão, cada coluna um papel. O admin liga e
desliga a permissão e salva. O servidor continua decidindo; a tela só mostra e edita a
mesma tabela.

Sugestão de níveis do console:
- `convidado`: só lê. Vê clientes e relatórios, não altera nada.
- `suporte`: atende cliente e vê a ficha da conta, sem mexer em cobrança.
- `financeiro`: vê e mexe em assinatura e fatura, sem ver conteúdo de loja.
- `operador` e `admin`: como hoje.

**Exemplo:**

```
Aba "Acessos", grupo "Console":
                          convidado  suporte  financeiro  operador  admin
  ver clientes                X         X         X          X        X
  criar cliente               -         -         -          X        X
  ver fatura                  -         X         X          X        X
  dar baixa na fatura         -         -         X          X        X
  gerir equipe                -         -         -          -        X

Aba "Acessos", grupo "Loja":
                          convidado  atendente  gerente  dono
  ver pedidos                 X         X          X       X
  mudar status do pedido      -         X          X       X
  editar cardápio             -         -          X       X
  ver fatura da loja          -         -          -       X
```

---

## 15. Atendente da plataforma para falar com os clientes do Whaviso

**Local:** console de admin, nova aba "Atendente".
Reaproveita: front `frontend/src/modules/llm/` (abas Chave e consumo, Conhecimento e
Fluxo), back `backend/apps/api/src/modules/` (`fluxo`, `conhecimento`,
`configuracoes_llm`) e o serviço `backend/apps/atendente/`.

**Como está:** o atendente com IA existe só para a loja. Ele responde o cliente final do
restaurante e usa a base de conhecimento e o fluxo da loja. A Whaviso não tem atendente
para responder o dono do restaurante, que é o cliente da plataforma. Hoje esse contato é
manual.

**Como deveria:** usar o mesmo módulo, com uma instância da plataforma. O atendente da
plataforma responde o cliente do Whaviso sobre o produto, o plano, a fatura e o uso do
painel. Ele tem fluxo próprio e base de conhecimento própria, separados dos da loja. As
telas são as mesmas: criar fluxo, publicar versão, subir documento, aprovar e ver
avaliação. Só muda o escopo dos dados.

Regra: nada da plataforma aparece na base da loja, e nada da loja aparece na base da
plataforma.

**Exemplo:**

```
Aba "Atendente" no console:
  [Fluxo]         grafo de atendimento da plataforma
  [Conhecimento]  documentos do Whaviso (planos, prazos, como usar)
  [Conversas]     clientes do Whaviso falando com a equipe

A mesma tela da loja (/llm), com escopo de plataforma.
```

Observação: depende do item 5 (serviço `whaviso-atendente` em produção) e de um número de
WhatsApp da Whaviso no módulo `canais`.

---

## 16. Chave de API por cliente, com validade

**Local:** console de admin, ficha da conta (aba "Contas" > "Ficha da conta").
Front: `frontend/src/modules/plataforma_clientes/components/FichaContaDialog.tsx`.
Back: não existe módulo; a api só aceita login do Supabase, em
`backend/apps/api/src/shared/auth`. A chave que existe hoje é a do provedor de IA da loja,
que o cliente cadastra (BYO), em `configuracoes_llm`.

**Como está:** não existe chave de API emitida pela Whaviso. Um cliente que quer integrar
com o Whaviso precisa entrar com login do Supabase. Um dos planos vai incluir a nossa API,
mas não há como entregar a chave nem como encerrar o acesso no fim do teste.

**Como deveria:** cada conta pode ter uma ou mais chaves de API emitidas pela Whaviso, na
ficha da conta. O admin cria, edita e exclui. Excluir revoga na hora. Campos: nome,
validade e situação. A chave aparece uma vez, na criação; depois só o começo e os 4
últimos dígitos. Guardar só o hash. A chave vence sozinha na data marcada e a api recusa
com 401. A chave vale só para as lojas daquela conta e nunca cruza com outra conta.

**Exemplo:**

```
Ficha da conta "Pizzaria do Zé" > "Chaves de API":

  NOME            CHAVE               CRIAÇÃO     VALIDADE    SITUAÇÃO
  Integração PDV  whv_live_9f...3a21  28/10/2026  31/12/2026  ativa
  Teste           whv_test_1c...88bd  28/10/2026  04/11/2026  expirada

Botão "Nova chave":
  Nome:     Integração PDV
  Validade: 31/12/2026 (ou "sem validade")
  Depois de criar: copiar a chave uma vez (não aparece de novo)
```

---

## 17. Gestão da Meta fica na plataforma; criação de fluxo é compartilhada

**Local:** console da plataforma (nova seção de WhatsApp/Meta). E a criação de fluxo, hoje
em `frontend/src/modules/llm/fluxo/`, que passa a usar essa gestão. Transporte com a Meta:
`backend/apps/zap/src/shared/meta_client/`. Números: `modules/numeros_whatsapp` e `canais`.

**Como está:** não existe uma seção única, na plataforma, que faça a comunicação com a Meta
para o atendimento. Os pedaços estão espalhados: `campanhas` usa template, `numeros_whatsapp`
e `canais` cuidam do número, e o `meta_client` no zap é só o transporte. Falta o lugar que
define template, envia para aprovação e cuida do que o atendimento do WhatsApp precisa.

**Como deveria:** a plataforma tem uma seção que faz a gestão fina da Meta: define template,
envia para aprovação, acompanha o status e habilita o que o atendimento precisa. Essa gestão
é só da plataforma (a equipe Whaviso). A criação de fluxo usa essa gestão e vale para os dois
lados, loja e plataforma: cada um monta o fluxo dele, mas ambos escolhem template a partir do
catálogo aprovado que a plataforma gere. Depende do motor de atendimento compartilhado (ver
item 15 e o escopo genérico loja/plataforma).

**Exemplo:**

```
Plataforma > seção "WhatsApp/Meta":
  define template, envia para aprovação, vê status (aprovado, recusado, em análise)
  habilita o número e o que o atendimento precisa

Criação de fluxo (loja e plataforma):
  passo que manda template escolhe um template JÁ aprovado pela plataforma
```
