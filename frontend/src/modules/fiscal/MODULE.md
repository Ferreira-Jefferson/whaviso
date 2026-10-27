# fiscal (frontend)

## Proposito
Pagina `/fiscal` com duas secoes: **Documentos** (lista NFC-e/NFS-e com status, chave de acesso, link, nova
tentativa em caso de erro) e **Emissor** (configuracao: credencial write-only, CNPJ, regime, series, ambiente, ativar/desativar).

## Entry points
- `index.ts`: export default da pagina (`lazy(() => import('@/modules/fiscal'))`).

## Dados (`api.ts`, raiz `['fiscal']`)
- `GET/PUT/PATCH /v1/fiscal/config`, `GET/POST /v1/fiscal/documentos`. Leitura/emissao: `loja:gerir`;
  PUT da config: so o dono. Contrato `_generated/fiscal`.

## Segredo
- **Credencial do emissor WRITE-ONLY**: `type="password"`, limpa ao fim do envio; leituras so trazem `ultimos4` mascarado.
  Sem credencial preenchida e com config existente, o formulario usa PATCH (nao reenvia o segredo).

## Notas
- Emissor de terceiro ainda pode ser stub no servidor: documentos ficam `erro` (`emissor: emissor_nao_configurado`); o erro ja vem saneado.
- Link do documento so vira `<a>` se for `https://` (segunda barreira alem da api), com `rel="noopener noreferrer"`.
- Emitir um documento NOVO (primeira vez) parte do pedido (`POST /fiscal/documentos` com `pedido_id`); aqui so a nova tentativa apos erro.
