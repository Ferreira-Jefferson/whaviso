# Regra de negócio: Quem pode logar e como um e-mail é ativado

> Quem consegue entrar no sistema. Autenticar no provedor de identidade (conta Google) não dá acesso:
> o acesso depende de o e-mail estar **ativo** na allowlist do sistema. Um e-mail só fica ativo depois
> do pagamento confirmado (via PSP) ou de uma liberação manual pelo operador da plataforma. Quem
> autentica com um e-mail que não está ativo nunca entra no painel: permanece na tela de login, com
> aviso. É o complemento, na porta de entrada, do motor de permissões por papel (ver
> `10-acessos-permissoes.md`) e do kernel multi-tenant (ver `08-multi-tenant-contas-lojas.md`).

- **Domínio:** elegibilidade de login (allowlist de e-mail) e ativação por pagamento ou por liberação manual
- **Módulos de execução relacionados:** `acessos_login` (allowlist e console do operador), `conta`
  (gate de bootstrap da conta no primeiro acesso), `plataforma_clientes` (cadastro e liberação de
  clientes pelo operador), `plataforma_cobranca` (cobrança e gancho de pagamento do PSP), front-shell
  (gate de entrada que barra quem não tem acesso), `ZAP-enviar-email` (boas-vindas via Resend).

## Objetivo

Garantir que só entra no sistema quem tem um e-mail **ativo**, e deixar claras as formas de um e-mail
se tornar ativo. Autenticar (provar a identidade do e-mail no Google) é pré-requisito, não é acesso.
A autoridade do acesso é o servidor; a tela de login apenas reflete o resultado, nunca é a trava.

## Atores

- **Interessado (lead):** pessoa que quer contratar o Whaviso; ainda não tem acesso.
- **Cliente (dono da conta):** quem já tem e-mail ativo e um plano/pacote vigente.
- **Operador da plataforma (equipe Whaviso):** cadastra, libera e cobra clientes. A liberação manual e o
  cadastro por dentro do sistema exigem papel com a permissão de cobrança (ver `10-acessos-permissoes.md`).
- **PSP (gateway de pagamento):** processa o pagamento (PIX e cartão) e notifica a confirmação. Provedor
  atual: Asaas (ver `../backend-api/pagamentos.md` e `../backend-api/pagamentos-intermediado.md`).

## As três formas de um e-mail ficar ativo

### 1. Autosserviço: o interessado se cadastra e paga

- O interessado preenche uma ficha de adesão com, no mínimo: **nome**, **e-mail**, **telefone/WhatsApp
  de contato**, e **CNPJ e/ou CPF** (ao menos um dos dois; pode informar os dois), e escolhe o
  plano/pacote.
- Ele paga (PIX na v1; ver "Decisões em aberto" sobre cartão). O sistema **aguarda a notificação do PSP**
  de que o pagamento foi confirmado; não ativa por tela nem por "cliquei que paguei".
- Quando o PSP confirma, o e-mail passa a **ativo**, já com as definições do plano/pacote contratado, e
  um **e-mail de boas-vindas** é enviado ("seu plano X foi aceito, pode entrar"). A partir daí a pessoa
  tem acesso.

### 2. Liberação manual de um cadastro pendente

- Um interessado já se cadastrou (ficha preenchida) mas ainda não foi aprovado/pago.
- O operador, na tela de Clientes, **aprova aquele e-mail manualmente**, definindo o nível de acesso
  (papel) conforme o motor de permissões (ver `10-acessos-permissoes.md`).
- O e-mail passa a ativo e o boas-vindas é enviado, como no caso 1.

### 3. Cadastro feito pelo operador por dentro do sistema

- O operador cadastra o e-mail e os dados exigidos diretamente no sistema.
- Por ser operador, não precisa pagar boleto. Ele pode: **aprovar manualmente** (como no caso 2), **ou**
  gerar para a pessoa uma cobrança do PSP (**PIX ou link de pagamento por cartão**, conforme as opções
  do PSP) e aguardar o pagamento, que ativa como no caso 1.
- O cadastro entra na lista de clientes do operador.

## Regras

1. **Autenticar não é acessar.** Provar a identidade do e-mail (login Google) só prova quem é a pessoa.
   O acesso depende de o e-mail estar **ativo** na allowlist do sistema.
2. **Ativo só por pagamento confirmado ou liberação manual.** Um e-mail apenas cadastrado (pendente, sem
   pagamento e sem aprovação) **não** é ativo. O pagamento só conta quando o **PSP notifica** a
   confirmação; o sistema nunca ativa por sinal vindo do cliente.
3. **E-mail não ativo nunca entra.** Quem autentica com um e-mail que não está cadastrado ou está
   pendente permanece na tela de login (`/entrar`), com aviso de acesso não permitido, e não acessa
   nenhuma outra rota nem nenhum dado do sistema. O servidor nega (a API responde negação em todas as
   rotas de conteúdo); o front não deixa a pessoa atravessar o painel (reduz superfície de engenharia
   social e phishing). A tela de login é a única rota de quem não tem acesso.
4. **Ativação dispara as boas-vindas uma vez.** Ao ficar ativo (por pagamento ou por aprovação), é
   enviado um e-mail de boas-vindas, sem reenvio em reaprovação (idempotente).
5. **A liberação manual define o papel.** Ao aprovar manualmente, o operador define o nível de acesso da
   pessoa segundo os papéis fixos e a grade de permissões (ver `10-acessos-permissoes.md`).
