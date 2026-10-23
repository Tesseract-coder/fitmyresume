import * as S from '@radix-ui/react-switch';
import { cn } from '@/lib/cn';

export function Switch({ className, ...props }: S.SwitchProps) {
  return (
    <S.Root
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border border-subtle bg-slate-300 transition-colors data-[state=checked]:bg-teal-600 dark:bg-slate-600',
        // 44px touch target around the visual switch
        'before:absolute before:-inset-2 before:content-[""]',
        className,
      )}
      {...props}
    >
      <S.Thumb className="block size-5 translate-x-1 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-6" />
    </S.Root>
  );
}
