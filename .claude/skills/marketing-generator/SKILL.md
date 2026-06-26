---
name: marketing-generator
description: "Gera criativos e textos de divulgação para Facebook e Instagram do whaviso, organizados por pilar de conteúdo. Para cada ideia entrega cinco blocos: o ângulo, a ideia de imagem, um prompt pronto para gerar a imagem numa LLM, a legenda de apresentação e o público-alvo (persona, região, faixa de renda, área de trabalho). Use quando o usuário pedir criativos, posts, conteúdo de divulgação, legendas, ideias de marketing, ou citar um pilar e uma quantidade de ideias. Na primeira execução, analisa o projeto e gera um briefing de produto."
---

# marketing-generator

Fábrica de criativos e copy para as páginas de Facebook e Instagram do whaviso. Trabalha por **pilar de conteúdo**: o usuário diz o pilar e quantas ideias quer, e a skill entrega, para cada ideia, cinco blocos prontos (ângulo, imagem, prompt de imagem, legenda, público).

A estratégia de marketing já existe em `business/marketing/`. Esta skill é o braço de produção dela. Não reinvente estratégia: leia o que já está decidido e produza dentro disso.

## Quando usar

Quando o usuário pedir conteúdo de divulgação, posts, criativos, legendas, ideias de marketing, ou disser algo como "3 ideias do pilar da dor". Sempre para Facebook e Instagram (mesmo conteúdo serve os dois; ver decisão de canais no briefing).

## Relevância ao whaviso (filtro inegociável)

Toda ideia, em QUALQUER estágio do funil, tem que orbitar o problema que o whaviso resolve: vender ou emprestar na confiança, dinheiro combinado pra receber depois, controlar o que está pendente, receber o que combinou sem precisar cobrar.

Topo de funil pode ter público amplo e tom leve, mas o TEMA fica nessa órbita. Antes de aceitar uma ideia, faça o teste: "quem é atraído por isso tem a dor que o whaviso resolve? a ideia constrói ponte pro produto?" Se a resposta é não, descarte.

Conteúdo de finanças só vale quando é a finança de quem vende na confiança e recebe depois (o mês que fecha pelo que entrou, quanto do seu dinheiro está combinado pra depois, anotar quem combinou de te pagar). Dica genérica que qualquer página de finanças poderia postar (poupar, precificar, montar planilha) NÃO serve, por mais "leve" que pareça.

## Arquivos de referência (leia sob demanda)

- **Frameworks de copy** (como escrever a legenda): [referencia/copywriting.md](referencia/copywriting.md)
- **Anatomia do prompt de imagem + guia visual do whaviso**: [referencia/imagem-prompts.md](referencia/imagem-prompts.md)
- **Como definir o público (persona/região/renda/área)**: [referencia/publico.md](referencia/publico.md)
- **Contexto do produto e do público (gerado na 1a execução)**: `business/marketing/briefing-produto.md`
- **Catálogo de pilares e ângulos já pensados**: `business/marketing/ideias-conteudo.md`
- **Ledger do que já foi gerado** (para não repetir): `business/marketing/criativos/_indice.md`

## Regras de linguagem (guarda inegociável)

Todo texto gerado (legenda, ângulo, ideia de imagem, prompt) obedece às regras de ouro do whaviso. Fonte: `backend/packages/shared/src/contracts/linguagem.ts`.

1. **Vocabulário proibido**, nunca usar: dívida, devendo, atraso/atrasado, cobrança/cobrar, inadimplência. **Vocabulário aprovado**: aviso, lembrete, combinado, acordo. (A promessa é "receba o que combinou sem precisar cobrar", então a palavra "cobrar" só aparece negada, no sentido de "sem cobrar".)
2. **Nunca usar travessão** (em dash `—` ou en dash `–`). Use vírgula, dois-pontos, parênteses ou reescreva. O hífen comum `-` é permitido.
3. **Gênero neutro**: não inferir o gênero de quem recebe nem da persona ao escrever a copy. Evite "bem-vindo/a", "obrigado/a", "o cliente/a cliente". Prefira "que bom ter você", "valeu", "quem compra".
4. Tom: leve, prático, humano, sem julgamento. Nunca tom de guru financeiro nem de banco.

**Validação obrigatória (loop validador → corrige → repete):** depois de escrever o arquivo do lote, rode a checagem na própria saída e corrija qualquer ocorrência antes de apresentar:

