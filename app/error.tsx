"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <h2 className="mb-2 text-lg font-semibold">Something went wrong</h2>
      <button
        type="button"
        onClick={reset}
        className="rounded bg-foreground px-3 py-1.5 text-sm text-background"
      >
        Try again
      </button>
    </div>
  );
}
