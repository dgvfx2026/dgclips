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
