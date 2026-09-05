export const BRIEF_FIELD_MAX_CHARS = 8_000;
export const BRIEF_SOURCE_MAX_CHARS = 500_000;

export type PreparedBriefImport = {
  sourceText: string;
  editableText: string;
  hasExcerpt: boolean;
  wasTruncated: boolean;
};

/** Keeps a complete reference when practical while fitting the editable brief fields. */
export function prepareBriefImport(rawText: string): PreparedBriefImport {
  const normalized = rawText.replace(/\s+\n/g, "\n").trim();
  const wasTruncated = normalized.length > BRIEF_SOURCE_MAX_CHARS;
  const sourceText = normalized.slice(0, BRIEF_SOURCE_MAX_CHARS);
  return {
    sourceText,
    editableText: excerpt(sourceText, BRIEF_FIELD_MAX_CHARS),
    hasExcerpt: sourceText.length > BRIEF_FIELD_MAX_CHARS,
    wasTruncated,
  };
}

function excerpt(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const boundary = text.lastIndexOf(" ", limit);
  return text.slice(0, boundary > Math.floor(limit * 0.7) ? boundary : limit).trimEnd();
}
