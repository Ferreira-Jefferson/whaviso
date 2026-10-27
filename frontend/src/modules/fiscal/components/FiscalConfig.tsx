// Configuracao do emissor fiscal da loja. A credencial do emissor e WRITE-ONLY: campo de senha,
// limpo ao fim do envio, nunca exibido de volta (so os ultimos 4 caracteres, mascarados).
// Sem credencial preenchida e com config existente, salva so os ajustes (PATCH); com credencial,
// reenvia tudo (PUT, so o dono). A api valida e o cliente mostra a mensagem dela.
import { useEffect, useState } from 'react'
import { ReceiptText, ShieldCheck } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { Badge, Banner, Button, Card, ErrorState, Field, IconChip, Input, Select, Skeleton, useToast } from '@/shared/ui'
import { formatarDataHora } from '@/shared/format'
import {
  CredencialFiscal,
  type RegimeFiscalDto,
} from '@/shared/contracts/_generated/fiscal'
import { useAjustarFiscalConfig, useDefinirFiscalConfig, useFiscalConfig } from '../api'
import { OPCOES_AMBIENTE, OPCOES_REGIME, ROTULO_AMBIENTE, ROTULO_REGIME, formatarCnpj, soDigitos } from '../estados'

type Ambiente = 'homologacao' | 'producao'
type Erros = Partial<Record<'credencial' | 'cnpj' | 'serie_nfce' | 'serie_nfse', string>>

function lerSerie(v: string): number | null {
  if (!/^\d{1,3}$/.test(v)) return null
  const n = Number(v)
  return n >= 1 && n <= 999 ? n : null
}

