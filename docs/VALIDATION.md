# Verificação da entrega

Revisão local em 27/10/2026.

- Interface executada em Next.js e revisada no navegador em tamanhos de computador e celular.
- Busca sem acentos, filtros, favoritos, persistência após recarregar, seleção de legenda e sua persistência verificados.
- Formulário de link/upload, prévia demonstrativa e navegação móvel verificados.
- Nenhuma requisição de processamento real é feita no modo demonstração.
- Tentativa de criar com link explica o processamento desativado antes de abrir a configuração. O link permanece disponível após recarregar e voltar ao formulário, apenas na sessão da aba.
- Verificações de componentes confirmaram bloqueio sem login, rejeição de URL não suportada, envio das opções corretas, exibição de falha da API e recuperação para nova tentativa.
- ESLint e TypeScript passaram na árvore completa do frontend.
- Tema Liquid Glass revisado em 1440 px e 390 px, incluindo o menu, formulário com rolagem e controle de legendas.
- As duas rotas de compartilhamento geraram PNGs reais de 1200 × 630 no runtime Node.js.
- A verificação de runtime rejeitou um manifesto de build com função Edge e aceitou um manifesto sem funções Edge.
- A compilação de produção compilou os módulos e passou pela validação de código; a etapa seguinte foi impedida no ambiente local por `spawn EPERM` do Windows.
- A suíte Vitest completa não pôde iniciar localmente porque seu compilador também depende dessa criação de processos.
- O workflow `.github/workflows/tests.yml` executa lint, tipos, testes, build de produção e testes de navegador no Linux do GitHub.
- A [primeira execução do frontend](https://github.com/dgvfx2026/dgclips/actions/runs/40544370311) passou no Linux. O [backend](https://github.com/dgvfx2026/dgclips/actions/runs/40547124089) também passou. O teste de contrato de serviços daquela segunda execução teve sua leitura de arquivo corrigida para funcionar no Vitest.
- O log da Vercel enviado pelo proprietário confirma build completo do Next.js e das imagens do backend, MCP e worker no commit `1728115`. A publicação foi bloqueada pela rota Open Graph em Edge; ambas as rotas sociais agora usam Node.js e o build verifica essa compatibilidade.

O deploy completo e o processamento real com IA, banco de produção e armazenamento precisam ser verificados com os serviços e chaves do proprietário. Não foram criadas contas nem incluídas chaves. A demonstração e os exemplos estão identificados na interface. Os resultados da versão mais recente ficam no [GitHub Actions](https://github.com/dgvfx2026/dgclips/actions).

A alternativa local foi avaliada para Ryzen 7 5700X, 32 GB e RTX 4060 de 8 GB. O Docker Compose validou o arquivo de configuração e o inicializador preservou os cinco segredos gerados em uma segunda execução. A instalação de Docker/WSL, a disponibilidade da GPU no contêiner e o processamento de um vídeo ainda precisam ser executados. Consulte [DGCLIPS_LOCAL.md](DGCLIPS_LOCAL.md).
