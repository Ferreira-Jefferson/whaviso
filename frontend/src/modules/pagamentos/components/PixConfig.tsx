// Configuracao da chave Pix da loja. A chave e WRITE-ONLY: depois de salva ela nunca volta para a
// tela (so tipo, titular, cidade e os ultimos 4 caracteres). O campo e limpo assim que o envio
// termina, com sucesso ou nao, para a chave nao ficar em estado de componente.
import { useState } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { Badge, Banner, Button, Card, ChavePixInput, ErrorState, Field, Input, SecretField, Skeleton, useToast } from '@/shared/ui'
import { ROTULO_TIPO_CHAVE, formatarDataHora } from '@/shared/format'
import { LojaPixEntrada } from '@/shared/contracts/_generated/pagamentos'
import type { TipoChavePix } from '@/shared/contracts/_generated/enums'
import { useDefinirPix, usePixEstado } from '../api'

type Erros = Partial<Record<'tipo' | 'chave' | 'titular' | 'cidade', string>>

export function PixConfig() {
  const estado = usePixEstado()
  const definir = useDefinirPix()
  const { mostrarToast } = useToast()

  const [tipo, setTipo] = useState<TipoChavePix | ''>('')
  const [chave, setChave] = useState('')
  const [titular, setTitular] = useState('')
  const [cidade, setCidade] = useState('')
  const [erros, setErros] = useState<Erros>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)

  const pix = estado.data

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErroGeral(null)
    if (!tipo) {
      setErros({ tipo: 'Escolha o tipo da chave.' })
      return
    }
    const parsed = LojaPixEntrada.safeParse({
      tipo,
      chave,
      titular,
      cidade: cidade.trim() === '' ? undefined : cidade,
    })
    if (!parsed.success) {
      const novos: Erros = {}
      for (const i of parsed.error.issues) {
        const campo = String(i.path[0]) as keyof Erros
        if (campo in { tipo: 1, chave: 1, titular: 1, cidade: 1 } && !novos[campo]) {
          novos[campo] =
            campo === 'chave'
              ? `A chave não confere com o tipo ${ROTULO_TIPO_CHAVE[tipo]}.`
              : campo === 'titular'
                ? 'Informe o nome do titular (até 60 caracteres).'
                : campo === 'cidade'
                  ? 'A cidade deve ter até 30 caracteres.'
                  : 'Dado inválido.'
        }
      }
      setErros(novos)
      return
    }
    setErros({})
    try {
      await definir.mutateAsync(parsed.data)
      setTipo('')
      setTitular('')
      setCidade('')
      mostrarToast('Chave Pix salva.', { tom: 'sucesso' })
    } catch (err) {
      setErroGeral(err instanceof ApiError ? err.message : 'Não foi possível salvar a chave Pix.')
    } finally {
      setChave('')
    }
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-lg text-salvia">
          <KeyRound strokeWidth={1.75} className="size-5" aria-hidden />
          Chave atual
        </h2>
        {estado.isPending && <Skeleton className="h-20 w-full" />}
        {estado.isError && <ErrorState aoTentarDeNovo={() => void estado.refetch()} />}
        {estado.isSuccess && !pix && (
          <div className="flex flex-col items-start gap-2 rounded-input border border-dashed border-linha bg-papel-2 px-4 py-5">
            <Badge tom="atencao">Sem chave</Badge>
            <p className="text-sm text-tinta-2">
              Nenhuma chave cadastrada. Sem ela, não é possível gerar o Pix de copia e cola nos pedidos.
            </p>
          </div>
        )}
        {estado.isSuccess && pix && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tom="sucesso">Chave ativa</Badge>
              <span className="text-xs text-tinta-2">{ROTULO_TIPO_CHAVE[pix.tipo]}</span>
            </div>
            <SecretField ultimos4={pix.ultimos4} className="flex w-full py-2.5" />
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-tinta-2">Titular</dt>
              <dd className="text-tinta">{pix.titular}</dd>
              <dt className="text-tinta-2">Cidade</dt>
              <dd className="text-tinta">{pix.cidade ?? 'Não informada'}</dd>
              <dt className="text-tinta-2">Atualizada em</dt>
              <dd className="text-tinta">{formatarDataHora(pix.atualizado_em)}</dd>
            </dl>
          </div>
        )}
        <p className="flex items-start gap-2 border-t border-linha pt-3 text-xs text-tinta-2">
          <ShieldCheck strokeWidth={1.75} className="mt-0.5 size-4 flex-none" aria-hidden />
          Por segurança, a chave guardada nunca é exibida de novo. Para alterar, cadastre uma nova.
        </p>
      </Card>

      <Card>
        <form onSubmit={(e) => void salvar(e)} className="flex flex-col gap-4" noValidate>
          <h2 className="text-lg text-salvia">{pix ? 'Trocar a chave' : 'Cadastrar a chave'}</h2>
          {erroGeral && <Banner tom="erro">{erroGeral}</Banner>}
          <ChavePixInput
            tipo={tipo}
            onTipoChange={setTipo}
            chave={chave}
            onChaveChange={setChave}
            erroTipo={erros.tipo}
            erroChave={erros.chave}
            rotuloChave={pix ? 'Nova chave Pix' : 'Chave Pix'}
          />
          <Field label="Titular" erro={erros.titular} dica="Nome que aparece para quem paga, como está no banco.">
            <Input value={titular} onChange={(e) => setTitular(e.target.value)} maxLength={60} autoComplete="off" />
          </Field>
          <Field label="Cidade " erro={erros.cidade} dica="Cidade do titular, usada no código Pix.">
            <Input value={cidade} onChange={(e) => setCidade(e.target.value)} maxLength={30} autoComplete="off" />
          </Field>
          <Button type="submit" loading={definir.isPending} className="max-md:w-full md:self-start">
            Salvar chave
          </Button>
          <p className="flex items-start gap-2 text-xs text-tinta-2">
            <ShieldCheck strokeWidth={1.75} className="mt-0.5 size-3.5 flex-none" aria-hidden />
            A chave é guardada cifrada e não volta para esta tela. O campo é limpo assim que você salva.
          </p>
        </form>
      </Card>
    </div>
  )
}
