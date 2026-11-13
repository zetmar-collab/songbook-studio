// Rejestr funkcji zapisujących niezapisane zmiany. Wywoływany przy zamykaniu okna
// (proces główny czeka na potwierdzenie maks. 1,5 s) oraz przy przełączaniu widoków.
type Flusher = () => Promise<unknown> | void

const flushers = new Set<Flusher>()

export function registerFlush(fn: Flusher): () => void {
  flushers.add(fn)
  return () => {
    flushers.delete(fn)
  }
}

export async function flushAll(): Promise<void> {
  await Promise.allSettled([...flushers].map((f) => f()))
}