- Use a ferramenta Grep no arquivo gerado com o padrão `d[ií]vida|devendo|atras(o|ad)|cobran|inadimpl` (case-insensitive). Qualquer hit que não seja "sem cobrar"/"sem cobrança" deve ser reescrito.
- Use a ferramenta Grep com o padrão `[—–]` no arquivo. Qualquer hit é travessão proibido: reescreva.
- Releia procurando marcas de gênero ("/a", "/o", "bem-vind", "obrigad"). Neutralize.

Só apresente ao usuário depois que as três checagens passarem.

## Fluxo

Copie este checklist e marque conforme avança:

```
- [ ] Passo 0: garantir o briefing-produto.md (gerar na 1a vez)
- [ ] Passo 1: perguntar estágio do funil, depois pilar + quantidade
- [ ] Passo 2: ler o ledger e o catálogo, escolher ângulos novos
- [ ] Passo 3: gerar N ideias (5 blocos cada)
- [ ] Passo 4: validar linguagem (3 checagens) e corrigir
- [ ] Passo 5: salvar lote + atualizar ledger + apresentar
```

### Passo 0: garantir o briefing

Se `business/marketing/briefing-produto.md` **não existe**, gere-o agora seguindo a seção "Primeira execução" abaixo. Se existe, leia-o: ele é o contexto de produto e público que alimenta todas as ideias.

### Passo 1: estágio do funil, pilar e quantidade

Os cinco pilares vivem em `business/marketing/ideias-conteudo.md`, agrupados por estágio do funil (slug entre parênteses, usado no nome do arquivo):

**Topo de funil** (alcance amplo, não fala do produto)
- Finança leve pra quem vende (`financa-leve`)

**Meio de funil** (toca a dor, qualifica)
- A dor de lembrar sem cobrar (`dor-de-lembrar`) · emocional
- Vender parcelado na confiança sem perder dinheiro (`parcelar-com-seguranca`) · prático

**Fundo de funil / ponta** (converte)
- Bastidor e propósito do projeto (`bastidor-proposito`) · storytelling
- Mostrar o produto (`mostrar-produto`) · conversão

**Por padrão, pergunte. Não assuma o pilar.** Use AskUserQuestion, começando pelo estágio do funil:

1. **Pergunte o estágio do funil:** Topo, Meio ou Fundo (ponta), com uma linha explicando cada um. A quantidade de ideias pode ser perguntada junto (é independente do estágio).
2. **Depois liste os pilares daquele estágio** e pergunte qual pilar o usuário quer. Indique quantas ideias já existem de cada pilar (conte no ledger) e sugira preferir os menos explorados. Se o estágio tem um pilar só (Topo), pule essa pergunta e siga com ele.

Só pule uma pergunta se o usuário já tiver dito aquilo no pedido (ex.: já nomeou o pilar, ou já disse "topo de funil, 3 ideias"). Não invente pilares fora desses cinco sem o usuário pedir.

### Passo 2: evitar repetição

Antes de gerar, leia `business/marketing/criativos/_indice.md` (se existir) e a seção do pilar em `ideias-conteudo.md`. Para o pilar escolhido, **prefira ângulos ainda não usados**. Os exemplos listados em `ideias-conteudo.md` são pontos de partida; só repita um ângulo já gerado se o usuário pedir variação dele.

### Passo 3: gerar as ideias

Para cada uma das N ideias, produza os cinco blocos no formato do template abaixo. Aplique:

- **Relevância**: passe cada ideia pelo filtro de "Relevância ao whaviso" (acima) antes de escrever. Descarte qualquer ângulo genérico que não orbite o problema do produto, mesmo que seja um bom conteúdo solto.
- **Copy**: escolha o framework adequado ao pilar (PAS para dor, BAB para transformação, AIDA para fechar). Ver [referencia/copywriting.md](referencia/copywriting.md).
- **Imagem**: monte o prompt pela anatomia e siga o guia visual do whaviso. Ver [referencia/imagem-prompts.md](referencia/imagem-prompts.md).
- **Público**: persona, região, faixa de renda, área de trabalho, coerentes com o estágio do funil. Ver [referencia/publico.md](referencia/publico.md).

**Formato padrão: imagem única.** Gere sempre UMA imagem única por ideia (proporção 4:5), a não ser que o usuário peça carrossel explicitamente. Só estáticos, sem vídeo/Reels (decisão de canais; ver briefing). Para montar o prompt de imagem com qualidade profissional e sem alucinações, siga [referencia/imagem-prompts.md](referencia/imagem-prompts.md). Não prometa funções ainda não ligadas (auto-envio por template Meta, OTP, backfill); fale só do que já funciona.

