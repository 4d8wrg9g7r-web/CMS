import { redirect } from "next/navigation";

/** No marketing site — the root just routes into the app (middleware sends signed-out visitors to /login). */
export default function RootPage() {
  redirect("/dashboard");
}
