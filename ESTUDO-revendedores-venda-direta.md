# Estudo: o whaviso para revendedores de venda direta

> **O que é este documento.** Um estudo de produto que parte de um público concreto (revendedores de venda direta: perfumes, roupas, bijuterias, semijoias, lingerie, cosméticos) e pergunta: o que essa pessoa anota no caderno, o que ela precisa saber para entender a saúde do negócio e crescer, e o quanto o whaviso de hoje atende isso. Ao final, o que já temos, o que falta e o que ajustar, com recomendações faseadas que respeitam as regras de ouro e a arquitetura atual.
>
> **Método.** Cruzei a fonte da verdade do produto (`historias/`, épicos 1 a 15), o documento de visão (`PROJETO.md`), o schema real (`backend/supabase/migrations/`, tabela `avisos` e relacionadas) e o código de agregação do painel (`apps/api/src/modules/painel/repo.ts`). As afirmações sobre "o que existe" vêm do SQL e do código, não de suposição.
>
> **Este documento não é regra de negócio.** A fonte da verdade continua sendo `historias/`. Isto é um estudo de apoio: aponta lacunas e sugere direção. Nada aqui altera comportamento do produto por si só.
>
> **Direção decidida (pelo dono do produto, 2026-07-12).** O rumo abaixo deixou de ser hipótese. O **core continua sendo a notificação**, e a **linguagem das mensagens ao devedor não muda** (compliance, Regras de Ouro). Mas notificar por notificar é commodity: o **diferencial do whaviso é a gestão** do que foi vendido, do que se deve e a quem, visto dos dois lados (quem recebe e quem paga). Entram como parte dessa direção as **categorias definidas pelo usuário** (ex.: uma para cada marca ou linha que a pessoa revende) e a **linguagem do produto** (UI e landing) comunicando esse valor de gestão. As seções 5 a 7 já refletem essa decisão.

---

## 1. Quem é o revendedor e o que ele anota no caderno

O revendedor de venda direta opera num ritmo próprio, diferente do público que o `PROJETO.md` §9 lista hoje (prestadores de serviço, pais separados, acordos informais). Vale mapear o ciclo de trabalho dele antes de julgar o encaixe.

**O ciclo típico do revendedor:**

1. **Campanha / ciclo.** Muitas marcas trabalham em ciclos (ex.: revistas/catálogos que trocam a cada 3 semanas). A cada ciclo há novidades, promoções e uma meta implícita de vendas.
2. **Pedido do cliente.** O cliente escolhe itens do catálogo. Uma venda quase sempre tem **vários produtos** (ex.: 2 perfumes + 1 batom + 1 hidratante), cada um com quantidade e preço.
3. **Pedido ao fornecedor.** O revendedor junta os pedidos e compra da empresa, geralmente com desconto de revenda sobre o preço de tabela.
4. **Recebimento e entrega.** A mercadoria chega, é separada por cliente e entregue.
5. **Pagamento do cliente.** À vista, no fiado (depois) ou parcelado. É aqui que a confiança pesa e onde o "furo" dói.
6. **Fechamento.** No fim do ciclo/mês, o revendedor quer saber: quanto vendi, quanto recebi, quanto ainda vou receber, **quanto lucrei**, e o que fazer no próximo ciclo.

**O que, na prática, vai para o caderno:**

| No caderno do revendedor | Por quê |
|---|---|
| Quem comprou (nome, telefone, às vezes endereço) | Identificar o cliente e entregar |
| O que comprou (produtos, quantidade, preço) | Saber o que separar e conferir o total |
| Valor total do pedido | Quanto aquela venda vale |
| Como vai pagar (à vista / fiado / parcelado) e quando | Controlar o que entra e quando |
| Quanto já pagou / quanto falta | O saldo em aberto por cliente |
| Quanto custou (preço de compra) | Sem isto não há lucro |
| O que tem em estoque (para quem tem pronta-entrega) | O que dá para vender já |
| Status da entrega (pediu, chegou, entreguei) | Não perder o fio da meada |

**O que ele quer saber para entender a saúde do negócio e crescer** (o "para além do caderno"):

