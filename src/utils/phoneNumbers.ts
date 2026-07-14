export const PHONE_NUMBER_PATTERN = /^\d{7,20}$/;

const PHONE_LINK_ALLOWED_PATTERN = /^[0-9+()\-\s]+$/;

export function normalizePhoneDigits(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  const digitsOnly = value.replace(/\D/g, '');
  return PHONE_NUMBER_PATTERN.test(digitsOnly) ? digitsOnly : '';
}

export function normalizePhoneNumber(value: string | undefined): string {
  if (!value) {
    return '';
  }

  let decodedValue: string;
  try {
    decodedValue = decodeURIComponent(value);
  } catch {
    return '';
  }

  const trimmedValue = decodedValue.trim();
  if (!trimmedValue || !PHONE_LINK_ALLOWED_PATTERN.test(trimmedValue)) {
    return '';
  }

  return normalizePhoneDigits(trimmedValue);
}

export function isValidPhoneNumber(value: string): boolean {
  return PHONE_NUMBER_PATTERN.test(value);
}

// Converts a stored phone number (as typed into the guest spreadsheet -
// almost always a local Israeli mobile like "0501234567") into the full
// international digit string WhatsApp's wa.me "click to chat" links
// require: no leading 0, country code prepended instead. Left untouched if
// it already looks international (starts with the country code already).
// This only affects the wa.me link that gets built for the reminders tab -
// it never touches the digits stored as the guest's ID/phone field
// elsewhere, since those need to stay exactly as imported to keep matching
// the baseList/rsvps/invite-link records that already use them as keys.
export function toWhatsappDialableNumber(digits: string, defaultCountryCode = '972'): string {
  if (digits.startsWith(defaultCountryCode)) {
    return digits;
  }
  if (digits.startsWith('0')) {
    return `${defaultCountryCode}${digits.slice(1)}`;
  }
  return digits;
}
