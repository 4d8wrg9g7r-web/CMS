import Link from "next/link";
import { Compass } from "lucide-react";
import { EmptyState } from "../../components/ui/EmptyState";
import { buttonClasses } from "../../components/ui/Button";

export default function DashboardNotFound() {
  return (
    <EmptyState
      bare={false}
      icon={<Compass size={28} strokeWidth={1.5} />}
      title="Not found"
      description="That page doesn't exist, or the item may have been deleted."
      action={
        <Link href="/dashboard" className={buttonClasses("secondary", "sm")}>
          Back to dashboard
        </Link>
      }
    />
  );
}
