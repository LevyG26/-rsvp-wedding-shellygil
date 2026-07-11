import { FormEvent, useEffect, useState } from 'react';

const MIN_GUEST_COUNT = 1;
const MAX_GUEST_COUNT = 10;

interface GuestCountInputProps {
  count: number;
  disabled?: boolean;
  inputLabel: string;
  saveLabel: string;
  savingLabel: string;
  onChange: (count: number) => Promise<void>;
}

export function GuestCountInput({
  count,
  disabled = false,
  inputLabel,
  saveLabel,
  savingLabel,
  onChange,
}: GuestCountInputProps) {
  const [inputValue, setInputValue] = useState(String(count));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setInputValue(String(count));
  }, [count]);

  const parsedCount = Number(inputValue);
  const isValid = Number.isInteger(parsedCount)
    && parsedCount >= MIN_GUEST_COUNT
    && parsedCount <= MAX_GUEST_COUNT;
  const hasChanged = isValid && parsedCount !== count;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasChanged || isSaving || disabled) {
      return;
    }

    setIsSaving(true);
    try {
      await onChange(parsedCount);
    } catch {
      setInputValue(String(count));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center justify-center gap-2" dir="ltr">
      <input
        type="number"
        min={MIN_GUEST_COUNT}
        max={MAX_GUEST_COUNT}
        step={1}
        aria-label={inputLabel}
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)}
        disabled={isSaving || disabled}
        className="w-16 rounded-xl border border-gray-300 bg-white px-2 py-1.5 text-center text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200 disabled:cursor-not-allowed disabled:bg-gray-100"
      />
      <button
        type="submit"
        disabled={!hasChanged || isSaving || disabled}
        className="rounded-xl bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {isSaving ? savingLabel : saveLabel}
      </button>
    </form>
  );
}
