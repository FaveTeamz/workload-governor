import type { Meta, StoryObj } from "@storybook/react";
import { MemoryRouter } from "react-router-dom";
import { OrgSelector } from "../components/OrgSelector";
import type { Org } from "../components/OrgSelector";

const SAMPLE_ORGS: Org[] = [
  { id: "stellar-org",   name: "stellar-org",   activeIssueCount: 12 },
  { id: "meridian-dao",  name: "meridian-dao",  activeIssueCount: 4  },
  { id: "soroban-labs",  name: "soroban-labs",  activeIssueCount: 7  },
  { id: "fave-teamz",    name: "FaveTeamz",     activeIssueCount: 3  },
  { id: "open-source-1", name: "open-source-1", activeIssueCount: 0  },
];

const meta: Meta<typeof OrgSelector> = {
  title: "Components/OrgSelector",
  component: OrgSelector,
  decorators: [(Story) => <MemoryRouter><Story /></MemoryRouter>],
  parameters: {
    docs: {
      description: {
        component:
          "Searchable, keyboard-navigable org selector. Updates ?org= URL param on selection.",
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof OrgSelector>;

export const Default: Story = {
  args: { orgs: SAMPLE_ORGS },
};

export const Empty: Story = {
  args: { orgs: [] },
};

export const WithSelection: Story = {
  args: {
    orgs: SAMPLE_ORGS,
    onSelect: (id) => console.log("Selected:", id),
  },
};
