import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import type { CSSProperties } from 'react';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: Array<ClassValue>) {
  return twMerge(clsx(inputs));
}

export function cssVars(style: CSSProperties & Record<`--${string}`, string | number | undefined>): CSSProperties {
  return style;
}
