# Pendências pós corte de produção

Anotações do que falta fazer.

Data do corte: 2026-10-28 (a `main` recebeu o pivô do restaurante e subiu em produção).

> AVISO (2026-10-29): esta lista está PARCIALMENTE DESATUALIZADA. Vários itens de 1 a 17 já
> foram implementados e commitados na `development` depois que o texto foi escrito (por exemplo:
> os itens 1, 2 e 3 estão no commit 2d51dcf, com a migration 0069). Antes de trabalhar em
> qualquer item desta seção, CONFIRME o estado real no código, não confie só no texto. Fonte do
> que ainda falta: a memória do projeto e a verificação direta no repo. O bloco de progresso da
> seção "Corte para São Paulo e performance" (mais abaixo) está atualizado.

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

---

# Corte para São Paulo e performance (anotado em 2026-10-29)

Esta parte nasceu de uma investigação de lentidão. O app demora para carregar as
páginas mesmo com o banco quase vazio. Quatro análises (banco, conexão, api, front)
chegaram na mesma causa: **o banco está em us-east-1 (Virgínia) e o app roda no
Brasil**. Cada ida ao banco custa de 110 a 160 ms de rede. Cada página faz de 10 a 15
idas em série. Dá de 1 a 2 segundos só de rede, sem depender de volume de dados.

A correção maior é mover o banco para São Paulo. O projeto novo já foi criado. O resto
é cortar o número de idas ao banco (cache, paralelizar, agregar). Os dois efeitos se
somam.

Aviso de segurança: nenhum segredo aqui. As senhas reais ficam só no
`secrets/production.env` (gitignored). Este arquivo é versionado; nunca cole senha nele.

**Ordem recomendada quando as outras sessões fecharem:**
1. Itens 18, 19, 20, 21: terminar o corte para São Paulo (migrations, senhas, apontar
   dev e VPS, Auth). É o maior ganho e destrava o resto.
2. Itens 22, 23, 24: cache de escopo, pool quente, LISTEN. Beneficiam toda requisição.
3. Itens 25, 26, 27: cortar o waterfall de boot e o polling no front.
4. Itens 28 a 31: endpoint agregado, índices, read-model, serialização.
5. Item 32: limpezas. Item 33: coordenar as sessões e corrigir a memória.

**Índice dos fixes de performance (o "programa de eliminação"), por impacto:**

| Fix | Item | Camada | Status |
|-----|------|--------|--------|
| Coalescência de escopo por processo | 22 | API | FEITO (commit 20e60da) como single-flight, não cache por TTL. Ver nota abaixo. |
| Pool quente (idle alto + keepalive) | 23 | API/db | FEITO (commit 42fc3b2) |
| Boot: semear x-loja-id + destravar Outlet | 25 | Front | FEITO (commit c959b76) |
| Token em memória (fetch síncrono) | 26 | Front | FEITO (commit c959b76) |
| Cortar refetchInterval + resync seletivo | 27 | Front | FEITO (commit c959b76) |
| Dashboard num só (/dashboard/geral) | 28 | API+Front | FEITO (commit 8168599). /bootstrap do boot nao feito (ganho pequeno pos-item 25) |
| DATABASE_URL_LISTEN (corrige cache/realtime) | 24 | config | no production.env e no backend/.env dev; falta VPS |
| Índices B1/B2/B3/B6 + pg_trgm | 29 | DB | FEITO em código (migration 0081, validada local); falta db push no cloud |
| Read-model de clientes (B5) | 30 | DB | só dói com volume, depois |
| Serialização p/ listas grandes | 31 | API | depois |

**Nota do item 22 (FEITO como single-flight, 2026-10-29):** a 1a tentativa foi um cache por TTL de
3s, que quebrou 3 testes de integração por uma regressão de correção real (loja recém-criada
invisível por 3s; operador desativado com acesso por 3s). Em vez de religar esse TTL com uma
`invalidarEscopo(userId)` em cada mutação de escopo (superfície grande e, com mais de 1 processo,
ainda stale por falta de NOTIFY), o `cache_escopo.ts` virou **single-flight (coalescência)**: a
entrada vive só enquanto a Promise está em voo e some assim que ela assenta. Isso colapsa o burst
concorrente de 5 a 7 requisições da mesma página numa ida só (o desperdício que o item descrevia),
com ZERO janela de staleness: qualquer requisição não concorrente relê fresco, a revogação segue
imediata e a falha nunca fica cacheada. Ligado em `app.ts` (um leitor compartilhado pelos dois
plugins de escopo) e exportado como `comCoalescencia` do `shared/tenant`. Gate cheio verde (os 3
testes que quebravam no TTL passam, pois são sequenciais). O corte do banco para São Paulo (RTT de
~130 ms para ~8.6 ms) já havia capturado a maior parte do ganho; isto remove o resto sem risco.

