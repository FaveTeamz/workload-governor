import { Link } from "react-router-dom";
import "./Breadcrumb.css";

export interface BreadcrumbItem {
  label: string;
  path?: string; // undefined for current page (not clickable)
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

function truncate(text: string, maxLength = 40): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  if (items.length === 0) return null;

  // Generate schema.org BreadcrumbList structured data
  const schemaData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items.map((item, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": item.label,
      ...(item.path && { "item": `${window.location.origin}${item.path}` }),
    })),
  };

  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <script type="application/ld+json">
        {JSON.stringify(schemaData)}
      </script>
      <ol className="breadcrumb__list">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const isFirstLevel = index === items.length - 2; // one level up
          const truncatedLabel = truncate(item.label);
          const needsTruncation = item.label.length > 40;

          return (
            <li
              key={index}
              className={`breadcrumb__item${isFirstLevel ? " breadcrumb__item--parent" : ""}${isLast ? " breadcrumb__item--current" : ""}`}
            >
              {isLast ? (
                <span
                  className="breadcrumb__text"
                  aria-current="page"
                  title={needsTruncation ? item.label : undefined}
                >
                  {truncatedLabel}
                </span>
              ) : (
                <>
                  <Link
                    to={item.path!}
                    className="breadcrumb__link"
                    title={needsTruncation ? item.label : undefined}
                  >
                    {truncatedLabel}
                  </Link>
                  <span className="breadcrumb__separator" aria-hidden="true">
                    /
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
