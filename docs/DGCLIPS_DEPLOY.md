# Publicação do DGCLIPS: GitHub + Vercel + processamento

## Estrutura

```text
Navegador → Vercel (Next.js + login) → API de vídeo (HTTPS)
                      ↓                    ↓
                PostgreSQL compartilhado ← worker + Redis
                      
Navegador ← URLs assinadas → bucket S3 privado ← API/worker
```

O usuário entra na interface; ela assina as chamadas à API com `BACKEND_AUTH_SECRET`. A API confere a assinatura e a propriedade do projeto. Segredos de IA e armazenamento ficam no servidor. As credenciais S3 não vão ao navegador; ele recebe autorizações temporárias.

## 1. Banco compartilhado

Crie um banco PostgreSQL acessível com TLS tanto pelo servidor quanto pela Vercel. Use um banco dedicado ao DGCLIPS e guarde o endereço, usuário e senha. Encode caracteres especiais da senha na URL.

- **Vercel / Prisma:** `postgresql://usuario:senha@host:5432/dgclips?sslmode=require`
- **Servidor / asyncpg:** `postgresql+asyncpg://usuario:senha@host:5432/dgclips?ssl=require`

As duas URLs precisam apontar para o mesmo banco e esquema. Remova da URL asyncpg parâmetros exclusivos do Prisma ou do provedor. Para migrações, use a conexão direta do banco; configure pooler apenas conforme as orientações do seu provedor.

Antes da primeira inicialização, dentro de `frontend/`, configure `DATABASE_URL` no ambiente e rode `pnpm exec prisma migrate deploy`. A API aplica suas próprias migrações adicionais na inicialização. Faça backup antes de atualizar instalações que já tenham dados.

## 2. Bucket privado

Crie um bucket privado em um armazenamento compatível com S3. Dê à credencial de serviço permissão para ler, gravar, listar, excluir e executar upload multipart apenas nesse bucket. Não habilite leitura pública.

Configure o CORS com `deploy/storage-cors.json`, substituindo a origem pelo domínio exato da sua interface. O cabeçalho `ETag` precisa estar exposto para concluir os uploads multipart. Inclua apenas os domínios usados pelo seu estúdio.

Preencha as variáveis `MEDIA_S3_*` no servidor. No Amazon S3 padrão, deixe `MEDIA_S3_ENDPOINT` vazio; outros provedores normalmente informam um endpoint próprio. API e worker precisam usar o mesmo bucket, região, prefixo e credenciais.

