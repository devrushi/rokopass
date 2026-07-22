// Express 5's route param types allow `string | string[]` (repeating params like `/:id+`).
// None of our routes use that syntax, so a param is always a single string at runtime —
// this just narrows the type to match.
export function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}
