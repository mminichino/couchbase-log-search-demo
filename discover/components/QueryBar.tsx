"use client";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  loading?: boolean;
};

export function QueryBar({ value, onChange, onSubmit, loading }: Props) {
  return (
    <form
      className="flex min-w-0 flex-1 items-stretch gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label className="sr-only" htmlFor="discover-q">
        Search query
      </label>
      <input
        id="discover-q"
        className="min-w-0 flex-1 rounded-md border border-ink-200 bg-white/90 px-3 py-2 font-mono text-sm text-ink-900 outline-none ring-accent/30 placeholder:text-ink-400 focus:ring-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="+service:payments +level:ERROR timeout"
        spellCheck={false}
        autoComplete="off"
      />
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-ink-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-800 disabled:opacity-60"
      >
        {loading ? "Searching…" : "Search"}
      </button>
    </form>
  );
}
