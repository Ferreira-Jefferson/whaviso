# Pesquisa de funcionalidades: sistema de gestão de restaurante e delivery

> Análise de lacunas do plano whaviso contra o conjunto de funcionalidades que o mercado
> brasileiro de gestão de restaurante e delivery considera padrão. Produto whaviso: automação de
> pedidos de restaurante por WhatsApp (atendente de IA) + operação de entrega, multi-tenant
> Conta (empresa) -> Lojas (restaurantes) -> Números.
>
> Base de produto: STATUS.md (ondas e módulos), ARQUITETURA.md, BANCO.md (schema baseline).
> Base de mercado: iFood, Saipos, Anota AI, Brendi, Goomer, Colibri, Food Sistemas, Foody
> Delivery, OlaClick, Repediu, SisFood, Linx, e referências globais Toast e Square for Restaurants.

## Resumo executivo

O plano atual **não está vazio**. O inventário de módulos (STATUS.md, mais a tabela de features da
revisão de produto) já cobre a maior parte do que o mercado chama de sistema de gestão de delivery:
cardápio com grupos de opções, pedidos em kanban, conversas, clientes, zonas de entrega, motoboys com
fechamento, despacho e roteirização, Pix na conversa, dashboard, CRM com RFM, campanhas, avaliações,
promoções/cupons, fidelidade/cashback, agendamento, KDS, importação de cardápio por IA, canais (iFood)
e um livro-razão de custos. Nesse eixo o whaviso está **à frente** de um cardápio digital comum, porque
junta atendimento por IA, operação de entrega e gestão num só produto, exatamente o posicionamento que
diferencia Saipos (gestão) de Anota AI (cardápio) no mercado.

A sensação de "fraco" vem de duas coisas reais, não de ausência de catálogo:

1. **Muitas features estão só como linha numa tabela** (a tabela da revisão de produto em STATUS.md),
   sem arquivo de módulo, sem onda firme e sem schema detalhado. Elas existem como intenção, não como
   plano executável. Isso faz o escopo parecer menor do que é.
2. **Três lacunas de verdade**, já confirmadas pelo dono, que o schema baseline não contempla e que
   são espinha dorsal de operação de restaurante (não só delivery):
   - **Funcionários + Cargos** (equipe da loja, com "motoboy" como cargo fixo de sistema). Hoje não
     existe no plano: há `motoboys` isolado na entrega, mas não um cadastro de pessoas e cargos da loja
     (cozinheiro, garçom, atendente, motoboy) com escala e horários.
   - **Estoque de insumos (matéria-prima)** distinto do estoque por item do cardápio. O plano tem
     `API-estoque` por produto com ficha técnica "como fatia seguinte"; o dono quer o estoque de
     insumos (arroz, feijão, carne) como primeira classe, não como anexo.
   - **Quantidade disponível por item do cardápio.** O schema tem `ativo` e `esgotado_ate` (liga/desliga
     e "esgotado até"), mas não uma **quantidade numérica** disponível por item (ex.: "15 marmitas hoje").

O que está **genuinamente fora** do plano e é padrão de mercado, mas depende de decisão de escopo do
dono (não é delivery-WhatsApp puro): **PDV/caixa** (abrir/fechar caixa, sangria, suprimento) e
**salão (mesas e comandas)**. Ficam listados como decisões em aberto, não como lacuna a preencher às
cegas.

Veredito: o caminho para o escopo "encher" não é inventar módulos novos em massa, e sim (a) promover as
features-tabela a módulos com arquivo e onda, e (b) abrir os três módulos confirmados (funcionários,
estoque de insumos, quantidade por item). Esta pesquisa detalha os dois.

---

## Inventário de funcionalidades por eixo

Legenda de **prioridade**: `imprescindivel` (sem isso o produto não entrega a promessa) ·
`importante` (esperado pelo mercado, diferencia) · `futuro` (agrega, pode esperar).
Legenda de **status**: `coberto` (há módulo no plano) · `parcial` (há módulo mas incompleto ou só como
linha de tabela sem arquivo/onda) · `lacuna` (não existe no plano).

