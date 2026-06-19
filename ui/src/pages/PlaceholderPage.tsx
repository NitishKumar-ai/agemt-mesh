import type { ComponentType } from 'react';

export function PlaceholderPage({
  icon: Icon,
  eyebrow,
  title,
  description,
}: {
  icon: ComponentType<{ size?: number }>;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="placeholder-page">
      <div className="placeholder-icon">
        <Icon size={28} />
      </div>
      <span>{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}
