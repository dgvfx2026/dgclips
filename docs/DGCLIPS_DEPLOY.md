# DGCLIPS na Vercel com Services

## Importação correta

Use **Root Directory: `.`**, a raiz do repositório. Não selecione `frontend/` para esta configuração. O arquivo [`vercel.json`](../vercel.json) da raiz descreve o projeto inteiro. O serviço `frontend` usa Next.js; `backend` e `mcp` usam seus `Dockerfile.vercel`; `worker` é um daemon privado.

A arquitetura foi confirmada pelo proprietário em 27/10/2026:

| Componente | Entrada pública | Comunicação |
| --- | --- | --- |
| `frontend` | Todas as rotas, incluindo `/api` | Chama `backend` via `DGCLIPS_BACKEND_URL` |
| `backend` | Nenhuma | Usa PostgreSQL, Redis e S3 externos |
| `mcp` | Nenhuma | Chama `backend` via `SUPOCLIP_API_URL` |
| `worker` | Nenhuma; daemon | Consome a fila Redis e processa vídeos |

**Não adicione um rewrite público de `/api/*` para o backend.** Essas rotas já existem no Next.js e cuidam do login, da sessão e das assinaturas para a API. A interface faz as chamadas internas a partir das funções do servidor. Não há uso de bindings em middleware ou durante builds.

