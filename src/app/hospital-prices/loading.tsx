export default function Loading() {
  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-2 h-9 w-72 animate-pulse rounded-md bg-neutral-200" />
        <div className="mb-8 h-4 w-96 animate-pulse rounded bg-neutral-200" />
        <div className="h-10 w-80 animate-pulse rounded-md bg-neutral-200" />
      </div>
    </main>
  );
}
