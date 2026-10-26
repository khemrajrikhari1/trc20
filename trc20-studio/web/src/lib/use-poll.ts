"use client";
import { useEffect } from "react";

/** Re-fetches a PENDING record from the API (which re-checks the chain) until it settles. */
export function usePollPending<T extends { id: string; status: string }>(
  rows: T[],
  endpoint: (id: string) => string,
  onUpdate: (row: T) => void,
  intervalMs = 4000,
) {
  const pendingIds = rows.filter((r) => r.status === "PENDING").map((r) => r.id).join(",");
  useEffect(() => {
    if (!pendingIds) return;
    const ids = pendingIds.split(",");
    const t = setInterval(async () => {
      for (const id of ids) {
        const r = await fetch(endpoint(id)).catch(() => null);
        if (r?.ok) onUpdate(await r.json());
      }
    }, intervalMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingIds]);
}
