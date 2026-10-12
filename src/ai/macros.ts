export interface MacroNames {
  char?: string;
  user?: string;
}

/**
 * Resolve standard Tavern-style display macros without keeping mutable global
 * character/user state. Each AI request should pass the current names explicitly.
 */
export function resolveMacros(text: string, names: MacroNames = {}): string {
  if (!text || text.indexOf('{{') < 0) return text;
  const char = names.char?.trim() || '角色';
  const user = names.user?.trim() || '用户';
  return text
    .replace(/\{\{\s*char\s*\}\}/gi, char)
    .replace(/\{\{\s*user\s*\}\}/gi, user);
}
