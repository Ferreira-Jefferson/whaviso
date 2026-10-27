// Dialog de documento: criar, editar ou promover uma sugestao em documento. O corpo so e montado
// com o dialog aberto, entao o formulario sempre nasce com o estado inicial certo.
// Validacao de borda com o contrato Zod; a trava de conteudo estavel e do servidor (422).
import { useState, type FormEvent } from 'react'
import { Banner, Button, Dialog, Field, Input, Select } from '@/shared/ui'
import { DocumentoCriar, type DocumentoTipo } from '@/shared/contracts/_generated/conhecimento'
import { OPCOES_TIPO } from '../estados'
import { Textarea } from './Textarea'

export interface ValoresDocumento {
  tipo: DocumentoTipo
  titulo: string
  conteudo: string
}

interface Props {
  aberto: boolean
  titulo: string
  textoSalvar: string
  /** Aviso fixo no topo (ex.: "editar um aprovado cria uma nova versao"). */
  aviso?: string
  inicial: ValoresDocumento
  salvando: boolean
  erro: string | null
  onSalvar: (v: ValoresDocumento) => void
  onFechar: () => void
}

export function DialogDocumento({ aberto, ...resto }: Props) {
  return (
    <Dialog aberto={aberto} onFechar={resto.onFechar} titulo={resto.titulo} className="sm:max-w-xl">
      {aberto && <Corpo {...resto} />}
    </Dialog>
  )
}

function Corpo({ textoSalvar, aviso, inicial, salvando, erro, onSalvar, onFechar }: Omit<Props, 'aberto' | 'titulo'>) {
  const [tipo, setTipo] = useState<DocumentoTipo>(inicial.tipo)
  const [titulo, setTitulo] = useState(inicial.titulo)
  const [conteudo, setConteudo] = useState(inicial.conteudo)
  const [local, setLocal] = useState<string | null>(null)

  function enviar(e: FormEvent) {
    e.preventDefault()
    const r = DocumentoCriar.safeParse({ tipo, titulo, conteudo })
    if (!r.success) {
      setLocal(
        titulo.trim().length === 0
          ? 'Dê um título ao documento.'
          : conteudo.trim().length === 0
            ? 'Escreva o conteúdo.'
            : 'Título até 120 caracteres e conteúdo até 4000.',
      )
      return
    }
    setLocal(null)
    onSalvar(r.data)
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4 text-tinta">
      {aviso && <Banner tom="info">{aviso}</Banner>}
      <Field label="Tipo">
        <Select value={tipo} onChange={setTipo} options={OPCOES_TIPO} ariaLabel="Tipo do documento" />
      </Field>
      <Field label="Título">
        <Input value={titulo} maxLength={120} onChange={(e) => setTitulo(e.target.value)} />
      </Field>
      <Field
        label="Conteúdo"
        dica="Só informação estável: como funciona, regras, políticas, respostas prontas. Preço, disponibilidade, telefone e Pix ficam de fora."
      >
        <Textarea rows={8} value={conteudo} maxLength={4000} onChange={(e) => setConteudo(e.target.value)} />
      </Field>
      <p className="-mt-2 text-right text-xs text-tinta-2 tabular">{conteudo.length}/4000</p>
      {(local ?? erro) && <Banner tom="erro">{local ?? erro}</Banner>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variante="secondary" onClick={onFechar} disabled={salvando}>
          Cancelar
        </Button>
        <Button type="submit" loading={salvando}>
          {textoSalvar}
        </Button>
      </div>
    </form>
  )
}
