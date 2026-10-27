# DGCLIPS no seu computador

Esta configuração usa a mesma interface do DGCLIPS com PostgreSQL, Redis, armazenamento de arquivos, transcrição Whisper e IA Ollama no próprio PC. Não exige contas em banco, S3 ou APIs de IA pagas. A primeira instalação e os downloads dos modelos precisam de internet. Links do YouTube também precisam de internet; arquivos próprios podem ser processados localmente depois da preparação.

## Avaliação da máquina em 27/10/2026

- Ryzen 7 5700X, 8 núcleos e 16 threads.
- 32 GB de RAM.
- NVIDIA RTX 4060 com 8 GB de VRAM, driver 617.42.
- Windows 10 Pro 22H2, build 19045.
- Cerca de 72 GB livres no disco C: na avaliação.

O hardware é um bom candidato para começar com Whisper `small` e Qwen3 `4b`. Isso é uma avaliação de compatibilidade, não uma medição de velocidade ou qualidade. O processamento de um vídeo real ainda precisa ser validado. O inicializador trabalha com um vídeo por vez e limita a cinco clipes por projeto inicialmente.

## O que falta instalar

O Docker Desktop e um ambiente WSL 2 funcional ainda não estavam disponíveis na avaliação. O Docker precisa de virtualização habilitada, Linux containers e acesso à GPU NVIDIA. A instalação pode pedir reinicialização e confirmação do proprietário. A compatibilidade e o suporte da versão instalada do Windows devem ser verificados no instalador; o Docker condiciona o suporte ao ciclo de atendimento da Microsoft.

- [Requisitos e instalador oficial do Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/).
- [GPU NVIDIA com Docker e WSL 2](https://docs.docker.com/desktop/features/gpu/).
- Node.js 22 ou 24; Node.js já estava disponível nesta máquina.

O Ollama roda dentro do Docker nesta configuração; não é necessário instalar um segundo aplicativo Ollama no Windows. Os programas, imagens e modelos usam vários gigabytes, além dos seus vídeos. Reserve espaço antes da primeira instalação.

## Iniciar

1. Instale e abra o Docker Desktop, com Linux containers e WSL 2.
2. Na pasta do projeto, abra `Iniciar-DGCLIPS.cmd`.
3. Aguarde a construção dos programas, a preparação do banco e os downloads dos modelos.
4. O inicializador verifica a GPU, prepara os modelos e espera os serviços ficarem disponíveis.
5. Abra **http://localhost:3117**, crie sua conta local e teste primeiro um arquivo curto seu.

O primeiro teste deve conferir transcrição em português, trechos escolhidos, legendas, editor e download. A velocidade e a qualidade com o modelo local podem diferir dos provedores online. Downloads de plataformas externas podem falhar por restrições da origem; um arquivo próprio permite testar primeiro o processamento sem depender desses downloads.

O site na Vercel continua sendo uma instalação separada. Para processar no PC, use a aplicação em `localhost:3117` enquanto este computador estiver ligado.

## Dados e configuração

O inicializador cria `.env.dgclips-local` com segredos diferentes e aleatórios. Ele não imprime os valores, não sobrescreve o arquivo existente e o arquivo é ignorado pelo Git e pelo build. Guarde esse arquivo junto com o backup dos dados: as credenciais e a chave de criptografia fazem parte da instalação.

Os vídeos, banco, fila e modelos ficam em volumes persistentes do projeto Docker `dgclips-local`. O frontend e a API são publicados apenas no endereço local do computador; banco, Redis e Ollama não recebem portas públicas. Não há cobranças por minuto de APIs nesta configuração, mas o PC usa energia, processamento e espaço em disco.

Para impedir novas contas depois de criar a sua, mude `LOCAL_DISABLE_SIGN_UP=true` no arquivo privado e execute o inicializador novamente.

## Comandos de apoio

```text
node scripts/local-start.mjs --prepare
node scripts/local-start.mjs --check
node scripts/local-start.mjs --stop
node scripts/local-start.mjs --logs
```

`--prepare` apenas cria/verifica o arquivo local. `--check` verifica o Docker e a configuração sem baixar modelos ou iniciar o processamento. `--stop` para os serviços preservando os dados. `--logs` mostra as mensagens recentes para diagnóstico. Para voltar a usar, abra o inicializador novamente.

## Estado da validação

O arquivo foi validado com o Docker Compose 5.6.1 em modo de configuração, sem iniciar contêineres. A geração de cinco segredos independentes e a preservação do arquivo existente foram verificadas. A execução completa, a GPU dentro do Docker e um vídeo real precisam ser testados depois de instalar os pré-requisitos; ainda não houve instalação ou download de modelos nesta máquina.

Referências: [Whisper](https://github.com/openai/whisper), [Ollama com Docker](https://docs.ollama.com/docker), [GPU suportada pelo Ollama](https://docs.ollama.com/gpu), [Qwen3 4B — modelo de aproximadamente 2,5 GB](https://ollama.com/library/qwen3:4b).
