import { Card } from "../../../components/ui/Card";

function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-surface-muted ${className}`} />;
}

export default function DashboardLoading() {
  return (
    <div className="flex gap-6">
      <div className="min-w-0 flex-1">
        <Block className="mb-2 h-7 w-64" />
        <Block className="mb-8 h-4 w-80" />

        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="flex flex-col gap-3">
              <Block className="h-3 w-20" />
              <Block className="h-8 w-16" />
              <Block className="h-3 w-24" />
            </Card>
          ))}
        </div>

        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <Block className="mb-4 h-4 w-32" />
            <Block className="mb-3 h-10 w-full" />
            <Block className="mb-3 h-10 w-full" />
            <Block className="h-10 w-full" />
          </Card>
          <Card>
            <Block className="mb-4 h-4 w-32" />
            <Block className="mb-3 h-10 w-full" />
            <Block className="h-10 w-full" />
          </Card>
        </div>

        <Card padding="none">
          <Block className="m-5 h-4 w-24" />
        </Card>
      </div>

      <aside className="hidden w-[400px] shrink-0 xl:block">
        <Block className="h-[600px] w-full rounded-lg" />
      </aside>
    </div>
  );
}