- Total vendido no ciclo/mês, total recebido, total ainda a receber (fiado em aberto).
- **Lucro do período** (venda menos custo). Este é o número que quase ninguém acompanha bem e que mais muda decisões.
- Ticket médio por cliente.
- Melhores clientes (quem compra mais) e clientes que sumiram (comprou antes, parou) para reativar.
- Produtos que mais saem (o que repor, o que empurrar).
- Quanto de fiado "furou" (não recebido) e com quem.
- Meta do ciclo contra o realizado.
- Recorrência: quem compra todo ciclo.

---

## 2. O que o whaviso é hoje

O átomo do whaviso é o **combinado** (tabela `avisos`). Olhando o schema real, um combinado guarda:

- Papéis e vínculo: `cobrador_id`, `devedor_profile_id`, `direcao` (receber/pagar), `status`.
- A outra ponta: `nome_devedor`, `telefone_devedor` (e `nome_cobrador`/`telefone_cobrador` no fluxo invertido).
- O acordo: **`motivo`** (texto livre, de 3 a 120 caracteres), **`valor_centavos`** (um único valor), **`data_combinada`** (uma única data).
- Recebimento: `pix_chave`, `pix_titular`, `pix_banco`.
- Ciclo de lembretes: `horario_reservado_*`, `cadencia_etapas`, e recorrência (`recorrencia_tipo/freq/intervalo`, `ocorrencias_total`, `ocorrencia_atual`) que gera **parcelas de mesmo valor** via a tabela `aviso_ocorrencias`.
- Operacional: `arquivado_em`, `entrega_chave_status` (atenção: isto é o status de envio da **chave Pix**, não de entrega de mercadoria).

Em cima disso, o produto entrega muito bem três coisas:

1. **Lembrete de fiado automatizado e defensável.** Ciclo D-2 a D+1, linguagem neutra, sem as palavras proibidas, opt-out sempre visível, encerramento automático. É o coração do produto e a maior dor real do revendedor: cobrar sem constranger e sem virar chato.
2. **Painel por papel.** "A receber" e "A pagar", totais por estado, "precisa de você", timeline de eventos por combinado. O painel computa **somas e contagens por estado** (`a_receber`, `recebido`, `a_pagar`, `pago`) sobre o `valor_centavos`. Nada além disso: não há ticket médio, custo, lucro nem agrupamento por produto.
3. **Visão por pessoa (Épico 15).** Reúne todos os combinados de um mesmo telefone, com os quatro totais da relação (a receber, recebido, a pagar, pago) e atalho para novo combinado. A identidade é o telefone; **não há cadastro de contatos** como entidade própria (decisão de privacidade).

Complementos relevantes: **modo agenda** (`sem_aviso`, anotar sem enviar), **carteira de créditos** (cada envio custa 1 crédito), **Pix em toda mensagem** e **parcelamento** (recorrência).

> **O próprio `PROJETO.md` já sinaliza a tensão.** A seção 1 diz, textualmente, que a agenda de pedidos é "uso secundário (não é a promessa central)" e instrui: "Não vender como sistema de gestão de vendas nem prometer recursos de ERP." E a seção 9 lista um público que **não inclui** revendedores de venda direta. Ou seja: servir bem esse público é uma decisão de posicionamento, não só de features. Volto a isso na seção 5.

---

## 3. Cruzamento: necessidade do revendedor x sistema

Legenda: 🟢 tem e atende · 🟡 atende em parte · 🔴 não tem · ⛔ ausente **de propósito** (regra de ouro / política do canal).