Lembrete: o maior ganho de todos é mover o banco pra São Paulo (itens 18 a 21). Os
fixes acima cortam o número de idas ao banco e se somam a esse ganho.

**Progresso (2026-10-29, no fim desta sessão):**
- Projeto novo em São Paulo criado. Data API e auto-expose desligados; auto-RLS desligado.
- **Item 18 FEITO:** `supabase db push` aplicou as 66 migrations (3 roles criados, 85
  tabelas, RLS em todas, templates com 7 linhas; `planos` vazio, que é esperado). As
  senhas dos 3 roles foram ROTACIONADAS (as antigas vazaram no transcript desta conversa)
  e gravadas no `backend/.env` e no `secrets/production.env`. Os 3 roles conectam.
- **Item 19 RESOLVIDO:** a senha do banco conecta.
- **Item 20 (dev) FEITO:** `backend/.env` e `frontend/.env` apontam pro projeto novo
  (host sa-east-1, porta 5432, sslmode=require, `DATABASE_URL_LISTEN` presente). FALTA a
  parte da VPS (`/etc/whaviso/*.env`).
- **Item 21 (Google) FEITO no painel** (provider ligado, Client ID certo, nonce check
  off). Falta confirmar o Site URL e o Send SMS Hook do OTP.
- **Ganho medido:** RTT ao banco caiu de ~110-160 ms (Virgínia) para ~8.6 ms (São Paulo).

**Onda de performance (2026-10-29, nesta sessão):** integrados e commitados na `development`:
- **Item 23 FEITO** (commit 42fc3b2): pool do banco quente (idle 10 min + keepAlive).
- **Item 29 FEITO em código** (commit 355d3db): migration 0081 com os índices + pg_trgm,
  validada no banco de DEV local (todas as migrations OK). FALTA aplicar no cloud (db push).
- **Itens 25, 26, 27 FEITOS** (commit c959b76): boot do front sem waterfall (semeia x-loja-id da
  loja salva e destrava o Outlet), token de acesso lido em memória, e corte de polling redundante
  com resync seletivo. Gate verde (front e back: typecheck, lint, 1057 testes de api passando).
- **Item 22 ADIADO** (ver a nota no índice acima): o cache de escopo por TTL quebrava correção e
  gate; precisa de invalidação na mutação antes de religar.
- **Item 28 FEITO** (commit 8168599): endpoint agregado `GET /dashboard/geral` resolve os cinco
  read-models do dashboard em paralelo no servidor, então a página faz uma ida ao banco em vez de
  cinco (e resolve o escopo uma vez). O front passou a usar um hook só. A parte `/bootstrap` (juntar
  identidade + lojas + flag de operador no boot) NÃO foi feita: depois do item 25 o boot já roda em
  paralelo, então o ganho remanescente é pequeno; fica como follow-up se precisar.
- **Item 13 FEITO** (commit 56f620a): seletor de plano na criação/edição de assinatura. O backend já
  aceitava `plano_id` numa cópia LOCAL do contrato; unifiquei `plano_id` na fonte compartilhada
  (propaga pro front via codegen) e removi a duplicata. O seletor some com graça para papel sem
  `planos:gerir` (403) e segue com valor manual. NÃO mostra o plano atual na edição (o `AssinaturaDTO`
  não traz `plano_id`): follow-up pequeno (repo + DTO) se quiser.
