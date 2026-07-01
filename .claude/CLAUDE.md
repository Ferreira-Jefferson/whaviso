# graphify
- **graphify** (`.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
When the user types `/graphify`, invoke the Skill tool with `skill: "graphify"` before doing anything else.

# marketing-generator
- **marketing-generator** (`.claude/skills/marketing-generator/SKILL.md`) - gera criativos e copy de divulgação (Facebook/Instagram) por pilar de conteúdo. Trigger: `/marketing-generator`
When the user types `/marketing-generator`, invoke the Skill tool with `skill: "marketing-generator"` before doing anything else.

# deploy
- **deploy** (`.claude/skills/deploy/SKILL.md`) - release de produção ponta a ponta: migrations no Supabase cloud + deploy na Hostinger (GitHub Action na main) + validação + volta pra development. Trigger: `/deploy` (ou "faça o deploy", "publicar", "subir pra produção", "release")
When the user types `/deploy`, or asks to deploy/publish/release to production ("faça o deploy", "publicar", "subir pra produção"), invoke the Skill tool with `skill: "deploy"` before doing anything else.

# chrome-qa-loop
- **chrome-qa-loop** (`.claude/skills/chrome-qa-loop/SKILL.md`) - loop de QA exploratório sobre o app rodando de verdade num Chrome real (via Chrome DevTools MCP), com 4 lentes (QA/Product/Engineering/Security), grounding em `historias/`, 1 relatório md por achado, triage via graphify. Trigger: `/chrome-qa-loop` (ou "qa loop", "explorar o app", "testar o app rodando", "chrome qa")
When the user types `/chrome-qa-loop`, or asks to explore/QA/test the running app in the browser ("qa loop", "explorar o app", "testar o app rodando"), invoke the Skill tool with `skill: "chrome-qa-loop"` before doing anything else.
