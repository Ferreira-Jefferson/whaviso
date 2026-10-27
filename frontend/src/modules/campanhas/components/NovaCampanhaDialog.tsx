// Cria uma campanha (rascunho): nome, template aprovado, numero de origem, segmento e variaveis.
// O opt-out NAO e opcao: quem recusou marketing e sempre excluido pelo backend (aviso fixo na tela).
// A previa de quantos recebem aparece no detalhe do rascunho, antes de disparar.
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { Banner, Button, Dialog, Field, Input, Select, useToast } from '@/shared/ui'
import { useCriarCampanha, useNumerosOrigem, type CampanhaSegmento } from '../api'
import { ROTULO_SEGMENTO, SEGMENTOS } from '../estados'

interface Props {
  aberto: boolean
  aoFechar: () => void
  /** Chamado com o id do rascunho criado (abre o detalhe para revisar e disparar). */
  aoCriar: (id: string) => void
}

interface Variavel {
  chave: string
  valor: string
}

type Erros = Partial<Record<'nome' | 'template' | 'numero' | 'variaveis', string>>

export function NovaCampanhaDialog({ aberto, aoFechar, aoCriar }: Props) {
  return (
    <Dialog aberto={aberto} onFechar={aoFechar} titulo="Nova campanha" className="max-w-lg">
      {aberto && <Formulario aoFechar={aoFechar} aoCriar={aoCriar} />}
    </Dialog>
  )
}

function Formulario({ aoFechar, aoCriar }: Pick<Props, 'aoFechar' | 'aoCriar'>) {
  const numeros = useNumerosOrigem()
  const criar = useCriarCampanha()
  const { mostrarToast } = useToast()

  const [nome, setNome] = useState('')
  const [template, setTemplate] = useState('')
  const [numeroId, setNumeroId] = useState('')
  const [segmento, setSegmento] = useState<CampanhaSegmento | ''>('')
  const [variaveis, setVariaveis] = useState<Variavel[]>([])
  const [erros, setErros] = useState<Erros>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)

  const lista = numeros.data ?? []
  const numeroEfetivo = numeroId || (lista.length === 1 ? (lista[0]?.id ?? '') : '')

  const atualizarVar = (i: number, parte: Partial<Variavel>) =>
    setVariaveis((v) => v.map((x, j) => (j === i ? { ...x, ...parte } : x)))

  const enviar = () => {
    const e: Erros = {}
    if (!nome.trim()) e.nome = 'Dê um nome para a campanha.'
    if (!template.trim()) e.template = 'Informe o template aprovado.'
    if (!numeroEfetivo) e.numero = 'Escolha o número de origem.'
    const chaves = variaveis.map((v) => v.chave.trim())
    if (variaveis.some((v) => !v.chave.trim() || !v.valor.trim())) e.variaveis = 'Preencha nome e valor de cada variável.'
    else if (new Set(chaves).size !== chaves.length) e.variaveis = 'Há variáveis com o mesmo nome.'
    setErros(e)
    setErroGeral(null)
    if (Object.keys(e).length > 0) return

    criar.mutate(
      {
        nome: nome.trim(),
        template_chave: template.trim(),
        numero_whatsapp_id: numeroEfetivo,
        filtro: segmento ? { segmento } : {},
        variaveis: Object.fromEntries(variaveis.map((v) => [v.chave.trim(), v.valor.trim()])),
      },
      {
        onSuccess: (c) => {
          mostrarToast('Rascunho criado. Confira o público antes de disparar.', { tom: 'sucesso' })
          aoFechar()
          aoCriar(c.id)
        },
        onError: (err) => setErroGeral(err instanceof ApiError ? err.message : 'Não foi possível criar a campanha.'),
      },
    )
  }

  return (
    <form
      className="flex flex-col gap-4 text-left"
      onSubmit={(ev) => {
        ev.preventDefault()
        enviar()
      }}
    >
      <Field label="Nome" erro={erros.nome}>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} placeholder="Ex.: Volta dos clientes sumidos" autoFocus />
      </Field>

      <Field
        label="Template aprovado"
        erro={erros.template}
        dica="Campanha só é enviada por template aprovado pela Meta e ativo. Informe a chave do template (a mesma do cadastro de mensagens)."
      >
        <Input value={template} onChange={(e) => setTemplate(e.target.value)} maxLength={120} placeholder="chave_do_template" />
      </Field>

      <Field label="Número de origem" erro={erros.numero}>
        <Select
          ariaLabel="Número de origem"
          value={numeroEfetivo}
          onChange={setNumeroId}
          invalido={Boolean(erros.numero)}
          disabled={numeros.isPending}
          options={[
            { value: '', label: numeros.isPending ? 'Carregando...' : lista.length === 0 ? 'Nenhum número conectado' : 'Escolha um número' },
            ...lista.map((n) => ({ value: n.id, label: `WhatsApp ${n.phone_number_id}` })),
          ]}
        />
      </Field>

      <Field label="Para quem">
        <Select
          ariaLabel="Segmento"
          value={segmento}
          onChange={(v) => setSegmento(v as CampanhaSegmento | '')}
          options={[
            { value: '', label: 'Todos que podem receber' },
            ...SEGMENTOS.map((s) => ({ value: s, label: ROTULO_SEGMENTO[s] })),
          ]}
        />
      </Field>
      <Banner tom="info">Quem pediu para não receber marketing nunca entra no disparo.</Banner>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-tinta">Variáveis do template</legend>
        <p className="text-xs text-tinta-2">Valores fixos, iguais para todos os destinatários.</p>
        {variaveis.length === 0 && (
          <p className="rounded-input border border-dashed border-linha px-3 py-2.5 text-xs text-tinta-2">
            Nenhuma variável. Adicione se o template tiver campos a preencher.
          </p>
        )}
        {variaveis.map((v, i) => (
          <div key={i} className="flex items-start gap-2">
            <Input
              aria-label={`Nome da variável ${i + 1}`}
              value={v.chave}
              onChange={(e) => atualizarVar(i, { chave: e.target.value })}
              placeholder="nome"
              maxLength={60}
              className="w-2/5"
            />
            <Input
              aria-label={`Valor da variável ${i + 1}`}
              value={v.valor}
              onChange={(e) => atualizarVar(i, { valor: e.target.value })}
              placeholder="valor"
              maxLength={1024}
            />
            <Button
              type="button"
              variante="ghost"
              tamanho="icone"
              aria-label={`Remover variável ${i + 1}`}
              className="flex-none text-tinta-2 hover:bg-barro/10 hover:text-barro"
              onClick={() => setVariaveis((l) => l.filter((_, j) => j !== i))}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        ))}
        {erros.variaveis && (
          <p role="alert" className="text-xs text-barro">
            {erros.variaveis}
          </p>
        )}
        <Button type="button" variante="secondary" className="w-fit" onClick={() => setVariaveis((l) => [...l, { chave: '', valor: '' }])}>
          <Plus className="size-4" aria-hidden />
          Adicionar variável
        </Button>
      </fieldset>

      {erroGeral && (
        <p role="alert" className="text-sm text-barro">
          {erroGeral}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" loading={criar.isPending}>
          Criar rascunho
        </Button>
        <Button type="button" variante="secondary" disabled={criar.isPending} onClick={aoFechar}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
