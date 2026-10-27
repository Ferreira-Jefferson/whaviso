# disponibilidade (frontend)

## Propósito
Define quando a loja ativa atende e aceita pedidos. Três seções mais o estado derivado:
- **Horários de funcionamento**: faixas por dia da semana (vários períodos por dia; um período
  pode cruzar a meia-noite, quando `fecha <= abre`). Cada faixa é uma linha persistida (tem id).
- **Janela do atendente**: dias + faixa de horário em que o atendente do WhatsApp pode responder.
  Registro único por loja; salvar substitui.
- **Exceções / feriados**: datas em que a loja fecha ou muda o horário. Desativar desfaz (sem apagar).
- **Aceitando agora**: estado calculado no servidor (`aceitando_agora` + `atendente_pode_responder`).

Rota `/disponibilidade`.

## Entry points
- `index.ts`: export default da página (para `lazy(() => import('@/modules/disponibilidade'))` no registry).

## Dados
- `GET/POST /v1/disponibilidade/horarios`, `PATCH /horarios/:id`, `POST /horarios/:id/desativar`.
- `GET /v1/disponibilidade/janela`, `PUT /janela` (substitui).
- `GET/POST /v1/disponibilidade/excecoes`, `POST /excecoes/:id/desativar`.
- `GET /v1/disponibilidade/agora` (derivado; refetch a cada 60s).
- Contratos: `@/shared/contracts/_generated/disponibilidade` (não redefinir). O payload é validado
  no cliente (regex HH:mm, abre≠fecha, pelo menos um dia) antes de enviar; a api revalida no servidor.
- Cache: raiz `['disponibilidade']`. Qualquer escrita invalida a raiz toda, porque muda o derivado
  "aceitando agora".

## Componentes
- `EstadoAgora`: cartão do estado derivado (aceitando agora / atendente respondendo).
- `EditorHorarios`: lista por dia; adiciona/remove (desativa)/reativa faixa e edita abre/fecha (PATCH no blur).
- `EditorJanela`: dias em pílulas + início/fim + liga/desliga; salva via PUT.
- `EditorExcecoes`: formulário (data, fechado × horário especial, motivo) + lista com desativar.

## Notas
- Horas/datas em `America/Sao_Paulo`; a tela só edita o cadastro, o backend decide a etapa e o "agora".
- Tabelas de negócio não têm DELETE: remover período/exceção desativa (vira inativo), não apaga.
- Motivo da exceção é interno (equipe), nunca aparece para o cliente.
- Mobile-first, alvos de toque ≥ 44px; estados loading/empty/error em cada seção.
- Nenhum primitivo novo: toggles/pílulas de dia são padrões locais da tela (Button/Badge/Banner do
  design system). Se outro módulo precisar do mesmo toggle de dias, promover para `@/shared/ui`.
