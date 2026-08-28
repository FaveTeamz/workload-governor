import { useEffect, useMemo, useState, type ReactNode } from 'react';
import tokens from '../tokens.json';

interface TokenEntry {
  name: string;
  cssVar: string;
  value: string;
  description: string;
}

interface ComponentVariant {
  label: string;
  preview: ReactNode;
}

interface ComponentCard {
  name: string;
  storyPath: string;
  variants: ComponentVariant[];
}

function formatTokenName(section: string, key: string): string {
  return `${section}.${key}`;
}

export function DesignSystemPage() {
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);

    const prevTitle = document.title;
    document.title = 'Design system preview';

    return () => {
      meta.remove();
      document.title = prevTitle;
    };
  }, []);

  const colorTokens = useMemo<TokenEntry[]>(() => {
    return Object.entries(tokens.color as Record<string, Record<string, string>>).flatMap(([group, values]) =>
      Object.entries(values).map(([name, value]) => ({
        name: formatTokenName('color', `${group}.${name}`),
        cssVar: `--color-${group}-${name}`,
        value,
        description: `${group} ${name}`,
      })),
    );
  }, []);

  const spacingTokens = useMemo<TokenEntry[]>(() => {
    return Object.entries(tokens.spacing as Record<string, string>).map(([name, value]) => ({
      name: formatTokenName('spacing', name),
      cssVar: `--space-${name}`,
      value,
      description: `Spacing step ${name}`,
    }));
  }, []);

  const typographyTokens = useMemo<TokenEntry[]>(() => {
    const fontSizes = Object.entries(tokens.typography.fontSize as Record<string, string>).map(([name, value]) => ({
      name: formatTokenName('typography.fontSize', name),
      cssVar: `--text-${name}`,
      value,
      description: `Font size ${name}`,
    }));

    const fontWeights = Object.entries(tokens.typography.fontWeight as Record<string, number>).map(([name, value]) => ({
      name: formatTokenName('typography.fontWeight', name),
      cssVar: `--font-${name}`,
      value: String(value),
      description: `Font weight ${name}`,
    }));

    const lineHeights = Object.entries(tokens.typography.lineHeight as Record<string, number>).map(([name, value]) => ({
      name: formatTokenName('typography.lineHeight', name),
      cssVar: `--leading-${name}`,
      value: String(value),
      description: `Line height ${name}`,
    }));

    return [...fontSizes, ...fontWeights, ...lineHeights];
  }, []);

  const componentGallery = useMemo<ComponentCard[]>(() => [
    {
      name: 'Button',
      storyPath: '/?path=/story/design-system-button--default',
      variants: [
        { label: 'Primary', preview: <button className="btn btn-primary" type="button">Primary</button> },
        { label: 'Secondary', preview: <button className="btn btn-secondary" type="button">Secondary</button> },
        { label: 'Ghost', preview: <button className="btn btn-ghost" type="button">Ghost</button> },
      ],
    },
    {
      name: 'Badge',
      storyPath: '/?path=/story/design-system-badge--default',
      variants: [
        { label: 'Success', preview: <span className="badge badge--success">Success</span> },
        { label: 'Warning', preview: <span className="badge badge--warning">Warning</span> },
        { label: 'Error', preview: <span className="badge badge--error">Error</span> },
      ],
    },
    {
      name: 'Card',
      storyPath: '/?path=/story/design-system-card--default',
      variants: [
        { label: 'Default', preview: <div className="card" style={{ maxWidth: 280 }}><div className="card__header">Card header</div><div className="card__body">Body content for the design system preview.</div><div className="card__footer"><button className="btn btn-primary btn-sm" type="button">Action</button></div></div> },
      ],
    },
    {
      name: 'Table',
      storyPath: '/?path=/story/design-system-table--default',
      variants: [
        { label: 'Basic rows', preview: <div className="table-wrap"><table className="table"><thead><tr><th>Label</th><th>Status</th></tr></thead><tbody><tr><td>Alpha</td><td>Open</td></tr><tr><td>Beta</td><td>Assigned</td></tr></tbody></table></div> },
      ],
    },
    {
      name: 'Gauge',
      storyPath: '/?path=/story/design-system-gauge--default',
      variants: [
        { label: 'Progress', preview: <div className="gauge"><div className="gauge__pct">8/15</div><div className="gauge__label">Pending apps</div></div> },
      ],
    },
  ], []);

  async function handleCopy(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      setCopiedToken(token);
      window.setTimeout(() => setCopiedToken((current) => (current === token ? null : current)), 1500);
    } catch {
      setCopiedToken(token);
    }
  }

  return (
    <main className="design-system-page" id="main-content" tabIndex={-1}>
      <header className="design-system-page__hero">
        <div>
          <p className="design-system-page__eyebrow">Developer reference</p>
          <h1 className="design-system-page__title">Design system tokens and component gallery</h1>
          <p className="design-system-page__intro">
            This preview is generated from the shared token source file and is intended as an in-app reference for implementation details.
          </p>
        </div>
        <a className="btn btn-secondary" href="/?preview=1" target="_blank" rel="noreferrer">Open storybook</a>
      </header>

      <section className="design-system-section" aria-labelledby="token-swatches-title">
        <div className="design-system-section__header">
          <h2 id="token-swatches-title">Colors</h2>
          <p>Tap a swatch to copy the token name.</p>
        </div>
        <div className="design-system-grid design-system-grid--tokens">
          {colorTokens.map((token) => (
            <button
              key={token.cssVar}
              type="button"
              className="design-system-token-card"
              onClick={() => handleCopy(token.cssVar)}
              title={`Copy ${token.cssVar}`}
            >
              <span className="design-system-token-card__swatch" style={{ backgroundColor: token.value }} aria-hidden="true" />
              <span className="design-system-token-card__meta">
                <strong>{token.cssVar}</strong>
                <span>{token.value}</span>
                <span>{copiedToken === token.cssVar ? 'Copied' : token.name}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="design-system-section" aria-labelledby="spacing-title">
        <div className="design-system-section__header">
          <h2 id="spacing-title">Spacing scale</h2>
          <p>Visual and token-based references for spacing steps.</p>
        </div>
        <div className="design-system-grid design-system-grid--tokens">
          {spacingTokens.map((token) => (
            <button key={token.cssVar} type="button" className="design-system-token-card" onClick={() => handleCopy(token.cssVar)}>
              <span className="design-system-token-card__swatch design-system-token-card__swatch--spacing" style={{ width: token.value, height: token.value }} aria-hidden="true" />
              <span className="design-system-token-card__meta">
                <strong>{token.cssVar}</strong>
                <span>{token.value}</span>
                <span>{copiedToken === token.cssVar ? 'Copied' : token.name}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="design-system-section" aria-labelledby="typography-title">
        <div className="design-system-section__header">
          <h2 id="typography-title">Typography scale</h2>
          <p>Font-size, font-weight, and line-height references.</p>
        </div>
        <div className="design-system-grid design-system-grid--tokens">
          {typographyTokens.map((token) => (
            <button key={token.cssVar} type="button" className="design-system-token-card" onClick={() => handleCopy(token.cssVar)}>
              <span className="design-system-token-card__swatch design-system-token-card__swatch--typography" aria-hidden="true" style={{ fontSize: token.value, lineHeight: 1.1 }}>
                Aa
              </span>
              <span className="design-system-token-card__meta">
                <strong>{token.cssVar}</strong>
                <span>{token.value}</span>
                <span>{copiedToken === token.cssVar ? 'Copied' : token.name}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="design-system-section" aria-labelledby="component-gallery-title">
        <div className="design-system-section__header">
          <h2 id="component-gallery-title">Component gallery</h2>
          <p>Reference implementations for shared design-system components.</p>
        </div>
        <div className="design-system-grid design-system-grid--components">
          {componentGallery.map((component) => (
            <article key={component.name} className="design-system-component-card">
              <div className="design-system-component-card__header">
                <h3>{component.name}</h3>
                <a href={component.storyPath} target="_blank" rel="noreferrer">Open story</a>
              </div>
              <div className="design-system-component-card__body">
                {component.variants.map((variant) => (
                  <div key={`${component.name}-${variant.label}`} className="design-system-component-card__variant">
                    <span className="design-system-component-card__variant-label">{variant.label}</span>
                    {variant.preview}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
