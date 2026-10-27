import { Suspense } from 'react'
import { Outlet } from 'react-router'
import { Spinner } from '@/shared/ui'

function Carregando() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-salvia">
      <Spinner className="size-6" />
    </div>
  )
}

export function ComSuspense() {
  return (
    <Suspense fallback={<Carregando />}>
      <Outlet />
    </Suspense>
  )
}