6. **Convidado de conta existente não passa pelo gate de adesão.** Quem é convidado por um dono para a
   loja dele entra pelo fluxo de convites (ver `08-multi-tenant-contas-lojas.md` e
   `../backend-api/conta.md`), não pela allowlist de adesão: a allowlist governa a criação da PRIMEIRA
   conta, não os convidados.
7. **Acesso é estado, não some.** Revogar o acesso de um e-mail muda o estado para revogado; não apaga
   registro (trilha de auditoria, sem dado sensível em claro).

## Critérios de aceite

- Autenticar com um e-mail não cadastrado ou pendente mantém a pessoa em `/entrar`, com aviso, sem
  renderizar nenhuma tela do painel; todas as rotas de conteúdo respondem negação.
- Pagamento confirmado pelo PSP ativa o e-mail com o plano/pacote contratado e envia o boas-vindas uma
  única vez; a pessoa passa a acessar.
- O operador aprova manualmente um e-mail pendente definindo o papel; o e-mail fica ativo e o boas-vindas
  é enviado.
- O operador cadastra um cliente por dentro do sistema e, para ele, aprova manualmente ou gera cobrança
  do PSP (PIX ou link de cartão); o pagamento confirmado ativa o acesso.
- Um e-mail revogado deixa de acessar e permanece na tela de login; o registro não é apagado.

## Plano (não é carteira de créditos)

- A adesão contrata um **plano**, não um pacote de créditos. A carteira de créditos era do produto
  antigo (cobrança/notificação), onde o cliente pagava por mensagem enviada; **não se aplica** a este
  produto, que é de uso aberto dentro do plano.
- Haverá **vários planos** (a tela de planos e o catálogo serão construídos depois). Exemplo ilustrativo
  de como os planos se diferenciam (valores e regras são ilustrativos, não finais): um plano mais barato
  em que o cliente usa a **própria** chave de IA (cadastra a dele), e um plano mais caro que inclui o uso
  da **API da própria Whaviso**. O que cada plano libera é definição de produto a detalhar na tela de
  planos.

## Criação de loja é do próprio cliente

- A plataforma **concede o acesso** e envia o aviso de boas-vindas; **não cria a loja** do cliente.
- Com acesso, o cliente **cria a própria loja** (uma ou mais), manualmente, dentro do sistema. Logo, um
  cliente recém-ativado entra **sem nenhuma loja** e a primeira tela útil é a de criar a primeira loja.
- Consequência para o gate de entrada: estar ativo **não** é o mesmo que ter loja. O gate de entrada do
  painel deve liberar quem está **ativo** (ainda que sem loja), e barrar apenas quem **não** está ativo.
  Barrar por "não tem loja" é errado: expulsaria o cliente legítimo antes de ele criar a primeira loja.

## Registro de autenticação é mantido (decidido)

- Autenticar no Google cria, por si, um registro de identidade no provedor (Supabase Auth) para
  qualquer e-mail válido, mesmo sem cadastro nem plano. **Decisão: manter** esse registro (não bloquear
  na porta, não limpar). Serve de **funil/lead**: dá para analisar quantas pessoas tentaram logar x
  quantas ativaram, e eventualmente contatar quem tentou mas não ativou. Não é risco: o registro não
  concede acesso (o gate de entrada e a API negam tudo para quem não está ativo).
- Mensagens distintas na porta por estado: **cadastrado mas pagamento/aprovação pendente** mostra
  "pagamento ainda não aprovado / aguardando"; **não cadastrado ou revogado** mostra "acesso não
  permitido, contate o suporte".

## Decisões em aberto (a confirmar, não assumir)

- **PSP e cartão.** `plataforma/cobranca.md` ainda descreve conferência manual v1 sem gateway. O modelo
  aqui (PSP Asaas notifica o pagamento; link de cartão além do PIX) **supersede** aquela nota: atualizar
  `plataforma/cobranca.md` para refletir o gancho de pagamento automático e a geração de cobrança
  (PIX/cartão) pelo operador.
- **Campos exatos da ficha de adesão.** Mínimo acordado: nome, e-mail, telefone/WhatsApp, CNPJ e/ou CPF
  (ao menos um) e o plano. Confirmar se há outros obrigatórios.

## Notas de implementação (espelho do que já existe; não é regra, é rastreio)

- A allowlist vive na tabela de e-mails permitidos; o console do operador (`acessos_login`) lista,
  adiciona, aprova (enfileira o boas-vindas) e revoga. O gate de bootstrap da primeira conta vive no
  módulo `conta` (`criarConta`), que exige o e-mail aprovado. O `plataforma_cobranca` também marca o
  e-mail como aprovado no gancho de pagamento (origem pagamento), por coordenação via banco.
- O gate de **entrada no painel** (front-shell) barra quem autenticou mas não está ativo, deslogando e
  voltando para `/entrar` com aviso. O critério é o **estado de ativação** do e-mail, não a presença de
  loja (um cliente ativo cria a própria loja depois). Implementado: a api expõe `GET /v1/acessos-login/eu`
  (só autenticado), que resolve o e-mail pelo token e devolve `estado` (`ativo` | `pendente` | `revogado`
  | `nao_cadastrado`); o guard do shell decide por esse estado (ou por ser operador), e mostra a mensagem
  conforme o motivo.
