// Testes de renderizacao e acessibilidade do ui kit base (papeis, nomes, teclado).
import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  Select,
  Skeleton,
  Spinner,
  TableResponsive,
  Tabs,
  ToastProvider,
  useToast,
} from './index'

describe('ui kit', () => {
  it('Button: papel button, aria-busy e desabilitado enquanto carrega', () => {
    const onClick = vi.fn()
    const { rerender } = render(<Button onClick={onClick}>Salvar</Button>)
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    rerender(
      <Button loading onClick={onClick}>
        Salvar
      </Button>,
    )
    const b = screen.getByRole('button', { name: /Salvar/ }) as HTMLButtonElement
    expect(b.disabled).toBe(true)
    expect(b.getAttribute('aria-busy')).toBe('true')
  })

  it('Input: aria-invalid quando invalido', () => {
    render(<Input aria-label="Nome" invalido />)
    expect(screen.getByLabelText('Nome').getAttribute('aria-invalid')).toBe('true')
  })

  it('Select: nome acessivel e onChange', () => {
    const onChange = vi.fn()
    render(
      <Select
        ariaLabel="Situacao"
        value="a"
        onChange={onChange}
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
      />,
    )
    fireEvent.change(screen.getByLabelText('Situacao'), { target: { value: 'b' } })
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('Card, Badge, Skeleton e Spinner', () => {
    const { container } = render(
      <>
        <Card>conteudo</Card>
        <Badge tom="sucesso">Pronto</Badge>
        <Skeleton className="h-4" />
        <Spinner />
      </>,
    )
    expect(screen.getByText('Pronto')).toBeTruthy()
    expect(container.querySelector('[aria-hidden]')).toBeTruthy()
    expect(screen.getByRole('status', { name: 'Carregando' })).toBeTruthy()
  })

  it('EmptyState e ErrorState (role alert + tentar de novo)', () => {
    const tentar = vi.fn()
    render(
      <>
        <EmptyState titulo="Nada aqui" descricao="Volte depois" />
        <ErrorState aoTentarDeNovo={tentar} />
      </>,
    )
    expect(screen.getByText('Nada aqui')).toBeTruthy()
    expect(screen.getByRole('alert')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(tentar).toHaveBeenCalled()
  })

  it('Tabs: papeis, aria-selected e navegacao por setas', () => {
    function Demo() {
      const [a, setA] = useState('um')
      return (
        <Tabs
          ariaLabel="Secoes"
          ativa={a}
          aoMudar={setA}
          itens={[
            { id: 'um', rotulo: 'Um', conteudo: <p>painel um</p> },
            { id: 'dois', rotulo: 'Dois', conteudo: <p>painel dois</p> },
          ]}
        />
      )
    }
    render(<Demo />)
    expect(screen.getByRole('tablist', { name: 'Secoes' })).toBeTruthy()
    const um = screen.getByRole('tab', { name: 'Um' })
    expect(um.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(um, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Dois' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tabpanel').textContent).toBe('painel dois')
    expect(screen.getByRole('tab', { name: 'Um' }).getAttribute('tabindex')).toBe('-1')
  })

  it('TableResponsive: tabela com legenda acessivel', () => {
    render(
      <TableResponsive
        legenda="Itens"
        chaveLinha={(l: { id: string; n: string }) => l.id}
        linhas={[{ id: '1', n: 'Pizza' }]}
        colunas={[{ chave: 'n', titulo: 'Nome', principal: true, render: (l) => l.n }]}
      />,
    )
    expect(screen.getAllByText('Pizza').length).toBeGreaterThan(0)
    expect(screen.getByText('Itens')).toBeTruthy()
  })

  it('Toast: regiao aria-live e mensagem', () => {
    function Demo() {
      const { mostrarToast } = useToast()
      return <button onClick={() => mostrarToast('Salvo')}>ok</button>
    }
    render(
      <ToastProvider>
        <Demo />
      </ToastProvider>,
    )
    act(() => fireEvent.click(screen.getByText('ok')))
    expect(screen.getByText('Salvo')).toBeTruthy()
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite')
  })

  it('Dialog: titulo e acoes (showModal simulado, jsdom nao implementa)', () => {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '')
    }
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open')
    }
    render(
      <Dialog aberto onFechar={() => undefined} titulo="Confirmar" acoes={<Button>Sim</Button>}>
        Tem certeza?
      </Dialog>,
    )
    expect(screen.getByRole('heading', { name: 'Confirmar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sim' })).toBeTruthy()
  })
})
