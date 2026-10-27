// Constantes de transporte da Meta Cloud API. Versao da Graph API e hosts ficam aqui para
// serem promovidos a env (ver relatorio: GRAPH_API_VERSION) sem espalhar valor magico.
import type { HostPermitido } from '@whaviso/shared/clientes'

/** Host unico da Graph API (allowlist de SSRF; SEC-070). */
export const GRAPH_HOST_PADRAO = 'graph.facebook.com'

/** Versao fixa da Graph API; promover a env GRAPH_API_VERSION/META_API_VERSION. */
export const GRAPH_API_VERSION_PADRAO = 'v23.0'

/** Hosts de onde a Meta serve o binario de midia baixada (CDN), alem do host do Graph. */
export const HOSTS_MIDIA_PADRAO: readonly HostPermitido[] = ['lookaside.fbsbx.com', '*.fbcdn.net']

/** Teto de tamanho da midia baixada (defesa contra flood); 25 MiB cobre audio/imagem/doc. */
export const MAX_MIDIA_BYTES_PADRAO = 25 * 1024 * 1024
