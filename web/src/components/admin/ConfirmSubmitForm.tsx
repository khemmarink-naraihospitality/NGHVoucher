"use client";

interface ConfirmSubmitFormProps {
  action: (formData: FormData) => void | Promise<void>;
  confirmMessage: string;
  hiddenFields: Record<string, string | number>;
  buttonLabel: string;
  buttonClassName?: string;
}

/** A one-field-set form that asks for confirmation before submitting — for destructive actions like deleting a room type. */
export function ConfirmSubmitForm({
  action,
  confirmMessage,
  hiddenFields,
  buttonLabel,
  buttonClassName,
}: ConfirmSubmitFormProps) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {Object.entries(hiddenFields).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <button type="submit" className={buttonClassName ?? "text-xs underline text-red-700"}>
        {buttonLabel}
      </button>
    </form>
  );
}
