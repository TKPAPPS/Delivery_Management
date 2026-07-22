// Format a Resend "from" address with a friendly display name so email clients show
// "The Kosher Place Delivery" instead of the bare address. Idempotent: if the value
// already includes a display name (contains '<'), it's returned unchanged.
export const EMAIL_FROM_NAME = 'The Kosher Place Delivery';

export function emailFrom(address: string): string {
  const a = (address ?? '').trim();
  if (!a || a.includes('<')) return a;
  return `${EMAIL_FROM_NAME} <${a}>`;
}
