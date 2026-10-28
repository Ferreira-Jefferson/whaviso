// Conecta um canal ou troca a credencial. A credencial e WRITE-ONLY: campo de senha, sem
// autocompletar, e limpo assim que o envio termina (com sucesso ou nao). Nunca e exibida de volta.
import { useEffect, useState } from 'react'
import { ApiError } from '@/shared/api_client'
import { Banner, Button, Dialog, Field, Input, useToast } from '@/shared/ui'
import { CredencialCanal, type CanalEstado } from '@/shared/contracts/_generated/canais'
import { useConectarCanal } from '../api'
import type { CANAIS } from '../estados'

interface Props {
  canal: (typeof CANAIS)[number] | null
  /** Estado atual (para pre-preencher a config nao secreta e saber se e troca). */
  atual: CanalEstado | undefined
  onFechar: () => void
}

export function ConectarCanalDialog({ canal, atual, onFechar }: Props) {
  const conectar = useConectarCanal()
  const { mostrarToast } = useToast()
  const [credencial, setCredencial] = useState('')
  const [merchant, setMerchant] = useState('')
  const [rotulo, setRotulo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [erroCred, setErroCred] = useState<string | undefined>()

  useEffect(() => {
    if (!canal) return
    setCredencial('')
    setMerchant(atual?.config.merchant_id ?? '')
    setRotulo(atual?.config.rotulo ?? '')
    setErro(null)
    setErroCred(undefined)
  }, [canal, atual?.config.merchant_id, atual?.config.rotulo])

  async function salvar() {
    if (!canal) return
    const c = CredencialCanal.safeParse(credencial)
    if (!c.success) {
      setErroCred('Credencial inválida: use ao menos 16 caracteres, sem espaços.')
      return
    }
    setErroCred(undefined)
    setErro(null)
    const config = {
      ...(merchant.trim() ? { merchant_id: merchant.trim() } : {}),
      ...(rotulo.trim() ? { rotulo: rotulo.trim() } : {}),
    }
    try {
      await conectar.mutateAsync({
        canal: canal.canal,
        credencial: c.data,
        ...(Object.keys(config).length > 0 ? { config } : {}),
      })
      mostrarToast(atual ? 'Credencial atualizada.' : `${canal.nome} conectado.`, { tom: 'sucesso' })
      onFechar()
    } catch (e) {
      setErro(
        e instanceof ApiError
          ? e.isForbidden
            ? 'Só o dono da conta pode conectar ou trocar a credencial.'
            : e.message
          : 'Não foi possível conectar o canal.',
      )
    } finally {
      setCredencial('')
    }
  }

  return (
    <Dialog
      aberto={canal !== null}
      onFechar={onFechar}
      titulo={canal ? `${atual ? 'Trocar credencial do' : 'Conectar'} ${canal.nome}` : 'Conectar canal'}
      className="max-w-md"
      acoes={
        <>
          <Button className="w-full" loading={conectar.isPending} onClick={() => void salvar()}>
            {atual ? 'Trocar credencial' : 'Conectar'}
          </Button>
          <Button variante="secondary" className="w-full" disabled={conectar.isPending} onClick={onFechar}>
            Cancelar
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void salvar()
        }}
        noValidate
      >
        {erro && <Banner tom="erro">{erro}</Banner>}
        <Field
          label="Credencial de acesso"
          erro={erroCred}
          dica="Fornecida pelo canal. Fica guardada com segurança e não aparece de novo depois de salva."
        >
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={credencial}
            onChange={(e) => setCredencial(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Identificação da loja no canal " dica="Por exemplo, o código do restaurante no iFood.">
          <Input value={merchant} maxLength={64} onChange={(e) => setMerchant(e.target.value)} />
        </Field>
        <Field label="Apelido ">
          <Input value={rotulo} maxLength={60} onChange={(e) => setRotulo(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  )
}