| # | Necessidade do revendedor | Status | Onde está / o que falta |
|---|---|---|---|
| 1 | Cliente (nome, telefone) | 🟡 | `nome_devedor` + `telefone_devedor`; identidade por telefone (Épico 15). Sem cadastro, endereço, aniversário, notas ou etiquetas. |
| 2 | O que foi comprado (produtos, qtd, preço unitário) | 🔴 | Só `motivo` (texto livre, 3 a 120 caracteres). Sem itens de pedido, sem quantidades. **Maior lacuna do lado "agenda de pedidos".** |
| 3 | Valor total do pedido | 🟢 | `valor_centavos`. (Sem composição por item.) |
| 4 | Prazo / fiado / data de pagamento | 🟢 | `data_combinada`. |
| 5 | Parcelamento | 🟡 | Recorrência gera parcelas de **valor igual**. Entrada + parcelas diferentes não é modelado. |
| 6 | Já pagou? Quanto falta? | 🟢 | Fluxo `informado_pago` → confirmação do cobrador → `pago`. |
| 7 | Quanto o cliente deve no total | 🟢 | Visão por pessoa (Épico 15), quatro totais por telefone. |
| 8 | Lembrar do fiado sem constranger | 🟢 | Ciclo de lembretes (Épico 6), linguagem neutra, opt-out. **Feature-âncora para este público.** |
| 9 | Receber por Pix | 🟢 | Pix obrigatório, em toda mensagem, com titular e banco. |
| 10 | Custo do produto / **lucro** | 🔴 | Não existe campo de custo. O painel nunca mostra lucro. **Maior lacuna do lado "saúde do negócio".** |
| 11 | Estoque / pronta-entrega | 🔴 | Nenhum conceito de inventário. |
| 12 | Status de entrega da mercadoria | 🔴 | `entrega_chave_status` é da chave Pix; H9.7 é entrega de **mensagem**. Entrega de produto não existe. |
| 13 | Ciclo / campanha e meta do ciclo | 🔴 | Nenhum conceito de ciclo, período de campanha ou meta. |
| 14 | Contas a pagar ao fornecedor/empresa | 🔴 | O fluxo "pagar invertido" é pessoa-a-pessoa, não a relação com a marca. |
| 15 | Ticket médio, melhores clientes, inativos, produtos campeões | 🔴 | Painel só soma por estado/papel. Nenhuma métrica analítica. |
| 16 | Avisar chegada do pedido / novidades / promoções | ⛔ | Fora de escopo **por compliance**: o canal só tolera lembrete informativo, sem mensagem ativa nem promoção (Regras de Ouro, Épico 13). |
| 17 | Anotar sem enviar (agenda) | 🟢 | Modo agenda (`sem_aviso`). |

**Resumo do cruzamento.** O whaviso cobre com força a metade "**cobrar o fiado sem desgaste**" (itens 6 a 9, 17) e a visão por cliente (item 7). Fica devendo a metade "**agenda de pedidos + saúde do negócio**" (itens 2, 10 a 15). O item 16 é uma fronteira que **não deve** ser cruzada no canal atual.

---

## 4. Análise das lacunas (agrupadas por tema)

**A. Composição do pedido (item 2, 5).**
Hoje uma venda de vários produtos vira um `motivo` de até 120 caracteres e um valor único. O revendedor não consegue registrar "2 perfumes, 1 batom, 1 hidratante" de forma estruturada, nem conferir o total por item, nem depois saber o que mais vendeu. Isto limita o whaviso a "quanto" sem "o quê".

**B. Custo e lucro (item 10).**
É a lacuna de maior alavancagem para "saúde do negócio" com o menor esforço. Um único campo opcional de custo por combinado já habilitaria o número que o revendedor mais precisa e menos acompanha: **lucro do período**. Esse dado nunca vai ao WhatsApp; é só painel.

**C. Analítica de crescimento (item 15).**
O painel é **operacional** (o que fazer agora), não **analítico** (como vai meu negócio). Faltam ticket médio, ranking de melhores clientes, clientes inativos (para reativar) e produtos campeões. A base para vários desses números já existe (valores, estados, telefone como identidade); o que falta é a agregação e a tela.

**D. Ritmo de campanha (item 13).**
Sem um conceito de ciclo/período, o revendedor não consegue fechar "quanto vendi e lucrei no ciclo X" nem comparar ciclos. Não precisa ser uma entidade pesada: um rótulo de período que agrupa combinados já resolveria a maior parte.

**E. Logística leve (item 12).**
Saber se a mercadoria foi entregue é parte do caderno. Hoje não há nada. É um campo simples de status, não um módulo de logística.

**F. Cliente como entidade (item 1).**
A decisão de não ter cadastro de contatos protege privacidade e simplifica, e a visão por pessoa (Épico 15) cobre bastante. Mas para **crescer** (reativar quem sumiu, tratar cliente VIP), uma camada leve de cliente ajudaria. Aqui há um trade-off real com o compliance de dado sensível, a ponderar com cuidado.

**G. Fronteiras que não se cruzam (itens 14, 16).**
Contas a pagar ao fornecedor e mensagens de novidade/promoção são de outra natureza. O primeiro puxa o produto para ERP; o segundo **viola a política do canal**. Devem ficar de fora do escopo atual (ver seção 6, riscos).

