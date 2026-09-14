import type { ReactNode } from "react";

export function PageHeading({
  title,
  subtitle,
  action,
  leading,
}: {
  title: ReactNode;
  subtitle?: string;
  action?: ReactNode;
  leading?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div className="page-heading-main">
        {leading}
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
