import { FormEvent, useEffect, useState } from 'react';

// Generic inline-editable single-line text field, styled to match
// GuestCountInput (same save-button pattern) but for free text rather than a
// bounded number - used for the guest full name, so a typo that broke roster
// name-matching can be fixed right in the table. dir="auto" lets each name
// render in its own natural direction (Hebrew vs. Latin) regardless of the
// surrounding page direction.
interface EditableTextFieldProps {
  value: string;
  disabled?: boolean;
  inputLabel: string;
  saveLabel: string;
  savingLabel: string;
  placeholder?: string;
  onChange: (value: string) => Promise<void>;
}

export function EditableTextField({
  value,
  disabled = false,
  inputLabel,
  saveLabel,
  savingLabel,
  placeholder,
  onChange,
}: EditableTextFieldProps) {
  const [inputValue, setInputValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const trimmed = inputValue.trim();
  const hasChanged = trimmed.length > 0 && trimmed !== value;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasChanged || isSaving || disabled) {
      return;
    }

    setIsSaving(true);
    try {
      await onChange(trimmed);
    } catch {
      setInputValue(value);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
      <input
        type="text"
        dir="auto"
        aria-label={inputLabel}
        value={inputValue}
        placeholder={placeholder}
        onChange={(event) => setInputValue(event.target.value)}
        disabled={isSaving || disabled}
        className="w-full min-w-0 rounded-xl border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200 disabled:cursor-not-allowed disabled:bg-gray-100"
      />
      <button
        type="submit"
        disabled={!hasChanged || isSaving || disabled}
        className="shrink-0 rounded-xl bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {isSaving ? savingLabel : saveLabel}
      </button>
    </form>
  );
}
