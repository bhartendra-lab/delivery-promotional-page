export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-20">
      <div className="max-w-md text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          We can&apos;t find this page
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          The link may be incorrect or the delivery page may no longer be
          available. Please contact the studio.
        </p>
      </div>
    </main>
  );
}
