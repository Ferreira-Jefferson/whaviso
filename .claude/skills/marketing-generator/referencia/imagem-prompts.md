# Prompt de imagem e guia visual do whaviso

Como escrever um único prompt que gera uma imagem com cara profissional, sem bugs nem alucinações, e como manter a identidade da marca. Agnóstico de ferramenta (serve para qualquer gerador), com notas por modelo no fim.

## Conteúdo
- Padrão: imagem única
- A fórmula do prompt (ordem que funciona)
- Template pronto
- Anti-bug: como evitar alucinações
- Lista de negativos reutilizável
- Vocabulário (luz, lente, enquadramento)
- Guia visual do whaviso
- Texto na arte
- Proporções
- Notas por modelo
- Carrossel (só sob pedido)
- Exemplos completos

## Padrão: imagem única

Por padrão, cada ideia gera UMA imagem única, proporção 4:5. Só monte carrossel se o usuário pedir. Quanto mais completo e concreto o prompt de uma imagem só, menos a IA inventa.

## A fórmula do prompt (ordem que funciona)

Monte nesta ordem. Cada bloco fecha uma porta para erro:

1. **Meio + gatilho de realismo:** o que é a imagem. Ex.: "Candid editorial photograph, photorealistic".
2. **Sujeito (concreto):** quem, fazendo o quê, **para onde olha**, com qual expressão, faixa de idade, roupa simples. A direção do olhar muda a leitura inteira da cena, então seja explícito. Ex.: "a single adult small-business seller in their 30s, looking down at the phone screen, hesitant expression". Quanto mais específico, menos a IA improvisa.
3. **Cenário e objetos do segmento:** onde, com props concretos, e **nomeie os produtos do segmento do público** (a IA não sabe o que a pessoa vende e inventa: "products" sozinho pode virar frasco de remédio). Ex.: "at a home table, a paper notebook and a few cosmetic products (a lipstick, a perfume bottle, a cream jar), blurred shelves behind".
4. **Composição e enquadramento:** tipo de plano, ângulo, regra dos terços e o espaço negativo para o texto. Ex.: "medium shot, eye level, subject on the right third, clean empty space on the left for a headline".
5. **Iluminação:** direção, qualidade, hora, clima. É o que mais define "profissional". Ex.: "soft diffused window light from the upper left, warm morning glow".
6. **Câmera e lente:** força profundidade e desfoque reais. Ex.: "shot on a 50mm lens, f/2.0, shallow depth of field".
7. **Estilo e cor:** paleta e tratamento. Ex.: "warm neutral tones with a soft green accent, natural color grading, authentic and human, not staged".
8. **Textura e realismo:** o truque do fotorrealismo. Ex.: "natural skin texture with visible pores and fine lines, subtle fabric texture, realistic light scatter".
9. **Proporção e qualidade:** Ex.: "4:5 aspect ratio, high detail, sharp focus on the subject".
10. **Negativos:** o que NÃO quer (lista abaixo).

## Olhar e objetos: os dois que mais mudam a imagem

Dois ajustes pequenos resolvem a maioria dos resultados "quase certos":

- **Direção do olhar.** Diga sempre para onde a pessoa olha, isso muda o sentido inteiro da cena. "looking down at the phone screen" passa concentração ou hesitação; "looking away into the distance" passa distração ou preocupação; "looking at the camera" cria conexão direta. Escolha conforme a mensagem do post.
- **Objetos do segmento, nomeados.** O gerador não conhece o catálogo do seu público e preenche o vazio sozinho: se você escrever só "products", pode sair frasco de remédio em vez de cosmético. Nomeie os produtos e faça eles baterem com a área de trabalho da persona do criativo.

Produtos por segmento (use no bloco de objetos):
- Cosmético: batom, frasco de perfume, pote de creme, paleta de maquiagem.
- Roupa e catálogo: peças dobradas, cabides, sacola de boutique.
- Semijoia: brincos e colares num expositor.
- Doces sob encomenda: brigadeiros, um bolo, embalagens de festa.
- Beleza autônoma: esmaltes, materiais de manicure, secador.

