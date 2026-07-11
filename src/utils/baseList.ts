import { normalizePhoneDigits } from './phoneNumbers';

export const BASE_LIST_COLLECTION = 'baseList';
export const BASE_LIST_NAME_MAX_LENGTH = 120;
export const BASE_LIST_GROUP_MAX_LENGTH = 120;

export interface NormalizedBaseListEntry {
  phone: string;
  name: string;
  group: string;
}

export function normalizeTextField(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().slice(0, maxLength);
}

export function normalizeBaseListEntry(input: unknown, fallbackPhone?: string): NormalizedBaseListEntry | null {
  if (typeof input !== 'object' || input === null) {
    return null;
  }

  const rawEntry = input as Record<string, unknown>;
  const phone = normalizePhoneDigits(rawEntry.phone) ||
    normalizePhoneDigits(rawEntry.phones) ||
    normalizePhoneDigits(fallbackPhone);
  const name = normalizeFirstTextField(rawEntry, ['name', 'Name'], BASE_LIST_NAME_MAX_LENGTH);
  const group = normalizeFirstTextField(rawEntry, ['group', 'Group'], BASE_LIST_GROUP_MAX_LENGTH);

  if (!phone || !name) {
    return null;
  }

  return {
    phone,
    name,
    group,
  };
}

function normalizeFirstTextField(
  input: Record<string, unknown>,
  fieldNames: string[],
  maxLength: number,
): string {
  for (const fieldName of fieldNames) {
    const normalizedValue = normalizeTextField(input[fieldName], maxLength);
    if (normalizedValue) {
      return normalizedValue;
    }
  }

  return '';
}
