export function EmptyState({ title, body, action }: { title: React.ReactNode; body?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-lavender bg-lavender-tint/60 px-6 py-12 text-center">
      <p className="font-display text-xl text-plum">{title}</p>
      {body ? <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-plum-soft">{body}</p> : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
