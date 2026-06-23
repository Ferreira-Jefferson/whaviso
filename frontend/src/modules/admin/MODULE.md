# Módulo: admin

Painel do owner: métricas, usuários, templates de mensagem (viewer + proposta de
versão, por chave), auditoria de envios, planos.

> Privacidade: o owner NÃO acessa avisos individuais de outros usuários. Não há
> tela de "avisos globais". O valor para o owner são as CONTAGENS por status,
> exibidas como gráfico (`GraficoBarras`) no Métricas a partir de `GET
> /v1/admin/metricas`.

**Papel:** owner
**Rotas:** /admin, /admin/usuarios, /admin/templates, /admin/mensagens/:chave, /admin/envios, /admin/planos

> Fronteira: este módulo NUNCA importa de outro módulo. Coordena via `@/shared/*`
> (ui, contracts, format, api_client, auth). Páginas exportadas lazy em `index.ts`.

## Templates UNIFICADOS (um modelo, um editor)

Toda mensagem do produto vive numa tabela só (`templates`, chaveada por `chave`:
`ciclo.<etapa>` + contexto, `cobrador.*`, `resposta.*`...). Conteúdo estruturado
(texto + botões + mídia). O zap é transporte genérico. Detalhes: catálogo da
estrutura em `catalogo_mensagens.ts`; ver memória `whaviso-templates-unificados`.

## Páginas

- **Metricas** (`/admin`): `GET /v1/admin/metricas`. StatCards de contagem
  (usuários, combinados, taxa de aceite, falhas de envio) + `GraficoBarras`
  (template reusável do shared, CSS puro) com a distribuição de avisos/envios
  por status. Sem lib de gráfico.
- **Templates** (`/admin/templates`): HUB de todas as mensagens, agrupadas por
  fluxo (`catalogo_mensagens.ts`), via `GET /v1/admin/mensagens`. O ciclo é uma
  TRILHA (`CicloTemplates`, nós linkam para `/admin/mensagens/ciclo.<etapa>`); as
  demais famílias viram listas (`ListaMensagens`): editáveis (status vivo + link)
  quando têm chave, ou catálogo com estado honesto quando ainda não há editor.
- **DetalheMensagem** (`/admin/mensagens/:chave`): editor ÚNICO de qualquer
  mensagem (risco #8):
  - Preview via `POST /v1/admin/mensagens/preview` (render do BACKEND, nunca do
    cliente; `WhatsAppPreview` do shared).
  - Lint de linguagem com `lintLinguagem` do shared, BLOQUEANTE na proposta (texto
    E rótulos de botão; backend revalida → 422 `linguagem_proibida`).
  - Editor de texto + paleta de variáveis da chave + editor de botões (a `acao` é
    fixa/código; o `rotulo` é editável).
  - Propor nova versão via `POST /v1/admin/mensagens` (nasce `pendente`).
  - Aprovar via `POST /v1/admin/mensagens/:id/aprovar` (manual, era Baileys).
  - Ativar via `POST /v1/admin/mensagens/:id/ativar`; não-aprovado → 409
    `template_nao_aprovado`. Apagar versão → `DELETE`; ativa → 409 `template_ativo`.
  - Sem edição ao vivo do texto enviado.
- **Envios** (`/admin/envios`), **Usuarios** (`/admin/usuarios`): UI completa
  com degradação graciosa em 404 (`buscarOpcional` em `api.ts` → estado
  "indisponível").
- **Planos** (`/admin/planos`): `GET /v1/billing/planos` (read-only). Planos
  fixos (pessoal/profissional) mostram preço pronto. O plano `parametrico`
  (personalizado) vira uma CALCULADORA que cota no servidor (`GET
  /v1/billing/cotacao?quantidade=N`, fonte única do preço; o front não recalcula
  a fórmula). Pagamento real ainda não ligado (gateway agnóstico no backend).

## Mapa de endpoints (backend real vs lacunas)

EXISTEM hoje:
- `GET /v1/admin/metricas` → `{ avisos_por_status, envios_por_status, total_usuarios }`
- `GET /v1/admin/mensagens` → `{ mensagens: [...] }` (templates unificados por chave)
- `POST /v1/admin/mensagens` (201; lint → 422 `linguagem_proibida`)
- `POST /v1/admin/mensagens/preview` → `{ render, lint_ok, palavra_proibida }`
- `POST /v1/admin/mensagens/:id/aprovar` (aprovação manual)
- `POST /v1/admin/mensagens/:id/ativar` (409 `template_nao_aprovado` se não aprovado)
- `DELETE /v1/admin/mensagens/:id` (409 `template_ativo` na versão ativa)
- `GET /v1/billing/planos` (módulo billing)

LACUNAS (UI pronta, mas o backend NÃO expõe, com degradação graciosa):
- `GET /v1/admin/usuarios` + ações de gestão (mudar plano, suspender)
- `GET /v1/admin/envios` (auditoria de envios)
- Métricas: taxa de opt-out e filtro por período NÃO existem na api atual.
- Edição de planos pelo admin: inexistente (planos são read-only).
