# Octob — visão funcional para replicação ou evolução

Documento objetivo sobre **o que o sistema faz**, do ponto de vista de produto e comportamento esperado — útil para reimplementar ou melhorar em outro repositório.

---

## Em uma frase

Aplicação **desktop** (Electron) que combina **gestão de Git com worktrees** e **sessões de agentes de código (IA)** na mesma janela: várias ramificações e vários agentes em paralelo, com **isolamento por worktree** para reduzir conflitos e caos entre abas/terminais.

---

## Usuário e problema

**Público:** desenvolvedores que já usam assistentes de IA para codificar e costumam ter **vários projetos, branches ou sessões ao mesmo tempo**.

**Dores que o produto endereça:**

| Dor | Como o Octob responde (conceito) |
|-----|----------------------------------|
| Muitos terminais/abas | Uma sidebar com projetos, worktrees e sessões |
| Dois agentes no mesmo checkout | Agentes ligados a worktrees diferentes (pastas isoladas) |
| `stash` / `checkout` repetidos | Vários worktrees abertos ao mesmo tempo, alternância por clique |
| Contexto partido (ex.: API + UI) | Conexões entre worktrees e possibilidade de contexto mais amplo |

---

## Conceitos principais

| Conceito | Significado |
|----------|-------------|
| **Projeto** | Repositório Git na máquina, registrado no app |
| **Worktree** | Cópia de trabalho **separada** de uma branch; não substitui a pasta “principal”, convive em paralelo |
| **Space** | Agrupa projetos/worktrees para organização e acesso rápido (pins, escala de uso) |
| **Sessão de IA** | Execução/conversa do agente **dentro do app**, com streams, chamadas de ferramentas e aprovação de permissões conforme necessário |
| **Conexão entre worktrees** | Liga dois worktrees para **contexto cruzado**: comparar, referenciar outra branch, alinhar feature com base, fluxos tipo full-stack |

**Agentes suportados (referência atual):** OpenCode, Claude Code, Codex.

---

## O que o sistema faz (lista de capacidades)

1. **Orquestração de agentes** — Ver várias sessões ativas num só lugar e alternar entre elas sem perder visão estrutural do que está aberto.

2. **Workflow worktree-first** — Criar, listar e arquivar worktrees pela UI; identificadores amigáveis (ex.: nomes por cidade) para diferenciar cópias.

3. **Git na interface** — Status, staging, commit, pull/push, gestão visual de branches, sem depender só do terminal.

4. **Explorador “com Git”** — Árvore de arquivos com indicadores de mudanças, visualização de diffs, navegação e editor integrado (Monaco).

5. **Conexões** — Relacionar dois worktrees para comparações, referência rápida e fluxos onde duas cópias precisam “conversar” no fluxo mental do desenvolvedor.

6. **UX de produtoividade** — Paleta de comandos (ex.: `Cmd+K` / equivalente por SO), temas, atalhos.

7. **Estado persistente local** — Dados como projetos preferidos, trabalho organizado por spaces e estado da aplicação (no Octob atual via SQLite no processo principal).

---

## Arquitetura lógica (alto nível)

Serve para você **espelhar módulos** em outra base de código:

| Camada | Papel típico |
|--------|----------------|
| **Main (Node)** | Git, SQLite, orquestração dos SDKs de agente, segurança e FS |
| **Preload / IPC** | Ponte tipada entre main e renderer |
| **Renderer (React)** | UI por domínios: sidebar, sessões IA, arquivo, git, espaços |

Não é “só Git” nem “só chat”: é **worktrees + operação Git visível + sessões de agente** coordenadas.

---

## Ao desenhar um clone “melhorado”

Sugestões de decisões explícitas no novo projeto:

- **Modelo de dados:** projeto → worktrees → sessões → conexões (e spaces, se quiser equivalência).
- **Isolamento:** regra fixa de que escrita/agents ficam sempre atrelados a um **root de worktree** conhecido.
- **IA:** quais backends, onde ficam tokens, quotas e modo offline.
- **Conexões:** são só metadados de UI ou também leem arquivos de outra árvore sob regras claras?

---

## Referências no próprio repo

- `README.md` — visão geral comercial/técnica e funcionalidades.
- `docs/GUIDE.md` — fluxos do usuário e conceitos.
- `README.md` (seção Architecture) — diagrama main / preload / renderer.

---

**Licença do Octob:** MIT (ver `LICENSE`). Este arquivo descreve **comportamento**; políticas legais e marca seguem o repositório original.
