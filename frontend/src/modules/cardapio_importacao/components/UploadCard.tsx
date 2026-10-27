// Envio do arquivo do cardapio (foto ou PDF, ate 10 MB). Le o arquivo no navegador, converte para
// base64 e enfileira a leitura. O conteudo nunca e logado nem guardado fora desta chamada.
import { useRef, useState } from 'react'
import { FileUp } from 'lucide-react'
import { Banner, Button, Card, useToast } from '@/shared/ui'
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

  function escolher(f: File | undefined) {
    if (!f) return
    const problema = validarArquivo(f)
    setErro(problema)
    setArquivo(problema ? null : f)
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

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg text-salvia">Importar de uma foto ou PDF</h2>
        <p className="mt-1 text-sm text-tinta-2">
          Envie a foto ou o PDF do seu cardápio. Nós lemos os itens e preços, e você revisa tudo antes de entrar no
          cardápio.
        </p>
      </div>
      {erro && <Banner tom="erro">{erro}</Banner>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          ref={entrada}
          type="file"
          accept={TIPOS_ACEITOS}
          aria-label="Arquivo do cardápio"
          onChange={(e) => escolher(e.target.files?.[0])}
          className="block w-full text-sm text-tinta-2 file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-pill file:border file:border-linha file:bg-cartao file:px-4 file:text-sm file:font-medium file:text-tinta hover:file:bg-papel-2"
        />
        <Button
          loading={lendo || enviar.isPending}
          disabled={!arquivo}
          onClick={() => void enviarArquivo()}
          className="max-sm:w-full sm:flex-none"
        >
          <FileUp strokeWidth={1.75} className="size-4" aria-hidden />
          Enviar para leitura
        </Button>
      </div>
      <p className="text-xs text-tinta-2">
        JPG, PNG, WebP ou PDF, até 10 MB.
        {arquivo && ` Selecionado: ${arquivo.name} (${formatarTamanho(arquivo.size)}).`}
      </p>
    </Card>
  )
}
