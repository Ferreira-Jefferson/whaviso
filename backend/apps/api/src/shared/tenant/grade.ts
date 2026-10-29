// Grade de permissoes lida do banco (`papel_permissoes`) com cache por processo.
//
// - Leitura SINCRONA (`permite`) sobre o cache: serve papelPermite/escopoPermite/realtime.
// - O cache nasce com os PADROES do catalogo (= comportamento anterior ao motor); quando ha
//   fonte (pool), carrega do banco e se refresca por TTL. Falha de leitura mantem o cache
//   anterior (nunca abre acesso novo por erro).
// - Linha ausente na grade cai no padrao do catalogo (permissao nova no codigo antes da migration).
// - Papel fixo (`admin`, `dono`) e sempre tudo, independente do banco (anti-lockout).
// - Salvar a grade chama `recarregarGrade()` (invalida o cache imediatamente neste processo) e emite
//   NOTIFY no canal `grade_permissoes` (na mesma transacao do save): cada processo da api faz LISTEN
//   (conexao dedicada, `iniciarEscutaGrade`) e invalida o cache ao receber. Assim o efeito e imediato
//   em QUALQUER instancia, sem janela de TTL. O TTL segue como rede de seguranca se a conexao LISTEN
//   cair (ela reconecta com backoff e recarrega a grade ao voltar).
import { consultar, criarEscuta, sqlBruto, type Escuta, type Executor } from '@whaviso/shared/db'
import { definicaoDe, padraoPermite, PAPEL_FIXO, SO_PAPEL_FIXO, type EscopoAcesso } from './catalogo'

const TTL_MS = 30_000

/** Canal Postgres que avisa as instancias da api de que a grade mudou. */
export const CANAL_GRADE = 'grade_permissoes'

let fonte: Executor | null = null
/** `${escopo}|${papel}|${chave}` -> permitido, so das linhas lidas do banco. */
let explicitas = new Map<string, boolean>()
let carregadaEm = 0
let recarga: Promise<void> | null = null

const k = (escopo: string, papel: string, chave: string) => `${escopo}|${papel}|${chave}`

/** A permissao `chave` esta liberada para `papel` neste escopo? Chave/escopo desconhecidos: nega. */
export function permite(escopo: EscopoAcesso, papel: string, chave: string): boolean {
  const def = definicaoDe(chave)
  if (!def || def.escopo !== escopo) return false
  if (papel === PAPEL_FIXO[escopo]) return true
  if (SO_PAPEL_FIXO.includes(chave)) return false
  const e = explicitas.get(k(escopo, papel, chave))
  return e ?? padraoPermite(escopo, papel, chave)
}

/** Define de onde ler a grade (o pool da api). null = so padroes (testes unitarios). */
export function configurarFonteGrade(exec: Executor | null): void {
  fonte = exec
  explicitas = new Map()
  carregadaEm = 0
  recarga = null
}

interface LinhaGrade {
  escopo: string
  papel: string
  permissao_chave: string
  permitido: boolean
}

/** Relê a grade do banco agora (apos save). Propaga o erro; o cache so e trocado em sucesso. */
export async function recarregarGrade(): Promise<void> {
  if (!fonte) return
  const linhas = await consultar<LinhaGrade>(
    fonte,
    sqlBruto('select escopo, papel, permissao_chave, permitido from public.papel_permissoes'),
  )
  const novo = new Map<string, boolean>()
  for (const l of linhas) novo.set(k(l.escopo, l.papel, l.permissao_chave), l.permitido)
  explicitas = novo
  carregadaEm = Date.now()
}

/** Garante cache fresco (TTL). Best effort: erro de leitura mantem o cache anterior. */
export async function garantirGradeFresca(): Promise<void> {
  if (!fonte || Date.now() - carregadaEm < TTL_MS) return
  recarga ??= recarregarGrade()
    .catch(() => {
      carregadaEm = Date.now() // falhou: mantem o cache e so tenta de novo apos o TTL
    })
    .finally(() => {
      recarga = null
    })
  await recarga
}

/** Volta aos padroes e solta a fonte (isolamento de testes). */
export function resetarGrade(): void {
  configurarFonteGrade(null)
}

/** Invalida o cache AGORA (sincrono): a proxima decisao relê o banco antes de decidir. */
export function invalidarGrade(): void {
  carregadaEm = 0
}

export interface OpcoesEscutaGrade {
  /** Connection string DIRETA/session (LISTEN nao funciona em pooler em modo transacao). */
  connectionString: string
  backoffMinMs?: number
  /** Chamado a cada queda da conexao (sem dado sensivel). */
  aoFalha?: (motivo: string) => void
}

/**
 * Abre a conexao LISTEN dedicada no canal da grade. Ao receber (ou ao reconectar, pois um aviso
 * pode ter se perdido) invalida o cache na hora e relê o banco. Devolve a escuta (iniciada).
 */
export function iniciarEscutaGrade(opcoes: OpcoesEscutaGrade): Escuta {
  const recarregar = () => {
    invalidarGrade()
    void recarregarGrade().catch(() => undefined) // falhou: cache anterior + TTL cobrem
  }
  const escuta = criarEscuta({
    connectionString: opcoes.connectionString,
    canal: CANAL_GRADE,
    backoffMinMs: opcoes.backoffMinMs,
    applicationName: 'whaviso_grade_listen',
    aoMensagem: recarregar,
    aoReconectar: recarregar,
    aoFalha: opcoes.aoFalha,
  })
  escuta.iniciar()
  return escuta
}
