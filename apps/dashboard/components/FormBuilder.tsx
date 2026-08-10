"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
import type { FormField, FormFieldType } from "@cms/database";
import { buttonClasses } from "./ui/Button";
import { Input, Select } from "./ui/Input";
import { FIELD_MAPPING_OPTIONS, FIELD_TYPE_OPTIONS } from "../lib/forms-format";

type EditableField = FormField & { options: string[] };

function newField(): EditableField {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `f_${Date.now()}`,
    label: "",
    type: "SHORT_TEXT",
    required: false,
    options: [],
    mapsTo: null,
  };
}

function toEditable(fields: FormField[]): EditableField[] {
  return fields.map((f) => ({ ...f, options: f.options ?? [] }));
}

/**
 * Interactive field-list editor for a form's draft schema. Manages fields in local state
 * and serializes them to a hidden input as JSON on save -- so the server action stays a
 * single "save draft schema" call. Publishing (a separate action) snapshots the saved
 * draft into an immutable version.
 */
export function FormBuilder({
  action,
  initialFields,
}: {
  action: (formData: FormData) => void | Promise<void>;
  initialFields: FormField[];
}) {
  const [fields, setFields] = useState<EditableField[]>(toEditable(initialFields));

  function update(index: number, patch: Partial<EditableField>) {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }
  function remove(index: number) {
    setFields((prev) => prev.filter((_, i) => i !== index));
  }
  function move(index: number, delta: number) {
    setFields((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  // Serialize to the shape the schema parser expects (options only for DROPDOWN;
  // mapsTo null when unset).
  const serialized = JSON.stringify(
    fields.map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      required: f.required,
      options: f.type === "DROPDOWN" ? f.options : undefined,
      mapsTo: f.mapsTo || null,
      helpText: f.helpText || undefined,
    })),
  );

  return (
    <form action={action}>
      <input type="hidden" name="schema" value={serialized} />

      <div className="space-y-3">
        {fields.length === 0 && (
          <p className="rounded-md border border-dashed border-border py-8 text-center text-sm text-ink-muted">
            No fields yet. Add your first question below.
          </p>
        )}

        {fields.map((field, index) => (
          <div key={field.id} className="rounded-md border border-border bg-surface p-4">
            <div className="mb-3 flex items-start gap-2">
              <GripVertical size={16} className="mt-2.5 shrink-0 text-ink-muted" />
              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <label className="text-xs text-ink-secondary">
                  Label
                  <Input
                    value={field.label}
                    onChange={(e) => update(index, { label: e.target.value })}
                    placeholder="What's your name?"
                    className="mt-1 text-sm"
                  />
                </label>
                <label className="text-xs text-ink-secondary">
                  Type
                  <Select
                    value={field.type}
                    onChange={(e) => update(index, { type: e.target.value as FormFieldType })}
                    className="mt-1 text-sm"
                  >
                    {FIELD_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </label>
                {field.type === "DROPDOWN" && (
                  <label className="text-xs text-ink-secondary sm:col-span-2">
                    Options <span className="text-ink-muted">(comma-separated)</span>
                    <Input
                      value={field.options.join(", ")}
                      onChange={(e) =>
                        update(index, {
                          options: e.target.value
                            .split(",")
                            .map((o) => o.trim())
                            .filter(Boolean),
                        })
                      }
                      className="mt-1 text-sm"
                    />
                  </label>
                )}
                <label className="text-xs text-ink-secondary">
                  Maps to Person field
                  <Select
                    value={field.mapsTo ?? ""}
                    onChange={(e) => update(index, { mapsTo: (e.target.value || null) as EditableField["mapsTo"] })}
                    className="mt-1 text-sm"
                  >
                    {FIELD_MAPPING_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="mt-1 flex items-center gap-2 self-end text-xs text-ink-secondary">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(e) => update(index, { required: e.target.checked })}
                    className="h-4 w-4 rounded border-border-strong text-accent"
                  />
                  Required
                </label>
              </div>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  aria-label="Move up"
                  className="rounded-sm p-1 text-ink-muted hover:bg-surface-muted hover:text-ink"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  aria-label="Move down"
                  className="rounded-sm p-1 text-ink-muted hover:bg-surface-muted hover:text-ink"
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  aria-label="Remove field"
                  className="rounded-sm p-1 text-ink-muted hover:bg-surface-muted hover:text-danger"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setFields((prev) => [...prev, newField()])}
          className={buttonClasses("secondary", "sm")}
        >
          <Plus size={15} /> Add field
        </button>
        <button type="submit" className={buttonClasses("primary", "md")}>
          Save fields
        </button>
      </div>
    </form>
  );
}
