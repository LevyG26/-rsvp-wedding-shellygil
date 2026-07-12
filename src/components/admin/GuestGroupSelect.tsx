import { FormEvent, useState } from 'react';

const NEW_GROUP_VALUE = '__new_group__';
const MAX_GROUP_NAME_LENGTH = 60;

interface GuestGroupSelectLabels {
  unassigned: string;
  addNew: string;
  newGroupPlaceholder: string;
  save: string;
  cancel: string;
  saving: string;
}

interface GuestGroupSelectProps {
  group: string;
  groups: string[];
  labels: GuestGroupSelectLabels;
  disabled?: boolean;
  onChange: (group: string) => Promise<void>;
}

export function GuestGroupSelect({
  group,
  groups,
  labels,
  disabled = false,
  onChange,
}: GuestGroupSelectProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const saveGroup = async (nextGroup: string) => {
    setIsSaving(true);
    try {
      await onChange(nextGroup);
      setIsAdding(false);
      setNewGroupName('');
    } catch {
      // The dashboard owns and displays persistence errors.
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectChange = async (value: string) => {
    if (value === NEW_GROUP_VALUE) {
      setIsAdding(true);
      return;
    }

    await saveGroup(value);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = newGroupName.trim();
    if (!normalizedName) {
      return;
    }

    const existingGroup = groups.find(
      (option) => option.toLocaleLowerCase() === normalizedName.toLocaleLowerCase(),
    );
    await saveGroup(existingGroup ?? normalizedName);
  };

  // w-full (not a fixed width like w-44/min-w-56) so this always fills
  // whatever container it's placed in - a wide desktop table column, or a
  // narrow mobile grid cell - instead of overflowing past the edge of a
  // narrow container the way a fixed width does. flex-wrap on the add-new
  // form lets the buttons drop to their own line on narrow screens rather
  // than forcing the row wider than its container.
  if (isAdding) {
    return (
      <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={newGroupName}
          onChange={(event) => setNewGroupName(event.target.value)}
          placeholder={labels.newGroupPlaceholder}
          maxLength={MAX_GROUP_NAME_LENGTH}
          disabled={isSaving || disabled}
          autoFocus
          className="min-w-0 flex-1 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200 disabled:bg-gray-100"
        />
        <button
          type="submit"
          disabled={!newGroupName.trim() || isSaving || disabled}
          className="shrink-0 rounded-xl bg-gray-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {isSaving ? labels.saving : labels.save}
        </button>
        <button
          type="button"
          onClick={() => {
            setIsAdding(false);
            setNewGroupName('');
          }}
          disabled={isSaving}
          className="shrink-0 rounded-xl bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed"
        >
          {labels.cancel}
        </button>
      </form>
    );
  }

  return (
    <select
      value={group}
      onChange={(event) => void handleSelectChange(event.target.value)}
      disabled={isSaving || disabled}
      className="w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200 disabled:cursor-not-allowed disabled:bg-gray-100"
    >
      <option value="">{labels.unassigned}</option>
      {groups.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
      <option value={NEW_GROUP_VALUE}>{labels.addNew}</option>
    </select>
  );
}
