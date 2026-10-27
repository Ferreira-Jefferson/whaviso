# plataforma_funil (frontend)

## Proposito
Console do OPERADOR (equipe Whaviso): CRM de aquisicao. Espelha
`backend/apps/api/src/modules/plataforma_funil`. Nao e tela de loja.

## Telas (`pages/Funil.tsx`, abas + "Novo prospecto")
- Quadro (`QuadroFunil`): colunas por estagio (novo, contato, proposta, ativo, perdido) com total e os 10
  primeiros; rola na horizontal no mobile.
- Lista (`ListaProspectos`): busca, cidade, estagio, "Carregar mais" por cursor; telefone MASCARADO.
- Agenda (`AgendaFunil`): atrasados primeiro, depois por dia; "Meus" ou "Equipe toda"; janela 7/14/30
  dias; "Concluir" direto da agenda.
- Detalhe (`ProspectoDialog`): contato (telefone em claro so aqui, link `tel:`), mudar estagio (so
  transicoes validas, motivo opcional), vincular conta (vira `ativo`), registrar atividade (nota, ligacao,
  mensagem, reuniao, follow-up com dia e hora em America/Sao_Paulo) e historico com "Concluir".
- `ProspectoFormDialog`: cadastro e edicao (patch so do que mudou; campo esvaziado vira null).

## Dados
- `/v1/plataforma-funil/*` (todas `semLoja`). Contratos: `@/shared/contracts/_generated/plataforma_funil`.
- Contas para vincular: busca por HTTP em `/plataforma-clientes/contas` (sem importar o modulo).
- Cache raiz `['plataforma_funil']`; toda mutacao invalida a raiz.

## Regras
- Atividade e imutavel (append-only): concluir follow-up = nova atividade com `conclui_atividade_id`
  (tipo ligacao/mensagem/reuniao/nota; nota exige texto). Follow-up em aberto = nenhum registro carregado o conclui.
- `ativo` nunca e escolhido na mudanca de estagio, so pelo vinculo de conta.
- PII do prospecto: telefone claro nunca em lista/quadro/agenda nem em log. Erros 409 (duplicata) e 422
  (telefone invalido) mostram a mensagem do servidor.

## Primitivos locais
`AreaErro`, `SeletorConta`, `rotulos.ts`.
