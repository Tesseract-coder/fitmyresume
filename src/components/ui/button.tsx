import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const buttonVariants = cva(
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-brand-700 text-white hover:bg-brand-800 dark:bg-brand-500 dark:hover:bg-brand-600',
        accent: 'bg-teal-600 text-white hover:bg-teal-700',
        outline: 'surface hover:bg-subtle',
        ghost: 'hover:bg-subtle',
        destructive: 'bg-red-700 text-white hover:bg-red-800',
        link: 'min-h-0 px-0 text-brand-600 underline-offset-4 hover:underline dark:text-brand-100',
      },
      size: {
        default: '',
        lg: 'min-h-12 px-6 text-base',
        icon: 'size-11 px-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, type = 'button', ...props }, ref) => (
  <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = 'Button';
