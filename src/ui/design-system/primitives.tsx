import type { ComponentPropsWithoutRef } from 'react';
import { forwardRef } from 'react';
import { cx } from '../shared/utils';

/** Native semantics and refs are preserved for keyboard, forms and feature adapters. */
export const Button = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<'button'> & {
    variant?: 'primary' | 'secondary' | 'danger';
  }
>(({ variant, className, ...props }, ref) => (
  <button ref={ref} className={cx(variant, className)} {...props} />
));
Button.displayName = 'Button';
export const Input = forwardRef<HTMLInputElement, ComponentPropsWithoutRef<'input'>>(
  (props, ref) => <input ref={ref} {...props} />,
);
Input.displayName = 'Input';
export const Textarea = forwardRef<HTMLTextAreaElement, ComponentPropsWithoutRef<'textarea'>>(
  (props, ref) => <textarea ref={ref} {...props} />,
);
Textarea.displayName = 'Textarea';
export const Select = forwardRef<HTMLSelectElement, ComponentPropsWithoutRef<'select'>>(
  (props, ref) => <select ref={ref} {...props} />,
);
Select.displayName = 'Select';
export const Dialog = forwardRef<HTMLDialogElement, ComponentPropsWithoutRef<'dialog'>>(
  (props, ref) => <dialog ref={ref} {...props} />,
);
Dialog.displayName = 'Dialog';
export const Progress = forwardRef<HTMLProgressElement, ComponentPropsWithoutRef<'progress'>>(
  (props, ref) => <progress ref={ref} {...props} />,
);
Progress.displayName = 'Progress';
export function Panel({ className, ...props }: ComponentPropsWithoutRef<'section'>) {
  return <section className={cx('panel', className)} {...props} />;
}
export function Badge({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
  return <span className={cx('status-pill', className)} {...props} />;
}