export function FiscalConfig() {
  const config = useFiscalConfig()
  const definir = useDefinirFiscalConfig()
  const ajustar = useAjustarFiscalConfig()
  const { mostrarToast } = useToast()

  const [credencial, setCredencial] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [regime, setRegime] = useState<RegimeFiscalDto>('simples_nacional')
  const [serieNfce, setSerieNfce] = useState('1')
  const [serieNfse, setSerieNfse] = useState('1')
  const [ambiente, setAmbiente] = useState<Ambiente>('homologacao')
  const [erros, setErros] = useState<Erros>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)

  const estado = config.data
  const configurada = Boolean(estado?.configurada)
  // Tom do chip pelo estado: reforça a situação de relance (sem depender só do selo).
  const avatarTom = !estado?.configurada ? 'neutro' : estado.ativo ? 'salvia' : 'ambar'

  // Carrega o formulario com o que ja esta salvo (so campos nao secretos).
  useEffect(() => {
    if (!estado?.configurada) return
    setCnpj(estado.cnpj ? formatarCnpj(estado.cnpj) : '')
    if (estado.regime) setRegime(estado.regime)
    setSerieNfce(String(estado.serie_nfce ?? 1))
    setSerieNfse(String(estado.serie_nfse ?? 1))
    if (estado.ambiente) setAmbiente(estado.ambiente)
  }, [estado])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErroGeral(null)
    const novos: Erros = {}
    const digitos = soDigitos(cnpj)
    if (digitos.length !== 14) novos.cnpj = 'O CNPJ tem 14 dígitos.'
    const nfce = lerSerie(serieNfce)
    const nfse = lerSerie(serieNfse)
    if (nfce === null) novos.serie_nfce = 'Use um número de 1 a 999.'
    if (nfse === null) novos.serie_nfse = 'Use um número de 1 a 999.'
    const enviaCredencial = credencial !== '' || !configurada
    let cred: string | null = null
    if (enviaCredencial) {
      const c = CredencialFiscal.safeParse(credencial)
      if (!c.success) novos.credencial = 'Credencial inválida: use ao menos 8 caracteres, sem espaços.'
      else cred = c.data
    }
    setErros(novos)
    if (Object.keys(novos).length > 0 || nfce === null || nfse === null) return

    try {
      if (enviaCredencial && cred) {
        await definir.mutateAsync({
          credencial: cred,
          cnpj: digitos,
          regime,
          serie_nfce: nfce,
          serie_nfse: nfse,
          ambiente,
        })
      } else {
        await ajustar.mutateAsync({ cnpj: digitos, regime, serie_nfce: nfce, serie_nfse: nfse, ambiente })
      }
      mostrarToast('Configuração fiscal salva.', { tom: 'sucesso' })
    } catch (err) {
      setErroGeral(
        err instanceof ApiError
          ? err.isForbidden && enviaCredencial
            ? 'Só o dono da conta pode cadastrar ou trocar a credencial do emissor.'
            : err.message
          : 'Não foi possível salvar a configuração fiscal.',
      )
    } finally {
      setCredencial('')
    }
  }

  async function alternarAtivo() {
    if (!estado) return
    try {
      await ajustar.mutateAsync({ ativo: !estado.ativo })
      mostrarToast(estado.ativo ? 'Emissão desativada.' : 'Emissão ativada.', { tom: 'sucesso' })
    } catch (err) {
      mostrarToast(err instanceof ApiError ? err.message : 'Não foi possível alterar.', { tom: 'erro' })
    }
  }

  const salvando = definir.isPending || ajustar.isPending

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <IconChip tom={avatarTom} tamanho="md">
            <ReceiptText strokeWidth={1.75} className="size-5" aria-hidden />
          </IconChip>
          <div className="min-w-0">
            <h2 className="text-lg text-salvia">Situação do emissor</h2>
            <p className="mt-0.5 text-xs text-tinta-2">Emissão de NFC-e e NFS-e dos pedidos.</p>
          </div>
          {config.isSuccess && estado?.configurada && (
            <Badge tom={estado.ativo ? 'sucesso' : 'atencao'} className="ml-auto">
              {estado.ativo ? 'Emissão ativa' : 'Emissão desativada'}
            </Badge>
          )}
        </div>
        {config.isPending && <Skeleton className="h-24 w-full" />}
        {config.isError && <ErrorState aoTentarDeNovo={() => void config.refetch()} />}
        {config.isSuccess && !estado?.configurada && (
          <p className="border-t border-linha pt-4 text-sm text-tinta-2">
            Nenhum emissor configurado. Cadastre os dados ao lado para poder emitir notas fiscais dos pedidos.
          </p>
        )}
        {config.isSuccess && estado?.configurada && (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 border-t border-linha pt-4 text-sm">
              <dt className="text-tinta-2">CNPJ</dt>
              <dd className="tabular text-right text-tinta">{estado.cnpj ? formatarCnpj(estado.cnpj) : '-'}</dd>
              <dt className="text-tinta-2">Regime</dt>
              <dd className="text-right text-tinta">{estado.regime ? ROTULO_REGIME[estado.regime] : '-'}</dd>
              <dt className="text-tinta-2">Séries</dt>
              <dd className="tabular text-right text-tinta">
                NFC-e {estado.serie_nfce ?? '-'} · NFS-e {estado.serie_nfse ?? '-'}
              </dd>
              <dt className="text-tinta-2">Ambiente</dt>
              <dd className="text-right">
                {estado.ambiente === 'producao' ? (
                  <Badge tom="atencao">Produção</Badge>
                ) : (
                  <span className="text-tinta">{estado.ambiente ? ROTULO_AMBIENTE[estado.ambiente] : '-'}</span>
                )}
              </dd>
              <dt className="text-tinta-2">Credencial</dt>
              <dd className="tabular text-right text-tinta">{estado.ultimos4 ? `•••• ${estado.ultimos4}` : 'Cadastrada'}</dd>
              {estado.atualizado_em && (
                <>
                  <dt className="text-tinta-2">Atualizada em</dt>
                  <dd className="text-right text-tinta">{formatarDataHora(estado.atualizado_em)}</dd>
                </>
              )}
            </dl>
            <Button variante="secondary" loading={ajustar.isPending} onClick={() => void alternarAtivo()} className="max-md:w-full md:self-start">
              {estado.ativo ? 'Desativar emissão' : 'Ativar emissão'}
            </Button>
          </>
        )}
        <p className="flex items-start gap-2 border-t border-linha pt-3 text-xs text-tinta-2">
          <ShieldCheck strokeWidth={1.75} className="mt-0.5 size-4 flex-none" aria-hidden />
          A credencial do emissor nunca é exibida de novo depois de salva.
        </p>
      </Card>

      <Card>
        <form onSubmit={(e) => void salvar(e)} className="flex flex-col gap-4" noValidate>
          <h2 className="text-lg text-salvia">{configurada ? 'Ajustar configuração' : 'Configurar emissor'}</h2>
          {erroGeral && <Banner tom="erro">{erroGeral}</Banner>}
          <Field
            label={configurada ? 'Nova credencial do emissor (opcional)' : 'Credencial do emissor'}
            erro={erros.credencial}
            dica={
              configurada
                ? 'Deixe em branco para manter a atual. Só o dono pode trocar.'
                : 'Chave de acesso fornecida pelo serviço emissor de notas.'
            }
          >
            <Input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={credencial}
              onChange={(e) => setCredencial(e.target.value)}
            />
          </Field>
          <Field label="CNPJ" erro={erros.cnpj}>
            <Input
              inputMode="numeric"
              autoComplete="off"
              value={cnpj}
              maxLength={18}
              placeholder="00.000.000/0000-00"
              onChange={(e) => setCnpj(e.target.value)}
            />
          </Field>
          <Field label="Regime tributário">
            <Select ariaLabel="Regime tributário" value={regime} onChange={setRegime} options={OPCOES_REGIME} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Série NFC-e" erro={erros.serie_nfce}>
              <Input inputMode="numeric" value={serieNfce} maxLength={3} onChange={(e) => setSerieNfce(e.target.value)} />
            </Field>
            <Field label="Série NFS-e" erro={erros.serie_nfse}>
              <Input inputMode="numeric" value={serieNfse} maxLength={3} onChange={(e) => setSerieNfse(e.target.value)} />
            </Field>
          </div>
          <Field label="Ambiente">
            <Select ariaLabel="Ambiente de emissão" value={ambiente} onChange={setAmbiente} options={OPCOES_AMBIENTE} />
          </Field>
          {ambiente === 'producao' && (
            <Banner tom="info">Em produção, as notas emitidas têm valor fiscal. Use homologação para testar.</Banner>
          )}
          <Button type="submit" loading={salvando} className="max-md:w-full md:self-start">
            Salvar configuração
          </Button>
        </form>
      </Card>
    </div>
  )
}
