import { useEffect, useState } from "react";

/**
 * Field primitives for the config editor.
 *
 * NumberField exists because a controlled `<input type="number">` bound
 * straight to a number is hostile to type: clearing it to retype yields NaN,
 * and "0." or "-" are unrepresentable intermediate states. So it holds the raw
 * string while focused and only commits a parsed number when that string is a
 * complete number. An empty field commits nothing and reports itself as
 * invalid, rather than silently becoming 0 — a weight that quietly turns into
 * 0 changes every score in the competition.
 */

interface NumberFieldProps {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  testId?: string;
  disabled?: boolean;
}

export function NumberField({
  label,
  value,
  onCommit,
  min,
  max,
  step,
  hint,
  testId,
  disabled,
}: NumberFieldProps) {
  const [text, setText] = useState(String(value));
  const [touched, setTouched] = useState(false);

  // Re-sync when the value changes underneath us (undo, reset, reload).
  useEffect(() => {
    setText(String(value));
  }, [value]);

  const parsed = Number(text);
  const isEmpty = text.trim() === "";
  const isInvalid = isEmpty || Number.isNaN(parsed);

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        className={`h-9 rounded-md border bg-background px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring ${
          touched && isInvalid ? "border-destructive" : "border-input"
        }`}
        value={text}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        data-testid={testId}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          setTouched(true);
          const parsedNext = Number(next);
          if (next.trim() !== "" && !Number.isNaN(parsedNext)) {
            onCommit(parsedNext);
          }
        }}
        onBlur={() => {
          // Restore the last good value rather than leaving the field empty.
          if (isInvalid) setText(String(value));
        }}
      />
      {touched && isInvalid ? (
        <span className="text-xs text-destructive">
          Enter a number — this field cannot be left empty.
        </span>
      ) : hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  testId?: string;
  disabled?: boolean;
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  testId,
  disabled,
}: TextFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <input
        type="text"
        className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        data-testid={testId}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  hint?: string;
  testId?: string;
  disabled?: boolean;
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  testId,
  disabled,
}: SelectFieldProps<T>) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <select
        className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
        value={value}
        disabled={disabled}
        data-testid={testId}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}

export function EditorCard({
  title,
  description,
  action,
  children,
  testId,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 shadow-sm"
      data-testid={testId}
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
