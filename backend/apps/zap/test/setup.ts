// Setup global dos testes do zap (registrado em vitest.config.ts:setupFiles).
//
// Esqueleto da fundação: os módulos de domínio (webhook, drenos de outbox) entram na
// Onda 1 e trarão de volta o reset de estado global por teste (as filas que os drenos
// enxergam por inteiro). Por ora os únicos testes são unitários (meta_client), sem banco,
// então o setup é um no-op. Mantido como arquivo para a config de vitest não precisar mudar.
export {}
