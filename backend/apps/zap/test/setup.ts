// Setup global dos testes do zap (registrado em vitest.config.ts:setupFiles).
//
// Zera, ANTES DE CADA TESTE, o estado GLOBAL que os drenos do zap enxergam por inteiro
// (não por aviso/cobrador), para que uma linha deixada por um teste não polua o próximo:
//  - webhook_eventos_processados: a dedup por wamid é global; os testes de inbound reusam
//    wamids fixos ("w_ja_paguei", "w1", "w", ...) entre casos, e sem zerar o 2º caso a usar
//    um wamid seria dedupado (claim-first) e falharia.
//  - envios / notificacoes_cobrador / notificacoes_billing / whats_teste_mensagens: os
//    drenos (processarEnviosDevidos, processarNotificacoesCobrador, processarNotificacoesBilling,
//    testar_envio) fazem claim GLOBAL (FOR UPDATE SKIP LOCKED em toda a fila). Com o seed de
//    dev deixando os templates enviáveis, uma linha residual de outro teste viraria enviável
//    e inflaria a contagem do dreno (ex.: os testes de gating do notificar_cobrador). Zerar
//    a fila por teste torna cada dreno determinístico e independente da ORDEM dos arquivos
//    (que difere entre Windows e o CI Linux). São tabelas-folha (nada referencia elas), então
//    o delete não esbarra em FK. Cada teste cria as próprias linhas DEPOIS deste beforeEach.
//
// Como fileParallelism=false, o delete antes de cada teste é seguro (sem teste concorrente).
// Guardado em try/catch: num ambiente sem banco (sem .env.test) os testes de DB já são
// pulados/quebram pela conexão; o setup não deve derrubar tudo por causa do reset.
import { beforeEach } from 'vitest'
import { poolSuper } from './harness'

beforeEach(async () => {
  try {
    await poolSuper.query(
      `delete from public.webhook_eventos_processados;
       delete from public.notificacoes_cobrador;
       delete from public.notificacoes_billing;
       delete from public.envios;
       delete from public.whats_teste_mensagens;`,
    )
  } catch {
    // sem banco disponível: ignora (os testes que dependem de DB tratam a ausência).
  }
})