Regra de coerência: a imagem combina com o público do criativo. Persona confeiteira leva objetos de confeitaria, não cosméticos.

## Template pronto

```
[Medium + realism trigger], [single subject: who, doing what, where they look,
expression, age, simple clothing], [environment with named segment products,
blurred background], [shot
type + angle + subject placement + empty space for headline], [lighting:
direction, quality, time of day, mood], [camera + lens + aperture + depth of
field], [color palette: warm neutral tones with a soft green accent, natural
grading, authentic not staged], [natural skin/fabric texture, realistic light
scatter], 4:5 aspect ratio, high detail, sharp focus.
Avoid: [negative list].
```

## Anti-bug: como evitar alucinações

O coração deste guia. As alucinações vêm quase sempre dos mesmos lugares:

- **Mãos:** maior fonte de erro. Evite poses complexas. Prefira mãos relaxadas numa ação simples (segurar um caderno, apoiar o queixo) ou deixe as mãos fora de quadro. Sempre inclua "extra fingers, mutated hands" nos negativos.
- **Texto na arte:** a IA embola texto. Por padrão NÃO peça texto dentro da imagem: deixe espaço negativo e sobreponha o texto depois (Canva, editor). Se o texto precisa estar na arte, use um modelo forte de texto (ver notas por modelo), escreva uma frase curta entre aspas, exata, e aceite que pode precisar de tentativas.
- **Telas e UI falsa:** celular ou painel com interface inventada quase sempre sai embolado. Soluções: desfoque a tela ("blurred screen"), vire a tela para longe da câmera, ou (melhor para "mostrar o produto") use um print real do app, sem pedir à IA para desenhar a interface.
- **Número de pessoas:** diga o número exato ("a single person"). Sem isso a IA duplica gente no fundo.
- **Rostos em segundo plano:** se o rosto não é o foco, use plano mais aberto ou leve desfoque; rostos pequenos no fundo costumam distorcer.
- **Não brigue com o modelo:** negativo enxuto. Se a lista de negativos fica maior que o prompt, você está lutando contra o modelo em vez de guiá-lo. Foque nos 10 a 15 erros que importam para a cena.
- **Concreto vence vago:** "soft morning window light" gera melhor que "good lighting". Cada vaguidade é espaço para a IA inventar.

### Checklist anti-bug (rode antes de entregar o prompt)
- [ ] Disse o número de pessoas?
- [ ] As mãos estão simples ou fora de quadro?
- [ ] Evitou UI/tela inventada (desfoque, vira a tela, ou usa print real)?
- [ ] Sem texto dentro da arte (ou texto curto e exato, em modelo que renderiza bem)?
- [ ] Iluminação e lente concretas?
- [ ] Lista de negativos curta e específica?

## Lista de negativos reutilizável

Base para fotografia realista de pessoas e objetos (ajuste à cena):
```
deformed hands, extra fingers, mutated hands, bad anatomy, distorted face,
asymmetrical eyes, plastic skin, waxy airbrushed skin, blurry, low quality,
cartoon, 3d render, illustration, garbled text, watermark, logo, oversaturated,
stock-photo look, duplicated people
```

## Vocabulário (atalhos)

- **Luz:** soft diffused window light · warm golden hour · overcast soft light · Rembrandt lighting · backlight ou rim light · soft side light.
- **Lente e plano:** close-up · medium close-up · medium shot · wide shot · 35mm (mostra o ambiente) · 50mm (natural) · 85mm (retrato, fundo comprimido) · shallow depth of field (f/2.0) · deep focus (f/8).
- **Enquadramento:** rule of thirds · eye level · slightly high angle · negative space no topo ou à esquerda para o texto.
- **Clima e estética:** authentic, candid, editorial, documentary · warm and human · calm and reassuring (combina com o alívio que o whaviso entrega).

## Guia visual do whaviso

