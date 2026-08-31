import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function componentSource(name: string) {
  return readFileSync(
    fileURLToPath(new URL(`./${name}`, import.meta.url)),
    "utf8",
  );
}

function count(source: string, pattern: RegExp) {
  return source.match(pattern)?.length ?? 0;
}

describe("navigation prefetch policy", () => {
  it("does not manually prefetch routes from the application shell", () => {
    const source = componentSource("app-shell.tsx");

    expect(source).not.toContain("router.prefetch");
    expect(count(source, /<Link\b/g)).toBeGreaterThan(0);
    expect(count(source, /prefetch=/g)).toBe(count(source, /<Link\b/g));
  });

  it("uses the same Supervisora name in the main navigation", () => {
    const source = componentSource("app-shell.tsx");

    expect(source).toContain('label: "Supervisora"');
    expect(source).not.toContain('label: "Supervisor"');
  });

  it.each([
    "calendar-v1.tsx",
    "client-panels.tsx",
    "clients-view.tsx",
    "day-view.tsx",
    "supervisor-v1.tsx",
    "work-view.tsx",
  ])("disables viewport prefetch for repeated links in %s", (name) => {
    const source = componentSource(name);

    expect(count(source, /<Link\b/g)).toBeGreaterThan(0);
    expect(count(source, /prefetch=\{false\}/g)).toBe(
      count(source, /<Link\b/g),
    );
  });

  it("prefetches client tabs only after navigation intent", () => {
    const source = componentSource("client-workspace.tsx");

    expect(count(source, /<Link\b/g)).toBe(1);
    expect(source).toContain(
      "prefetch={intentPrefetchTab === tab.key ? null : false}",
    );
  });
});
