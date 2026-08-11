"use client";

import { useActionState, useRef } from "react";
import { Megaphone } from "lucide-react";
import { buttonClasses } from "./ui/Button";
import { Textarea } from "./ui/Input";
import { createAnnouncementAction, type AnnouncementFormState } from "../app/(dashboard)/community/actions";

/** Church announcement composer — posts to the app's home feed as the church. */
export function AnnouncementForm() {
  const [state, formAction, pending] = useActionState<AnnouncementFormState, FormData>(createAnnouncementAction, {
    error: null,
  });
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        formAction(fd);
        formRef.current?.reset();
      }}
      className="flex flex-col gap-3"
    >
      <Textarea
        name="body"
        required
        rows={3}
        maxLength={1000}
        placeholder="Share an announcement with everyone in the app — service times, weather closures, celebrations…"
        className="block w-full"
      />
      {state.error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</p>}
      <div>
        <button type="submit" disabled={pending} className={buttonClasses("primary", "md")}>
          <Megaphone size={15} /> {pending ? "Posting…" : "Post announcement"}
        </button>
      </div>
    </form>
  );
}
