// Handler de cadastro de chave Pix: a lógica de SALVAR (não é apresentação, então
// não vive em ui/). Valida presença, normaliza (trim, rótulo vazio -> null) e
// traduz erros conhecidos (chave duplicada) numa mensagem amigável. Cada tela
// monta seu próprio form com os elementos de ui/ (ChavePixInput etc.) e chama
// `cadastrar`; em erro, lança Error com mensagem pronta para exibir.
import { useCriarChavePix } from './api'
import { ApiError } from '../api_client'
import type { ChavePix, TipoChavePix } from '../contracts'

interface EntradaCadastro {
  tipo: TipoChavePix | ''
  chave: string
  rotulo?: string | null
  padrao?: boolean
}

export function useCadastrarChavePix() {
  const criar = useCriarChavePix()

  async function cadastrar({ tipo, chave, rotulo, padrao }: EntradaCadastro): Promise<ChavePix> {
    if (!tipo) throw new Error('Selecione o tipo da chave.')
    if (!chave.trim()) throw new Error('Informe a chave Pix.')
    try {
      return await criar.mutateAsync({
        tipo,
        chave: chave.trim(),
        rotulo: rotulo?.trim() ? rotulo.trim() : null,
        padrao: padrao ?? false,
      })
    } catch (e) {
      if (e instanceof ApiError && e.code === 'chave_pix_duplicada') {
        throw new Error('Você já tem essa chave Pix cadastrada.')
      }
      throw new Error(
        e instanceof ApiError ? e.message : 'Não foi possível adicionar a chave. Tente novamente.',
      )
    }
  }

  return { cadastrar, salvando: criar.isPending }
}
