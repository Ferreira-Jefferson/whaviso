// Kernel compartilhado NOVO (item 19, leva 2026-07-22 1D): upload/leitura do comprovante de
// recarga no Supabase Storage. Vive em shared/ porque módulo nunca importa módulo (billing
// consome, não o contrário). Usa a Storage REST API por fetch puro (mesmo estilo de
// shared/supabase_admin: sem SDK, só a SERVICE ROLE KEY de servidor).
//
// Bucket: "comprovantes" (privado). ESTE MÓDULO NÃO CRIA O BUCKET: buckets do Storage não
// entram nas migrations validadas localmente (o shim de teste não tem o schema `storage`);
// criar o bucket privado "comprovantes" no painel/cloud do Supabase é passo manual de infra,
// pendente antes deste recurso rodar em produção (ver nota no MODULE.md do billing).
//
// SEGREDO DE SERVIDOR: nunca exponha a service role key no front. NUNCA logar o conteúdo do
// arquivo (documento de pagamento, dado bancário) nem o path completo em nível de log > info.
export const BUCKET_COMPROVANTES = 'comprovantes'

export interface UploadComprovanteArgs {
  supabaseUrl: string
  serviceRoleKey: string
  path: string
  bytes: Buffer
  mime: string
}

export interface ResultadoUpload {
  ok: boolean
}

/** Extensão de arquivo a partir do MIME aceito (só os 4 tipos validados no endpoint). */
export function extensaoPorMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'application/pdf':
      return 'pdf'
    default:
      return 'bin'
  }
}

/**
 * Envia os bytes ao Storage (upsert: reenvio do comprovante sobrescreve o arquivo anterior
 * do mesmo caminho, guardado pela api antes de chamar isto). Sem SDK: POST direto na Storage
 * REST API do GoTrue/Storage do Supabase, com a service role key (bypassa RLS do storage).
 */
export async function subirComprovante(args: UploadComprovanteArgs): Promise<ResultadoUpload> {
  const base = args.supabaseUrl.replace(/\/$/, '')
  try {
    const resp = await fetch(
      `${base}/storage/v1/object/${BUCKET_COMPROVANTES}/${args.path}`,
      {
        method: 'POST',
        headers: {
          apikey: args.serviceRoleKey,
          authorization: `Bearer ${args.serviceRoleKey}`,
          'content-type': args.mime,
          'x-upsert': 'true',
        },
        body: args.bytes,
      },
    )
    return { ok: resp.ok }
  } catch {
    // Sem rede/Storage fora do ar: o chamador trata como indisponível (regraNegocio),
    // nunca loga o erro bruto (poderia ecoar o path/conteúdo em stacks de rede).
    return { ok: false }
  }
}

/**
 * Apaga o arquivo do Storage (job de retenção de 30 dias, H11.14). Mantém só o registro no
 * banco (arquivo_apagado_em preenchido pelo chamador); NUNCA remove a linha (regra de
 * não-DELETE em negócio). TODO(retenção): sem infra de cron na api hoje; o job periódico que
 * varre `idx_billing_comprovantes_retencao` e chama esta função deve entrar no scheduler do
 * zap (apps/zap/src/scheduler.ts, mesmo padrão do job de creditos_hold de 24h) numa leva
 * futura, fora do escopo desta leva (zap não está no escopo de arquivos deste grupo).
 */
export async function apagarComprovante(args: {
  supabaseUrl: string
  serviceRoleKey: string
  path: string
}): Promise<ResultadoUpload> {
  const base = args.supabaseUrl.replace(/\/$/, '')
  try {
    const resp = await fetch(
      `${base}/storage/v1/object/${BUCKET_COMPROVANTES}/${args.path}`,
      {
        method: 'DELETE',
        headers: {
          apikey: args.serviceRoleKey,
          authorization: `Bearer ${args.serviceRoleKey}`,
        },
      },
    )
    return { ok: resp.ok }
  } catch {
    return { ok: false }
  }
}

/**
 * URL assinada temporária (o owner ver o comprovante na listagem de revisão, H11.14): o
 * bucket é privado, então nunca há URL pública. `expiraSegundos` default 10 minutos (só o
 * tempo de abrir a tela). null se o Storage não respondeu (owner tenta de novo depois).
 */
export async function assinarUrlComprovante(args: {
  supabaseUrl: string
  serviceRoleKey: string
  path: string
  expiraSegundos?: number
}): Promise<string | null> {
  const base = args.supabaseUrl.replace(/\/$/, '')
  try {
    const resp = await fetch(
      `${base}/storage/v1/object/sign/${BUCKET_COMPROVANTES}/${args.path}`,
      {
        method: 'POST',
        headers: {
          apikey: args.serviceRoleKey,
          authorization: `Bearer ${args.serviceRoleKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: args.expiraSegundos ?? 600 }),
      },
    )
    if (!resp.ok) return null
    const corpo = (await resp.json()) as { signedURL?: string; signedUrl?: string }
    const relativo = corpo.signedURL ?? corpo.signedUrl ?? null
    if (!relativo) return null
    return `${base}/storage/v1${relativo.startsWith('/') ? relativo : `/${relativo}`}`
  } catch {
    return null
  }
}
