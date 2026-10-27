// SEC-025 (sem service_role no bundle): TODO ate o F6 (front-shell) ter build.
//
// Decisao (harness.md etapa 10): o F7 roda em paralelo com o F6; enquanto o `frontend/` nao
// produz `dist/`, nao ha bundle para varrer. O TRILHO ja esta pronto:
//   - script backend/scripts/check_bundle_secrets.sh (le frontend/dist, barra service_role /
//     META_* / *_KEY / sentinela; so a anon key publica pode estar presente);
//   - sem dist, o script sai 0 com aviso, entao nao quebra o gate antes do F6.
// Quando o F6 tiver `npm run build`, trocar estes `todo` por testes reais: build com uma
// service_role sentinela no ambiente + grep no dist, afirmando que so a anon key esperada aparece.
import { describe, it } from 'vitest'

describe('SEC-025: sem service_role no bundle (todo ate F6)', () => {
  it.todo('SEC-025: build do front com service_role sentinela nao a vaza no dist')
  it.todo('SEC-025: so a anon key esperada esta presente no dist (sourcemaps limpos)')
})
