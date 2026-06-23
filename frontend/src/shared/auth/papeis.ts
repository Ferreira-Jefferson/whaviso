import type { RoleUsuario } from '../contracts'

// Home de cada papel. Fonte única usada por guards e pelos fluxos de login/
// onboarding para redirecionar ao destino certo. owner é admin do sistema;
// user é a home padrão (de lá alcança /meus por vínculo; ver AppShell/guards).
const HOME_POR_PAPEL: Record<RoleUsuario, string> = {
  owner: '/admin',
  user: '/app',
}

export function homeDoPapel(role: RoleUsuario | null): string {
  if (!role) return '/app'
  return HOME_POR_PAPEL[role]
}
