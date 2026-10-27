# DGCLIPS Studio para Windows

Esta edição usa a mesma interface Midnight / Liquid Glass do site, com um motor local independente. Não precisa instalar Docker, WSL, Python, Node, banco de dados, Redis ou Ollama. Não exige cadastro nem chaves de API.

## Para usar

1. Abra **DGCLIPS-Instalar.exe** e escolha a pasta. O instalador sugere `D:\DGCLIPS Studio` quando o disco D: está disponível.
2. Abra **DGCLIPS Studio** pelo atalho da área de trabalho.
3. Cole um link no início e clique em **Criar clipes**. Para arquivos, clique em **ou envie um arquivo**, escolha o vídeo e confirme **Gerar meus clipes**.
4. Acompanhe o progresso, assista aos cortes e use **Salvar clipe**.

O modelo Whisper small e os componentes de áudio/vídeo estão incluídos. O instalador é grande por esse motivo. Vídeos locais podem ser processados sem internet. Links exigem conexão, e o próprio site pode bloquear vídeos privados, restritos, indisponíveis ou que exigem login. Nesse caso, use um arquivo local.

O Windows precisa do **Microsoft Edge WebView2**, já presente na máquina avaliada. Esta versão usa CPU com quantização int8, sem depender de instalação de CUDA. O tempo de processamento varia conforme o vídeo e o computador.

## Dados e limites

- Projetos e clipes ficam em `DGCLIPS-Dados`, ao lado do programa instalado. A desinstalação preserva essa pasta.
- Até 8 GB por vídeo, quatro horas de duração e cinco vídeos na fila; um vídeo é processado por vez.
- A seleção considera a transcrição, frases completas, densidade de fala e assuntos recorrentes. São sugestões para revisão, sem promessa de viralização. Não usa um LLM nem rastreamento de rostos nesta edição.
- O atalho por link usa duração automática, legendas e vertical com imagem completa. Em **Novo projeto**, escolha outras durações, recorte vertical central ou formato original.
- Os estilos Essencial, Impacto e Dinâmico mudam o agrupamento e a apresentação das legendas. Revise os resultados antes de publicar.
- Fechar o programa interrompe o processamento. Ao abrir novamente, o projeto apresenta a opção de tentar novamente.
- A versão web na Vercel continua separada. Instalar esta edição não ativa o processamento no site.

## Construir a partir do código

Requisitos de desenvolvimento: Windows x64, Python 3.12, Node 24, pnpm 10.27 e o compilador NSIS 3.13 obtido de sua distribuição oficial. O usuário final não precisa instalar esses programas.

```powershell
py -3.12 -m venv .desktop-env
.\.desktop-env\Scripts\python.exe -m pip install -r desktop/requirements-lock.txt
pnpm --dir frontend install --frozen-lockfile
node desktop/prepare-assets.mjs
node desktop/build-ui.mjs
.\.desktop-env\Scripts\python.exe desktop/prepare-build.py
.\.desktop-env\Scripts\python.exe -m unittest discover -s desktop -p test_desktop.py
.\.desktop-env\Scripts\python.exe -m PyInstaller --noconfirm --workpath desktop/build --distpath desktop/dist desktop/DGCLIPS-folder.spec
```

O modelo é fixado pelo commit e SHA-256 em `model-manifest.json`; o download é verificado antes de empacotar. A interface importa os componentes reais de `frontend/src/components/dgclips`, usando adaptadores locais para navegação, sessão e envio de arquivos. Não há uma cópia estática da página.

Para compilar só a interface, sem baixar modelos: `node desktop/prepare-assets.mjs --ui-only` e `node desktop/build-ui.mjs`.

Para gerar o instalador, execute `makensis.exe /INPUTCHARSET UTF8 /DPAYLOAD="<pasta absoluta desktop/dist/DGCLIPS>" /DOUTPUT="<arquivo absoluto DGCLIPS-Instalar.exe>" desktop/installer.nsi`. Use uma pasta de saída exclusiva de build; nunca aponte a saída do PyInstaller para a pasta que contém o código.

Antes de distribuir, execute o diagnóstico no programa compilado, incluindo um vídeo local de teste:

```powershell
desktop/dist/DGCLIPS/DGCLIPS.exe --self-check desktop/dist/check.json --test-video frontend/public/clips/podcast-1.mp4
```

O relatório deve conter `ok: true` e `video_test.status: completed`. Teste também a janela nativa e o diálogo de salvar no Windows. Artefatos de teste, modelos, dependências e resultados de build não entram no Git. As licenças e versões das bibliotecas acompanham o instalador em `_internal/licenses`.

Licença do projeto: AGPL-3.0, preservando a atribuição ao SupoClip. O instalador não é assinado digitalmente; não desative proteções do Windows para executá-lo.
