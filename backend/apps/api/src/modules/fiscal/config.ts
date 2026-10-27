// Fiacao de PRODUCAO das dependencias (cifra + emissor), resolvida de forma PREGUICOSA: o boot
// nunca quebra por falta de var; so a rota que precisa falha.
//
// PROVEDOR PADRAO (decisao de engenharia, 2026-10-27): Focus NFe como emissor de terceiro default
// de NFC-e/NFS-e (REST documentado, idempotencia nativa por `ref`, ambiente por host, auth por
// token). A implementacao real vive em `@whaviso/shared/clientes` (`criarFiscalFocusDoAmbiente`),
// atras de `ClienteFiscal`, com fetchSeguro + allowlist de host. Ela e GATED por ambiente: so entra
// com `API_FISCAL_PROVEDOR=focusnfe` (o token de emissao e por loja, cifrado no banco, nao no env).
// Sem isso (dev/offline/testes), o emissor de producao cai no STUB `emissorNaoConfigurado`, que
// responde erro Permanente (`emissor_nao_configurado`): o documento fica `erro` e nada e emitido.
import { z } from 'zod'
import { criarFiscalFocusDoAmbiente, falha, Permanente, type ClienteFiscal } from '@whaviso/shared/clientes'
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
  // Emissor real (Focus NFe) quando ativado por ambiente; senao, o stub nao configurado.
  const emissor = criarFiscalFocusDoAmbiente() ?? emissorNaoConfigurado
  return { cifra: criarCifraFiscal(parsed.data.FISCAL_MASTER_KEY), emissor }
}
