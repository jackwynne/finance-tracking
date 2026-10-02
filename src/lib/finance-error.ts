import { ConvexError } from 'convex/values';
import { z } from 'zod';

const fallback = 'The request failed. Try again, or keep the original file and contact the developer.';

export function financeErrorMessage(cause: unknown) {
  if (cause instanceof ConvexError) {
    const result = z.string().safeParse(cause.data);
    if (result.success) {
      const message = result.data
        .replace(/^Uncaught ConvexError:\s*/, '')
        .split('\n')[0]
        .trim();
      if (message) return message;
    }
    return fallback;
  }
  if (cause instanceof Error && !cause.message.startsWith('[CONVEX ')) return cause.message;
  return fallback;
}