- **Item 14 FEITO** (commit 095f646): o menu da loja se adapta à grade de permissões (`/acessos/minhas`),
  escondendo os itens cuja chave `:ver` o papel não tem. Mapeei só as rotas com chave `:ver` dedicada
  e inequívoca; as ambíguas (cozinha, despacho, estoque, avaliações, dashboard, fatura, lojas, agenda)
  ficam sempre visíveis (seguro: o servidor já nega a ação com 403). O motor de permissão e a tela
  Acessos já existiam; isto é só o gating de UI que faltava. Gating de BOTÕES de ação dentro das telas
  fica como follow-up.

- **FEITO depois (2026-10-29, baixa prioridade sem contra):** item 22 como single-flight (commit
  20e60da); `staleTime` de 5 min no catálogo de lojas (commit d3ec479); alvo `vercel` morto removido
  do push_secrets e notas (commit 93691c5).
- **FALTA (código, baixa prioridade, tem contra real):** item 30 (read-model de clientes: exige
  migration + trigger de sincronização, superfície de correção nova; só dói com volume) e item 31
  (serialização: ou remove a validação de resposta em prod, tirando a rede de segurança do contrato,
  ou fia fast-json-stringify por rota; só dói com volume). O de-dup de `/lojas` NÃO compensa (são
  duas queries de formas diferentes).
- **FALTA (fora do código / precisa de você, da VPS ou da Meta):** db push do 0081 (e das demais
  migrations pendentes) no cloud COMPARTILHADO de prod (combinar no deploy); item 21 (OTP hook);
  itens 6, 8, 35 (VPS); 15 Fase B e 17 (Meta). O item 20/24 (VPS *.env) e o item 5 (serviço atendente)
  foram tratados por outra sessão no cutover de prod do VPS (api/zap no projeto novo, pooler 5432,
  TLS verify-full com CA pinada); confirmar o atendente e o resto no próximo deploy.

---

## 18. Banco novo em São Paulo: criar o schema e casar as senhas dos roles

**Local:** Supabase cloud, projeto `yrwkwgmikjbkiplvjtyx` (sa-east-1). Fonte de env:
`secrets/production.env`. Migrations: `backend/supabase/migrations`.

**Como está:** o projeto novo em São Paulo está criado e vazio (0 tabelas, os roles
`whaviso_*` ainda não existem). Já conferi por psql. O runtime (dev e prod) ainda
aponta para o projeto antigo em us-east-1, que é a causa da lentidão.

**Como deveria:** rodar as migrations no projeto novo e setar as senhas dos roles de
serviço para casar com o `production.env`. Depois apontar tudo para o novo (item 20).
Manter o projeto antigo vivo até validar; só então apagar.

**Exemplo (nesta ordem):**

```
1. supabase db push usando MIGRATIONS_DB_URL (porta 5432, session pooler).
   Cria schema + catálogo (planos etc.). O seed NÃO roda no cloud.
2. Setar as senhas dos roles via ALTER ROLE, com os valores que já estão no
   secrets/production.env (API_DATABASE_URL, ZAP_DATABASE_URL, ATENDENTE_DATABASE_URL):
     ALTER ROLE whaviso_api       PASSWORD '<senha do whaviso_api no production.env>';
     ALTER ROLE whaviso_zap       PASSWORD '<senha do whaviso_zap no production.env>';
     ALTER ROLE whaviso_atendente PASSWORD '<senha do whaviso_atendente no production.env>';
3. Conferir: select rolname from pg_roles where rolname like 'whaviso%';  -> 3 linhas
```

Autorização: aplicar migrations no cloud já está liberado (memória
[[feedback-pode-aplicar-migrations-cloud-para-testar]]).

---

## 19. A senha do banco novo não bate

**Local:** `secrets/production.env` e painel Supabase (Database > Settings).

**Como está (resolvido em 2026-10-29):** a senha do `MIGRATIONS_DB_URL` agora AUTENTICA
no banco novo (testado por psql, sem exibir o valor). Falta só um detalhe: o campo
`SUPABASE_DB_PASSWORD` ficou com um valor DIFERENTE da senha de dentro da
`MIGRATIONS_DB_URL`. Esse campo é só conveniência; nenhum serviço o lê (o que conecta é a
URL), então não quebra nada.

**Como deveria:** alinhar o `SUPABASE_DB_PASSWORD` com a senha da URL (sem exibir o
valor), só para não confundir quem ler o arquivo depois.

**Exemplo:**

