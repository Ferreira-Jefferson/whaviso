// Avalia uma linha da matriz contra o banco real: executa a operacao como o role e diz se a
// REALIDADE bate com o `esperado`. E o nucleo compartilhado pelo executor da matriz e pelo
// meta-teste (que prova que uma expectativa errada e reprovada).
import type { LinhaMatriz } from '../matriz/privilegios'
import { PRIVILEGIO_INSUFICIENTE, operarComoRole } from './db_roles'
import { sqlOperacao } from './operacao_sql'

export interface Avaliacao {
  /** A realidade do banco bate com o `esperado` da linha? */
  conforme: boolean
  /** SQLSTATE observado (undefined quando a operacao passou). */
  code?: string
  esperado: LinhaMatriz['esperado']
}

export async function avaliarLinha(linha: LinhaMatriz): Promise<Avaliacao> {
  const r = await operarComoRole(linha.role, sqlOperacao(linha))
  const negadoPorPrivilegio = r.code === PRIVILEGIO_INSUFICIENTE
  const conforme =
    linha.esperado === 'negado' ? negadoPorPrivilegio : !negadoPorPrivilegio
  return { conforme, code: r.code, esperado: linha.esperado }
}