### Eixo 1: Pedidos, canais e recebimento

| Funcionalidade | O que é | Por que importa (WhatsApp + delivery) | Prioridade | Status no whaviso |
|---|---|---|---|---|
| Pedido por WhatsApp (IA) | Cliente monta e fecha o pedido conversando; atendente de IA entende texto e áudio | É o core do produto; Brendi/Anota AI/Goomer provam demanda (Goomer diz automatizar 80% das interações) | imprescindivel | `coberto` (AT-motor-min, AT-harness, AT-entender, API-pedidos) |
| Pedido balcão / retirada / entrega | Tipos de pedido além do delivery (retirada no local, consumo no balcão) | Operação real tem retirada; `pedidos.origem` já prevê `manual` | importante | `parcial` (pedidos tem origem manual; sem fluxo de retirada/balcão explícito) |
| Kanban de pedidos ao vivo | Painel novo -> em preparo -> saiu -> entregue, em tempo real | Padrão de todo gestor; SSE já previsto | imprescindivel | `coberto` (API-pedidos kanban, F5 SSE) |
| Repetir pedido / troco / forma de pagamento carimbada | Refazer último pedido, registrar troco e meio de pagamento no pedido | Erro operacional real; já reconhecido na revisão de produto | importante | `parcial` (REVISAO: pedidos+AT; sem arquivo) |
| Pedido agendado (data/hora futura) | Cliente pede para entrega em horário futuro | Comum em marmita/encomenda; mercado oferece | importante | `parcial` (API-agendamento como linha de tabela) |
| Impressão de pedido / comanda / etiqueta | Imprimir o pedido na cozinha/expedição (ESC-POS) | Cozinha sem tela depende de papel; Saipos/Colibri imprimem | importante | `parcial` (ClienteImpressora citado; sem módulo) |
| Integração iFood e marketplaces | Puxar pedidos de iFood/Rappi/99 numa fila só | Saipos centraliza 100+ plataformas numa tela; reduz tablet-ilha | importante | `parcial` (API-canais / ClienteCanal; origem ifood no schema; sem arquivo) |

