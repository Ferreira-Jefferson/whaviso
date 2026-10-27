// Fiacao de PRODUCAO das dependencias (cifra + emissor), resolvida de forma PREGUICOSA: o boot
// nunca quebra por falta de var; so a rota que precisa falha.
//
// DECISAO PENDENTE DO DONO: qual provedor de emissor fiscal (NFC-e/NFS-e) usar. Enquanto nao ha
// escolha, o emissor de producao e o STUB `emissorNaoConfigurado`, que responde erro Permanente
// (`emissor_nao_configurado`): o documento fica `erro` com motivo claro e nada e emitido de fato.
// Quando o provedor for escolhido, a implementacao real de `ClienteFiscal` (com fetchSeguro e
// allowlist de host proprios) substitui o stub aqui, sem tocar no resto do modulo.
import { z } from 'zod'
import { falha, Permanente, type ClienteFiscal } from '@whaviso/shared/clientes'
import { criarCifraFiscal } from './cifra'
import type { DepsFiscal } from './service'

const schema = z.object({ FISCAL_MASTER_KEY: z.string().min(32, 'minimo 32 caracteres') })

export const emissorNaoConfigurado: ClienteFiscal = {
  emitir: async () =>
    falha(new Permanente('provedor de emissor fiscal nao configurado', { codigo: 'emissor_nao_configurado' })),
}

export function depsDeProducao(): DepsFiscal {
  const parsed = schema.safeParse(process.env)
  // Mensagem sem valor: so o nome da var (o valor seria o proprio segredo).
  if (!parsed.success) throw new Error('FISCAL_MASTER_KEY ausente ou invalida (minimo 32 caracteres)')
  return { cifra: criarCifraFiscal(parsed.data.FISCAL_MASTER_KEY), emissor: emissorNaoConfigurado }
}
