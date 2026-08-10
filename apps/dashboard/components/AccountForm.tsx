"use client";

import { Input } from "./ui/Input";
import { SubmitButton } from "./SubmitButton";
import { useToast } from "./ui/Toast";

interface AccountFormProps {
  defaultName: string;
  defaultEmail: string;
  action: (formData: FormData) => Promise<void>;
}

export function AccountForm({ defaultName, defaultEmail, action }: AccountFormProps) {
  const { showToast } = useToast();

  async function handleSave(formData: FormData) {
    try {
      await action(formData);
      showToast("Account details saved");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Something went wrong. Please try again.", "error");
    }
  }

  return (
    <form action={handleSave} className="flex flex-col gap-4">
      <label className="text-sm text-ink-secondary">
        Name
        <Input name="name" type="text" required defaultValue={defaultName} className="mt-1 max-w-sm" />
      </label>
      <label className="text-sm text-ink-secondary">
        Email
        <Input name="email" type="email" required defaultValue={defaultEmail} className="mt-1 max-w-sm" />
      </label>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving...">Save</SubmitButton>
      </div>
    </form>
  );
}
