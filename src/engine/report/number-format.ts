/**
 * Minimal subset of Java's decimal format used by the original report, enough
 * for percentage display: patterns like "0", "0.0", "0.##", "0.###".
 *
 * `0` in the fractional part forces a digit; `#` makes it optional (trailing
 * zeros are trimmed). The integer part is always shown.
 */
export function formatNumber(value: number, pattern = "0.###"): string {
  const dot = pattern.indexOf(".");
  const fraction = dot === -1 ? "" : pattern.slice(dot + 1);
  const maxDigits = fraction.length;
  const minDigits = (fraction.match(/0/g) ?? []).length;

  let text = value.toFixed(maxDigits);
  if (maxDigits > minDigits && text.includes(".")) {
    // Trim optional trailing zeros down to the minimum required.
    text = text.replace(/0+$/, "");
    const [, frac = ""] = text.split(".");
    if (frac.length < minDigits) {
      text = value.toFixed(minDigits);
    } else if (text.endsWith(".")) {
      text = text.slice(0, -1);
    }
  }
  return text;
}
