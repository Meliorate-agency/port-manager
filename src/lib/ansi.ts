/**
 * Strip ANSI escape codes from a string.
 * Handles color codes, cursor movement, and other terminal sequences.
 */
export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
}
