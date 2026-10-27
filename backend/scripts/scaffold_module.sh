#!/usr/bin/env bash
# Cria o esqueleto de um modulo feature-first: scripts/scaffold_module.sh <api|zap> <nome_modulo>
# Layout api: modules/<nome>/{index,routes,service,repo,schemas}.ts + MODULE.md + <nome>.test.ts
set -euo pipefail

APP="${1:?uso: scaffold_module.sh <api|zap> <nome_modulo>}"
NOME="${2:?uso: scaffold_module.sh <api|zap> <nome_modulo>}"
case "$APP" in api | zap) ;; *) echo "erro: app deve ser api ou zap" >&2; exit 1 ;; esac
if ! [[ "$NOME" =~ ^[a-z][a-z0-9_]*$ ]]; then
  echo "erro: nome do modulo deve ser snake_case minusculo (ex.: pedidos)" >&2
  exit 1
fi
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="$ROOT/apps/$APP/src/modules/$NOME"

if [ -d "$DIR" ]; then
  echo "erro: $DIR ja existe" >&2
  exit 1
fi

mkdir -p "$DIR"

cat > "$DIR/MODULE.md" <<EOF
# $NOME

## Proposito
(1-2 frases: o que esta feature faz e para quem)

## Entry points
- \`index.ts\` (plugin Fastify registrado em \`src/routes.ts\`)

## Especialistas consumidos
- \`@whaviso/shared/db\` (consultar/sql/comTransacao: unica via de dados)
- \`shared/...\` (do app $APP)

## Tabelas
- dono de: (nenhuma)
- le de: (nenhuma)

## Contratos
- publica/consome: (nenhum)
EOF

if [ "$APP" = "api" ]; then
cat > "$DIR/schemas.ts" <<EOF
// Schemas Zod estritos da borda (SEC-081): z.strictObject, tamanhos e enums fechados.
import { z } from 'zod'

export const ${NOME}Resposta = z.strictObject({ ok: z.boolean() })
EOF

cat > "$DIR/repo.ts" <<EOF
// Acesso a dados do modulo: SO via @whaviso/shared/db, sempre com sql\`...\` (parametrizado).
import { consultar, sql, type Executor } from '@whaviso/shared/db'

export async function sondar(exec: Executor): Promise<boolean> {
  const linhas = await consultar(exec, sql\`select \${1}::int as ok\`)
  return linhas.length === 1
}
EOF

cat > "$DIR/service.ts" <<EOF
// Regra do modulo. Sem acesso HTTP aqui; erros de dominio via shared/http_errors.
import type { Executor } from '@whaviso/shared/db'
import { sondar } from './repo'

export async function status(exec: Executor): Promise<{ ok: boolean }> {
  return { ok: await sondar(exec) }
}
EOF

cat > "$DIR/routes.ts" <<EOF
import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ${NOME}Resposta } from './schemas'
import { status } from './service'

export const ${NOME}Routes: FastifyPluginAsync = async (instancia) => {
  const app = instancia.withTypeProvider<ZodTypeProvider>()
  // Loja: config.acesso + [app.autenticar, app.escopoLoja]. Plataforma: 'plataforma' + app.escopoOperador.
  app.get(
    '/status',
    {
      config: { acesso: 'conteudo_de_loja' as const /*, rateLimit: { max: 20, timeWindow: '1 minute' } */ },
      preHandler: [app.autenticar, app.escopoLoja],
      schema: { response: { 200: ${NOME}Resposta } },
    },
    async () => status(app.pool),
  )
}
EOF

cat > "$DIR/index.ts" <<EOF
export { ${NOME}Routes } from './routes'
EOF

cat > "$DIR/$NOME.test.ts" <<EOF
import { describe, it, expect } from 'vitest'
import { ${NOME}Resposta } from './schemas'

describe('$NOME', () => {
  it('resposta segue o schema estrito', () => {
    expect(${NOME}Resposta.safeParse({ ok: true }).success).toBe(true)
    expect(${NOME}Resposta.safeParse({ ok: true, extra: 1 }).success).toBe(false)
  })
})
EOF
else
cat > "$DIR/index.ts" <<EOF
import type { FastifyPluginAsync } from 'fastify'

export const ${NOME}Routes: FastifyPluginAsync = async (app) => {
  void app // TODO: registrar rotas do modulo $NOME
}
EOF
cat > "$DIR/$NOME.test.ts" <<EOF
import { describe, it, expect } from 'vitest'

describe('$NOME', () => {
  it.todo('cobrir o comportamento do modulo')
  it('placeholder carrega', () => expect(true).toBe(true))
})
EOF
fi

echo "criado apps/$APP/src/modules/$NOME"
echo "registre em apps/$APP/src/routes.ts (1 linha):"
echo "  import { ${NOME}Routes } from './modules/$NOME'"
echo "  { prefixo: '${NOME}', plugin: ${NOME}Routes },   // dentro de MODULOS"
