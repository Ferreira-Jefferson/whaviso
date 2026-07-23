# Grupo 1A — Combinados (frontend): NovoAviso, CadenciaLembretes, SeletorChavePix

Origem: `docs/feedback-2026-07-22.md` + `.claude/plans/snazzy-sleeping-music.md`. Fonte de verdade de regra de negócio: `historias/`.

## Escopo desta wave (wave 1)

**Arquivos que este grupo TEM QUE SER O ÚNICO A TOCAR:**
- `frontend/src/modules/avisos/pages/NovoAviso.tsx`
- `frontend/src/modules/avisos/components/CadenciaLembretes.tsx`
- `frontend/src/shared/pix/SeletorChavePix.tsx`
- `frontend/src/shared/ui/Toast.tsx` (novo)
- `frontend/src/shared/ui/IconePendencia.tsx` (novo)

**NÃO tocar** `frontend/src/shared/contracts/entidades.ts` (owner é o grupo 1B) nem `frontend/src/modules/avisos/components/AvisoCriado.tsx` (fica pra wave 2, depende do campo `codigo` que 1B publica em entidades.ts). Item 21 (frontend) fica **fora desta wave**, entra na wave 2.

## Itens

- **Item 9 (preload do preview):** em `useCombinadoPreview(payload, enviarAceite)` dentro do `RevisarModal`, trocar o segundo argumento para sempre `true`. O preview já dispara assim que o modal monta, fica cacheado (`staleTime: 30s` já configurado), e quando o usuário marca "Enviar aceite" o preview já está pronto.
- **Item 11 (toast):** novo `ToastProvider`/`useToast()` em `shared/ui/Toast.tsx`, mesmo padrão de contexto de `shared/auth`. Portal fixo, `aria-live="polite"`, auto-dismiss configurável, tons reaproveitando a paleta de `Banner.tsx`. Chamar em `NovoAviso.tsx` no sucesso do `onSubmit` ("Combinado enviado" / "Combinado salvo na agenda").
- **`IconePendencia` (novo, componente puro para os grupos 1B e 1C consumirem depois):** recebe `tipo` (enum de pendência) e `tooltip` (texto), sem lógica de negócio embutida — quem decide tipo/texto é quem consome. Documentar a interface (props) claramente no topo do arquivo, porque 1B e 1C vão importar este componente sem coordenação direta com você.
- **Item 12 (gate visual sem pix):** `CadenciaLembretes` ganha prop `pixPresente: boolean`; quando falso, aplica opacidade + texto explicativo ("Só é possível enviar lembretes pelo WhatsApp em combinados com chave Pix..."). Vale para qualquer direção/modo em que pix é opcional (agenda, pagar).
- **Item 13 (oferecer chave ao enviar sem pix):** dentro do `RevisarModal`, quando `enviarAceite && !pix_chave`, mostrar o próprio `SeletorChavePix` embutido (já tem abas "minhas chaves"/"cadastrar"). Para `receber`: mantém bloqueio de envio (schema já exige). Para `pagar`: é oferta não bloqueante, não impede envio (decisão de produto já registrada no backend, ver `avisos.test.ts:130-133`).

## Decisões já tomadas (não perguntar de novo)

- Texto exato do gate de pix (item 12): use uma frase clara e neutra em gênero, sem travessão. Ajuste livre de wording, não é bloqueante.

## Verificação

- `cd frontend && npm run lint && npm run typecheck`.
- Testar manualmente o fluxo de Novo Aviso localmente antes de dar como concluído, se `npm run dev` estiver disponível.
- Rodar `/graphify . --update` ao final, se a ferramenta existir no ambiente.
