// Editor do endereco da loja. Estado controlado pelo formulario (so strings); a montagem
// e a validacao do contrato (Endereco) ficam no FormularioLoja. Deixar tudo vazio = sem endereco.
import { Field, Input } from '@/shared/ui'
import type { EnderecoForm } from '../campos'

function formatarCep(bruto: string): string {
  const d = bruto.replace(/\D/g, '').slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

export function EditorEndereco({
  valor,
  onChange,
}: {
  valor: EnderecoForm
  onChange: (proximo: EnderecoForm) => void
}) {
  const set = (campo: keyof EnderecoForm, v: string) => onChange({ ...valor, [campo]: v })

  return (
    <div className="grid gap-4 sm:grid-cols-6">
      <div className="sm:col-span-4">
        <Field label="Rua">
          <Input
            value={valor.logradouro}
            onChange={(e) => set('logradouro', e.target.value)}
            placeholder="Ex.: Av. Paulista"
            maxLength={200}
            autoComplete="off"
          />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Número">
          <Input
            value={valor.numero}
            onChange={(e) => set('numero', e.target.value)}
            placeholder="Ex.: 1000"
            maxLength={20}
            autoComplete="off"
          />
        </Field>
      </div>
      <div className="sm:col-span-3">
        <Field label="Complemento" dica="Opcional: sala, bloco, ponto de referência.">
          <Input
            value={valor.complemento}
            onChange={(e) => set('complemento', e.target.value)}
            placeholder="Opcional"
            maxLength={100}
            autoComplete="off"
          />
        </Field>
      </div>
      <div className="sm:col-span-3">
        <Field label="Bairro">
          <Input
            value={valor.bairro}
            onChange={(e) => set('bairro', e.target.value)}
            maxLength={100}
            autoComplete="off"
          />
        </Field>
      </div>
      <div className="sm:col-span-3">
        <Field label="Cidade">
          <Input
            value={valor.cidade}
            onChange={(e) => set('cidade', e.target.value)}
            maxLength={100}
            autoComplete="off"
          />
        </Field>
      </div>
      <div className="sm:col-span-1">
        <Field label="UF">
          <Input
            value={valor.uf}
            onChange={(e) => set('uf', e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))}
            placeholder="SP"
            autoCapitalize="characters"
            autoComplete="off"
          />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="CEP">
          <Input
            value={formatarCep(valor.cep)}
            onChange={(e) => set('cep', e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="00000-000"
            inputMode="numeric"
            autoComplete="off"
          />
        </Field>
      </div>
    </div>
  )
}