```
psql "host=aws-1-sa-east-1.pooler.supabase.com port=5432 \
      user=postgres.yrwkwgmikjbkiplvjtyx dbname=postgres sslmode=require" -c "select 1"
(deve conectar com a senha escolhida)
```

Observação: enquanto a senha do banco for igual à do root da VPS, há reuso. Trocar uma
das duas. Se vazar uma, vaza o acesso aos dois sistemas.

---

## 20. Apontar o dev e a VPS para o banco novo

**Local:** `backend/.env` (dev), `frontend/.env` (dev) e, na VPS,
`/etc/whaviso/api.env`, `/etc/whaviso/zap.env`, `/etc/whaviso/atendente.env`.

**Como está:** `backend/.env` e `frontend/.env` ainda apontam para o projeto antigo
(`yrwkwgmikjbkiplvjtyx`). A VPS também. Dev e prod usam o MESMO cloud (decisão do corte,
memória [[whaviso-prod-cutover]]).

**Como deveria:** trocar `SUPABASE_URL`, as chaves e as connection strings para o
projeto novo (`yrwkwgmikjbkiplvjtyx`) em todos esses arquivos. Usar porta 5432 (session
pooler), nunca 6543. Incluir `DATABASE_URL_LISTEN` (item 24). Todos os valores já estão
no `secrets/production.env` (fonte única, já limpo e organizado).

**Exemplo:**

```
backend/.env (dev):   API_DATABASE_URL, ZAP_DATABASE_URL, SUPABASE_URL,
                      VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY -> projeto novo
frontend/.env (dev):  VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY -> projeto novo
VPS:                  api.env, zap.env, atendente.env -> strings do production.env
```

---

## 21. Reconfigurar o Auth no projeto novo

**Local:** painel Supabase do projeto novo (Authentication).

**Como está:** o Auth do projeto novo está vazio. Configuração de auth não migra
sozinha. Usuários de teste também não migram (são de teste, logam de novo).

**Como deveria:** reconfigurar no painel: provider Google OAuth (client id, secret e
redirect URLs), provider Phone, e o Send SMS Hook (tipo HTTPS) apontando para
`https://api.whaviso.com/hooks/send-code`, com o `SEND_CODE_HOOK_SECRET` igual nos dois
lados. Conferir os templates do OTP na Meta (já aprovados, memória
[[whaviso-auth-login]]).

**Exemplo:**

```
Authentication > Providers:   Google (client id + secret), Phone (ligado)
Authentication > Hooks:       Send SMS hook -> HTTPS
                              URL  https://api.whaviso.com/hooks/send-code
                              secret = SEND_CODE_HOOK_SECRET (mesmo no zap)
```

---

## 22. Coalescer a resolução de escopo por processo (FEITO, single-flight)

> FEITO em 2026-10-29 (commit 20e60da) como single-flight, não como cache por TTL. Ver a
> "Nota do item 22" no índice de performance acima para o porquê e o contrato de segurança.

**Local:** `backend/apps/api/src/shared/tenant/cache_escopo.ts` (`comCoalescencia`) e a
ligação em `backend/apps/api/src/app.ts` e no `shared/tenant/index.ts`.

**Como está:** toda requisição resolve o escopo (`lojasDoUsuario`) com 1 ida ao banco,
sem cache, por decisão explícita (`shared/tenant/leitor_escopo.ts:22`, usado em
`shared/tenant/plugin.ts:81` e `shared/operador/plugin.ts:63`). Cada página dispara de
5 a 7 requisições e cada uma repaga esse round-trip. O arquivo `cache_escopo.ts` já foi
escrito e testado (6 testes verdes em `cache_escopo.test.ts`), MAS a ligação em
`app.ts` (`comCacheCurto`) e o export no `index.ts` foram REVERTIDOS por outra sessão.
Então o cache não está ativo.

**Como deveria:** reaplicar a ligação. Em `app.ts`, envolver
`criarLeitorEscopoSql(deps.pool)` com `comCacheCurto(...)`. No `shared/tenant/index.ts`,
exportar `comCacheCurto` e `TTL_ESCOPO_MS`. O TTL curto (3s) junta o burst da página
numa ida só. Falha não é cacheada (mantém fail-closed). Rodar o gate antes de commitar.