---

## 5. Posicionamento (decidido): a gestão é o diferencial

A escolha estratégica que este estudo levantou foi **tomada**: o whaviso deixa de se vender só como "lembrete de combinado" e passa a se posicionar como **a agenda de vendas e recebimentos** de quem trabalha com confiança e fiado, tendo a notificação como motor e a **gestão como diferencial**.

A lógica, nas palavras do dono do produto:

- **A notificação é o core, mas notificar por notificar é commodity.** Qualquer um manda mensagem. O que prende o usuário é **saber o que vendeu, quanto tem a receber e de quem**, e (do outro lado) **quanto deve e a quem**.
- **A linguagem das mensagens ao devedor não muda.** As Regras de Ouro e a política do WhatsApp continuam intactas (tom informativo, sem palavras proibidas, opt-out). A mudança é de **escopo de gestão** e de **linguagem do produto** (UI e landing), não do canal.
- **É o caminho natural do sistema.** O modelo `combinado` já carrega valor, data, papel e histórico por pessoa (Épico 15). Falta pouco, e de forma aditiva, para ele descrever "o que foi vendido" e "como vai o negócio".

Em relação às três posturas possíveis, fica registrada a decisão pelo **caminho do meio**: virar o **caderno digital do revendedor** com os elementos de alta alavancagem e baixo custo (custo/lucro, itens opcionais do pedido, categorias, métricas de negócio), **sem** virar ERP (sem estoque pesado, sem contas a pagar ao fornecedor, sem catálogo de produtos). Isso implica atualizar `PROJETO.md` §1 e §9 (público e promessa) e escrever as histórias novas em `historias/`.

### 5.1 Categorias definidas pelo usuário (novo eixo de organização)

O revendedor raramente atende uma marca só: a mesma pessoa vende para a Natura, o Boticário e a "Calcinhas Ltda". Ele precisa de um eixo para **separar e filtrar** por aquilo que faz sentido no negócio dele, não em categorias fixas que a gente imponha.

- **Categoria = rótulo livre, criado pela conta** (isolamento por `profile.id`), aplicável a um combinado. Exemplos do usuário: "Natura", "Boticário", "Calcinhas Ltda"; mas serve para qualquer eixo (linha de produto, "pronta-entrega", "clientes do bairro").
- **Filtro e recorte em toda parte:** painel, listas, totais e métricas passam a poder ser vistos **por categoria** ("quanto vendi e tenho a receber da Natura este mês").
- **Nunca vaza para o devedor.** Categoria é organização interna do usuário; não entra em nenhuma mensagem do ciclo (respeita as Regras de Ouro).
- **Combina com custo (A1) e métricas (A3):** habilita o número que fecha o raciocínio do revendedor: **lucro por categoria/marca**.
- **Esboço de schema (aditivo):** tabela `categorias` (`id`, `profile_id`, `nome`, `cor?`, `arquivada`) mais `avisos.categoria_id` nullable (começar com **uma** categoria por combinado; avaliar N:N só se a pesquisa pedir). Filtro/agrupamento no servidor, como manda o Épico 9 H9.8.

---

## 6. Recomendações faseadas

Cada item marca esforço aproximado e se respeita o escopo atual. Nada aqui manda mensagem nova ao devedor sem passar pelas regras do Épico 6/13.

### Fase A: alto valor, baixo esforço, aditivo (recomendada primeiro) — ✅ ENTREGUE

Toda a Fase A (A0 a A4) está implementada de ponta a ponta (backend + Supabase cloud + frontend), com testes. As mensagens ao devedor não mudaram (compliance): categoria, custo, itens e métricas são dados internos do dono.

