export const extractJsonObject = (content: string): Record<string, unknown> => {
  const trimmed = content.trim();

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      const candidate = trimmed.slice(start, end + 1);
      return JSON.parse(candidate) as Record<string, unknown>;
    }
  }

  throw new Error('Unable to parse JSON object from model response');
};
