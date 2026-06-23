#!/usr/bin/env bash
# Cria o esqueleto de um módulo feature-first: scripts/scaffold_module.sh <api|zap> <nome_modulo>
set -euo pipefail

APP="${1:?uso: scaffold_module.sh <api|zap> <nome_modulo>}"
NOME="${2:?uso: scaffold_module.sh <api|zap> <nome_modulo>}"
DIR="apps/$APP/src/modules/$NOME"

if [ -d "$DIR" ]; then
  echo "erro: $DIR já existe" >&2
  exit 1
fi

mkdir -p "$DIR/tests"

cat > "$DIR/MODULE.md" <<EOF
# $NOME

## Propósito
(1-2 frases: o que esta feature faz e para quem)

## Entry points
- \`index.ts\` (plugin Fastify registrado em \`src/routes.ts\`)

## Especialistas consumidos
- \`@whaviso/shared/...\`
- \`shared/...\` (do app $APP)

## Tabelas
- dono de: (nenhuma)
- lê de: (nenhuma)

## Contratos
- publica/consome: (nenhum)
EOF

cat > "$DIR/index.ts" <<EOF
import type { FastifyPluginAsync } from 'fastify'

export const ${NOME}Routes: FastifyPluginAsync = async (app) => {
  void app // TODO: registrar rotas do módulo $NOME
}
EOF

echo "criado $DIR, registre em apps/$APP/src/routes.ts (1 linha)"