Não configure `DGCLIPS_BACKEND_URL` nem `SUPOCLIP_API_URL` nas variáveis: a Vercel injeta ambas em runtime. [Bindings oficiais](https://vercel.com/docs/services/bindings).

## Primeiro deploy: demonstração

Como os serviços externos ainda não estão configurados, comece com:

```text
DGCLIPS_DEMO=true
NEXT_PUBLIC_SELF_HOST=true
NEXT_PUBLIC_APP_URL=https://SEU-PROJETO.vercel.app
BETTER_AUTH_URL=https://SEU-PROJETO.vercel.app
NEXT_PUBLIC_SOURCE_URL=https://github.com/dgvfx2026/dgclips
```

A interface abre com exemplos identificados. O backend responde que a configuração está pendente e o worker aguarda sem consumir a fila. O login e o processamento real ficam desativados. Os contêineres ainda precisam ser construídos no deploy.

Se você colar um vídeo e chegar à tela de configuração, o processamento ainda não foi ativado. O formulário explica o bloqueio antes da navegação e preserva o link apenas na sessão desta aba. A opção de explorar exemplos é independente: ela não processa o link informado. Publicar o site não cria automaticamente as contas de banco, armazenamento, fila ou IA. Esses serviços precisam ser conectados pelo proprietário e podem ter custos de uso.

O worker confirmado usa uma instância de **2 GiB em `iad1`**. Daemons só executam em produção e usam as cotas/recursos do plano. Para deixar uma demonstração sem instância de worker, altere temporariamente `instances.iad1` para `0`. [Limites dos daemons](https://vercel.com/docs/daemons/limits).

## Configurar os serviços externos

O arquivo [`deploy/vercel.env.example`](../deploy/vercel.env.example) lista os nomes das variáveis. Ele contém apenas exemplos. Configure os valores na Vercel; não envie segredos no chat nem os adicione ao GitHub.

### PostgreSQL

Crie um banco dedicado com TLS. Frontend e backend devem apontar para **o mesmo banco e esquema**, usando os formatos adequados para cada cliente:

```text
DATABASE_URL=postgresql://USUARIO:SENHA@HOST:5432/dgclips?sslmode=require
BACKEND_DATABASE_URL=postgresql+asyncpg://USUARIO:SENHA@HOST:5432/dgclips?ssl=require
```

Encode caracteres especiais da senha. Use a conexão direta para aplicar as migrações do Prisma. Remova da URL asyncpg parâmetros exclusivos do Prisma/provedor. Na pasta `frontend`, com `DATABASE_URL` definida no ambiente, execute `pnpm exec prisma migrate deploy` antes de ativar o login. A API aplica suas migrações adicionais na inicialização.

### Redis

Use um endpoint **Redis TCP**, com TLS e senha. Um endereço HTTP/REST não serve para o worker ARQ. Configure `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` e `REDIS_SSL=true`. A API, o acompanhamento de progresso e o worker usam a mesma instância e a conexão TLS.

### Armazenamento S3

Configure um bucket **privado** e preencha `MEDIA_STORAGE=s3` e as variáveis `MEDIA_S3_*`. API e worker não compartilham disco persistente na Vercel: os arquivos precisam passar pelo bucket. A credencial deve poder ler, gravar, listar, excluir e executar uploads multipart apenas nesse bucket.

Use [`deploy/storage-cors.json`](../deploy/storage-cors.json), substituindo a origem pelo domínio real da interface. Exponha `ETag` para concluir uploads multipart. Deixe `MEDIA_S3_ENDPOINT` vazio para o endpoint padrão do Amazon S3; outros provedores fornecem seu próprio endereço. Uploads e downloads usam URLs assinadas e não expõem as credenciais do bucket.

## Login e IA

Gere três segredos diferentes com pelo menos 32 caracteres. Este comando gera um valor novo a cada execução:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Configure `BETTER_AUTH_SECRET`, `BACKEND_AUTH_SECRET` e `APP_SETTINGS_ENCRYPTION_KEY`. Não use `NEXT_PUBLIC_` para segredos. `BETTER_AUTH_URL` e `NEXT_PUBLIC_APP_URL` precisam conter o domínio HTTPS real da interface.

Adicione a chave AssemblyAI e a chave de um provedor de modelo. Configure `LLM` com um modelo disponível na sua conta. Mantenha `SELF_HOST=true` e `NEXT_PUBLIC_SELF_HOST=true`. Consulte [configuration.md](configuration.md) para outros provedores ou transcrição local.

Depois de configurar tudo:

1. Altere `DGCLIPS_DEMO=false` e faça novo deploy de produção.
2. Abra `/sign-up`, crie sua conta e confira o login.
3. Para uso pessoal, defina `DISABLE_SIGN_UP=true` e faça novo deploy.
4. Processe primeiro um vídeo curto seu. Confira progresso, legendas, edição e download.
5. Teste um upload maior que 4,5 MB e confirme o envio direto ao bucket.

Os serviços compartilham variáveis no projeto Vercel; por isso o backend usa `BACKEND_DATABASE_URL` e o frontend usa `DATABASE_URL`. O worker aguarda a configuração antes de iniciar o ARQ e processa um vídeo por vez para respeitar a memória inicial. Vídeos maiores podem exigir mais memória/CPU; acompanhe os logs e as cotas antes de ampliar o uso.

## Desenvolvimento e validação

`vercel dev -L` inicia os serviços locais e injeta bindings. Daemons ainda precisam ser executados separadamente com Docker durante o desenvolvimento. [Serviços](https://vercel.com/docs/services), [desenvolvimento de daemons](https://vercel.com/docs/daemons).

O ambiente de entrega não tem Docker nem suas credenciais de produção. A configuração e o código foram preparados e verificados; o primeiro build dos contêineres e o processamento real precisam ser confirmados na sua conta. O workflow do GitHub executa os testes e o build do frontend.

## Alternativa com servidor próprio

O `docker-compose.production.yml` continua disponível para rodar API/worker/Redis em um servidor próprio. Nesse caso, consulte [DGCLIPS_DOCKER_DEPLOY.md](DGCLIPS_DOCKER_DEPLOY.md) e publique somente a interface como projeto Next.js separado. Não misture as duas configurações de deploy.

## Erro de publicação nas imagens de compartilhamento

Se a Vercel informar `Service "frontend" declares service bindings, but function "opengraph-image" cannot run on Functions on Hive`, a causa é uma função Edge no serviço que usa bindings privados. As rotas `opengraph-image` e `twitter-image` usam explicitamente `runtime = "nodejs"`. O build também verifica o manifesto gerado pelo Next.js para impedir que novas funções Edge reintroduzam o problema. Faça o deploy do commit corrigido; alterar banco ou chaves não resolve essa incompatibilidade.
