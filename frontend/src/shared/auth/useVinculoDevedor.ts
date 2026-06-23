import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { apiClient } from '@/shared/api_client'
import { avisoSchema } from '@/shared/contracts'
import { useAuth, usePerfil } from './hooks'

// Resposta mínima de GET /v1/avisos (só o que precisamos para detectar vínculo).
const listaAvisosLeve = z.object({ itens: z.array(avisoSchema) })

/**
 * O usuário é devedor em ALGUM aviso? (ou seja, tem acesso à área /meus).
 * "Ser devedor" é RELACIONAL (não é a role), então derivamos de
 * avisos.devedor_profile_id == o id do usuário. owner acessa tudo, não precisa checar.
 *
 * Fonte única usada pelo guard RequireVinculoDevedor e pelo cross-link do AppShell;
 * o React Query desduplica/cacheia pela queryKey, então só há uma chamada de rede.
 */
export function useTemVinculoDevedor(): { isLoading: boolean; temVinculo: boolean } {
  const { status, role } = useAuth()
  const perfil = usePerfil()
  const habilitado = status === 'logado' && role !== 'owner' && Boolean(perfil?.id)

  const q = useQuery({
    queryKey: ['vinculo-devedor', perfil?.id],
    enabled: habilitado,
    queryFn: async ({ signal }) => {
      const r = await apiClient.get<{ itens: { devedor_profile_id: string | null }[] }>(
        '/avisos',
        { schema: listaAvisosLeve, query: { per_page: 100 }, signal },
      )
      return r.itens.some((a) => a.devedor_profile_id === perfil?.id)
    },
  })

  return { isLoading: habilitado && q.isLoading, temVinculo: q.data === true }
}
