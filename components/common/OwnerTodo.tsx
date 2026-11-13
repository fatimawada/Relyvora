import React from 'react';

interface OwnerTodoProps {
  id: string;
  children?: React.ReactNode;
}

/**
 * OwnerTodo Guard Component:
 * In development, renders a visible styled badge for unconfirmed items.
 * In production (NODE_ENV === 'production'), throws a fatal Error during the build
 * to ensure that unconfirmed owner decisions/placeholders can NEVER ship.
 */
export function OwnerTodo({ id, children }: OwnerTodoProps) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `[OwnerTodo Guard] Fatal: Unconfirmed owner decision item rendered in production: "${id}". ` +
      `Resolve this decision in docs/OWNER-INPUT.md before deploying.`
    );
  }

  return (
    <span
      data-ownertodo={id}
      className="inline-block px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs font-sans border border-amber-500/30"
    >
      [TODO: {id}] {children}
    </span>
  );
}
