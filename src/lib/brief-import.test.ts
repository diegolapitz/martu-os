import { describe, expect, it } from "vitest";

import {
  BRIEF_FIELD_MAX_CHARS,
  BRIEF_SOURCE_MAX_CHARS,
  prepareBriefImport,
} from "./brief-import";

describe("prepareBriefImport", () => {
  it("keeps a long brief as reference while fitting its editable extract", () => {
    const source = `${"Una marca con mucho contexto. ".repeat(600)}cierre`;
    const prepared = prepareBriefImport(source);

    expect(prepared.sourceText).toBe(source);
    expect(prepared.editableText.length).toBeLessThanOrEqual(BRIEF_FIELD_MAX_CHARS);
    expect(prepared.hasExcerpt).toBe(true);
    expect(prepared.wasTruncated).toBe(false);
  });

  it("sets an explicit flag when a source exceeds the safety cap", () => {
    const prepared = prepareBriefImport("x".repeat(BRIEF_SOURCE_MAX_CHARS + 1));

    expect(prepared.sourceText).toHaveLength(BRIEF_SOURCE_MAX_CHARS);
    expect(prepared.wasTruncated).toBe(true);
  });
});
