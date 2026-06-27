# Épico 1: Conta & Autenticação

> Login **sem e-mail/senha**: **Google OAuth** e **WhatsApp** (confirmação por botão).
> O canal WhatsApp já é viável agora via **Baileys**, então o fluxo todo é 🟢 MVP. O **Meta oficial** é só uma troca de transporte no futuro.
> Princípio: o número de WhatsApp é a identidade. Confirmar acesso/cadastro acontece no próprio WhatsApp, com botões, sem digitar código.

---

### H1.1: Entrar com Google 🟢
Como **cobrador**, quero entrar com minha conta Google, para acessar o painel sem criar senha.
*Critérios de aceite:*
- [ ] Botão "Entrar com Google" inicia o fluxo OAuth do Supabase.
- [ ] No primeiro login, o perfil (`profiles`) é criado automaticamente (cadastro fundido no login).
- [ ] Ao voltar do OAuth, a sessão fica ativa e o painel carrega.
- [ ] Nenhuma tela de senha é exibida em momento algum.

---

### H1.2: Entrar pelo WhatsApp (usuário já cadastrado) 🟢
Como **cobrador já cadastrado**, quero entrar informando meu número e aprovando no WhatsApp, para acessar sem Google e sem digitar código.
*Critérios de aceite:*
- [ ] Informo o telefone na tela de login.
- [ ] Recebo no WhatsApp uma mensagem de confirmação: *"Tentativa de login com seu número"*, com botões **Acessar** e **Negar acesso**.
- [ ] Ao tocar **Acessar**, a sessão é criada e o painel carrega.
- [ ] Ao tocar **Negar acesso**, o login é recusado e o evento registrado.
- [ ] Essa mensagem (login) só é enviada para número que **já tem cadastro**.

---

### H1.3: Cadastro pelo WhatsApp (número novo) 🟢
Como **pessoa sem conta**, quero me cadastrar confirmando no próprio WhatsApp, para começar a usar sem formulário de senha.
*Critérios de aceite:*
- [ ] Informo um número que ainda não tem cadastro.
- [ ] Recebo no WhatsApp: *"Olá, eu sou o Whaviso, identificamos uma tentativa de cadastro com seu número"*, com botões **Sim, sou eu** e **Não fui eu**.
- [ ] A mensagem de cadastro também pede para **salvar o contato do Whaviso**: como o número é próprio (Baileys), é por aqui que as mensagens seguintes (lembretes, avisos) vão chegar.
- [ ] Ao tocar **Sim, sou eu**, a conta é criada e eu já acesso o sistema.
- [ ] Ao tocar **Não fui eu**, o cadastro é abortado e o evento registrado.
- [ ] Nos acessos seguintes, esse número passa a receber a mensagem **de login** (H1.2), não a de cadastro.

---

### H1.4: Conta criada automaticamente no aceite 🟢
Como **convidado que aceitou um combinado pelo WhatsApp**, quero já ficar com uma conta criada (com meu número e nome), para poder acompanhar os avisos no painel se quiser.
*Critérios de aceite:*
- [ ] Ao aceitar um combinado (ver Épico 5), o Whaviso cria a conta por baixo dos panos usando o **número** e o **nome** informados.
- [ ] Junto da confirmação do aceite, recebo um link convidando a acompanhar no painel (acesso opcional, nunca obrigatório).
- [ ] Ao usar esse link pela primeira vez, recebo a confirmação de acesso pelo WhatsApp (fluxo de login da H1.2, pois a conta já existe).
- [ ] A conta criada assim entra no **plano free** (somente visualização, ver H1.5).
- [ ] Se o número recusar/ignorar, nenhuma conta ativa fica pendente de ação obrigatória.

---

### H1.5: Plano free com acesso só de leitura 🟢
Como **usuário em plano free**, quero visualizar meus avisos sem poder criar novos, para entender o valor antes de aderir a um plano pago.
*Critérios de aceite:*
- [ ] No plano free, consigo **ver** os combinados em que estou envolvido (como devedor ou cobrador).
- [ ] No plano free, **não** consigo **criar** combinados; a ação leva a uma CTA para escolher um plano.
- [ ] A regra é aplicada na **API** (não só na UI): tentativa de criar sem plano retorna erro `{ error: { code, message } }`.
- [ ] Detalhamento de limites e planos fica no Épico 11.

---

### H1.6: Sessão validada localmente na API 🟢
Como **sistema (api)**, quero validar o JWT localmente por JWKS, para autorizar requisições sem depender do PostgREST.
*Critérios de aceite:*
- [ ] Toda rota protegida exige `Authorization: Bearer <jwt>` e valida via JWKS.
- [ ] Token inválido ou expirado retorna envelope `{ error: { code, message } }` com 401.
- [ ] Rotas públicas (ex.: webhook do WhatsApp) não exigem JWT e usam seus próprios mecanismos de autenticação.

---

### H1.7: Manter sessão e sair 🟢
Como **usuário logado**, quero permanecer logado entre visitas e poder sair, para não reautenticar a cada acesso e proteger a conta em dispositivo compartilhado.
*Critérios de aceite:*
- [ ] A sessão persiste ao recarregar a SPA.
- [ ] Existe ação de "sair" que encerra a sessão e redireciona ao login.

---

### Decisões em aberto
- **Login WhatsApp: botão vs código.** As histórias H1.2/H1.3 descrevem aprovação por **botão** (*Acessar / Negar*, *Sim sou eu / Não fui eu*). A doc atual (CLAUDE.md, plano de auth) prevê **OTP por código** de 6 dígitos via Supabase Auth (`POST /hooks/send-code`), do qual o JWT sai pronto do Supabase. O fluxo por botão tem UX melhor mas o Supabase não emite sessão a partir de um clique, exigiria a gente emitir/gerenciar o JWT (ou um adaptador). Decidir antes de implementar; na validação vai aparecer como divergência.

### Fora de escopo deste épico (escopo negativo)
- ❌ Cadastro/login por e-mail e senha (decisão de 2026-06-17).
- ❌ Páginas de recuperação/troca de senha.
- ❌ Migração para Meta oficial: é troca de transporte futura, o comportamento das histórias acima não muda.
