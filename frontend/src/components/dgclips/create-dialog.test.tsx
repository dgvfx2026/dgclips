import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateDialog } from "./create-dialog";

const props = { open: true, onOpenChange: vi.fn(), initialUrl: "https://youtu.be/abcdefghijk", template: "hormozi", onDemo: vi.fn() };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe("DGCLIPS project creation", () => {
  it("makes demo status explicit and never submits a processing request", () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    render(<CreateDialog {...props} demo />);
    expect(screen.getByText(/Você está no modo demonstração/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Explorar um exemplo" }));
    expect(props.onDemo).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("requires authentication for a configured studio", () => {
    render(<CreateDialog {...props} demo={false} />);
    expect(screen.getByRole("link", { name: "Entrar para criar" })).toHaveAttribute("href", "/sign-in");
    expect(screen.queryByRole("button", { name: "Gerar meus clipes" })).not.toBeInTheDocument();
  });
  it("rejects unsupported URLs before contacting the API", () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    render(<CreateDialog {...props} initialUrl="https://example.com/video" demo={false} user={{ id: "user-1" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Gerar meus clipes" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Use um link válido");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sends the selected options to the authenticated original pipeline and surfaces failures", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "Não foi possível iniciar o projeto." }), { status: 503, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    render(<CreateDialog {...props} demo={false} user={{ id: "user-1" }} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Formato" }), { target: { value: "original" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Legendas automáticas/ }));
    fireEvent.click(screen.getByRole("button", { name: "Gerar meus clipes" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(fetch.mock.calls[0][0]).toBe("/api/tasks/create");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ source: { url: "https://youtu.be/abcdefghijk" }, caption_template: "hormozi", output_format: "original", add_subtitles: false });
    expect(screen.getByRole("button", { name: "Gerar meus clipes" })).toBeEnabled();
  });
});
