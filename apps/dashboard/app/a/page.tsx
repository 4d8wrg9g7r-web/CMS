import type { Metadata } from "next";
import { Church, Search } from "lucide-react";
import { appService } from "@cms/database";

/**
 * The container experience (docs/domain/app.md): one front door where anyone can
 * find their church and open its app — the web twin of the store container app
 * (Subsplash model), and the preview surface for every published church. Each
 * church's own install link /a/<id> stays the white-label front door.
 */

export const metadata: Metadata = {
  title: "Find your church",
  description: "Find your church and open its app.",
};

export default async function AppDirectoryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const entries = await appService.searchDirectory(q);

  return (
    <div className="min-h-dvh bg-neutral-100">
      <div className="mx-auto max-w-md px-5 py-10">
        <div className="mb-6 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-900 text-white">
            <Church size={22} />
          </span>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-neutral-900">Find your church</h1>
          <p className="mt-1 text-sm text-neutral-600">Search for your church and open its app.</p>
        </div>

        <form method="get" className="relative mb-5">
          <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Church name"
            className="w-full rounded-full border border-neutral-300 bg-white py-3 pl-11 pr-4 text-sm text-neutral-900 outline-none focus:border-neutral-500"
          />
        </form>

        {entries.length === 0 ? (
          <p className="pt-6 text-center text-sm text-neutral-500">
            {q ? `No churches match “${q}”.` : "No churches are listed yet."}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {entries.map((entry) => (
              <a
                key={entry.publicAppId}
                href={`/a/${entry.publicAppId}`}
                className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4 transition-shadow hover:shadow-md"
              >
                {entry.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- church-uploaded logo
                  <img src={entry.logoUrl} alt="" className="h-11 w-11 rounded-xl object-cover" />
                ) : (
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold text-white"
                    style={{ backgroundColor: entry.themeColor }}
                  >
                    {entry.appName.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-neutral-900">{entry.appName}</span>
                  <span className="block truncate text-sm text-neutral-500">{entry.organizationName}</span>
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
