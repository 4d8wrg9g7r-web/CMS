import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { appService } from "@cms/database";
import { AppSignIn } from "../../../../components/church-app/AppSignIn";

/** Member sign-in for the church app — themed to the church, phone-first. */
export default async function AppSignInPage({ params }: { params: Promise<{ publicAppId: string }> }) {
  const { publicAppId } = await params;
  const app = await appService.resolvePublicApp(publicAppId);
  if (!app) notFound();

  return (
    <div className="min-h-dvh bg-neutral-100">
      <div className="mx-auto max-w-md px-5 py-8">
        <Link
          href={`/a/${publicAppId}`}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-800"
        >
          <ArrowLeft size={14} /> Back
        </Link>
        <div className="mb-6 flex items-center gap-3">
          {app.manifest.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- church-uploaded logo
            <img src={app.manifest.logoUrl} alt="" className="h-12 w-12 rounded-xl object-cover" />
          )}
          <div>
            <h1 className="text-xl font-bold tracking-tight text-neutral-900">{app.manifest.appName}</h1>
            <p className="text-sm text-neutral-500">Sign in to your church family</p>
          </div>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <AppSignIn publicAppId={publicAppId} accent={app.manifest.themeColor} />
        </div>
      </div>
    </div>
  );
}
