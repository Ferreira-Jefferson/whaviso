# Grupo 1D — Créditos/Conta (+ item 19 realocado para cá: comprovante de recarga via IA)

Origem: `docs/feedback-2026-07-22.md` + `.claude/plans/snazzy-sleeping-music.md`. Fonte de verdade de regra de negócio: `historias/`.

## Escopo desta wave (wave 1)

**Arquivos que este grupo TEM QUE SER O ÚNICO A TOCAR:**
- `frontend/src/modules/billing/pages/Creditos.tsx`
- `frontend/src/modules/conta/pages/Conta.tsx`
- `frontend/src/shared/auth/erros.ts`
- `backend/apps/api/src/modules/billing/` (service.ts, repo.ts, index.ts e o que for necessário)
- `backend/apps/api/src/modules/perfil/` (apenas leitura/consulta pra confirmar comportamento do item 4b, não editar sem necessidade)
- Novo componente compartilhado de OTP em `frontend/src/shared/auth/` (item 3)
- Migration nova: **use exatamente o número `0094`** (confira `ls backend/supabase/migrations | tail` antes, mas não reuse número ocupado por outro grupo).

## Itens

- **Item 2 ("segurando 2 créditos"):** a string exata não existe em nenhum arquivo de código, é paráfrase do Jeff. Candidato mais provável: o card "Reservado" em `Creditos.tsx`, exibido ao lado do banner de saldo zero, sem explicação do que significa. Implemente adicionando um texto explicativo curto (tooltip ou texto auxiliar abaixo do número) explicando o que "Reservado" quer dizer (créditos com hold aberto, aguardando confirmação de envio). Registre no resumo final que essa é uma hipótese sobre qual tela/elemento o Jeff quis dizer, caso ele queira ajustar.
- **Item 3 (popup de whats ao recarregar):** quando `POST /billing/recarga` falhar com `code === 'telefone_ausente'`, abrir um dialog de cadastro/verificação de WhatsApp (extraia a lógica de OTP hoje duplicada em `Conta.tsx`/`Onboarding.tsx` para um componente compartilhado em `shared/auth/`, já que "módulo nunca importa módulo"), sem sair da tela; ao concluir, disparar a recarga de novo automaticamente. **Não edite `Onboarding.tsx` diretamente** (não está no seu escopo de arquivos) — extraia a lógica compartilhada de forma que `Onboarding.tsx` continue funcionando sem precisar editá-lo (o novo componente deve ser consumível por ele depois, numa próxima leva; se puder evitar tocar nele, evite).
- **Item 4a (mensagem de erro errada):** em `frontend/src/shared/auth/erros.ts`, adicionar um `if (code === 'phone_exists')` **antes** do fallback genérico de "phone/number" que hoje mascara esse erro como "DDD errado". Fix direto, só frontend.
- **Item 4b:** **decidido — não implementar nesta leva.** Não mexer em `perfilIncompleto()` nem reabrir onboarding para contas antigas. Só o item 4a (mensagem de erro) é implementado. Deixe isso explícito no resumo final como decisão registrada, não pendência esquecida.
- **Item 19 (comprovante de recarga, OpenRouter):**
  - Novo endpoint `POST /billing/recarga/:id/comprovante` recebendo imagem/PDF; armazenar no Supabase Storage.
  - Chamar um módulo de validação novo (`shared/validacao_comprovante/` ou dentro de `billing/`, decida o melhor lugar respeitando "módulo nunca importa módulo") que usa a API do **OpenRouter** (não Gemini — decisão já tomada) com um modelo com visão, pra responder se o documento é um comprovante de pagamento válido e se o valor/dados batem com a recarga solicitada.
  - **Decisão sobre confiança baixa (já tomada):** se a IA tiver baixa confiança de que o comprovante é válido/bate com a recarga, o item **fica pendente para revisão manual** (não credita automaticamente, não rejeita automaticamente). Modele um status de recarga tipo `aguardando_revisao_manual` (nova migration `0094`, coluna/estado em billing) e garanta que exista alguma forma de você (owner/cobrador da própria conta) ver essas pendências depois (mesmo que seja só uma listagem simples por enquanto, sem UI sofisticada).
  - Se a confiança for alta e os dados baterem, creditar automaticamente a carteira (reaproveitar a função de crédito já usada no billing — confirme o nome exato lendo o código antes de implementar).
  - **Decisão sobre retenção do documento (já tomada):** guardar o arquivo no Supabase Storage por **30 dias** e depois apagar (manter só o registro/decisão no banco, nunca o arquivo). Implemente isso como um job/rotina clara (pode ser um comentário + TODO de scheduler se não houver infraestrutura de cron neste backend — investigue se já existe algum mecanismo de tarefa periódica no projeto antes de inventar um novo).
  - **Riscos a registrar em comentário/commit (não logar dado sensível):** nunca logar o conteúdo do documento (dado bancário de terceiro/do próprio usuário); nunca logar o resultado bruto da IA se ele contiver dado sensível; falso positivo mitigado por exigir correspondência de valor, não só "parece um comprovante".
  - UI em `Creditos.tsx`: botão de anexar comprovante quando há recarga pendente.
  - Escrever história nova em `historias/11-planos-billing.md` (Épico 11) com os critérios de aceite: o que conta como comprovante válido, o que acontece em baixa confiança (revisão manual), retenção de 30 dias. Isso é parte da definição de "pronto" deste item, não opcional.

## Verificação

- `cd backend && npm run lint && npm run typecheck && npm test`.
- `bash scripts/validate_migrations.sh whaviso_dev` (migration nova).
- `cd frontend && npm run lint && npm run typecheck`.
- Migration nova fica pendente de aplicar no Supabase cloud — não aplique, isso é decidido depois com o Jeff.
- Rodar `/graphify . --update` ao final, se a ferramenta existir no ambiente.
