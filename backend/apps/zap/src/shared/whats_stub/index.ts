import { createHmac } from 'node:crypto'
import {
  ok,
  verificarAssinaturaHmac,
  type ClienteWhats,
  type MidiaBaixada,
  type ResultadoWhats,
} from '@whaviso/shared/clientes'

// Stub de ClienteWhats para dev/testes do zap: responde wamid sintetico, nao fala com a rede.
// O log recebe SO o nome da operacao e o wamid sintetico: nunca telefone, token, texto ou
// credencial (SEC-024). A implementacao real (ZAP-meta) substitui este diretorio.

export type LogStub = (evento: string, meta: { operacao: string; wamid?: string }) => void

export interface OpcoesWhatsStub {
  segredoWebhook?: string
  log?: LogStub
}

export interface WhatsStub extends ClienteWhats {
  /** Assina um corpo com o segredo do stub (para exercitar o webhook em dev). */
  assinar(rawBody: string | Uint8Array): string
}

export function criarWhatsStub(op: OpcoesWhatsStub = {}): WhatsStub {
  const segredo = op.segredoWebhook ?? 'segredo-stub'
  let seq = 0
  const proximo = (operacao: string): string => {
    seq += 1
    const wamid = `wamid.stub.${seq}`
    op.log?.('whats_stub_envio', { operacao, wamid })
    return wamid
  }
  const envio = (operacao: string): ResultadoWhats<{ wamid: string }> =>
    Promise.resolve(ok({ wamid: proximo(operacao) }))
  const midia: MidiaBaixada = { bytes: new Uint8Array(), mimeType: 'application/octet-stream' }

  return {
    enviarTexto: () => envio('enviarTexto'),
    enviarTemplate: () => envio('enviarTemplate'),
    enviarInterativo: () => envio('enviarInterativo'),
    enviarMidia: () => envio('enviarMidia'),
    baixarMidia: async () => ok({ ...midia }),
    marcarLida: async () => ok(undefined),
    verificarAssinatura: (raw, header) => verificarAssinaturaHmac(raw, header, segredo),
    assinar: (raw) => `sha256=${createHmac('sha256', segredo).update(raw).digest('hex')}`,
  }
}
