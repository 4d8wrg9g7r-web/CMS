import { redirect } from "next/navigation";

/** The old Media page: general uploads moved to /files; graphics live on their module pages. */
export default function MediaRedirect() {
  redirect("/files");
}
