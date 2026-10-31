// So roda em dev (import dinamico atras de `import.meta.env.DEV` em main.tsx; nunca entra no
// build de producao). Recebe a sessao do usuario de teste gerada por
// `backend/scripts/qa_login.mjs`, injeta no localStorage (mesmo formato que um login real do
// supabase-js) e recarrega, evitando colar o token manualmente no console do navegador.
export async function injetarSessaoQa(): Promise<boolean> {
  const url = new URL(location.href)
  const porta = url.searchParams.get('qa_session_port')
  if (!porta) return false

  try {
    const r = await fetch(`http://127.0.0.1:${porta}/session.json`)
    if (!r.ok) return false
    const { key, session } = (await r.json()) as { key: string; session: unknown }
    localStorage.setItem(key, JSON.stringify(session))
  } catch {
    return false
  }

  url.searchParams.delete('qa_session_port')
  location.replace(url.toString())
  return true
}
