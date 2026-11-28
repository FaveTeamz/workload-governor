import type { Meta, StoryObj } from "@storybook/react-vite";
import { NavBar } from "../components/NavBar";
import { LanguageSelector } from "../components/LanguageSelector";
import "../components/navbar.css";

interface LocalePreviewProps {
  /** Locale used to format the example date and number. */
  locale: "en-US" | "es" | "fr" | "pt-BR";
}

function LocalePreview({ locale }: LocalePreviewProps) {
  const sampleDate = new Date("2026-08-28T00:00:00Z");
  return (
    <>
      <NavBar
        walletAddress="GBZX4364PEPQTDICMIQDZ56K4T75QZCR4NBEYKO6PDRJAHZKGUOJPCXB"
        onConnect={async () => {}}
        onDisconnect={() => {}}
      />
      <dl>
        <dt>Date</dt>
        <dd>{new Intl.DateTimeFormat(locale, { dateStyle: "short", timeZone: "UTC" }).format(sampleDate)}</dd>
        <dt>Number</dt>
        <dd>{new Intl.NumberFormat(locale).format(1234567.89)}</dd>
      </dl>
      <LanguageSelector />
    </>
  );
}

const meta = {
  title: "i18n/Locale Demo",
  component: LocalePreview,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof LocalePreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EnglishUS: Story = { args: { locale: "en-US" } };
export const Spanish: Story = { args: { locale: "es" } };
export const French: Story = { args: { locale: "fr" } };
export const PortugueseBrazil: Story = { args: { locale: "pt-BR" } };