- **Cor:** verde suave e acolhedor (nunca verde gritante), estética próxima do WhatsApp sem copiar a marca. Neutros quentes (off-white, areia) de apoio.
- **Símbolo:** o sino de aviso pode aparecer sutil.
- **Pessoas e contexto:** gente real do Brasil que vende na vida real (revendedora, dona de pequeno comércio, confeiteira, manicure, feirante). Cena cotidiana, não escritório corporativo.
- **Diversidade:** varie gênero, idade e etnia entre os criativos, refletindo o público real (forte presença de mulheres na revenda, mas não só). Não estereotipe.
- **Sensação:** leve, humana, organizada, alívio. O produto tira um fardo, então a imagem respira calma, nunca tensão.
- **Autenticidade acima de polimento:** em 2026 conecta o que parece real. Prefira fotografia honesta a render 3D brilhante.

## Texto na arte

Padrão: sem texto embutido. Deixe espaço negativo e sobreponha depois: mais legível, editável e sem risco de embolar. Quando o texto precisa estar na arte, frase curta, exata, entre aspas, de preferência num modelo forte de texto.

## Proporções

- Feed (padrão): 4:5 vertical (1080 x 1350).
- Quadrado: 1:1.
- Stories e capa: 9:16.
Para esta operação (estáticos no feed), o padrão é 4:5.

## Notas por modelo (o mesmo prompt, pequenos ajustes)

- **Nano Banana / Gemini:** entende linguagem natural e conversacional, precisa de menos jargão, e é forte em renderizar texto. Pode escrever o prompt em frases corridas.
- **Flux:** recompensa precisão técnica: termos de fotografia, medidas, prompt bem estruturado.
- **Midjourney:** responde a clima, emoção e referência ("como cena de filme"), menos a specs. Use o parâmetro de proporção (ex.: `--ar 4:5`).
- **GPT-image:** ótimo para fotorrealismo e para texto curto correto.

Escreva o prompt completo (a fórmula acima) e, se souber a ferramenta, incline para o estilo dela. Em inglês por padrão; texto que aparece na arte fica em português.

## Carrossel (só sob pedido)

Quando o usuário pedir carrossel: defina um estilo único (mesma luz, paleta, lente) e repita em todos os quadros, mudando só a cena. Descreva quadro a quadro, repetindo a frase de estilo em cada um para a IA manter a unidade. Estrutura: quadro 1 gancho, meio desenvolve, último fecha.

## Exemplos completos (imagem única)

**Pilar da dor, imagem única (4:5):**
```
Candid editorial photograph, photorealistic. A single adult small-business
seller in their 30s sitting at a cozy home table, holding a smartphone and
looking down at the phone screen with a hesitant, thoughtful expression, one relaxed hand resting
on the table. A paper notebook and a few cosmetic products (a lipstick, a small perfume bottle,
a cream jar) softly blurred in the background. Medium shot, eye level, subject on
the right third, clean empty space
on the upper left for a headline. Soft diffused window light from the upper left,
warm morning glow. Shot on a 50mm lens, f/2.0, shallow depth of field. Warm
neutral tones with a soft green accent, natural color grading, authentic and
human, not staged. Natural skin texture with visible pores and fine lines,
realistic light scatter. 4:5 aspect ratio, high detail, sharp focus on the face
and phone.
Avoid: deformed hands, extra fingers, mutated hands, distorted face, plastic
skin, blurry, cartoon, 3d render, garbled text, watermark, oversaturated,
stock-photo look, duplicated people.
```
Texto a sobrepor depois (português): "Você digita o lembrete... e apaga."

**Mostrar o produto (use print real da tela):**
Para criativos do painel, prefira compor um print real do app sobre um fundo fotografado, em vez de pedir à IA para desenhar a interface (UI inventada embola). Exemplo de fundo:
```
Candid editorial photograph, photorealistic. A single hand holding a smartphone
at a cozy home table, the phone screen left intentionally blank for a real
screenshot to be composited later, catalog products softly blurred in the
background. Medium close-up, 50mm lens, f/2.2, soft natural daylight, warm
neutral tones with a soft green accent, authentic and human. 4:5 aspect ratio,
high detail.
Avoid: fake user interface, garbled text on screen, extra fingers, deformed
hand, watermark, stock-photo look.
```