**Exemplo:**

```
// app.ts
const leitor = comCacheCurto(criarLeitorEscopoSql(deps.pool))
// shared/tenant/index.ts
export { comCacheCurto, TTL_ESCOPO_MS } from './cache_escopo'
```

Suposição assumida: uma janela de revogação de uns 3 segundos é aceitável (um membro
removido perde acesso em até 3s, não na hora). Se não for, baixar o TTL.

---

## 23. Manter o pool do banco quente

**Local:** `backend/packages/shared/src/config/schemas.ts` (`DB_IDLE_TIMEOUT_MS`,
padrão 30s) e o client pg em `backend/packages/shared/src/db/index.ts`.

**Como está:** o pool pg não tem `min` e fecha conexão ociosa em 30s. Em tráfego baixo,
quase toda navegação cai em conexão fria e repaga TCP e TLS, somando de 400 a 600 ms.

**Como deveria:** subir `DB_IDLE_TIMEOUT_MS` para alguns minutos e ligar keepalive, para
não repagar o TLS a cada página. Com o banco em São Paulo o custo cai, mas o pool quente
ainda ajuda.

**Exemplo:**

```
DB_IDLE_TIMEOUT_MS=600000   (10 minutos)
pg.Pool({ ..., keepAlive: true })
```

---

## 24. DATABASE_URL_LISTEN em todo lugar (corrige realtime e cache)

**Local:** `backend/.env` (dev), `/etc/whaviso/api.env` (prod), uso em
`backend/apps/api/src/app.ts:111`.

**Como está:** o transaction pooler 6543 não suporta LISTEN/NOTIFY, e
`DATABASE_URL_LISTEN` não estava setado. Então a invalidação do cache da grade por
NOTIFY e o SSE do realtime degradam (a grade cai no TTL; o painel pode mostrar Offline,
ver item 7).

**Como deveria:** setar `DATABASE_URL_LISTEN` com uma conexão de sessão (porta 5432) do
`whaviso_api`. Com as strings já em 5432, o LISTEN volta a funcionar. Já está no
`secrets/production.env`; falta no `backend/.env` de dev e na VPS.

**Exemplo:**

```
DATABASE_URL_LISTEN=postgresql://whaviso_api.<ref>:<senha>@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require
```

---

## 25. Front: acabar com o waterfall de boot

**Local:** `frontend/src/app/` (`TenantProvider.tsx:30` e `:62`, `AppShell.tsx:247` e
`:279`, `tenant/armazenamento.ts:5`).

**Como está:** a página só monta depois que `GET /lojas` responde. O Outlet fica
bloqueado e o header `x-loja-id` só existe depois de `/lojas`. Cada carga paga
RTT(/lojas) mais RTT(dados) em série.

**Como deveria:** semear o `x-loja-id` com a loja salva no localStorage (`lerLojaSalva`
já existe) e deixar o Outlet montar. Assim os dados da página correm em paralelo com
`/lojas`. Reconciliar depois (o `resetQueries` já existe em `TenantProvider.tsx:62`).

**Exemplo:**

```
Hoje:    sessão -> /lojas -> (monta) -> dados     (em série)
Deveria: sessão -> (monta com loja salva) -> dados e /lojas juntos
```

---

## 26. Front: ler o token de acesso em memória

**Local:** `frontend/src/.../api_client/instancia.ts:7`, `client.ts:116`,
`supabase/client.ts:101`, `AuthProvider.tsx:23`.

**Como está:** antes de cada fetch o app chama `supabase.auth.getSession()`, que é async
e usa `navigator.locks`. Com N queries paralelas, elas disputam o lock e serializam o
início.

**Como deveria:** guardar o access token em memória via `onAuthStateChange` (já existe)
e ler síncrono. Deixar `getSession` só como plano B.

---

## 27. Front: cortar polling e deixar o resync seletivo

**Local:** `dashboard/api.ts:18`, `despacho/api.ts:40`,
`lojas/disponibilidade/api.ts:56`, `RealtimeProvider.tsx:36`.

**Como está:** há `refetchInterval` mesmo com o SSE já invalidando por evento (dashboard
60s nas 5 queries, despacho 20s). No resync, o provider faz `invalidateQueries()` sem
filtro, o que vira uma tempestade de refetch.

