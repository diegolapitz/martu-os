import { describe, expect, it } from "vitest";

import { prepareBriefImport } from "@/lib/brief-import";

import { clientSetupPatchSchema } from "./contracts";

describe("clientSetupPatchSchema", () => {
  it("accepts a long uploaded brief as a saved reference plus an editable extract", () => {
    const imported = prepareBriefImport("Contexto real del cliente. ".repeat(700));

    const payload = clientSetupPatchSchema.parse({
      brief: {
        businessDescription: imported.editableText,
        sourceText: imported.sourceText,
        source: "upload",
        confirmed: true,
      },
    });

    expect(payload.brief?.businessDescription).toBe(imported.editableText);
    expect(payload.brief?.sourceText).toBe(imported.sourceText);
  });
});
