import type { Metadata } from "next";
import { Heart } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { appService } from "@cms/database";

/** Stripe Checkout success landing — warm, simple, back to the app. */

interface Props {
  params: Promise<{ publicAppId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { publicAppId } = await params;
  const app = await appService.resolvePublicApp(publicAppId);
  return app ? { title: `Thank you — ${app.manifest.appName}` } : {};
}

export default async function GiveThanksPage({ params }: Props) {
  const { publicAppId } = await params;
  const app = await appService.resolvePublicApp(publicAppId);
  if (!app) notFound();
  const accent = app.manifest.themeColor;

  return (
    <div className="mx-auto flex h-dvh max-w-md flex-col items-center justify-center gap-4 bg-neutral-100 p-8 text-center">
      <span
        className="flex h-16 w-16 items-center justify-center rounded-full text-white"
        style={{ backgroundColor: accent }}
      >
        <Heart size={28} />
      </span>
      <h1 className="text-2xl font-bold text-neutral-900">Thank you!</h1>
      <p className="max-w-[280px] text-sm text-neutral-600">
        Your gift to {app.organizationName} was received. A receipt from Stripe is on its way to your email.
      </p>
      <Link
        href={`/a/${publicAppId}`}
        className="mt-2 rounded-full px-8 py-3 font-semibold text-white"
        style={{ backgroundColor: accent }}
      >
        Back to {app.manifest.appName}
      </Link>
    </div>
  );
}