- **A0. Categorias definidas pelo usuário** ✅ (ver 5.1): tabela `categorias` (migration 0081) + `avisos.categoria_id`, gerência em `/app/categorias`, seleção/criação inline no Novo Aviso e filtro por categoria no painel. É o eixo que amarra "por marca/linha" e destrava lucro por categoria junto de A1/A3.
- **A1. Campo de custo opcional por combinado** ✅ (`avisos.valor_custo_centavos`, nullable, migration 0082). Não vai ao WhatsApp; edição livre (não reabre reaprovação); habilita o lucro. Aparece no Novo Aviso.
- **A2. Itens opcionais do pedido** ✅ Composição em `avisos.itens` (`jsonb` array de `{descricao, qtd, valor_unit_centavos}`, migration 0083). Interno, nunca vai ao devedor; edição livre. O editor no Novo Aviso soma no `valor_centavos` (ajustável, ex.: desconto); o detalhe do combinado mostra a lista. Quem preferir segue só com o motivo + valor.
- **A3. Painel com métricas de negócio** ✅ (backend `painel/repo.metricas` + tela `/app/metricas` "Resultado"): lucro do período (só onde há custo, honesto), ticket médio, melhores clientes, clientes inativos e quebra por categoria (A0).
- **A4. Visão por pessoa com "última compra" e sinal de inatividade** ✅ (extensão do Épico 15): o resumo da pessoa (`/pessoas/:avisoId/resumo`) devolve `ultima_compra`, `dias_desde_ultima_compra` e `inativo` (sem venda ativa a receber e última venda além de 60 dias, alinhado ao default das métricas). A página da pessoa exibe a última compra e um sinal para reativar clientes parados.

### Fase B: fecha o ciclo do revendedor (médio esforço)

- **B1. Rótulo de ciclo/período** como agrupador leve (não entidade pesada), para fechar "vendi/lucrei no ciclo X" e comparar ciclos. *Esforço: médio.*
- **B2. Status de entrega da mercadoria** (campo simples: a separar / entregue), sem virar logística. *Esforço: baixo.*
- **B3. Parcelamento heterogêneo** (entrada + parcelas diferentes), se a pesquisa com usuários mostrar necessidade. *Esforço: médio-alto (mexe em ocorrências).*
- **B4. Produtos que mais vendem** (depende de A2 estar em uso). *Esforço: médio.*

### Fase C: fora do escopo atual (exige decisão da opção 3)

- Estoque/inventário (só para quem tem pronta-entrega; é praticamente outro produto).
- Contas a pagar ao fornecedor / relação com a marca.
- Catálogo / lista de preços.

### Não fazer (fronteira dura)

- **Mensagens de novidade, promoção ou "chegou seu pedido" pelo canal de lembretes.** Viola as Regras de Ouro e a política do WhatsApp (tom informativo, não ativo; sem promoção). Se um dia isto for desejado, é outro canal, com outro consentimento, não o ciclo de lembretes.

---

## 7. Linguagem do produto e landing page

Há **duas linguagens** no whaviso, e só uma delas muda.

1. **Linguagem das mensagens ao devedor (canal WhatsApp): imutável.** Tom informativo, sem "dívida/cobrança/atraso/inadimplência", opt-out sempre visível, gênero neutro. Isto é compliance e proteção do canal; **nada nesta virada de posicionamento toca aqui**.
2. **Linguagem do produto (UI, painel, landing, e-mails): precisa mudar.** Hoje ela vende "automatize seus avisos de pagamento". Para o revendedor, ela deve vender **organização e controle do negócio**, com o aviso automático como consequência, não como a única promessa.

### 7.1 Diagnóstico da landing atual

`frontend/src/modules/landing/pages/Landing.tsx` hoje:

- **Hero:** "Você combina, o whaviso lembra por você." (lidera com lembrete)
- Trata a agenda de vendas como **um parágrafo secundário** ("Use também como sua agenda de pedidos e vendas...").
- Seções: Como funciona, O ciclo de lembretes, O que a outra pessoa recebe, Créditos de envio.
- Exemplo usa "aluguel de junho" (persona de acordo informal, não revendedor).

Ou seja: a página inteira comunica o **motor** (notificação) e quase não comunica o **diferencial** (gestão). É exatamente o que a decisão da seção 5 quer inverter.

### 7.2 Proposta de reposicionamento da landing (copy)

Mantém as Regras de Ouro (o exemplo de mensagem segue neutro) e o design system atual; muda o que a página **promete primeiro**.

