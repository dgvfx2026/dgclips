import { describe, expect, it } from "vitest";
import { filterProjects, normalizeProject, sampleProjects } from "./dgclips-projects";
import type { GenerationSummary } from "./generations";

const task = { id: "real-task", source_title: "Meu vídeo", source_type: "upload", status: "queued", clips_count: 0, created_at: "2026-10-27T12:00:00Z" } as GenerationSummary;
describe("DGCLIPS project library", () => {
  it("keeps queued and unknown pipeline stages in processing, rather than claiming success", () => {
    for (const status of ["queued", "transcribing", "rendering", "new-stage"]) expect(normalizeProject({ ...task, status }).status).toBe("processing");
    expect(normalizeProject({ ...task, status: "failed" }).status).toBe("failed");
    expect(normalizeProject({ ...task, status: "completed", clips_count: 4 }).clips).toBe(4);
    expect(normalizeProject(task).sample).toBeUndefined();
  });
  it("finds Portuguese titles and categories without requiring accents", () => {
    expect(filterProjects(sampleProjects, "negocios", "all", []).map((item) => item.id)).toEqual(["demo-business"]);
    expect(filterProjects(sampleProjects, "CRIATIVIDADE", "all", [])).toHaveLength(1);
  });
  it("combines favorite, text and processing filters without changing source data", () => {
    expect(filterProjects(sampleProjects, "", "favorites", ["demo-creative"])).toHaveLength(1);
    expect(filterProjects(sampleProjects, "podcast", "favorites", ["demo-creative"])).toHaveLength(0);
    expect(filterProjects(sampleProjects, "", "processing", [])).toHaveLength(0);
    expect(sampleProjects).toHaveLength(3);
  });
});