**Como deveria:** tirar o `refetchInterval` do dashboard, afrouxar o do despacho, e no
resync invalidar só as raízes afetadas.

---

## 28. Endpoint agregado de boot e dashboard numa chamada

**Local:** api (novo endpoint) e front (boot e dashboard).

**Como está:** o boot faz várias chamadas (sessão, `/lojas`, `/plataforma-painel/eu`) e
o dashboard são 5 endpoints separados (`/resumo`, `/serie-diaria`, `/por-hora`,
`/top-itens`, `/atendimento`). Cada chamada repaga o escopo.

**Como deveria:** um endpoint `/bootstrap` (identidade mais lojas mais flag de operador
em 1 ida) e um dashboard num endpoint só (`Promise.all` no servidor, que já é usado em
`dashboard/service.ts:86`). Colapsa várias idas numa.

---

## 29. Índices do banco (só pesam com volume, baratos de adicionar)

**Local:** nova migration em `backend/supabase/migrations`. Aplicar no cloud com db push
(usar `CREATE INDEX CONCURRENTLY` no cloud).

**Como está:** faltam índices para filtro por janela de tempo e busca por texto. Com
banco vazio não pesa; com volume, pesa. O resto do schema está bem indexado.

**Como deveria:** adicionar os índices abaixo.

**Exemplo:**

```
create index pedidos_loja_tempo on public.pedidos (loja_id, criado_em)
  where status <> 'rascunho';                 -- dashboard/repo.ts:52,80,107; relatorios/repo.ts:261,307
create index movimentos_caixa_loja_tempo on public.movimentos_caixa (loja_id, tipo, criado_em);
                                              -- relatorios/repo.ts:231 (troca o movimentos_caixa_loja puro)
create index comandas_loja_fechada on public.comandas (loja_id, fechada_em)
  where status = 'fechada';                   -- relatorios/repo.ts:156,171
create index conversas_loja_atualizado on public.conversas (loja_id, atualizado_em desc, id desc);
                                              -- conversas/repo.ts:80 (aba "todas")
create extension if not exists pg_trgm;
create index clientes_nome_trgm on public.clientes using gin (nome gin_trgm_ops);
                                              -- busca ILIKE: clientes/repo.ts:33, conversas/repo.ts:72,
                                              --               plataforma_clientes/repo.ts:67
```

---

## 30. Read-model de clientes (lateral join caro)

**Local:** `backend/apps/api/src/modules/clientes/repo.ts:41-55`.

**Como está:** a listagem de clientes faz left join lateral com count e max em pedidos
para cada cliente, e ordena por coluna computada. Com volume, o Postgres calcula tudo
antes de ordenar; o cursor não evita o trabalho.

**Como deveria:** materializar `ultimo_pedido_em` e `pedidos_total` no cliente (por
trigger ou read-model). Assim a listagem não faz o lateral por linha.

---

## 31. Serialização de resposta para listas grandes

**Local:** `backend/apps/api/src/app.ts:60` (serializerCompiler do
fastify-type-provider-zod).

**Como está:** toda resposta passa por `zod.safeParse` mais `JSON.stringify`.
fast-json-stringify está desligado. Pequeno com banco vazio, pesa em listas grandes
(cardápio, pedidos, conversas).

**Como deveria:** usar fast-json-stringify nas rotas de payload grande, ou pular a
validação de resposta em produção.

---

## 32. Limpezas encontradas no caminho

**Local:** vários arquivos.

**Como está e como deveria (lista):**

```
- [FEITO, commit 93691c5] push_secrets.sh tinha alvo "vercel" (não usamos Vercel):
  removido, junto com as notas de Vercel em backend/.env.example e deploy/README.md.
- [FEITO por outra sessão, commit 762ad49] sslmode=verify-full com CA pinada na VPS.
- [NÃO compensa] GET /lojas 2x na página Lojas: são duas queries de formas diferentes
  (TenantProvider = LojaResumo[]; modules/lojas/api.ts = {itens} com incluir_inativas).
- [FEITO, commit d3ec479] staleTime de 5 min no catálogo de lojas. Enums não é query
  (são tipos z.enum em compile-time) e acessos é staleTime 0 de propósito (grade do gating).
- [FEITO, commit e6ad2d6] secrets/production.env.example alinhado (sem Vercel).
```

