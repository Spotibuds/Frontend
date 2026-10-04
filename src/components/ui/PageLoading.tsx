export default function PageLoading({ label = "Loading page…" }: { label?: string }) {
  return (
    <div className="page-shell" role="status" aria-label={label}>
      <p className="mb-6 text-sm text-gray-400">{label}</p>
      <div aria-hidden="true" className="space-y-5">
        <div className="h-8 w-48 rounded-md bg-gray-800" />
        <div className="h-36 max-w-2xl rounded-xl bg-gray-800" />
        <div className="h-16 max-w-2xl rounded-lg bg-gray-800" />
        <div className="h-16 max-w-2xl rounded-lg bg-gray-800" />
      </div>
    </div>
  );
}
