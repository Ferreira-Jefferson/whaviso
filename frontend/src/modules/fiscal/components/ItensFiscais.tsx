// Dados fiscais por item do catalogo (NCM, CFOP, origem, unidade e situacao tributaria). Sao DADO
// de cadastro do contador da loja, nao calculo: a api so os repassa ao emissor. Um item sem o dado
// completo nao gera NFC-e; a lista marca os pendentes e o editor cadastra um a um.
import { useEffect, useState } from 'react'
import { ReceiptText } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import {
  Badge,
  Banner,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Select,
  Skeleton,
  TableResponsive,
  useToast,
  type ColunaTabela,
} from '@/shared/ui'
import type { ItemFiscalLinhaDto } from '@/shared/contracts/_generated/fiscal'
import { useDefinirItemFiscal, useFiscalConfig, useItensFiscais } from '../api'
import { OPCOES_ORIGEM, usaCsosn } from '../estados'

type Erros = Partial<Record<'ncm' | 'cfop' | 'situacao', string>>

export function ItensFiscais() {
  const config = useFiscalConfig()
  const itens = useItensFiscais()
  const definir = useDefinirItemFiscal()
  const { mostrarToast } = useToast()

  const regime = config.data?.regime ?? null
  const comCsosn = usaCsosn(regime)

  const [emEdicao, setEmEdicao] = useState<ItemFiscalLinhaDto | null>(null)
  const [ncm, setNcm] = useState('')
  const [cfop, setCfop] = useState('5102')
  const [origem, setOrigem] = useState('0')
  const [unidade, setUnidade] = useState('UN')
  const [situacao, setSituacao] = useState('')
  const [erros, setErros] = useState<Erros>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)

  useEffect(() => {
    if (!emEdicao) return
    setNcm(emEdicao.ncm ?? '')
    setCfop(emEdicao.cfop ?? '5102')
    setOrigem(String(emEdicao.origem ?? 0))
    setUnidade(emEdicao.unidade ?? 'UN')
    setSituacao((comCsosn ? emEdicao.csosn : emEdicao.cst) ?? (comCsosn ? '102' : '00'))
    setErros({})
    setErroGeral(null)
  }, [emEdicao, comCsosn])

  const lista = itens.data ?? []

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!emEdicao) return
    setErroGeral(null)
    const novos: Erros = {}
    if (!/^\d{8}$/.test(ncm)) novos.ncm = 'O NCM tem 8 dígitos.'
    if (!/^\d{4}$/.test(cfop)) novos.cfop = 'O CFOP tem 4 dígitos.'
    const sit = situacao.trim()
    if (comCsosn ? !/^\d{3}$/.test(sit) : !/^\d{2,3}$/.test(sit)) {
      novos.situacao = comCsosn ? 'O CSOSN tem 3 dígitos.' : 'O CST tem 2 ou 3 dígitos.'
    }
    setErros(novos)
    if (Object.keys(novos).length > 0) return

    try {
      await definir.mutateAsync({
        itemId: emEdicao.item_id,
        dados: {
          ncm,
          cfop,
          origem: Number(origem),
          unidade: unidade.trim() || 'UN',
          csosn: comCsosn ? sit : null,
          cst: comCsosn ? null : sit,
        },
      })
      mostrarToast('Dados fiscais do item salvos.', { tom: 'sucesso' })
      setEmEdicao(null)
    } catch (err) {
      setErroGeral(err instanceof ApiError ? err.message : 'Não foi possível salvar os dados fiscais.')
    }
  }

  const pendentes = lista.filter((i) => !i.completo).length

  const colunas: ColunaTabela<ItemFiscalLinhaDto>[] = [
    {
      chave: 'item',
      titulo: 'Item',
      principal: true,
      render: (i) => (
        <div className="min-w-0">
          <span className="font-medium text-tinta">{i.nome}</span>
          {i.categoria_nome && <span className="block text-xs text-tinta-2">{i.categoria_nome}</span>}
        </div>
      ),
    },
    {
      chave: 'situacao',
      titulo: 'Situação',
      ocultarRotuloMobile: true,
      render: (i) =>
        i.completo ? <Badge tom="sucesso">Pronto</Badge> : <Badge tom="atencao">Faltam dados</Badge>,
    },
    {
      chave: 'ncm',
      titulo: 'NCM · CFOP',
      render: (i) =>
        i.ncm ? (
          <span className="tabular text-xs">
            {i.ncm} · {i.cfop}
          </span>
        ) : (
          <span className="text-tinta-2">-</span>
        ),
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      ocultarRotuloMobile: true,
      alinhar: 'direita',
      render: (i) => (
        <Button variante="secondary" onClick={() => setEmEdicao(i)}>
          {i.completo ? 'Editar' : 'Cadastrar'}
        </Button>
      ),
    },
  ]

  return (
    <div className="animate-rise">
      {!config.data?.configurada && (
        <Banner tom="info" className="mb-4">
          Configure o emissor (aba Emissor) para definir o regime: ele decide se o item usa CSOSN (Simples/MEI) ou CST.
        </Banner>
      )}
      {itens.isSuccess && lista.length > 0 && pendentes > 0 && (
        <Banner tom="atencao" className="mb-4">
          {pendentes === 1 ? '1 item ainda não tem' : `${pendentes} itens ainda não têm`} dados fiscais completos e não
          podem gerar NFC-e.
        </Banner>
      )}

      {itens.isPending && (
        <div aria-busy="true" aria-label="Carregando itens" className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {itens.isError && <ErrorState aoTentarDeNovo={() => void itens.refetch()} />}
      {itens.isSuccess && lista.length === 0 && (
        <EmptyState
          icone={<ReceiptText className="size-7" aria-hidden />}
          titulo="Nenhum item no cardápio"
          descricao="Cadastre itens no cardápio para definir aqui os dados fiscais de cada um."
        />
      )}
      {itens.isSuccess && lista.length > 0 && (
        <TableResponsive legenda="Dados fiscais por item" colunas={colunas} linhas={lista} chaveLinha={(i) => i.item_id} />
      )}

      <Dialog
        aberto={emEdicao !== null}
        onFechar={() => setEmEdicao(null)}
        titulo={emEdicao ? `Dados fiscais: ${emEdicao.nome}` : 'Dados fiscais'}
      >
        <form onSubmit={(e) => void salvar(e)} className="flex flex-col gap-4" noValidate>
          {erroGeral && <Banner tom="erro">{erroGeral}</Banner>}
          <Field label="NCM" erro={erros.ncm} dica="Classificação fiscal da mercadoria (8 dígitos).">
            <Input inputMode="numeric" value={ncm} maxLength={8} placeholder="00000000" onChange={(e) => setNcm(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="CFOP" erro={erros.cfop} dica="Natureza da operação.">
              <Input inputMode="numeric" value={cfop} maxLength={4} onChange={(e) => setCfop(e.target.value)} />
            </Field>
            <Field label="Unidade">
              <Input value={unidade} maxLength={6} onChange={(e) => setUnidade(e.target.value)} />
            </Field>
          </div>
          <Field label="Origem da mercadoria">
            <Select ariaLabel="Origem da mercadoria" value={origem} onChange={setOrigem} options={OPCOES_ORIGEM} />
          </Field>
          <Field
            label={comCsosn ? 'CSOSN (Simples Nacional/MEI)' : 'CST (regime normal)'}
            erro={erros.situacao}
            dica={comCsosn ? 'Ex.: 102 (tributada sem permissão de crédito).' : 'Ex.: 00 (tributada integralmente).'}
          >
            <Input inputMode="numeric" value={situacao} maxLength={3} onChange={(e) => setSituacao(e.target.value)} />
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variante="secondary" onClick={() => setEmEdicao(null)}>
              Cancelar
            </Button>
            <Button type="submit" loading={definir.isPending}>
              Salvar dados fiscais
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
