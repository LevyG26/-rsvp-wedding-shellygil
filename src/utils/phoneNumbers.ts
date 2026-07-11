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
