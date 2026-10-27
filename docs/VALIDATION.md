# Verificação da entrega

Revisão local em 27/10/2026.

- Interface executada em Next.js e revisada no navegador em tamanhos de computador e celular.
- Busca sem acentos, filtros, favoritos, persistência após recarregar, seleção de legenda e sua persistência verificados.
- Formulário de link/upload, prévia demonstrativa e navegação móvel verificados.
- Nenhuma requisição de processamento real é feita no modo demonstração.
- Verificações de componentes confirmaram bloqueio sem login, rejeição de URL não suportada, envio das opções corretas, exibição de falha da API e recuperação para nova tentativa.
- ESLint e TypeScript passaram na árvore completa do frontend.
- A compilação de produção compilou os módulos e passou pela validação de código; a etapa seguinte foi impedida no ambiente local por `spawn EPERM` do Windows.
- A suíte Vitest completa não pôde iniciar localmente porque seu compilador também depende dessa criação de processos.
- O workflow `.github/workflows/tests.yml` executa lint, tipos, testes, build de produção e testes de navegador no Linux do GitHub.

O processamento real com IA, o Docker, o banco de produção e o armazenamento precisam ser verificados com os serviços e chaves do proprietário. Não foram criadas contas nem incluídas chaves. A demonstração e os exemplos estão identificados na interface.
