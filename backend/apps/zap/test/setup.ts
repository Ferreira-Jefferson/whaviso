// Setup global dos testes do zap (registrado em vitest.config.ts:setupFiles).
//
// A trava de idempotência do webhook (public.webhook_eventos_processados) é GLOBAL por wamid.
// Os testes de inbound reusam wamids fixos ("w_ja_paguei", "w1", "w", ...) entre casos e
// arquivos; sem zerar a tabela entre testes, o segundo caso a usar um wamid seria dedupado
// (claim-first em processarBotao/processarTexto) e falharia. Como fileParallelism=false, um
// delete antes de cada teste é seguro (nenhum teste concorrente corre em paralelo).
//
// Guardado em try/catch: num ambiente sem banco (sem .env.test) os testes de DB já são
// pulados/quebram pela conexão; o setup não deve derrubar tudo por causa do reset.
import { beforeEach } from 'vitest'
import { poolSuper } from './harness'

beforeEach(async () => {
  try {
    await poolSuper.query('delete from public.webhook_eventos_processados')
  } catch {
    // sem banco disponível: ignora (os testes que dependem de DB tratam a ausência).
  }
})
