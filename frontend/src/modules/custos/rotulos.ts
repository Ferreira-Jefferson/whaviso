// Rotulos e cores das categorias de custo externo.
import type { CategoriaCusto } from '@/shared/contracts/_generated/custos'

export const ROTULO_CATEGORIA: Record<CategoriaCusto, string> = {
  llm: 'Atendente automático (IA)',
  whatsapp: 'Mensagens de WhatsApp',
  mapas: 'Mapas e rotas',
  fiscal: 'Emissão fiscal',
}

export const COR_CATEGORIA: Record<CategoriaCusto, string> = {
  llm: 'var(--color-salvia)',
  whatsapp: 'var(--color-folha)',
  mapas: 'var(--color-revisao)',
  fiscal: 'var(--color-ambar)',
}

export const CATEGORIAS: readonly CategoriaCusto[] = ['llm', 'whatsapp', 'mapas', 'fiscal']