| Bloco | Hoje | Proposto |
|---|---|---|
| Selo (badge) | "Lembretes no automático" | "Sua agenda de vendas e recebimentos" |
| Título (H1) | "Você combina, o whaviso lembra por você." | "Organize suas vendas, controle o fiado e receba no automático." |
| Subtítulo | "Cadastre o combinado uma vez. O whaviso manda os lembretes..." | "O whaviso é a agenda do seu negócio: anote cada venda ou combinado, veja quanto tem a receber de cada pessoa e deixe os lembretes saírem sozinhos pelo WhatsApp, na hora certa." |
| Reforço | "Use também como sua agenda de pedidos..." (secundário) | "Separe por categoria (cada marca, cada linha de produto) e filtre do jeito que faz sentido pra você." |
| Nova seção | (não existe) | **"Seu negócio organizado"**: o painel mostra o que você tem a receber, o que já recebeu, quanto deve a cada pessoa e o resultado por categoria. Traz a gestão para o centro. |
| Seção existente | "O que a outra pessoa recebe" | **Mantida** (é a prova do motor de notificação e do compliance). |
| Exemplos | "aluguel de junho" | Tunar para venda direta (ex.: "pedido do catálogo", "2 perfumes e 1 hidratante"), sem prometer recurso que ainda não exista. |

> **Cuidado de honestidade:** a landing não pode prometer categorias/lucro/itens antes de existirem. A copy acima assume que A0 a A3 (seção 6) estejam entregues, ou então deve destacar só o que já está no ar (agenda, a receber por pessoa, lembretes) e evoluir junto com as fases.

### 7.3 Onde mais a linguagem de gestão aparece

- **Painel (`/app`):** títulos e rótulos que falem de negócio ("Seu resultado", "Por categoria", "Melhores clientes"), sem termos proibidos.
- **Formulário de criar:** "venda"/"pedido" como vocabulário de apoio ao lado de "combinado"; campos de categoria e custo opcionais e discretos.
- **PROJETO.md §1 e §9:** reescrever a promessa central e o público-alvo para incluir o revendedor de venda direta explicitamente (hoje §1 proíbe posicionar como gestão de vendas: essa frase precisa mudar de acordo com a decisão da seção 5).

---

## 8. Riscos e restrições que não podem ser violados

- **Regras de Ouro / compliance (Épico 13):** nenhuma sugestão pode introduzir linguagem de cobrança, mensagem ativa ou promocional no canal, nem quebrar o opt-out. Custo, lucro, itens e métricas são **internos** (painel), nunca vão ao devedor.
- **Dado sensível (Épico 13 H13.8):** telefone e Pix nunca em URL, query ou log. Qualquer camada de "cliente" precisa herdar essas regras; por isso a opção 2 não propõe cadastro de contatos com endereço sem antes decidir o tratamento de dado.
- **Arquitetura (CLAUDE.md):** dinheiro em centavos, datas em America/Sao_Paulo, dados 100% via API (nunca PostgREST), módulo não importa módulo, sem DELETE em negócio. As sugestões A1 a B4 são aditivas e cabem nesse desenho.
- **Fonte da verdade:** implementar qualquer item exige primeiro escrever/ajustar a história correspondente em `historias/` e, quando mexer no schema, aplicar a migration no Supabase cloud (`db push`).

---

## 9. Conclusão

O whaviso já é um **excelente cobrador de fiado** para o revendedor e um bom controlador do que cada cliente deve. A decisão do produto (seção 5) é dar o passo natural do sistema: **manter a notificação como motor e a gestão como diferencial**, virando o **caderno digital que o revendedor abre todo dia**, não só quando vai cobrar. Isso se faz de forma barata e aditiva (categorias, custo/lucro, itens do pedido, métricas de negócio), com a **linguagem do produto** (UI e landing) comunicando esse valor, enquanto a **linguagem das mensagens ao devedor permanece intocada** (seção 7) e as fronteiras de compliance (seção 8) são mantidas.

### Próximos passos sugeridos (em ordem)

1. **Reescrever `PROJETO.md` §1 e §9** para a promessa "agenda de vendas e recebimentos" e o público revendedor (destrava tudo o mais).
2. **Escrever as histórias novas em `historias/`** (categorias, custo/lucro, itens do pedido, métricas), que são a fonte da verdade para depois implementar.
3. **Repositionar a landing** (seção 7.2) alinhada ao que já estiver no ar em cada fase.
4. **Implementar a Fase A** (A0 a A4), respeitando arquitetura (centavos, dados via API, migration no cloud) e compliance.
