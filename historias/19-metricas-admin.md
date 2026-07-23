# Épico 19: Métricas administrativas (visão do sistema, owner)

> O owner precisa enxergar se o produto está cumprindo o seu objetivo (avisos saindo, sendo aceitos, sendo pagos) sem abrir a conta de ninguém. Este épico documenta a tela `/admin/metricas` (owner), que já existia parcialmente no código antes desta escrita: contagens agregadas de usuários, combinados e envios, mais (2026-07-22) um resumo financeiro agregado do sistema inteiro, espelhando os mesmos três números que o usuário já vê em Gestão > Resultados (Épico 18 H18.2), mas somando todos os cobradores.
> **Só agregado, nunca individual:** o owner vê quantidades e somas, nunca nome, telefone, chave Pix ou o conteúdo de um combinado específico. Mesma régua de privilégio do owner-só-vê-templates-de-config (Épico 12): o owner administra a plataforma, não bisbilhota o negócio de quem usa.
> Convenções de sempre: sem travessão, sem palavras proibidas (nada de "dívida/cobrança/atraso/inadimplência"), neutras quanto a gênero; dinheiro em **centavos** (exibido em reais); datas em America/Sao_Paulo.

---

### H19.1: Contagens agregadas do sistema 🟢 `[x]`
Como **owner**, quero ver quantos usuários, combinados (por status) e envios (por status) existem no sistema, para entender o tamanho e a saúde geral do produto sem abrir nenhuma conta.
*Critérios de aceite:*
- [ ] A tela `/admin/metricas` mostra o **total de usuários**, a **distribuição de combinados por status** e a **distribuição de envios por status**, com um período opcional (De/Até, filtrando por `data_combinada` dos combinados e `agendado_para` dos envios).
- [ ] Mostra também taxas derivadas com denominador honesto: **taxa de aceite** (combinados que saíram de `aguardando_aceite`) e **taxa de falha de envio** (envios `falhou` sobre o total).
- [ ] Mostra o **total e a taxa de opt-out** (combinados com pelo menos um evento `optout` no período, sobre o total de combinados do período).
- [ ] Tudo calculado no **backend**, sem nome/telefone/conteúdo de combinado individual: só contagens e somas agregadas.
- [ ] Acesso restrito a `role='owner'` (`requireRole('owner')`); qualquer outra conta recebe `403`.

---

### H19.2: Resumo financeiro agregado do sistema 🟢 `[x]` (2026-07-22)
Como **owner**, quero ver o resumo financeiro do sistema inteiro (recebido, a receber, ticket médio), para entender se o produto está cumprindo o objetivo de negócio agregando todos os cobradores, sem abrir a conta de ninguém.
*Critérios de aceite:*
- [ ] A tela `/admin/metricas` mostra, somando **todos os cobradores** do sistema, os mesmos três números que o usuário já vê em Gestão > Resultados (Épico 18 H18.2): **recebido** (combinados `pago`), **a receber** (combinados ativos ainda não pagos) e **ticket médio** (recebido dividido pela quantidade de combinados pagos).
- [ ] Usa o **mesmo critério de estado** do painel do usuário (H9.2: os mesmos conjuntos "ativos não pagos" e "pago", fonte única em `shared/estados.ts`), para os números do owner nunca divergirem do que cada usuário vê da própria conta.
- [ ] Respeita o **mesmo período opcional** (De/Até) já usado pelas demais métricas desta tela.
- [ ] **Só números agregados:** o resumo nunca inclui nome, telefone, chave Pix nem qualquer dado de um combinado específico; "cumprir o objetivo do produto" aqui significa ver a saúde financeira do sistema como um todo, não auditar o negócio de uma conta.
- [ ] Calculado inteiramente no **backend**; o front só exibe.

---

### Decisões tomadas
- **Uma tela só** (`/admin/metricas`) reúne contagens de uso (H19.1) e o resumo financeiro (H19.2), em vez de duas telas separadas.
- **Resumo financeiro do sistema espelha os três números do usuário** (recebido/a receber/ticket médio), nunca quebrado por conta nem por cliente: é uma visão de saúde do produto, não uma auditoria de conta individual (auditoria de conta já existe em `/admin/usuarios`, Épico 11, com saldo mas sem dado financeiro do combinado).
- **Sem PII em métrica agregada:** nenhuma soma/contagem desta tela pode ser decomposta pelo front em nome, telefone ou combinado específico.

### Decisões em aberto
- Nenhuma pendente.

### Fora de escopo deste épico
- ❌ Auditoria de uma conta específica (usuários, envios, avisos, notificações por conta): Épico 11 (`/admin/usuarios`) e as telas de auditoria já existentes (`/admin/envios`, `/admin/avisos`, `/admin/notificacoes`).
- ❌ Quebra do resumo financeiro por cobrador/cliente: manter agregado é decisão deliberada de privacidade (H19.2); quebrar por conta seria auditoria individual, fora deste épico.
- ❌ Gestão de templates/mensagens (Épico 12) e créditos/curva de preço (Épico 11): telas próprias do owner, não fazem parte deste épico.