O `docker-compose.production.yml` usa `MEDIA_STORAGE=s3`: downloads e uploads recebem URLs temporárias para o bucket e o arquivo não atravessa a Vercel. Não troque para armazenamento local nessa arquitetura sem planejar uma rota externa própria para arquivos grandes. Confira os [limites de funções da Vercel](https://vercel.com/docs/functions/limitations).

## 3. Segredos e IA

Gere **três valores diferentes**, com pelo menos 32 caracteres cada. Você pode rodar este comando três vezes:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Use um valor em `BETTER_AUTH_SECRET`, outro em `BACKEND_AUTH_SECRET` e outro em `APP_SETTINGS_ENCRYPTION_KEY`. Os dois últimos são compartilhados entre Vercel e servidor. Não coloque segredos em variáveis que começam com `NEXT_PUBLIC_`.

Configure sua chave AssemblyAI e uma chave de provedor de modelo no servidor. O arquivo `deploy/.env.example` mostra o formato de configuração. Confirme que o modelo definido em `LLM` está disponível na sua conta. Para outros provedores ou transcrição local, consulte [configuration.md](configuration.md).

## 4. API, worker e HTTPS

Em um servidor Linux com Docker Compose, copie o repositório e execute na raiz:

```bash
cp deploy/.env.example .env
# Edite .env e substitua todos os exemplos pelos seus valores.
docker compose -f docker-compose.production.yml config --quiet
docker compose -f docker-compose.production.yml up -d --build
docker compose -f docker-compose.production.yml logs -f backend worker
```

Configure um registro DNS para `API_DOMAIN` apontando para esse servidor. As portas 80 e 443 precisam estar disponíveis; o Caddy incluído emite o certificado HTTPS automaticamente. Evite iniciar esse Caddy na mesma porta de um proxy já instalado: nesse caso, use seu proxy existente e encaminhe o tráfego para a API na rede interna.

PostgreSQL não é criado por esse arquivo: ele é o banco externo da etapa 1. Redis fica na rede privada dos contêineres, com senha e persistência. API e worker compartilham os volumes temporários e o bucket. A API não publica a porta 8000 diretamente na internet.

Confira `https://api.seu-dominio.com/health/db`: precisa responder com sucesso. Confira também o estado saudável do worker. A primeira imagem pode levar tempo para instalar FFmpeg e dependências de análise de vídeo. Dimensione CPU, RAM e disco para o tamanho dos seus vídeos.

## 5. Variáveis na Vercel

Na Vercel, selecione `frontend` como Root Directory e habilite a inclusão de arquivos da raiz no build. Configure estas variáveis no ambiente de produção:

| Variável | Valor |
| --- | --- |
| `DGCLIPS_DEMO` | `false` |
| `NEXT_PUBLIC_SELF_HOST` | `true` |
| `NEXT_PUBLIC_APP_URL` | Domínio HTTPS exato da interface |
| `BETTER_AUTH_URL` | Mesmo endereço da interface |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Domínios autorizados, separados por vírgulas |
| `DATABASE_URL` | URL PostgreSQL para Prisma, da etapa 1 |
| `BETTER_AUTH_SECRET` | Segredo exclusivo do login |
| `BACKEND_AUTH_SECRET` | Mesmo segredo de assinatura do servidor |
| `APP_SETTINGS_ENCRYPTION_KEY` | Mesma chave de criptografia do servidor |
| `NEXT_PUBLIC_API_URL` | Endereço HTTPS da API |
| `BACKEND_INTERNAL_URL` | Mesmo endereço HTTPS da API, acessível pela Vercel |
| `DISABLE_SIGN_UP` | `false` inicialmente; `true` depois da sua conta criada |
| `NEXT_PUBLIC_MAX_VIDEO_UPLOAD_BYTES` | Mesmo limite do servidor; padrão `4000000000` |
| `NEXT_PUBLIC_SOURCE_URL` | URL do seu repositório com esta versão do código |

No servidor, `CORS_ORIGINS` deve incluir a origem exata da interface. Não use `*` com autenticação. Se adicionar domínio próprio, atualize as URLs de autenticação, o CORS da API e do bucket e faça novo deploy. As variáveis `NEXT_PUBLIC_*` são aplicadas no build.

Para validar sem exibir segredos, copie as variáveis do frontend para um `.env.local` local e rode `pnpm check:deploy`. O arquivo é ignorado pelo Git. Depois faça o deploy de produção na Vercel.

Em demos e previews, mantenha `DGCLIPS_DEMO=true` e use ambientes separados para não ligar testes ao seu banco real.

## 6. Primeira utilização

1. Abra `/sign-up`, crie sua conta e confirme que o login funciona.
2. Para uso pessoal, altere `DISABLE_SIGN_UP=true` na Vercel e faça novo deploy.
3. Teste primeiro um vídeo curto seu. Verifique a criação, o progresso, as legendas e a abertura do editor.
4. Teste um upload e um download acima de 4,5 MB para confirmar que o navegador usa URLs assinadas do bucket.
5. Teste o formato vertical e confira a qualidade antes de enviar vídeos longos.

O processamento depende de credenciais e serviços reais e não foi executado com suas contas na entrega. Não há chaves embutidas. Publicação direta em redes sociais permanece opcional e exige a configuração OAuth original; baixar os clipes não exige conectar redes sociais. Recuperação de senha por e-mail depende da configuração de envio do upstream.

## Diagnóstico rápido

| Sintoma | Verificação |
| --- | --- |
| Continua em demonstração | `DGCLIPS_DEMO`, URLs, banco e segredos exigidos; faça redeploy |
| Login falha | Mesmo banco, migrações, segredo do login e URLs de origem |
| API retorna 401 | `BACKEND_AUTH_SECRET` precisa coincidir nos dois serviços |
| Upload falha no navegador | CORS da API/bucket, `ETag` exposto, HTTPS e limite de arquivo |
| Fila não anda | Worker saudável, conexão Redis e logs de transcrição/IA |
| Vídeo não reproduz | Bucket e chave iguais em API/worker, CORS e URL assinada válida |
| Build não encontra changelog | Inclua arquivos fora da Root Directory na configuração da Vercel |

Antes de atualizar o servidor, deixe os trabalhos em andamento terminarem e preserve o banco e os volumes. O repositório mantém o motor e as instruções técnicas originais em `docs/`.
