import { LucideIcon } from 'lucide-react';
import Link from 'next/link';

type Props = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    href: string;
  };
};

export function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="bg-white rounded-xl border p-12 text-center">
      <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
        <Icon className="w-6 h-6 text-primary" />
      </div>
      <h3 className="text-lg font-medium mb-2">{title}</h3>
      <p className="text-gray-500 mb-6 max-w-sm mx-auto">{description}</p>
      {action && (
        <Link
          href={action.href}
          className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
