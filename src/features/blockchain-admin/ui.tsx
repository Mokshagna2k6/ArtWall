import type { ReactNode } from "react";

/** Shared page chrome for the Blockchain Admin sub-pages. */
export function Page({ title, scope, children }: { title: string; scope: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-display">{title}</h1>
        <p className="border-hairline text-ink-muted mt-3 max-w-2xl rounded-md border border-dashed p-3 text-sm leading-6">
          <span className="text-ink font-medium">Scope: </span>
          {scope}
        </p>
      </div>
      {children}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border-hairline rounded-md border p-4">
      <p className="text-label text-ink-muted tracking-wider uppercase">{label}</p>
      <p className="mt-1 text-xl font-medium tabular-nums">{value}</p>
    </div>
  );
}

export function Table({ title, head, rows, empty }: { title: string; head: string[]; rows: ReactNode[][]; empty: string }) {
  return (
    <div>
      <p className="text-label text-ink-muted tracking-wider uppercase">{title}</p>
      {rows.length === 0 ? (
        <p className="border-hairline text-ink-muted mt-3 rounded-md border border-dashed p-6 text-center text-sm">{empty}</p>
      ) : (
        <div className="border-hairline mt-3 overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-hairline text-ink-muted border-b text-left text-xs uppercase tracking-wider">
                {head.map((h) => (
                  <th key={h} className="px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={i > 0 ? "border-hairline border-t" : undefined}>
                  {r.map((c, j) => (
                    <td key={j} className="max-w-[16rem] truncate px-4 py-3">{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
