# Verificação dos 13 épicos: resumo consolidado (refeito)

> Refeito com a regra correta: a **história é a única fonte da verdade**, o CLAUDE.md foi ignorado, e nada foi tratado como "gated/futuro" a menos que a **própria história** marque (legendas 🟢/🟡 e seções "Fora de escopo"). Onde o código diverge da história, é o **código** que muda. Os relatórios por épico estão nesta pasta (`01-...md` a `13-...md`).
>
> Baseline de testes no momento da verificação: tudo verde.

## Veredito por épico

Legenda: `[x]` o código atende · `[~]` atende em parte · `[!]` diverge (refatorar o código) · `[+]` a história pede e o código não tem.

| Épico | [x] | [~] | [!] | [+] |
|---|---|---|---|---|
| 01 Conta & Autenticação (DEFERIDO) | 15 | 6 | 4 | 3 |
| 02 Criar combinado (receber) | 38 | 1 | 0 | 0 |
| 03 Criar combinado (pagar invertido) | 28 | 1 | 1 | 0 |
| 04 Modo agenda | 29 | 1 | 0 | 0 |
| 05 Convite & Aceite | 39 | 1 | 0 | 0 |
| 06 Ciclo de lembretes | 38 | 1 | 0 | 0 |
| 07 Interação do devedor | 39 | 2 | 0 | 0 |
| 08 Confirmação de pagamento | 36 | 3 | 0 | 1 |
| 09 Painel | 32 | 3 | 1 | 0 |
| 10 Notificações ao cobrador | 38 | 1 | 1 | 0 |
| 11 Planos, limites e billing | 32 | 3 | 2 | 0 |
| 12 Templates / mensagens (admin) | 37 | 2 | 0 | 0 |
| 13 Linguagem, opt-out e compliance | 8 | 2 | 0 | 0 |

## O que o código precisa mudar para seguir a história

### Bug de runtime (prioridade alta)
- **09 [!] `cancelado_criador` fora dos contratos.** O banco grava o evento `cancelado_criador` (migration 0035, `avisos/service.ts:598`), mas o enum `tipoEvento` (backend `enums.ts` e frontend `enums.ts`) e o `ROTULO_EVENTO` só têm `cancelado_cobrador`. Resultado: `GET /avisos/:id/eventos` falha a validação Zod para qualquer aviso cancelado, quebrando a linha do tempo do painel. Correção: adicionar `cancelado_criador` aos dois enums + mapa de rótulos.

### Divergências claras (código deve seguir a história)
- **03 [!] Frontend não exige Pix no invertido.** `frontend/src/modules/avisos/schemas.ts:56-69` e o rótulo "Chave Pix (opcional)" (`NovoAviso.tsx:266`) deixam o Pix opcional no `pagar`, mas a história 03 (H3.1 + "Decisões tomadas") exige Pix no convite invertido, e o backend já obriga. Correção: refine no schema do front + ajustar rótulo (validação local amigável em vez de 400 cru).
- **08 [+] / 10 [!] CTA discreta de criar conta para o cobrador sem conta.** A história (H8.5 e H10.7) pede que a notificação ao cobrador sem conta traga uma chamada discreta para criar conta. Hoje nenhum template `cobrador.*` traz isso (só um comentário na migration 0042 menciona). Correção: incluir a CTA no(s) template(s) de notificação ao cobrador.
- **13 [~] Lint não barra travessão/palavras proibidas.** A história H13.10 pede que `npm run lint` barre. Hoje quem barra é um teste vitest + CHECK no banco; o eslint só faz boundaries. Correção: regra eslint (`no-restricted-syntax`/custom) nos dois `eslint.config.mjs`.

### Symmetry/cosmético (a história não obriga, mas vale)
- **08 [~] Parar o ciclo ao informar pagamento** tem o MESMO efeito observável nos dois canais (ciclo para, só empurrãozinho D+1), mas por mecanismos diferentes (webhook pré-cancela; devedor logado/link deixam o drainer cancelar no envio). Padronizar por simetria, opcional.
- **04 / 11**: comentários de escopo desatualizados em `planos/index.ts` e migrations (dizem que `sem_aviso` "não existe"; descrevem Plus "por unidade"). Limpeza.

## Precisa de decisão do dono
- **11 [!] Planos divergem da história, mas o código é uma mudança recente e deliberada.** A história 11 define Plus **por unidade** (1 unidade = 1 ativável + 10 de agenda) e Profissional **R$ 29/49**. O código (commit recente "Plus por volume de envios + layout dos planos", migrations 0045/0046) mudou Plus para **por volume de envios** (16..200, R$ 30,90..79,90) e Profissional para **R$ 29 fixo**. Pela regra (história manda), o código deveria voltar ao modelo por unidade, mas isso reverteria uma decisão de negócio recente. **Não mexo sem a sua confirmação.**

## Deferido
- **01 Conta & Autenticação.** A história pede login/cadastro por **botão** (Acessar/Negar, Sim sou eu/Não fui eu); o código faz **OTP por código**. Decisão delicada, ligada ao que a Meta permite (identificar número + enviar botão). Itens atrelados (eventos `login_negado`/`cadastro_negado` nunca inseridos; link de "acompanhar no painel" no aceite, H1.4) ficam com o épico 01, para conversa dedicada.

## Itens que a própria história marca como 🟡/fora de escopo (sem ação)
- 06 H6.10 cadência/janela configurável (🟡); 08 H8.7 recorrência (🟡); 09 H9.6 recorrentes (🟡); 11 gateway de pagamento real / mudar de plano / queda de assinatura (🟡); 02/03 validação do número no aceite (remetida ao Épico 5); eventos `dado_incorreto`/`telefone_divergente` (gated pelo próprio contrato/E5).
- 05 H5.6 / 07 H7.1 "webhook HMAC": a história supõe webhook HTTP da Meta; hoje o transporte é Baileys (sem HMAC HTTP), com o payload validado por `aviso_id`. Religar HMAC só ao voltar à Meta oficial.
