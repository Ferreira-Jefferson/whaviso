// ClienteMapas padrao quando nenhum provedor real foi injetado: toda chamada falha como transitoria,
// entao o modulo degrada (matriz por linha reta, enderecos ficam "pendentes"). Nunca inventa coordenada
// (o stub de dev geocodifica tudo num ponto fixo e nao pode gravar em enderecos de producao).
import { falha, Transitorio, type ClienteMapas } from '@whaviso/shared/clientes'

export function criarMapasIndisponivel(): ClienteMapas {
  const erro = () => falha(new Transitorio('provedor de mapas nao configurado', { codigo: 'mapas_nao_configurado' }))
  return {
    geocodificar: async () => erro(),
    matriz: async () => erro(),
    rota: async () => erro(),
  }
}
