import type { ComponentChildren } from 'preact';

export function EmptyState({ title, children }: { title: string; children?: ComponentChildren }) {
  return (
    <div class="empty">
      <div class="empty-title">{title}</div>
      {children && <div class="empty-body">{children}</div>}
    </div>
  );
}
