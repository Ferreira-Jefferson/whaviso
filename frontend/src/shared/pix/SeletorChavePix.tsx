// Seleção da chave Pix de um aviso. Dois modos, conforme o fluxo:
//  - 'proprias' (vou receber): o Pix é meu. Duas abas (igual ao Perfil): "Minhas
//    chaves" (lista selecionável das salvas, com scroll + opção "Nenhuma chave",
//    já que o Pix é opcional) e "Cadastrar" (form completo com elementos de ui/ +
//    o handler useCadastrarChavePix). Sem nenhuma salva, abre na aba Cadastrar.
//  - 'externa' (vou pagar): a chave é de quem vai receber, não se salva na minha
//    conta. Usa o MESMO ChavePixInput do cadastro (Tipo + chave + detecção), só
//    sem salvar: o aviso guarda apenas a string (pix_chave), então o Tipo aqui é
//    estado local, usado só pela UX de detecção, e não há botão de salvar.
// Controlado: devolve só a string da chave (o aviso guarda `pix_chave`, sem tipo).
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Banner,
  Button,
  ChavePixInput,
  Field,
  Input,
  SegmentedControl,
  Spinner,
} from '../ui'
import { ROTULO_TIPO_CHAVE } from '../format'
import type { ChavePix, TipoChavePix } from '../contracts'
import { useChavesPix } from './api'
import { useCadastrarChavePix } from './useCadastrarChavePix'

interface SeletorChavePixProps {
  value: string
  onChange: (chave: string) => void
  modo: 'proprias' | 'externa'
  erro?: string
}

export function SeletorChavePix(props: SeletorChavePixProps) {
  return props.modo === 'proprias' ? (
    <ChavesProprias {...props} />
  ) : (
    <ChaveExterna {...props} />
  )
}

// Vou pagar: chave de terceiro. Mesmo ChavePixInput do cadastro, sem salvar (o
// Tipo é local, só para a detecção; o aviso guarda apenas a string da chave).
function ChaveExterna({ value, onChange, erro }: SeletorChavePixProps) {
  const [tipo, setTipo] = useState<TipoChavePix | ''>('')
  return (
    <ChavePixInput
      orientacao="linha"
      rotuloChave="Chave Pix"
      tipo={tipo}
      onTipoChange={setTipo}
      chave={value}
      onChaveChange={onChange}
      erroChave={erro}
    />
  )
}

