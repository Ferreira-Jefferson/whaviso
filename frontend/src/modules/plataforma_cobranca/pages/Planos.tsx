// Console do operador: catalogo de planos. Admin cria/edita e ativa/inativa. Plano nunca some
// (so inativa). O valor do plano e copiado para a assinatura ao escolher o plano; reajustar o
// plano nao muda a cobranca de quem ja assina.
import { useEffect, useState } from 'react'
import { Package, Plus } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import {
  Badge, Banner, Button, Card, Dialog, EmptyState, Field, Input, MoneyInput, MoneyText, PageHeader, Skeleton,
  Switch, TableResponsive, Textarea, useToast, type ColunaTabela,
} from '@/shared/ui'
import { useAlterarPlano, useConfigTaxa, useCriarPlano, usePlanos, useSalvarConfigTaxa } from '../api'
import { AreaErro } from '../components/AreaErro'
import type { PlanoDTO } from '../planos'

function mensagem(e: unknown, padrao: string): string {
  return e instanceof ApiError ? e.message : padrao
}

/** Texto do formulario (um item por linha) -> lista sem linhas vazias. */
function linhasParaLista(texto: string): string[] {
  return texto.split('\n').map((l) => l.trim()).filter(Boolean)
}

export default function Planos() {
  const lista = usePlanos()
  const alterar = useAlterarPlano()
  const { mostrarToast } = useToast()
  const [criando, setCriando] = useState(false)
  const [editando, setEditando] = useState<PlanoDTO | null>(null)
  const itens = lista.data ?? []

  const alternar = (p: PlanoDTO, ativo: boolean) =>
    alterar.mutate(
      { id: p.id, patch: { ativo } },
      {
        onSuccess: () => mostrarToast(ativo ? 'Plano ativado.' : 'Plano inativado.', { tom: 'sucesso' }),
        onError: (e) => mostrarToast(mensagem(e, 'Não foi possível alterar o plano.'), { tom: 'erro' }),
      },
    )

  const colunas: ReadonlyArray<ColunaTabela<PlanoDTO>> = [
    { chave: 'nome', titulo: 'Plano', principal: true, render: (p) => <span className="font-medium">{p.nome}</span> },
    { chave: 'valor', titulo: 'Valor mensal', alinhar: 'direita', render: (p) => <MoneyText centavos={p.valor_centavos} /> },
    {
      chave: 'taxa',
      titulo: 'Taxa',
      alinhar: 'direita',
      render: (p) =>
        p.taxa_intermediacao_centavos == null
          ? <span className="text-sm text-tinta-2">Padrão</span>
          : <MoneyText centavos={p.taxa_intermediacao_centavos} />,
    },
    {
      chave: 'inclui',
      titulo: 'Inclui',
      render: (p) => (
        <span className="text-sm text-tinta-2">{p.inclui.length > 0 ? p.inclui.join(', ') : 'Sem itens listados'}</span>
      ),
    },
    {
      chave: 'situacao',
      titulo: 'Situação',
      render: (p) => (
        <span className="flex items-center gap-2">
          <Badge tom={p.ativo ? 'sucesso' : 'neutro'}>{p.ativo ? 'Ativo' : 'Inativo'}</Badge>
          <span onClick={(e) => e.stopPropagation()}>
            <Switch
              ligado={p.ativo}
              rotulo={p.ativo ? `Inativar ${p.nome}` : `Ativar ${p.nome}`}
              carregando={alterar.isPending && alterar.variables?.id === p.id}
              onMudar={(v) => alternar(p, v)}
            />
          </span>
        </span>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader titulo="Planos" descricao="Catálogo de planos oferecidos aos restaurantes clientes." />
      <TaxaPadraoCard />
      <div className="flex justify-end">
        <Button className="max-sm:w-full" onClick={() => setCriando(true)}>
          <Plus className="size-4" aria-hidden />
          Novo plano
        </Button>
      </div>

      {lista.isPending && (
        <div aria-busy="true" aria-label="Carregando planos" className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {lista.isError && <AreaErro erro={lista.error} aoTentarDeNovo={() => void lista.refetch()} />}
      {lista.isSuccess && itens.length === 0 && (
        <EmptyState
          icone={<Package className="size-7" aria-hidden />}
          titulo="Nenhum plano ainda"
          descricao="Crie o primeiro plano para escolhê-lo ao montar uma assinatura."
        />
      )}
      {lista.isSuccess && itens.length > 0 && (
        <TableResponsive colunas={colunas} linhas={itens} chaveLinha={(p) => p.id} onRowClick={setEditando} legenda="Planos" />
      )}

      <Dialog aberto={criando} onFechar={() => setCriando(false)} titulo="Novo plano" className="max-w-md">
        {criando && <FormPlano aoFechar={() => setCriando(false)} />}
      </Dialog>
      <Dialog aberto={editando != null} onFechar={() => setEditando(null)} titulo="Editar plano" className="max-w-md">
        {editando && <FormPlano key={editando.id} plano={editando} aoFechar={() => setEditando(null)} />}
      </Dialog>
    </div>
  )
}

function FormPlano({ plano, aoFechar }: { plano?: PlanoDTO; aoFechar: () => void }) {
  const [nome, setNome] = useState(plano?.nome ?? '')
  const [valor, setValor] = useState<number | null>(plano?.valor_centavos ?? null)
  const [taxa, setTaxa] = useState<number | null>(plano?.taxa_intermediacao_centavos ?? null)
  const [inclui, setInclui] = useState((plano?.inclui ?? []).join('\n'))
  const [erro, setErro] = useState<string | null>(null)
  const criar = useCriarPlano()
  const alterar = useAlterarPlano()
  const { mostrarToast } = useToast()
  const pendente = criar.isPending || alterar.isPending

  const salvar = () => {
    if (!nome.trim()) return setErro('Informe o nome do plano.')
    if (valor === null || valor <= 0) return setErro('Informe o valor mensal.')
    setErro(null)
    const corpo = {
      nome: nome.trim(),
      valor_centavos: valor,
      inclui: linhasParaLista(inclui),
      taxa_intermediacao_centavos: taxa,
    }
    const opcoes = {
      onSuccess: () => {
        mostrarToast(plano ? 'Plano atualizado.' : 'Plano criado.', { tom: 'sucesso' })
        aoFechar()
      },
      onError: (e: Error) => setErro(mensagem(e, 'Não foi possível salvar o plano.')),
    }
    if (plano) alterar.mutate({ id: plano.id, patch: corpo }, opcoes)
    else criar.mutate({ ...corpo, ativo: true }, opcoes)
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        salvar()
      }}
    >
      <Field label="Nome">
        <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} />
      </Field>
      <Field label="Valor mensal" dica={plano ? 'Reajuste vale para novas assinaturas. Quem já assina mantém o valor combinado.' : undefined}>
        <MoneyInput value={valor} onChange={setValor} />
      </Field>
      <Field label="Taxa de intermediação" dica="Por transação, no Pix/cartão intermediado. Em branco = usa o padrão da plataforma. R$ 0,00 = sem taxa.">
        <MoneyInput value={taxa} onChange={setTaxa} />
      </Field>
      <Field label="O que inclui" dica="Um item por linha. Ex.: Atendente com IA, 2 lojas, 1 número de WhatsApp.">
        <Textarea value={inclui} onChange={(e) => setInclui(e.target.value)} rows={5} />
      </Field>
      {erro && <Banner tom="erro">{erro}</Banner>}
      <div className="flex flex-col gap-2">
        <Button type="submit" loading={pendente}>
          {plano ? 'Salvar plano' : 'Criar plano'}
        </Button>
        <Button type="button" variante="secondary" disabled={pendente} onClick={aoFechar}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}

/** Taxa de intermediacao PADRAO da plataforma (fallback de todos os planos). */
function TaxaPadraoCard() {
  const config = useConfigTaxa()
  const salvar = useSalvarConfigTaxa()
  const { mostrarToast } = useToast()
  const [valor, setValor] = useState<number | null>(null)

  useEffect(() => {
    if (config.data) setValor(config.data.taxa_intermediacao_padrao_centavos)
  }, [config.data])

  const mudou = config.data != null && valor != null && valor !== config.data.taxa_intermediacao_padrao_centavos

  const enviar = () => {
    if (valor == null) return
    salvar.mutate(valor, {
      onSuccess: () => mostrarToast('Taxa padrão salva.', { tom: 'sucesso' }),
      onError: (e) => mostrarToast(mensagem(e, 'Não foi possível salvar a taxa.'), { tom: 'erro' }),
    })
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg text-salvia">Taxa de intermediação padrão</h2>
        <p className="text-sm text-tinta-2">
          Cobrada por transação quando o pagamento passa pelo Whaviso. Cada plano pode ter a sua; em branco, o plano usa esta.
        </p>
      </div>
      {config.isPending && <Skeleton className="h-10 w-48" />}
      {config.isError && <AreaErro erro={config.error} aoTentarDeNovo={() => void config.refetch()} />}
      {config.isSuccess && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <Field label="Valor por transação">
              <MoneyInput value={valor} onChange={setValor} />
            </Field>
          </div>
          <Button onClick={enviar} loading={salvar.isPending} disabled={!mudou}>
            Salvar taxa
          </Button>
        </div>
      )}
    </Card>
  )
}
