import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    rpc: async () => ({ data: [{ reportes: 3, total: 10 }] }),
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));

import { CampaignProgress } from "../components/CampaignProgress";

describe("CampaignProgress", () => {
  it("muestra el conteo X / Y", async () => {
    render(<CampaignProgress campaignId="c1" active={false} />);
    await waitFor(() => {
      expect(screen.getByText(/3 \/ 10 ya reportaron/)).toBeDefined();
    });
  });
});
