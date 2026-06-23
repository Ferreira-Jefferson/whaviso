# Briefing de produto (base para o marketing)

> Destilado de produto, público e estratégia para produzir divulgação sem reler o código.
> Gerado pela skill marketing-generator a partir de PROJETO.md, CLAUDE.md, linguagem.ts e dos arquivos de business/marketing/.
> Atualize quando o produto mudar.

## 1. O produto e o problema

**whaviso = WhatsApp + aviso.** Automatize seus avisos de pagamento por WhatsApp e controle tudo pelo painel.

Dois pilares:
1. **Avisar:** ciclo automático de mensagens por WhatsApp (de 2 dias antes até 1 dia depois), disparado quando o combinado é aceito.
2. **Controlar:** painel do que está pendente, do que já entrou e do que você ainda vai pagar.

**Problema que resolve:** lembrar manualmente quem combinou de pagar é chato, esquecível e desgastante. O whaviso agenda e envia os avisos sozinho, e o painel mostra o que falta entrar, sem ninguém precisar ficar lembrando na mão. O sistema nunca cobra, ele só lembra.

## 2. Promessa e frases-âncora

- Promessa de marketing: **"Receba o que combinou sem precisar cobrar."**
- Frase principal do produto: **"Avise o combinado."**
- Variações aprovadas: "Cadastrou, agendou, recebeu." · "Seus recebimentos no automático." · "Agende o aviso. Saiba quando recebeu."

## 3. Regras de linguagem (inegociáveis)

- **Proibido:** dívida, devendo, atraso/atrasado, cobrança, cobrar, inadimplência. Padrão: `d[ií]vida|devendo|atras(o|ad)|cobran|inadimpl`. (A palavra "cobrar" só pode aparecer negada: "sem cobrar".)
- **Aprovado:** aviso, lembrete, combinado, acordo.
- **Sem travessão** (em dash `—`, en dash `–`). Use vírgula, dois-pontos, parênteses. Hífen comum `-` é permitido.
- **Gênero neutro:** não inferir gênero de quem lê nem da persona na copy. Evitar "bem-vindo/a", "obrigado/a", "o cliente". Fonte: `backend/packages/shared/src/contracts/linguagem.ts`.

## 4. Público

**Alvo primário:** revendedores de cosmético e de catálogo (clientela recorrente, venda parcelada na confiança, ticket pequeno e repetido).

**Adjacentes:** confeiteiras e doces sob encomenda, beleza autônoma com pacote (manicure, cabeleireira), professores particulares.

**Comércio e serviço de bairro:** fiado de caderneta (mercadinho, padaria, serviços recorrentes).

**Bolsões regionais e culturais (a validar):** em qualquer região há economias locais onde parcelar na confiança é norma, e nem sempre via cosmético. Dois eixos criam esses bolsões: cultura local (cidade pequena, comunidade unida, caderneta) e renda sazonal (safra, temporada, pesca). Exemplos: interior, ribeirinhos, comunidades pesqueiras, agro familiar, colônias do Sul. Tratar como pesquisa, sem romantizar região.

Critério comum de quem é cliente: recebe de várias pessoas + pagamento combinado pra depois + a relação continua depois (então cobrar de forma dura estraga o vínculo). Detalhe em `potenciais-clientes.md`.

## 5. Pilares de conteúdo e funil

Conteúdo amplo na superfície, específico no alvo (funil). Detalhe e ângulos em `ideias-conteudo.md`.

1. **Finança leve pra quem vende** (topo): atrai amplo, não fala do produto.
2. **A dor de lembrar sem cobrar** (meio, emocional): o coração do posicionamento.
3. **Vender parcelado na confiança sem perder dinheiro** (meio, prático).
4. **Bastidor e propósito do projeto** (fundo, storytelling).
5. **Mostrar o produto** (fundo, conversão).

## 6. Canais e o que não prometer

- **Facebook + Instagram em paralelo**, modelo de **transmissão** (não comunidade): conteúdo visual e de leitura, baixo tempo, automatizável.
- **Formatos:** estáticos (carrossel e imagem única). **Sem vídeo/Reels, sem YouTube.**
- **Escuta** fica manual e esporádica (circular em grupos só para ler, sem postar).
- **Não prometer funções ainda não ligadas:** auto-envio do convite por template Meta, OTP de telefone, backfill por telefone, fases gated do "informou que pagou". Falar só do que já funciona.

## 7. Planos (alavanca de marketing)

A conta nasce no Free. O plano destrava capacidade e recursos. Use como argumento de valor, sem virar foco na fase de estudo.

| Plano | Preço | Destrava |
|---|---|---|
| Free | R$ 0 | Agenda e visualização (50 itens); não envia avisos |
| Start | R$ 9,90/mês | Avisos automáticos no WhatsApp, menu de texto livre, confirmação de pagamento (100 itens) |
| Profissional | R$ 29/mês | Tudo do Start + recorrência, cadência configurável, totais por período (150 itens) |
| Plus | R$ 29/unidade ao mês | Vendido por unidade (1 combinado ativável + 10 de agenda) |

## 8. Tom de voz

- **Marca e marketing:** leve, prático, humano, sem julgamento. Nunca tom de guru financeiro nem de banco. Quem usa quer resultado e alívio.
- **Mensagens ao destinatário (dentro do produto):** neutras e informativas, por restrição do canal (WhatsApp), não por identidade. Isso é detalhe do produto, não a voz do marketing.
- **Identidade visual:** verde suave (não agressivo), motivo de sino, estética próxima do WhatsApp sem copiar. Autenticidade acima de polimento.