// Vou receber: duas abas (igual ao Perfil): lista selecionável + cadastro.
function ChavesProprias({ onChange, erro }: SeletorChavePixProps) {
  const { data, isLoading } = useChavesPix()
  const chaves = useMemo(() => data ?? [], [data])

  // id da chave escolhida. '' = nenhuma (Pix é opcional). null = antes de init.
  const [sel, setSel] = useState<string | null>(null)
  // Aba ativa: 'chaves' (lista) | 'cadastrar' (form). null = antes de init.
  const [aba, setAba] = useState<'chaves' | 'cadastrar' | null>(null)

  // onChange via ref: não queremos reinicializar a seleção quando ele muda.
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  // Inicializa após a query carregar: sem chaves abre na aba Cadastrar; com
  // chaves, pré-seleciona a padrão na aba da lista.
  useEffect(() => {
    if (aba !== null || isLoading) return
    if (chaves.length === 0) {
      setSel('')
      setAba('cadastrar')
      return
    }
    const padrao = chaves.find((c) => c.padrao) ?? chaves[0]!
    setSel(padrao.id)
    onChangeRef.current(padrao.chave)
    setAba('chaves')
  }, [chaves, aba, isLoading])

  function escolher(id: string, chave: string) {
    setSel(id)
    onChange(chave)
  }

  // Chave recém-cadastrada: já entra na lista (query invalidada), fica selecionada
  // e volta para a aba da lista.
  function aoCriar(nova: ChavePix) {
    setSel(nova.id)
    onChange(nova.chave)
    setAba('chaves')
  }

  const temChaves = chaves.length > 0
  const abaAtiva = aba ?? 'chaves'

  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl
        ariaLabel="Seções da chave Pix"
        value={abaAtiva}
        onChange={(v) => setAba(v as 'chaves' | 'cadastrar')}
        options={[
          { value: 'chaves', label: 'Minhas chaves' },
          { value: 'cadastrar', label: 'Cadastrar' },
        ]}
      />

      {abaAtiva === 'cadastrar' ? (
        <FormularioNovaChave jaTemOutrasChaves={temChaves} onCriada={aoCriar} />
      ) : isLoading ? (
        <div className="flex justify-center py-6 text-salvia">
          <Spinner className="size-5" />
        </div>
      ) : !temChaves ? (
        <p className="py-4 text-center text-sm text-tinta-2">Nenhuma chave registrada.</p>
      ) : (
        <div className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-tinta-2">
            <input
              type="radio"
              name="chave-pix-aviso"
              className="size-4 accent-salvia"
              checked={sel === ''}
              onChange={() => escolher('', '')}
            />
            Nenhuma chave
          </label>
          {chaves.map((c) => (
            <label
              key={c.id}
              className="flex cursor-pointer items-center gap-2 text-sm text-tinta"
            >
              <input
                type="radio"
                name="chave-pix-aviso"
                className="size-4 accent-salvia"
                checked={sel === c.id}
                onChange={() => escolher(c.id, c.chave)}
              />
              <span className="truncate">
                <span className="text-tinta-2">{ROTULO_TIPO_CHAVE[c.tipo]} · </span>
                {c.chave}
                {c.rotulo ? ` · ${c.rotulo}` : ''}
                {c.padrao ? ' (padrão)' : ''}
              </span>
            </label>
          ))}
        </div>
      )}

      {erro && <p className="text-xs text-barro" role="alert">{erro}</p>}
    </div>
  )
}

// Form completo de cadastro: composição local (não é componente compartilhado)
// com os elementos de ui/ + o handler de salvar. Aparece inline no NovoAviso.
// Sem outras chaves -> a primeira já vira padrão.
function FormularioNovaChave({
  jaTemOutrasChaves,
  onCriada,
}: {
  jaTemOutrasChaves: boolean
  onCriada: (chave: ChavePix) => void
}) {
  const { cadastrar, salvando } = useCadastrarChavePix()
  const [tipo, setTipo] = useState<TipoChavePix | ''>('')
  const [chave, setChave] = useState('')
  const [rotulo, setRotulo] = useState('')
  const [padrao, setPadrao] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function adicionar() {
    setErro(null)
    try {
      const nova = await cadastrar({
        tipo,
        chave,
        rotulo,
        padrao: jaTemOutrasChaves ? padrao : true,
      })
      onCriada(nova)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível adicionar a chave.')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {erro && <Banner tom="erro">{erro}</Banner>}

      <ChavePixInput
        orientacao="linha"
        tipo={tipo}
        onTipoChange={setTipo}
        chave={chave}
        onChaveChange={setChave}
      />

      <Field label="Apelido (opcional)">
        <Input
          placeholder="Ex.: Nubank, conta principal"
          autoComplete="off"
          value={rotulo}
          onChange={(e) => setRotulo(e.target.value)}
        />
      </Field>

      {jaTemOutrasChaves && (
        <label className="flex items-center gap-2 text-sm text-tinta-2">
          <input
            type="checkbox"
            className="size-4 accent-salvia"
            checked={padrao}
            onChange={(e) => setPadrao(e.target.checked)}
          />
          Definir como chave padrão
        </label>
      )}

      <Button
        type="button"
        variante="secondary"
        className="self-end"
        loading={salvando}
        onClick={adicionar}
      >
        Adicionar chave
      </Button>
    </div>
  )
}