---

## 33. Sessões concorrentes revertendo trabalho; corrigir a memória do pooler

**Local:** o checkout `c:/Users/Jeffe/Documents/study/whaviso` e as memórias do projeto.

**Como está:** durante este trabalho havia 3 outras sessões de trabalho ativas no mesmo
checkout. Uma fez `git checkout` ou `stash` e reverteu arquivos rastreados não
commitados: `app.ts`, `shared/tenant/index.ts` e `secrets/production.env.example`. O
`cache_escopo.ts` (não rastreado) sobreviveu, mas a ligação se perdeu (ver item 22).
Além disso, a memória [[whaviso-dev-db]] e o CLAUDE.md dizem "session pooler 5432", mas
o prod estava no transaction pooler 6543, que é errado para LISTEN e para o claim com
FOR UPDATE SKIP LOCKED.

**Como deveria:** antes de reaplicar as mudanças de código, esperar as outras sessões
fecharem (ou combinar), e commitar de forma atômica assim que o gate ficar verde.
Corrigir a memória e o CLAUDE.md para dizer 5432 (session pooler) como a porta do app.

**Exemplo:**

```
git status            -> working tree limpo das outras sessões antes de reaplicar
reaplicar item 22 (ligação do cache) -> gate (lint, typecheck, test) -> commit atômico
```

---

## 34. Padronizar os nomes e prefixos de environment (opcional, só com a árvore limpa)

**Local:** `backend/.env` (prefixos `API_`/`ZAP_`), os `backend/apps/*/src/env.ts`,
`backend/packages/shared/src/config/schemas.ts`, `backend/apps/api/src/server.ts` (o
alias), `secrets/production.env(.example)`, `backend/scripts/push_secrets.sh`,
`deploy/README.md` e as units em `/etc/whaviso`.

**Como está:** os nomes funcionam, mas são mistos. O dev usa um arquivo único com prefixo
por serviço (`API_*`, `ZAP_*`), e o `server.ts` faz alias só de `PORT`, `HOST` e
`DATABASE_URL`. O prod usa nome sem prefixo, um env por host. O `production.env` mistura
as duas convenções. O `DATABASE_URL_LISTEN` entrou sem prefixo (a api lê direto).

**Como deveria:** escolher uma convenção e alinhar em todos os lugares, mantendo o app
funcionando. Fazer como tarefa isolada, com a árvore limpa (sem as sessões concorrentes
revertendo), rodando o gate e commitando atômico. NÃO fazer no meio do corte.

**Exemplo:**

```
Decidir: prefixo por serviço no arquivo único de dev; nome puro no env por host em prod.
Alinhar: schemas.ts + server.ts (alias) + production.env(.example) + push_secrets.sh +
         deploy/README + units. Rodar lint/typecheck/test. Commit atômico.
```

## 35. Verificar se o VPS tem um PostgreSQL servidor ocioso (só ocupa espaço)

**Local:** VPS Hostinger (`/home/deploy`, serviço do app). Fora do checkout.

**Como está:** em produção o único banco usado é o **Supabase cloud**; o app (api/zap/
atendente) conecta no cloud, nunca num Postgres local do VPS. O Postgres local desta
máquina de dev é só banco de TESTE (whaviso_dev e clones por worker), não existe o
equivalente em prod. Se o VPS tiver um **servidor** PostgreSQL instalado/rodando, ele
está ocioso e só consome disco e memória.

**Como deveria:** conferir no VPS se há um `postgresql` servidor instalado/ativo
(`systemctl status postgresql`, `dpkg -l | grep postgresql`) e, se estiver ocioso,
remover o PACOTE do servidor para liberar espaço. ATENCAO: manter o cliente `pg_dump`
(o backup diário do cloud depende dele, ver [[whaviso-backup-banco]]); remover só o
servidor, nunca o client. Verificar depois, com calma; não é urgente.

**Exemplo:**

```
No VPS: systemctl status postgresql ; dpkg -l | grep -i postgres
Se servidor ocioso: parar/desabilitar + remover postgresql-<versao> (manter postgresql-client).
Confirmar que o backup (pg_dump do cloud) segue funcionando.
```
