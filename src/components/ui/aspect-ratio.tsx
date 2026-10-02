import { cn, cssVars } from '@/lib/utils';

function AspectRatio({ ratio, className, ...props }: React.ComponentProps<'div'> & { ratio: number }) {
  return (
    <div
      data-slot="aspect-ratio"
      style={cssVars({
        '--ratio': ratio,
      })}
      className={cn('relative aspect-(--ratio)', className)}
      {...props}
    />
  );
}

export { AspectRatio };
