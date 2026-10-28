// Envio do arquivo do cardapio (foto ou PDF, ate 10 MB). Le o arquivo no navegador, converte para
// base64 e enfileira a leitura. O conteudo nunca e logado nem guardado fora desta chamada.
import { useRef, useState } from 'react'
import { FileText, FileUp, Image as ImageIcone, UploadCloud, X } from 'lucide-react'
import { Banner, Button, Card, cn, useToast } from '@/shared/ui'
import { useEnviarArquivo } from '../api'
import { TIPOS_ACEITOS, arquivoParaBase64, formatarTamanho, validarArquivo } from '../estados'

interface Props {
  /** Chamado com o id do job criado (ou reaproveitado) para a tela abri-lo. */
  aoEnviar: (id: string) => void
}

export function UploadCard({ aoEnviar }: Props) {
  const enviar = useEnviarArquivo()
  const { mostrarToast } = useToast()
  const entrada = useRef<HTMLInputElement>(null)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [lendo, setLendo] = useState(false)
  const [arrastando, setArrastando] = useState(false)

  const ocupado = lendo || enviar.isPending

  function escolher(f: File | undefined) {
    if (!f) return
    const problema = validarArquivo(f)
    setErro(problema)
    setArquivo(problema ? null : f)
  }

  function limpar() {
    setArquivo(null)
    setErro(null)
    if (entrada.current) entrada.current.value = ''
  }

  async function enviarArquivo() {
    if (!arquivo) return
    setErro(null)
    setLendo(true)
    try {
      const base64 = await arquivoParaBase64(arquivo)
      const criada = await enviar.mutateAsync(base64)
      mostrarToast(
        criada.reaproveitada ? 'Este arquivo já foi enviado há pouco. Abrimos a leitura existente.' : 'Arquivo enviado. Estamos lendo o cardápio.',
        { tom: 'sucesso' },
      )
      setArquivo(null)
      if (entrada.current) entrada.current.value = ''
      aoEnviar(criada.id)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível enviar o arquivo.')
    } finally {
      setLendo(false)
    }
  }

  const IconeArquivo = arquivo?.type === 'application/pdf' ? FileText : ImageIcone

  return (
    <Card className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg text-salvia">Importar de uma foto ou PDF</h2>
        <p className="mt-1 text-sm text-tinta-2">
          Envie a foto ou o PDF do seu cardápio. Nós lemos os itens e preços, e você revisa tudo antes de entrar no
          cardápio.
        </p>
      </div>

      {erro && <Banner tom="erro">{erro}</Banner>}

      <input
        ref={entrada}
        type="file"
        accept={TIPOS_ACEITOS}
        aria-label="Arquivo do cardápio"
        onChange={(e) => escolher(e.target.files?.[0])}
        className="sr-only"
      />

      {!arquivo ? (
        <label
          onDragOver={(e) => {
            e.preventDefault()
            if (!ocupado) setArrastando(true)
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => {
            e.preventDefault()
            setArrastando(false)
            if (!ocupado) escolher(e.dataTransfer.files?.[0])
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed px-6 py-10 text-center transition-colors',
            arrastando
              ? 'border-salvia bg-salvia-claro'
              : 'border-linha bg-papel-2/40 hover:border-salvia/60 hover:bg-papel-2',
          )}
        >
          <span className="flex size-12 items-center justify-center rounded-pill bg-cartao text-salvia ring-1 ring-linha">
            <UploadCloud strokeWidth={1.5} className="size-6" aria-hidden />
          </span>
          <span className="text-sm font-medium text-tinta">
            {arrastando ? 'Solte o arquivo para enviar' : 'Arraste a foto ou o PDF aqui'}
          </span>
          <span className="text-xs text-tinta-2">ou clique para escolher do seu aparelho</span>
        </label>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-input border border-linha bg-papel-2/50 p-3">
            <span className="flex size-10 flex-none items-center justify-center rounded-input bg-cartao text-salvia ring-1 ring-linha">
              <IconeArquivo strokeWidth={1.75} className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-tinta">{arquivo.name}</span>
              <span className="block text-xs text-tinta-2">
                {arquivo.type === 'application/pdf' ? 'PDF' : 'Foto'} · {formatarTamanho(arquivo.size)}
              </span>
            </span>
            <Button
              variante="ghost"
              className="flex-none px-3"
              disabled={ocupado}
              aria-label="Remover arquivo selecionado"
              onClick={limpar}
            >
              <X strokeWidth={1.75} className="size-4" aria-hidden />
            </Button>
          </div>
          <Button
            loading={ocupado}
            onClick={() => void enviarArquivo()}
            className="w-full sm:w-auto sm:self-end"
          >
            <FileUp strokeWidth={1.75} className="size-4" aria-hidden />
            Enviar para leitura
          </Button>
        </div>
      )}

      <p className="text-xs text-tinta-2">JPG, PNG, WebP ou PDF, até 10 MB.</p>
    </Card>
  )
}
