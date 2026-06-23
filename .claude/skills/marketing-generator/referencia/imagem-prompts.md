# Prompt de imagem e guia visual do whaviso

Como montar o prompt que vai para a LLM de imagem e como manter a cara da marca. Agnóstico de ferramenta (serve para qualquer gerador de imagem).

## Conteúdo
- Anatomia do prompt
- Idioma do prompt e texto na arte
- Proporções por posição
- Guia visual do whaviso
- Carrossel: consistência entre quadros
- O que evitar (cara de IA genérica)
- Exemplos de prompt

## Anatomia do prompt

Monte o prompt nesta ordem. Quanto mais específico, melhor o resultado:

1. **Sujeito**: quem ou o quê está na cena (ex.: uma pessoa adulta organizando vendas no celular).
2. **Cenário**: onde (ex.: bancada de uma pequena loja de bairro, fundo desfocado).
3. **Luz**: define o clima (ex.: luz natural suave de manhã, quente e acolhedora).
4. **Ângulo e lente**: (ex.: foto em close médio, lente 50mm, leve profundidade de campo).
5. **Estilo**: (ex.: fotografia editorial realista, autêntica, não publicitária).
6. **Composição com espaço para texto**: reserve uma área limpa (ex.: espaço negativo no topo para sobrepor o título depois).
7. **Proporção**: ex.: 4:5.
8. **Negativos** (quando a ferramenta aceitar): sem texto distorcido, sem marca d'água, sem cara de banco de imagem.

## Idioma do prompt e texto na arte

- **Escreva o prompt em inglês por padrão**: a maioria dos modelos rende mais. (Se o usuário preferir, pode ser em português.)
- **Texto que aparece na arte fica em português**, pois o público é brasileiro. Coloque entre aspas e exato.
- IA erra texto longo. Regra: no máximo uma frase curta dentro da imagem. Se a copy é maior, **deixe espaço negativo e sobreponha o texto depois** (Canva, editor), não peça para a IA escrever.

## Proporções por posição

- **Feed (padrão):** 4:5 vertical (1080 x 1350). Ocupa mais tela, melhor alcance.
- **Quadrado:** 1:1, bom para carrossel.
- **Stories e capa:** 9:16.
Para esta operação (estáticos no feed), o padrão é 4:5.

## Guia visual do whaviso

- **Cor:** verde suave e acolhedor (nunca verde gritante nem agressivo), estética próxima do WhatsApp **sem copiar** a marca. Pode usar neutros quentes (off-white, areia) de apoio.
- **Símbolo:** o sino de aviso é o motivo da marca; pode aparecer de forma sutil.
- **Pessoas e contexto:** gente real do Brasil que vende na vida real (revendedora, dona de pequeno comércio, confeiteira, manicure). Cenas cotidianas, não escritório corporativo.
- **Sensação:** leve, humana, organizada, sem peso. O produto tira um fardo, então a imagem respira alívio, nunca tensão ou clima de cobrança.
- **Autenticidade acima de polimento:** em 2026 o que conecta é o que parece real, não o anúncio perfeito. Prefira fotografia honesta a render 3D brilhante.

## Carrossel: consistência entre quadros

- Defina um estilo único (mesma luz, paleta, tipo de cena) e repita em todos os quadros, mudando só o conteúdo.
- No prompt, descreva quadro a quadro, repetindo a frase de estilo em cada um para a IA manter a unidade.
- Estrutura comum: quadro 1 gancho, quadros do meio desenvolvem, último quadro fecha com CTA.

## O que evitar (cara de IA genérica)

- Gradiente roxo em fundo branco, pessoas sorrindo perfeitas demais, mesa de escritório limpa e fria.
- Ícones 3D brilhantes genéricos, stock photo óbvio.
- Texto longo embutido pela IA (sai torto).
- Qualquer coisa que pareça template, sem contexto da vida de quem vende na confiança.

## Exemplos de prompt

**Imagem única, pilar da dor (4:5):**
```
Candid editorial photo of an adult small-business seller at a modest neighborhood
shop counter, looking thoughtfully at a worn paper notebook full of names,
soft warm morning light, 50mm lens, shallow depth of field, authentic and
human mood, muted warm tones with a soft green accent, clean negative space at
the top for a headline overlay, 4:5 aspect ratio. No distorted text, no
watermark, no glossy stock-photo look.
```
Texto a sobrepor depois (em português): "O caderno funciona, até a página somar 30 nomes."

**Imagem única, mostrar o produto (4:5):**
```
Clean realistic photo of a hand holding a smartphone showing a simple, calm
dashboard with a soft green theme, on a cozy home table with catalog products
softly blurred in the background, natural daylight, reassuring and organized
feeling, negative space on the left for text, 4:5 aspect ratio. No fake UI
clutter, no harsh colors, no watermark.
```
Texto a sobrepor (em português): "O que falta entrar, num lugar só."
Observação: para a tela do app, prefira usar um print real do painel quando existir, em vez de UI inventada.
