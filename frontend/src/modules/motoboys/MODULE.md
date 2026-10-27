# motoboys (frontend)

## Propósito
Motoboys da loja ativa (`/motoboys`, grupo entrega) em duas abas:
- **Cadastro**: lista e cadastro/edição do cadastro de entrega (veículo, placa, Pix) de uma
  pessoa de cargo `motoboy`; arquivar/reativar.
- **Fechamento do dia**: por dia de negócio, quanto cada motoboy recebe (entregas + ajustes),
  lançamentos expansíveis, ajuste manual (bônus/desconto) e "marcar como pago".

## Entry points
- `index.ts`: export default da página (para `lazy(() => import('@/modules/motoboys'))`).

## Dados (`api.ts`, raiz de cache `['motoboys']`)
- `GET|POST /v1/motoboys`, `PATCH /v1/motoboys/:id`, `POST /v1/motoboys/:id/ativar|desativar`,
  `POST /v1/motoboys/:id/lancamentos`, `GET /v1/motoboys/fechamentos?data=`,
  `POST /v1/motoboys/fechamentos/:id/pagar`.
- `GET /v1/pessoas` (`usePessoasMotoboy`): chamada HTTP pelo `api_client` (NÃO import do módulo
  pessoas) filtrando `cargo_chave === 'motoboy'`, para escolher a pessoa no cadastro. Pessoas que
  já têm cadastro de entrega (inclusive arquivadas) são ocultadas.
- Contratos: `@/shared/contracts/_generated/motoboys` (+ `pessoas` e `enums`, só leitura).

## Notas
- PII: telefone e Pix só saem mascarados (últimos 4). A tela **não** usa "revelar Pix"; trocar o
  Pix = digitar tipo + chave nova (os dois juntos, como a api exige); remover = os dois `null`.
- Dinheiro em centavos. O total do dia é **derivado pelo servidor**; ao pagar a tela envia o total
  que o dono viu e a api responde 409 se mudou (a lista recarrega e o aviso aparece no dialog).
- Ajuste: valor digitado positivo, sinal pelo segmento (bônus/desconto). Append-only: correção =
  novo ajuste oposto. Dia pago não aceita ajuste (botões somem).
- Dia de negócio em America/Sao_Paulo (`hojeSaoPaulo`), nunca o UTC do navegador.
- Sem primitivo novo: só `@/shared/ui`. Módulo não importa módulo.
