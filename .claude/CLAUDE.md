# graphify
- **graphify** (`.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
When the user types `/graphify`, invoke the Skill tool with `skill: "graphify"` before doing anything else.

# marketing-generator
- **marketing-generator** (`.claude/skills/marketing-generator/SKILL.md`) - gera criativos e copy de divulgação (Facebook/Instagram) por pilar de conteúdo. Trigger: `/marketing-generator`
When the user types `/marketing-generator`, invoke the Skill tool with `skill: "marketing-generator"` before doing anything else.

# deploy
- **deploy** (`.claude/skills/deploy/SKILL.md`) - release de produção ponta a ponta: migrations no Supabase cloud + deploy na Hostinger (GitHub Action na main) + validação + volta pra development. Trigger: `/deploy` (ou "faça o deploy", "publicar", "subir pra produção", "release")
When the user types `/deploy`, or asks to deploy/publish/release to production ("faça o deploy", "publicar", "subir pra produção"), invoke the Skill tool with `skill: "deploy"` before doing anything else.
