# Grupo 1E — zap: webhook_whatsapp (service.ts, repo.ts, index.ts)

Origem: `docs/feedback-2026-07-22.md` + `.claude/plans/snazzy-sleeping-music.md`. Fonte de verdade de regra de negócio: `historias/`.

## Escopo desta wave (wave 1) — ATENÇÃO: item 7 NÃO entra agora

**Nesta wave 1, implemente SÓ os itens 22 e 23.** O item 7 (lado zap) depende da migration do grupo 1B (tabela `avisos_reportes`, novo status) já estar aplicada localmente, e será feito numa wave 2 separada, depois que 1B terminar. Não tente adiantar o item 7 agora.

**Arquivos que este grupo TEM QUE SER O ÚNICO A TOCAR:**
- `backend/apps/zap/src/modules/webhook_whatsapp/service.ts`
- `backend/apps/zap/src/modules/webhook_whatsapp/repo.ts`
- `backend/apps/zap/src/modules/webhook_whatsapp/index.ts`
- Novo: `backend/packages/shared/src/contracts/pix.ts` (função pura de geração de payload EMV)

## Itens

- **Item 22 (pix com combinado e valor):** ampliar a query de `entregarChaveDePagamento` pra trazer `motivo`/`valor_centavos` do aviso, popular essas variáveis no `renderMensagem` (usar `formatarValorBr`, já usado em `enviar_lembretes`). Seguro popular antes do texto do template mudar (render ignora chave não usada). **Contrato com o grupo 1G (que muda o texto do template):** variáveis `pix_tipo, pix_chave, motivo, valor`. Este item precisa ir pra produção coordenado com 1G (não é problema de código agora, é só nota pro deploy).
- **Item 23 (Pix Copia e Cola / BR Code — decidido):** implementar `gerarPayloadPixCopiaCola(...)` em `packages/shared/src/contracts/pix.ts`, função pura seguindo o padrão EMV do Banco Central (sem integração externa paga, sem gateway). Consumir aqui como texto adicional na 1ª mensagem de entrega de chave.
  - **Decisão sobre o campo "cidade" do titular (já tomada):** usar um valor fixo genérico como placeholder (ex.: `"BRASIL"`, ou outro valor curto compatível com o limite de caracteres do spec EMV para esse campo) em vez de tentar capturar a cidade real do titular. Não mexer no cadastro de chave Pix (`pessoas/repo.ts`, fora do seu escopo de arquivos) para adicionar campo de cidade.
  - Escrever teste cobrindo a função pura `gerarPayloadPixCopiaCola` (CRC16 correto, campos obrigatórios presentes).

## Verificação

- `cd backend && npm run lint && npm run typecheck && npm test`.
- Rodar `/graphify . --update` ao final, se a ferramenta existir no ambiente.

---

## Wave 2 deste grupo (só depois que 1B tiver terminado e commitado) — item 7 lado zap + históriass

Guarde esta seção para quando for instruído a fazer a wave 2 (você receberá um prompt separado confirmando que 1B já commitou a migration `0092`/`0093`).

- **Item 7 (lado zap):** novo desvio em `processarTexto` para captar a escolha numerada do campo reportado (valor/data/nome_motivo — sem chave pix, decisão já tomada), gravando em `avisos_reportes` (tabela do 1B) e enfileirando notificação ao cobrador. Novas ações de botão `aprovar_correcao`/`recusar_correcao`, roteadas por telefone do cobrador (mesmo padrão de `confirmar`/`rejeitar`).
- **Históriass a escrever nesta wave 2 (consolidado aqui pra não ter dois agentes editando o mesmo arquivo de história):**
  - `historias/07-interacao-devedor.md`: adicionar a nova história/critério do fluxo de aceite pós-aceite com escolha de campo (nome/valor/data — sem pix) + aprovação do cobrador reabrindo edição com destaque visual dos campos alterados (comportamento decidido junto com o grupo 1B, confira `docs/planos/2026-07-22-1b-avisos-backend.md` pro detalhe exato).
  - `historias/07-interacao-devedor.md` (H7.3): registrar a terceira mensagem/formato de Pix Copia e Cola (BR Code) ao lado da chave + titular/banco que já existem.