Fontes: [Saipos sistema](https://saipos.com/), [Anota AI](https://anota.ai/),
[Brendi WhatsApp](https://brendi.com.br/blog/crm-restaurantes-delivery-marketing/),
[Goomer IA WhatsApp](https://gironews.com/food-service/goomer-lanca-ia-para-automatizar-pedidos-via-whatsapp/),
[Simpliza integração iFood+WhatsApp](https://blog.simpliza.com.br/delivery/como-integrar-pedidos-do-delivery/).

### Eixo 2: Cardápio

| Funcionalidade | O que é | Por que importa | Prioridade | Status no whaviso |
|---|---|---|---|---|
| Categorias, itens, grupos de opções/complementos | Cardápio normalizado com grupos reutilizáveis (tamanho, adicional, obrigatório/opcional, limite) | Ponto de normalização mais sensível; todo sistema tem | imprescindivel | `coberto` (API-cardapio: grupos_opcoes, opcoes, categorias, itens, herança + exceção) |
| Disponibilidade por horário (categoria por dia/faixa) | Cardápio de almoço x jantar, item só em certo horário | Esperado; o schema programa categoria por dia/horário | importante | `coberto` (categorias com programação por dia/horário) |
| Pausar item / esgotado (liga-desliga) | Tirar item do ar quando acaba, volta sozinho | Saipos/açaí pausam topping que some do cardápio e apps | imprescindivel | `coberto` (itens.ativo + esgotado_ate; opcoes.esgotado_ate) |
| **Quantidade disponível por item (numérica)** | Estoque de venda do próprio item do cardápio: "15 marmitas hoje", decrementa a cada venda, zera -> esgota | Marmita/prato do dia/lote limitado; evita vender o que não há; **confirmado faltando pelo dono** | imprescindivel | `lacuna` (só ativo/esgotado_ate, sem contador numérico) |
| Importar cardápio por foto/PDF (IA) | Subir foto do cardápio e o LLM monta os itens | Reduz atrito de onboarding; diferencial | importante | `coberto` (API-cardapio-imp, AT-importar) |

Fontes: [Saipos](https://saipos.com/), [FoodSistemas açaí (pausa de topping)](https://foodsistemas.com.br/segmentos/sistema-para-acai/),
[VEX MENU estoque/ficha](https://vexmenu.com/funcionalidades/estoque-restaurante).

### Eixo 3: Cozinha (KDS) e preparo

| Funcionalidade | O que é | Por que importa | Prioridade | Status no whaviso |
|---|---|---|---|---|
| KDS / display de cozinha | Tela que mostra pedidos na cozinha em tempo real, com tempo de espera e alerta de atraso | Tira o papel, ordena a produção; Saipos/Colibri/Food Sistemas oferecem | importante | `parcial` (FR-kds como linha de tabela; sem arquivo/onda firme) |
| Fluxo de preparo / etapas do pedido | Marcar item/pedido como em preparo, pronto, saiu | Alimenta o KDS e o kanban | importante | `parcial` (status de pedido existe; granularidade por item não detalhada) |
| Roteamento por estação (cozinha/bar/expedição) | Cada setor vê só o que lhe cabe | Operação maior separa estações; Food Sistemas controla por garçom/estação | futuro | `lacuna` |

Fontes: [Saipos KDS](https://saipos.com/sistema/restaurante/monitor-kds-para-restaurante),
[Food Sistemas KDS](https://foodsistemas.com.br/funcionalidades/kds/),
[Linx KDS](https://linx.com.br/blog/por-que-organizar-os-pedidos-da-cozinha-com-o-display-kds/).

### Eixo 4: Salão (mesas e comandas) — decisão de escopo

| Funcionalidade | O que é | Por que importa | Prioridade | Status no whaviso |
|---|---|---|---|---|
| Comandas e mesas | Abrir mesa/comanda, lançar itens, fechar conta, dividir | Restaurante de salão precisa; delivery puro não | futuro | `lacuna` (produto é delivery/WhatsApp; decisão em aberto) |
| App do garçom / QR na mesa | Garçom lança pelo celular; cliente pede por QR na mesa | Saipos/BeeFood oferecem; fora do foco atual | futuro | `lacuna` (decisão em aberto) |

Fontes: [Food Sistemas comanda](https://foodsistemas.com.br/funcionalidades/kds/),
[BeeFood QR na mesa](https://beefood.com.br/monitor-kds/).

### Eixo 5: PDV / caixa — decisão de escopo

| Funcionalidade | O que é | Por que importa | Prioridade | Status no whaviso |
|---|---|---|---|---|
| Abrir/fechar caixa, sangria, suprimento | Controle de operador de caixa, retirada e reforço de dinheiro, fechamento do turno | Padrão do PDV físico (Food Sistemas); relevante se houver balcão/retirada com dinheiro | importante (se houver balcão) | `lacuna` (decisão em aberto; sem nota fiscal, que o dono excluiu) |
| Formas de pagamento e conciliação | Dinheiro, cartão, Pix, carimbados no pedido/turno | Fechamento do dia confiável | importante | `parcial` (Pix na conversa coberto; conciliação de caixa não) |

Fontes: [Food Sistemas PDV/caixa](https://foodsistemas.com.br/funcionalidades/kds/),
[OlaClick gestão delivery](https://olaclick.com/ponto-de-venda/gestao-delivery-restaurante/).
Nota: **nota fiscal / fiscal / SPED estão fora de escopo por decisão do dono** (API-fiscal só via
emissor de terceiro atrás de `ClienteFiscal`, nunca motor fiscal por UF).

### Eixo 6: Clientes, CRM e pós-venda

| Funcionalidade | O que é | Por que importa | Prioridade | Status no whaviso |
|---|---|---|---|---|
| Cadastro de cliente + endereços | Cliente por loja (telefone só hash), endereços, repetir último endereço | Base de tudo; fecha pedido mais rápido | imprescindivel | `coberto` (API-clientes, enderecos) |
| Histórico e RFM (recência/frequência/valor) | Perfil de compra por cliente, o que pede, ticket médio | Maior diferencial segundo a própria revisão de produto; Repediu/Brendi usam | importante | `parcial` (API-crm + view clientes_metricas; sem arquivo/onda firme) |
| Campanhas por WhatsApp (opt-out, template, janela 24h) | Disparo segmentado pela outbox, respeitando opt-out e janela Meta | Reativação de inativo; recompra; cuidado LGPD/Meta | importante | `parcial` (API-campanhas como linha de tabela) |
| Avaliação / pós-venda | Pedir e registrar avaliação do consumidor após a entrega | Reputação e reativação; Repediu lê avaliação do iFood | importante | `parcial` (API-avaliacoes; tabela avaliacoes reservada; sem arquivo) |

Fontes: [Brendi CRM delivery](https://brendi.com.br/blog/crm-restaurantes-delivery-marketing/),
[Repediu](https://repediu.com.br/), [SisFood marketing](https://www.sisfood.com.br/solucoes/marketing-para-restaurante).

### Eixo 7: Fidelidade, cupons e promoções

| Funcionalidade | O que é | Por que importa | Prioridade | Status no whaviso |
|---|---|---|---|---|
| Cupons e combos / preço promocional | Camada de desconto e preço promocional sobre o cardápio | Conversão; iFood mostra que cupom tira da margem (calcular custo) | importante | `parcial` (API-promocoes como linha de tabela) |
| Fidelidade / cashback | Programa de pontos ou cashback do consumidor final | Retenção e lock-in; iFood comprou CRMBonus para isso; estudo cita +83,5% de gasto com cashback (dado de fornecedor) | importante | `parcial` (API-fidelidade como linha de tabela) |

Fontes: [iFood fidelidade](https://blog-parceiros.ifood.com.br/programa-de-fidelidade/),
[Cupom iFood (Saipos)](https://saipos.com/integracoes/ifood/cupom-ifood),
[Product Gurus (iFood x CRMBonus)](https://www.productgurus.com.br/p/aquisicao-da-crmbonus-pelo-ifood).

### Eixo 8: Estoque de insumos e ficha técnica

| Funcionalidade | O que é | Por que importa | Prioridade | Status no whaviso |
|---|---|---|---|---|
| **Estoque de insumos (matéria-prima)** | Controle de arroz, feijão, carne, pão, embalagem, com unidade (kg, g, un) e estoque mínimo/alerta | Primeira classe de operação; distinto do estoque de venda do item; **confirmado faltando pelo dono** | importante | `lacuna` (API-estoque atual é por produto; insumo não é primeira classe) |
| **Ficha técnica (receita) que baixa insumo ao vender** | Receita do prato: cada item consome X de cada insumo; venda baixa o insumo | Baixa precisa e CMV real; Saipos baixa por ficha técnica a cada venda | importante | `parcial` (plano cita ficha técnica "como fatia seguinte"; dono quer de primeira classe) |
| CMV e custo por prato | Custo de mercadoria vendida a partir dos insumos e receitas | Gestão de margem; dashboards de CMV por prato | futuro | `lacuna` (depende de insumo+ficha; não modelado) |
| Compras / entrada de nota de insumo | Registrar entrada de insumo (compra) que soma ao estoque | Fecha o ciclo do estoque | futuro | `lacuna` |

Distinção central (confirmada pelo dono): **dois estoques diferentes.** (1) quantidade disponível do
**item do cardápio** (eixo 2, "15 marmitas"), decremento direto na venda; (2) estoque de **insumo**,
decrementado pela **ficha técnica** do item vendido (vender 1 marmita baixa 200 g de arroz, 150 g de
feijão, 120 g de carne). São tabelas e telas distintas.

Fontes: [Saipos controle de estoque / ficha técnica](https://saipos.com/sistema/restaurante/controle-de-estoque-para-restaurante),
[VEX MENU ficha técnica + CMV](https://vexmenu.com/funcionalidades/estoque-restaurante),
[Brendi guia Saipos](https://brendi.com.br/blog/saipos-sistema-para-restaurantes/).

### Eixo 9: Equipe e funcionários

| Funcionalidade | O que é | Por que importa | Prioridade | Status no whaviso |
|---|---|---|---|---|
| **Funcionários da loja** | Cadastro de pessoas da operação (cozinheiro, garçom, atendente, motoboy, auxiliar), contato, status ativo | Operação real tem equipe; hoje só há `membros` (usuários do painel) e `motoboys` (entrega), não a equipe | importante | `lacuna` |
| **Catálogo de Cargos** | Lista de cargos por conta/loja, com "motoboy" como **cargo fixo de sistema, não apagável**, usado pela entrega | Hierarquia de restaurante é padrão (gerente, chef, cozinheiro, garçom, motoboy); o cargo motoboy liga funcionário à operação de entrega | importante | `lacuna` |
| **Escala / dias e horários** | Dias e turnos de trabalho por funcionário (almoço, pico do jantar), sem folha de pagamento | Escala por faixa de demanda é prática de delivery; diária de motoboy fica registrada na escala | importante | `lacuna` |
| Vínculo motoboy <-> funcionário | O motoboy da entrega é um funcionário de cargo motoboy | Unifica o cadastro de motoboy (hoje isolado) com a equipe | importante | `parcial` (motoboys existe isolado; precisa casar com funcionários/cargo) |

Fora de escopo por decisão do dono: **folha de pagamento e RH burocrático** (CLT, holerite, encargos).
A escala guarda dias/horários e diária, não processa folha.

Fontes: [Saipos cargos de restaurante](https://saipos.com/gestao-de-restaurante/cargos-de-um-restaurante),
[Controle na Mão hierarquia](https://controlenamao.com.br/blog/cargos-e-funcoes-de-um-restaurante/),
[Foody escala de motoboys](https://foodydelivery.com/blog/como-montar-escala-de-motoboys/).

### Eixo 10: Entrega e logística

| Funcionalidade | O que é | Por que importa | Prioridade | Status no whaviso |
|---|---|---|---|---|
| Zonas de entrega (taxa por bairro/área) | Bairro/polígono -> taxa do cliente + valor do motoboy | Precifica a entrega no pedido; padrão | imprescindivel | `coberto` (API-zonas; + pedido mínimo e frete grátis por zona) |
| Motoboys e fechamento do dia | Cadastro do entregador, acerto do dia (automático + manual), marcar pago | Dor real do delivery com frota própria | imprescindivel | `coberto` (API-motoboys + fechamento) |
| Despacho (atribuir motoboy, montar corrida) | Atribuir motoboy ao pedido; lote de entregas | Base da operação; responsabilização pelo nome no pedido | importante | `coberto` (API-despacho) |
| Roteirização (agrupar por preparo + proximidade) | Sugerir corrida por tempo de preparo e geografia; matriz de distância | Camada de maior valor; Saipos/Foody oferecem | futuro | `coberto` (API-roteiriza + ClienteMapas; onda 5) |
| Rastreio / status ao cliente | Avisar o cliente "saiu para entrega"; link de acompanhamento | OlaClick/Foody dão rastreio em tempo real; reduz "cadê meu pedido" | importante | `parcial` (status de pedido existe; aviso/rastreio ao cliente não detalhado) |

Fontes: [Saipos roteirização](https://saipos.com/sistema/roteirizacao-de-entregas),
[Foody frota própria](https://foodydelivery.com/restaurantes-frota-propria/),
[OlaClick](https://olaclick.com/ponto-de-venda/gestao-delivery-restaurante/).

### Eixo 11: Multi-unidade (rede / franquia)

| Funcionalidade | O que é | Por que importa | Prioridade | Status no whaviso |
|---|---|---|---|---|
| Uma empresa, várias lojas | Conta com N lojas, escopo e papéis por loja | Kernel do produto; rede compara unidades | imprescindivel | `coberto` (Conta -> Lojas -> Números no kernel; membros por loja) |
| Painel consolidado da rede | Métricas por loja e consolidadas, ranking entre unidades | Rede quer comparar lojas; mercado oferece visão de rede | importante | `parcial` (dashboard é por loja; consolidado multi-loja não detalhado) |
| Cardápio replicado entre lojas | Editar cardápio base e propagar para unidades | Franquia padroniza; Ecletica/Brendi citam | futuro | `lacuna` |

Fontes: [Brendi multi-unidades](https://brendi.com.br/blog/sistema-delivery-multi-unidades/),
[SisFood gestão/BI](https://www.sisfood.com.br/solucoes/gestao-para-restaurante).

### Eixo 12: Relatórios, dashboard e custos

| Funcionalidade | O que é | Por que importa | Prioridade | Status no whaviso |
|---|---|---|---|---|
| Dashboard da loja | Read-model de vendas, pedidos, conversas em tempo real | Gestão do dia; esperado | imprescindivel | `coberto` (API-dashboard) |
| Relatórios gerenciais / BI | Relatórios de fundo (vendas por período, por item, por canal, DRE/CMV) | Gestão de margem; Saipos/SisFood fazem DRE e CMV | importante | `parcial` (API-relatorios como linha de tabela) |
| Observabilidade de custos externos | Livro-razão de LLM, WhatsApp, mapas, fiscal, por loja | Protege a margem do SaaS (Meta cobra por mensagem) | importante | `coberto` (API-custos, eventos_custo) |

Fontes: [SisFood BI/DRE](https://www.sisfood.com.br/solucoes/gestao-para-restaurante),
[CMV na DRE (MarketUp)](https://suporte.marketup.com/hc/pt-br/articles/360001063763).

### Eixo 13: Plataforma (whaviso operadora) e atendimento

| Funcionalidade | O que é | Por que importa | Prioridade | Status no whaviso |
|---|---|---|---|---|
| Console da plataforma (clientes, cobrança, funil, crescimento) | Restaurante é cliente da whaviso; operador vê contas, assinaturas, MRR, churn | Negócio do SaaS; separado do plano da loja | imprescindivel | `coberto` (P-clientes, P-cobranca, P-funil, P-painel) |
| Handoff humano na conversa | Atendente humano assume a conversa do cliente | Casos que a IA não resolve; esperado | importante | `coberto` (API-handoff) |
| Base de conhecimento / RAG por loja | Respostas da IA ancoradas em conteúdo aprovado da loja | Qualidade e compliance do atendimento | importante | `coberto` (AT-rag, API-conhecimento) |

---

## Tabela de lacunas priorizada

Só o que falta (`lacuna`) ou está incompleto (`parcial`). Nome de módulo no estilo dos existentes.
Onda sugerida segue a lógica de dependência de STATUS.md (núcleo -> IA -> entrega -> negócio ->
avançado). "Promover" = a feature já existe como linha de tabela e precisa de arquivo de módulo e onda.

| # | Lacuna | Prioridade | Módulo proposto | Onda | Depende de | Observação |
|---|---|---|---|---|---|---|
| 1 | Quantidade disponível por item do cardápio (numérica) | imprescindivel | **API-cardapio-stock** (ou coluna `quantidade_disponivel` em `itens` + decremento na venda) | 1 | API-cardapio, API-pedidos | Confirmado pelo dono. Distinto de insumo. Decrementa na venda, zera -> esgota |
| 2 | Funcionários + catálogo de Cargos (motoboy cargo fixo) | importante | **API-funcionarios** + **API-cargos** | 3 | API-lojas; casar com API-motoboys | Confirmado pelo dono. Cargo motoboy não apagável, usado pela entrega. Sem folha |
| 3 | Escala / dias e horários do funcionário | importante | parte de **API-funcionarios** (sub-fatia `escalas`) | 3 | API-funcionarios | Confirmado. Registra turno e diária; sem folha de pagamento |
| 4 | Estoque de insumos (matéria-prima) como primeira classe | importante | **API-estoque-insumos** (insumos, unidades, mínimo, movimentos) | 5 | API-cardapio | Confirmado. Distinto do estoque de item; arroz/feijão/carne |
| 5 | Ficha técnica (receita) que baixa insumo ao vender | importante | **API-ficha-tecnica** (receita item -> insumos) | 5 | API-estoque-insumos, API-pedidos | Baixa por venda; base do CMV real |
| 6 | KDS / display de cozinha | importante | promover **FR-kds** + **API-kds** (fila de preparo) + ClienteImpressora | 3 | API-pedidos, F5 (SSE) | Hoje só linha de tabela |
| 7 | CRM / RFM do consumidor final | importante | promover **API-crm** + **FR-crm** | 3 | API-pedidos, API-clientes | Maior diferencial; só linha de tabela |
| 8 | Campanhas por WhatsApp (opt-out, template, 24h) | importante | promover **API-campanhas** | 4 | API-crm, ZAP-enviar | Cuidado LGPD/Meta; só linha de tabela |
| 9 | Avaliação / pós-venda do consumidor | importante | promover **API-avaliacoes** | 4 | API-pedidos | Reputação e reativação; só linha de tabela |
| 10 | Promoções / cupons / combos | importante | promover **API-promocoes** | 4 | API-cardapio, API-pedidos | Camada de preço promocional; só linha de tabela |
| 11 | Fidelidade / cashback | importante | promover **API-fidelidade** | 5 | API-crm, API-pedidos | Retenção/lock-in; só linha de tabela |
| 12 | Relatórios gerenciais / BI (DRE/CMV) | importante | promover **API-relatorios** | 4 | API-pedidos, API-dashboard | CMV depende de ficha técnica (#5); só linha de tabela |
| 13 | Integração iFood / marketplaces (ClienteCanal) | importante | promover **API-canais** | 5 | API-pedidos | Origem ifood já no schema; só linha de tabela |
| 14 | Pedido agendado (data/hora futura) | importante | promover **API-agendamento** (em pedidos) | 3 | API-pedidos | Só linha de tabela |
| 15 | Impressão de pedido / etiqueta (ESC-POS) | importante | **ClienteImpressora** (interface) | 3 | API-pedidos | Citado na arquitetura; sem módulo |
| 16 | Rastreio / aviso de status ao cliente | importante | sub-fatia de **AT-motor** / **API-pedidos** | 3 | API-pedidos, ZAP-enviar | "Saiu para entrega" ao cliente |
| 17 | Painel consolidado da rede (multi-loja) | importante | sub-fatia de **API-dashboard** | 4 | API-dashboard | Comparar unidades; dashboard hoje é por loja |
| 18 | Repetir pedido / troco / forma de pagamento | importante | **API-pedidos (+)** + AT | 1 | API-pedidos | Reconhecido na revisão; sem arquivo |
| 19 | Pedido balcão / retirada | importante | **API-pedidos (+)** (tipo de pedido) | 1 | API-pedidos | Origem manual existe; fluxo não |
| 20 | PDV / caixa (abrir/fechar, sangria) | importante (se houver balcão) | **API-caixa** (decisão em aberto) | a decidir | API-pedidos | Ver decisões em aberto; sem nota fiscal |
| 21 | Salão: mesas e comandas | futuro | **API-mesas** (decisão em aberto) | a decidir | API-pedidos | Ver decisões em aberto |
| 22 | Cardápio replicado entre lojas (franquia) | futuro | **API-cardapio (+)** (replicação) | futuro | API-cardapio | Só para rede/franquia |
| 23 | CMV / custo por prato | futuro | **API-custos-cmv** | futuro | API-ficha-tecnica | Depende de insumo + ficha |
| 24 | Compras / entrada de insumo | futuro | **API-compras** | futuro | API-estoque-insumos | Fecha o ciclo do estoque |

---

## Riscos e decisões em aberto (para o dono decidir)

1. **PDV/caixa (abrir/fechar caixa, sangria, suprimento):** entra? O whaviso é delivery por WhatsApp,
   mas operação real recebe dinheiro no balcão/retirada. Se não houver balcão com dinheiro, o caixa é
   dispensável; se houver, falta o controle de turno e conciliação. **Nota fiscal fica fora** (decisão
   já tomada; só via emissor de terceiro em `ClienteFiscal`). Sugestão: `API-caixa` opcional, por loja.

2. **Salão (mesas e comandas):** vale a pena? Hoje o produto não cobre consumo no local com mesa aberta.
   Se algum cliente-alvo é restaurante de salão (não só delivery/marmita), isso é um módulo grande
   (mesas, comandas, app do garçom, divisão de conta). Sugestão: tratar como `futuro`/opcional, não
   bloquear o núcleo de delivery.

3. **Quantidade por item x estoque de insumo: dois mecanismos ou um?** O dono confirmou os dois. Decisão
   fina: a quantidade disponível do item (ex.: "15 marmitas") pode ser (a) um contador próprio do item
   ou (b) derivada do insumo mais restrito pela ficha técnica. Recomendação: começar por (a), contador
   simples por item (onda 1), e deixar (b), derivação por ficha técnica, para a onda do estoque de
   insumos (onda 5). São complementares, não excludentes.

4. **Motoboy: unificar com Funcionários ou manter separado?** Hoje `motoboys` é um cadastro isolado da
   entrega. Com `API-funcionarios` + cargo fixo "motoboy", há sobreposição. Decisão: o motoboy da
   entrega deve ser um funcionário de cargo motoboy (cadastro único), ou os dois cadastros coexistem?
   Recomendação: cadastro único de funcionário, com o cargo motoboy habilitando os campos de entrega
   (veículo, placa, Pix) e o fechamento do dia. Evita dado duplicado e divergente.

5. **Escala sem folha: até onde?** A escala guarda dias, turnos e diária. Não processa folha, encargos
   nem ponto eletrônico (fora de escopo). Decisão: a escala precisa calcular o total a pagar por
   período (soma de diárias), ou só registrar os turnos? Para motoboy isso já se cruza com o
   fechamento do dia da entrega; alinhar os dois para não ter dois lugares somando pagamento de motoboy.

6. **Promover features-tabela a módulos:** a maior parte do "escopo fraco" se resolve transformando as
   linhas da tabela da revisão de produto (CRM, campanhas, avaliações, promoções, fidelidade,
   relatórios, canais, agendamento, KDS) em arquivos de módulo com etapas e onda. Decisão: fazer isso em
   lote agora (fecha o escopo no papel) ou sob demanda ao chegar a onda de cada um?

7. **Fora de escopo confirmado (mencionados para registro, não a construir):** folha de pagamento e RH
   burocrático; emissão de nota fiscal / fiscal / SPED / contábil (só via emissor de terceiro atrás de
   `ClienteFiscal`, nunca motor fiscal por UF); hardware de PDV pesado. Ficam citados porque são padrão
   de mercado, mas não entram.
