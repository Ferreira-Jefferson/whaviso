// API publica do modulo motor_fluxo (AT-motor-min): o motor deterministico do pedido, por botoes
// e regras, SEM LLM. O app-root monta o registry e chama o dreno a cada tick; nada fora deste
// index deve ser importado de outro lugar (fronteira do modulo).
export { criarRegistry, ErroRegistry } from './registry'
export { processarProximaMensagem, drenarInbound, type Desfecho, type DepsMotor } from './service'
export { GRAFO } from './grafo'
