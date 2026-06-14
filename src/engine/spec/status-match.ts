/**
 * Matches an observed HTTP status against a declared response key, supporting
 * exact codes ("200"), ranges ("2XX"), and the catch-all "default".
 */
export function statusMatches(declaredKey: string, actualStatus: string): boolean {
  const key = declaredKey.trim();
  if (key.toLowerCase() === "default") return true;
  if (/^\d{3}$/.test(key)) return key === actualStatus;
  const range = /^([1-5])[xX]{2}$/.exec(key);
  if (range && /^\d{3}$/.test(actualStatus)) return actualStatus[0] === range[1];
  return key === actualStatus;
}

/** True when the observed status is covered by at least one declared key. */
export function statusIsDeclared(declaredKeys: Iterable<string>, actualStatus: string): boolean {
  for (const key of declaredKeys) {
    if (statusMatches(key, actualStatus)) return true;
  }
  return false;
}