### Passo 4: validar linguagem

Rode as três checagens da seção "Regras de linguagem" no arquivo salvo. Corrija e repita até passar.

### Passo 5: salvar e apresentar

- Salve o lote em `business/marketing/criativos/<slug-do-pilar>-NN.md`, onde `NN` é o próximo número livre para aquele pilar (01, 02, ...). Use a ferramenta Glob para descobrir o próximo número.
- Atualize (ou crie) `business/marketing/criativos/_indice.md`: uma linha por ideia, no formato `- <pilar-slug> · <título do ângulo> · arquivo`. É o ledger que evita repetição.
- Apresente as ideias ao usuário no chat também, não só no arquivo. **Inclua sempre o prompt de imagem completo (bloco pronto para copiar) junto de cada ideia no chat**, esse é o entregável que o usuário leva para o gerador. Deixe claro que o "Texto a sobrepor" é uma sugestão de headline editável, não parte do prompt (entra por cima depois, no editor).

## Template de saída (use exatamente esta estrutura por ideia)

```markdown
### Ideia N: <título curto do ângulo>

- **Pilar:** <nome do pilar> · **Funil:** <topo|meio|fundo> · **Formato:** <imagem única (padrão) | carrossel de N quadros (só se o usuário pedir)>
- **Framework de copy:** <PAS | BAB | AIDA | híbrido>

**Ângulo (a ideia):**
<1 a 3 frases: qual a sacada e por que ela funciona para este público.>

**Ideia de imagem:**
<O que aparece no criativo: cena, composição, clima, onde fica o texto. Se carrossel, descreva quadro a quadro.>

**Prompt de geração de imagem:**
```
<Prompt pronto para colar numa LLM de imagem. Em inglês por padrão; texto que aparece na arte fica em português entre aspas. Inclua sujeito, cenário, luz, estilo, composição com espaço para o texto, proporção (ex.: 4:5).>
```

**Conteúdo de apresentação (legenda):**
> <Legenda pronta: gancho na 1a linha, corpo no framework escolhido, CTA leve, 3 a 6 hashtags do nicho. Respeita as regras de linguagem.>

**Público-alvo:**
- Persona: <ex.: revendedora de cosmético, faixa de idade>
- Região: <ex.: bairros e cidades pequenas de qualquer região; ou bolsão específico>
- Faixa de renda: <ex.: classes C e D, renda informal>
- Área de trabalho: <ex.: venda de catálogo, beleza autônoma, doces sob encomenda>
```

## Primeira execução: gerar o briefing-produto.md

Objetivo: condensar num único arquivo tudo que é preciso saber do produto, do público e do que o projeto oferece, para construir marketing sem reler o código toda vez.

**Fontes a ler** (use a ferramenta Read; opcionalmente `graphify query "<pergunta>"` para detalhes do produto como planos e templates):

- `PROJETO.md` (visão, problema, dois pilares, fluxos, estados, painel, planos, público, branding, tom de voz)
- `CLAUDE.md` (regras de ouro, stack, restrições)
- `backend/packages/shared/src/contracts/linguagem.ts` (vocabulário proibido/aprovado, travessão, gênero)
- `business/marketing/plano-divulgacao.md` (dor central, funil, decisão de canais, fases)
- `business/marketing/potenciais-clientes.md` (segmentos de público e bolsões regionais)
- `business/marketing/ideias-conteudo.md` (os cinco pilares e ângulos)

**Estrutura do briefing-produto.md a gerar** (seja conciso, é um destilado, não uma cópia):

1. O produto em uma frase + o problema que resolve + os dois pilares (avisar, controlar).
2. Promessa e frases-âncora aprovadas.
3. Regras de linguagem (vocabulário aprovado/proibido, sem travessão, gênero neutro) com os padrões exatos.
4. Público: resumo dos segmentos e dos bolsões regionais (de potenciais-clientes.md).
5. Pilares de conteúdo (os cinco) e o funil.
6. Decisão de canais (Facebook + Instagram, transmissão, estáticos, sem vídeo) e o que NÃO prometer (funções gated).
7. Planos e preços, só como alavanca de marketing (o que cada plano destrava).
8. Tom de voz (produto/marca, separado do tom neutro das mensagens ao destinatário).

Salve em `business/marketing/briefing-produto.md` e siga o fluxo. Atualize esse arquivo se o produto mudar.
