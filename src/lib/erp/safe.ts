export async function orGuest<T>(task: Promise<T>, fallback: T): Promise<T> {
  try {
    return await task;
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") return fallback;
    throw err;
  }
}
