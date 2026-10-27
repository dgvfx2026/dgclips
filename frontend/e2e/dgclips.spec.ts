import { expect, test } from "@playwright/test";

test("search, filters and favorites work and survive a reload", async ({ page }) => {
  await page.goto("/projects");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Meus projetos");
  await page.getByRole("textbox", { name: "Buscar projetos" }).fill("negocios");
  await expect(page.locator("article.dg-project-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Favoritar Ideias que viram grandes negócios", exact: true }).click();
  await page.getByRole("button", { name: "Limpar busca" }).click();
  await page.getByRole("button", { name: "Favoritos", exact: true }).click();
  await expect(page.locator("article.dg-project-card")).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole("button", { name: "Remover Ideias que viram grandes negócios dos favoritos" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Em processamento", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nenhum projeto por aqui" })).toBeVisible();
});
test("demo creation is explicit and opens a playable example", async ({ page }) => {
  await page.goto("/");
  const processingRequests: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/tasks/create")) processingRequests.push(request.url()); });
  await page.getByRole("button", { name: "Novo projeto N", exact: true }).click();
  await expect(page.getByText(/Você está no modo demonstração/)).toBeVisible();
  await page.getByRole("button", { name: "Enviar arquivo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Escolha um vídeo ou arraste aqui" })).toBeVisible();
  await page.getByRole("button", { name: "Explorar um exemplo", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveAttribute("data-state", "open");
  await expect(page.locator("video source")).toHaveAttribute("src", "/clips/podcast-1.mp4");
  expect(processingRequests).toHaveLength(0);
});
test("an unconfigured studio explains the block and preserves the submitted link", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/tasks/create")) requests.push(request.url()); });
  await page.goto("/");
  await page.getByRole("textbox", { name: "Link do vídeo", exact: true }).fill("https://youtu.be/abcdefghijk");
  await page.getByRole("button", { name: "Criar clipes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "O processamento ainda não está ativado" })).toBeVisible();
  await page.getByRole("button", { name: "Configurar processamento", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace\/settings$/);
  await expect(page.getByRole("heading", { name: "Seu vídeo ainda não foi enviado" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Link preservado nesta aba" })).toHaveValue("https://youtu.be/abcdefghijk");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Link preservado nesta aba" })).toHaveValue("https://youtu.be/abcdefghijk");
  await page.getByRole("link", { name: "Voltar para meu vídeo" }).click();
  await expect(page.getByRole("textbox", { name: "Link do vídeo", exact: true })).toHaveValue("https://youtu.be/abcdefghijk");
  await expect(page.locator("video")).toHaveCount(0);
  expect(requests).toHaveLength(0);
});
test("caption preference survives navigation", async ({ page }) => {
  await page.goto("/templates");
  await page.locator("article").filter({ hasText: "Impacto" }).getByRole("button", { name: "Usar estilo" }).click();
  await page.reload();
  await expect(page.locator("article").filter({ hasText: "Impacto" }).getByRole("button", { name: "Selecionado" })).toBeVisible();
});
test("mobile navigation, modal and layout fit the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Abrir navegação" }).click();
  await page.getByRole("button", { name: "Novo projeto N", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("cards reveal when scrolling and respect reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 720 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const card = page.locator(".dg-flow-card").first();
  await expect(card).toHaveClass(/dg-reveal/);
  await expect(card).not.toHaveClass(/dg-in-view/);
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveClass(/dg-in-view/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(card).toHaveClass(/dg-in-view/);
  await expect(card).toHaveCSS("transition-duration", "0s");
});
