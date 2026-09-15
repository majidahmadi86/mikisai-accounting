import { cn } from "@/lib/cn";

/** 44px tall controls so every field is a comfortable touch target. */
export const controlClass =
  "w-full min-h-11 rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm text-plum placeholder:text-plum-faint focus:outline-none focus:ring-2 focus:ring-lavender focus:border-berry";

export function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="eyebrow mb-1.5 block">
      {children}
    </label>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClass, className)} {...props} />;
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(controlClass, "pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlClass, "min-h-24", className)} {...props} />;
}

export function Field({ label, htmlFor, children, hint }: { label: React.ReactNode; htmlFor?: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="mt-1.5 text-xs leading-relaxed text-plum-soft">{hint}</p> : null}
    </div>
  );
}
