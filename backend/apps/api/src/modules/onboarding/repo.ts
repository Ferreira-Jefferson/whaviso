// SQL parametrizado do modulo. Somente leitura: o onboarding e um read-model sobre
// lojas, numeros_whatsapp, itens e pedidos (leituras documentadas no MODULE.md).
import { consultarUm, sql, type Executor } from '@whaviso/shared/db'

export interface SinaisLinha {
  loja_id: string
  criado_em: Date
  endereco_ok: boolean
  horarios_ok: boolean
  numero_em: Date | null
  cardapio_em: Date | null
  primeiro_pedido_em: Date | null
}

/** Sinais crus da loja (escopo por loja_id). Pedido real = fora de rascunho. */
export function sinais(ex: Executor, lojaId: string) {
  return consultarUm<SinaisLinha>(
    ex,
    sql`select l.id as loja_id, l.criado_em,
               (l.endereco is not null and l.endereco <> '{}'::jsonb) as endereco_ok,
               coalesce(exists (
                 select 1 from jsonb_array_elements(
                   case when jsonb_typeof(l.horarios -> 'dias') = 'array' then l.horarios -> 'dias' else '[]'::jsonb end
                 ) d where coalesce((d ->> 'fechado')::boolean, true) = false
               ), false) as horarios_ok,
               (select min(w.criado_em) from public.numeros_whatsapp w
                 where w.loja_id = l.id and w.status = 'conectado') as numero_em,
               (select min(i.criado_em) from public.itens i
                 where i.loja_id = l.id and i.ativo) as cardapio_em,
               (select min(p.criado_em) from public.pedidos p
                 where p.loja_id = l.id and p.status <> 'rascunho') as primeiro_pedido_em
          from public.lojas l
         where l.id = ${lojaId}`,
  )
}
