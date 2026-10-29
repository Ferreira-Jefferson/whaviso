// Contabilidade de consumo de embedding/rerank em `uso_llm` com o delta `tipo_uso` (migration 0018).
//
// Diferente do livro-razao de GERACAO (llm_client/uso.ts, chave BYO da loja), aqui o consumo e da
// credencial da PLATAFORMA (RAG.md secao 4). A linha ainda e atribuida a loja (loja_id) para o painel
// e o alerta de pico, mas com `tipo_uso` = embedding|rerank e `origem` = 'plataforma', separando o que
// a loja paga (geracao) do que a plataforma paga (embedding/rerank). Append-only (trigger da 0012).
import { consultar, sql, type Executor } from '@whaviso/shared/db'
import type { UsoLlm } from '@whaviso/shared/clientes'
import { idLoja, type Escopo } from '../escopo'
import type { ProvedorLlm } from '../llm_client'

export type TipoUsoRag = 'embedding' | 'rerank'

export interface RegistroUsoRag {
  escopo: Escopo
  provedor: ProvedorLlm
  modelo: string | null
  tipoUso: TipoUsoRag
  uso: UsoLlm
}

/**
 * Grava o consumo de embedding/rerank (INSERT; tabela append-only). `origem='plataforma'` e
 * `tipo_uso` explicito. SQL parametrizado, colunas explicitas.
 */
export async function registrarUsoRag(exec: Executor, r: RegistroUsoRag): Promise<void> {
  await consultar(
    exec,
    sql`insert into public.uso_llm
          (loja_id, provedor, modelo, origem, tipo_uso,
           tokens_entrada, tokens_saida, custo_estimado_centavos)
        values (${idLoja(r.escopo)}, ${r.provedor}, ${r.modelo}, 'plataforma', ${r.tipoUso},
                ${r.uso.tokensIn}, ${r.uso.tokensOut}, ${r.uso.custoEstimadoCentavos})`,
  )
}
