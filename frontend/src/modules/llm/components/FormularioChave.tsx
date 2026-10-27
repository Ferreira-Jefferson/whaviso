// Cadastro/troca da chave. WRITE-ONLY: o valor digitado vive so neste estado local, e e apagado assim
// que a chamada termina (sucesso ou falha). Nunca vai para storage, URL, log ou cache.
import { useState, type FormEvent } from 'react'
import { ShieldCheck } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { Banner, Button, Field, Input, Select, useToast } from '@/shared/ui'
import type { ProvedorLlm } from '@/shared/contracts/_generated/enums'
import { ChaveLlm, type ResultadoValidacaoLlm } from '@/shared/contracts/_generated/configuracoes_llm'
import { useDefinirCredencial, useTestarChave } from '../api'
import { MENSAGEM_TESTE, OPCOES_PROVEDOR } from '../estados'

export function FormularioChave({
  configurada,
  provedorAtual,
}: {
  configurada: boolean
  provedorAtual: ProvedorLlm | null
}) {
  const { mostrarToast } = useToast()
  const definir = useDefinirCredencial()
  const testar = useTestarChave()
  const [provedor, setProvedor] = useState<ProvedorLlm>(provedorAtual ?? 'openrouter')
  const [chave, setChave] = useState('')
  const [modelo, setModelo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [teste, setTeste] = useState<ResultadoValidacaoLlm | null>(null)

  function validar(): string | null {
    const r = ChaveLlm.safeParse(chave)
    return r.success ? null : (r.error.issues[0]?.message ?? 'chave inválida')
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setTeste(null)
    const problema = validar()
    if (problema) {
      setErro(`Chave inválida (${problema}).`)
      return
    }
    try {
      await definir.mutateAsync({
        provedor,
        chave: chave.trim(),
        ...(modelo.trim() ? { modelo_preferido: modelo.trim() } : {}),
      })
      mostrarToast(configurada ? 'Chave trocada.' : 'Chave salva.', { tom: 'sucesso' })
      setModelo('')
    } catch (err) {
      setErro(mensagemErro(err))
    } finally {
      setChave('') // a chave some da tela e da memoria do componente
    }
  }

  async function testarChave() {
    setErro(null)
    setTeste(null)
    const problema = validar()
    if (problema) {
      setErro(`Chave inválida (${problema}).`)
      return
    }
    try {
      const r = await testar.mutateAsync({ provedor, chave: chave.trim() })
      setTeste(r.resultado)
    } catch (err) {
      setErro(mensagemErro(err))
    }
  }

  const msg = teste ? MENSAGEM_TESTE[teste] : null
  const ocupado = definir.isPending || testar.isPending

  return (
    <form
      onSubmit={(e) => void salvar(e)}
      autoComplete="off"
      className="flex flex-col gap-4 rounded-card border border-linha bg-cartao p-4 sm:p-5"
    >
      <div className="flex items-start gap-2.5 rounded-input border border-salvia/20 bg-salvia-claro px-3 py-2.5 text-sm text-salvia">
        <ShieldCheck className="mt-0.5 size-4 flex-none" strokeWidth={1.75} aria-hidden />
        <p>
          A chave é guardada cifrada e nunca é mostrada de novo, nem para você. Ao salvar, ela é conferida no
          provedor antes de ser gravada.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Provedor">
          <Select value={provedor} onChange={setProvedor} options={OPCOES_PROVEDOR} ariaLabel="Provedor" disabled={ocupado} />
        </Field>
        <Field label="Modelo preferido (opcional)">
          <Input value={modelo} maxLength={120} onChange={(e) => setModelo(e.target.value)} disabled={ocupado} />
        </Field>
      </div>

      <Field label={configurada ? 'Nova chave' : 'Chave do provedor'}>
        <Input
          type="password"
          value={chave}
          onChange={(e) => setChave(e.target.value)}
          autoComplete="new-password"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={512}
          disabled={ocupado}
        />
      </Field>

      {provedor === 'outro' && (
        <Banner tom="info">
          Este provedor não tem conferência automática, então o servidor pode recusar o cadastro. Prefira um
          provedor da lista.
        </Banner>
      )}
      {msg && <Banner tom={msg.tom}>{msg.texto}</Banner>}
      {erro && <Banner tom="erro">{erro}</Banner>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variante="secondary"
          loading={testar.isPending}
          disabled={definir.isPending || !chave}
          onClick={() => void testarChave()}
        >
          Testar chave
        </Button>
        <Button type="submit" loading={definir.isPending} disabled={testar.isPending || !chave}>
          {configurada ? 'Trocar chave' : 'Salvar chave'}
        </Button>
      </div>
    </form>
  )
}

function mensagemErro(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.isForbidden) return 'Só o dono da loja pode cadastrar ou trocar a chave.'
    if (e.status === 422) return 'O provedor recusou a chave. Nada foi salvo.'
    if (e.status === 502) return 'O provedor não respondeu. Nada foi salvo; tente de novo em instantes.'
    if (e.status === 429) return 'Muitas tentativas. Aguarde um pouco e tente de novo.'
    return e.message
  }
  return 'Não foi possível concluir. Tente de novo.'
}
