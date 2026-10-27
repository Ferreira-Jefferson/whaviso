// Monta o DTO de detalhe do pedido a partir das linhas (snapshot). Telefone SEMPRE mascarado.
import type { Executor } from '@whaviso/shared/db'
import type { Cifra } from '@whaviso/shared/cifra'
import { destinosValidos } from './estados'
import * as repo from './repo'
import type { PedidoDetalheSaida } from './schemas'

function mascarar(cifra: Cifra, cifrado: Buffer | null): string | null {
  if (!cifrado) return null
  try {
    return cifra.mascararTelefone(cifra.decifrar(cifrado).toString('utf8'))
  } catch {
    // Cifra indisponivel ou dado corrompido: nunca cai para o claro.
    return null
  }
}

export async function carregarDetalhe(
  exec: Executor,
  cifra: () => Cifra,
  lojaId: string,
  p: repo.PedidoLinha,
): Promise<PedidoDetalheSaida> {
  const { itens, opcoes } = await repo.itensDoPedido(exec, lojaId, p.id)
  const endereco = p.endereco_id ? await repo.obterEndereco(exec, lojaId, p.endereco_id) : null
  return {
    id: p.id,
    codigo: p.codigo,
    status: p.status,
    origem: p.origem,
    modalidade: p.modalidade,
    subtotal_centavos: p.subtotal_centavos,
    taxa_entrega_centavos: p.taxa_entrega_centavos,
    total_centavos: p.total_centavos,
    observacao: p.observacao,
    problema_motivo: p.problema_motivo,
    entregue_em: p.entregue_em,
    criado_em: p.criado_em,
    atualizado_em: p.atualizado_em,
    conversa_id: p.conversa_id,
    zona_id: p.zona_id,
    corrida_id: p.corrida_id,
    ordem_parada: p.ordem_parada,
    motoboy_id: p.motoboy_id,
    motoboy_nome: p.motoboy_nome,
    cliente: p.cliente_id
      ? {
          id: p.cliente_id,
          nome: p.cliente_nome,
          telefone_mascarado: p.telefone_cifrado ? mascarar(cifra(), p.telefone_cifrado) : null,
        }
      : null,
    endereco,
    itens: itens.map((i) => ({
      ...i,
      opcoes: opcoes
        .filter((o) => o.item_pedido_id === i.id)
        .map(({ item_pedido_id: _ignorado, ...o }) => o),
    })),
    destinos: destinosValidos(p.status, p.modalidade),
  }
}
