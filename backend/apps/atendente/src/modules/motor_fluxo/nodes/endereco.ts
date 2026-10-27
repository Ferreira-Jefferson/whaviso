// Node `endereco`: resolve o endereco da entrega e aplica o gate de area.
//   - botao "Ultimo endereco" -> reusa o ultimo endereco do cliente (id/bairro vindos do contexto,
//     que o motor carregou para ESTE cliente). Se o bairro nao esta numa zona ativa da loja (e a
//     loja tem zonas), e fora da area: resposta fixa de recusa e oferece informar outro endereco.
//   - botao "Informar outro" / loja sem endereco previo -> cadastra um novo: escolhe o BAIRRO numa
//     lista de zonas (resolve zona/taxa e restringe a area) e depois informa a rua; sem zonas,
//     informa o endereco por texto (taxa 0, sem restricao).
// A taxa e calculada no motor na criacao do pedido (zona por bairro). SEM LLM.
import type { NodeContract, SaidaNode } from '@whaviso/shared/contracts'
import { efeitoCriarEndereco, efeitoEstado, saida, texto } from '../acoes'
import { iniciarEnderecoNovo, menuBairros, promptPagamento, reapresentar } from '../comum'
import { botaoIgual, escolherDaLista } from '../entrada'
import { BOTAO_END_NOVO, BOTAO_END_ULTIMO } from '../ids'
import { ConfigVazia, type EntradaTurno, type EstadoFluxo } from '../tipos'

const FORA_DA_AREA = 'Infelizmente ainda nao entregamos nesse endereco.'

export const enderecoNode: NodeContract<ConfigVazia, EntradaTurno> = {
  tipo: 'endereco',
  usaLlm: false,
  configSchema: ConfigVazia,
  async executar(entrada) {
    const { estado } = entrada
    if (estado.aguardando === 'endereco_bairro') return escolherBairro(entrada)
    if (estado.aguardando === 'endereco_rua') return informarRua(entrada)
    return decidir(entrada)
  },
}

/** Decisao inicial: usar o ultimo endereco (com gate de area) ou informar um novo. */
function decidir(entrada: EntradaTurno): SaidaNode {
  const { evento, estado, ultimoEnderecoId, ultimoEnderecoBairro, zonasBairros } = entrada

  if (botaoIgual(evento, BOTAO_END_ULTIMO) && ultimoEnderecoId) {
    if (foraDaArea(zonasBairros, ultimoEnderecoBairro)) {
      const inicio = iniciarEnderecoNovo(estado, zonasBairros)
      return saida(inicio.proximo, [texto(`${FORA_DA_AREA} Vamos tentar outro endereco.`), ...inicio.mensagens], inicio.efeitos)
    }
    const proximo: EstadoFluxo = { ...estado, etapa: 'pagamento', endereco_id: ultimoEnderecoId, aguardando: null, falhas: 0 }
    return saida('pagamento', [promptPagamento()], [efeitoEstado(proximo)])
  }

  if (botaoIgual(evento, BOTAO_END_NOVO)) return iniciarEnderecoNovo(estado, zonasBairros)

  return reapresentar(estado, texto('Toque em "Ultimo endereco" ou "Informar outro" para seguir.'))
}

/** Escolha do bairro (so bairros atendidos sao ofertados: isso ja garante que esta na area). */
function escolherBairro(entrada: EntradaTurno): SaidaNode {
  const { evento, estado, zonasBairros } = entrada
  const bairro = escolherDaLista(evento, estado.apresentados)
  if (!bairro || !zonasBairros.includes(bairro)) {
    const menu = menuBairros(zonasBairros)
    return reapresentar({ ...estado, apresentados: menu.ids }, texto(menu.texto))
  }
  const proximo: EstadoFluxo = { ...estado, aguardando: 'endereco_rua', bairro_rascunho: bairro, apresentados: [], falhas: 0 }
  return saida('endereco', [texto(`Otimo, entregamos no ${bairro}. Agora informe a rua e o numero:`)], [efeitoEstado(proximo)])
}

/** Recebe a rua/numero por texto e cria o endereco (com o bairro ja escolhido, se houve). */
function informarRua(entrada: EntradaTurno): SaidaNode {
  const { evento, estado } = entrada
  const rua = evento.texto
  if (!rua || rua.length < 4) {
    return reapresentar(estado, texto('Nao entendi. Informe a rua e o numero:'))
  }
  const proximo: EstadoFluxo = { ...estado, etapa: 'pagamento', aguardando: null, apresentados: [], falhas: 0 }
  // criar_endereco seta estado.endereco_id no motor (merge sobre o estado acima).
  return saida('pagamento', [promptPagamento()], [efeitoEstado(proximo), efeitoCriarEndereco(rua, estado.bairro_rascunho)])
}

/** Fora da area: a loja tem zonas E o bairro nao esta entre elas (bairro vazio = nao bloqueia aqui). */
function foraDaArea(zonasBairros: readonly string[], bairro: string | null): boolean {
  return zonasBairros.length > 0 && !!bairro && !zonasBairros.includes(bairro)
}
