import { Skeleton } from '@/components/ui/Skeleton';

export default function AnalyticsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border p-4 animate-pulse">
            <div className="flex items-center gap-3 mb-2">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-8 w-12" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border p-6">
          <Skeleton className="h-6 w-48 mb-4" />
          <Skeleton className="h-[300px] w-full" />
        </div>
        <div className="bg-white rounded-xl border p-6">
          <Skeleton className="h-6 w-48 mb-4" />
          <Skeleton className="h-[300px] w-full" />
        </div>
      </div>
    </div>
  );
}
