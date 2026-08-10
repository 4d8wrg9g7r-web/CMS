import Link from "next/link";
import { Compass } from "lucide-react";
import { buttonClasses } from "../components/ui/Button";

export default function RootNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <Compass size={32} strokeWidth={1.5} className="text-ink-muted" />
      <h1 className="text-lg font-semibold text-ink">Page not found</h1>
      <p className="max-w-sm text-sm text-ink-secondary">The page you&rsquo;re looking for doesn&rsquo;t exist or may have moved.</p>
      <Link href="/dashboard" className={buttonClasses("secondary", "sm")}>
        Back to dashboard
      </Link>
    </main>
  );
}
