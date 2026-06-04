import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// El form solo toca supabase DESPUÉS de validar; para el caso inválido basta un mock vacío.
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import CasoNuevoPage from "../app/(app)/casos/nuevo/page";

describe("formulario de nuevo caso", () => {
  it("muestra error de validación con handle inválido y no envía", async () => {
    render(<CasoNuevoPage />);
    fireEvent.change(screen.getByPlaceholderText("@handle"), {
      target: { value: "handle con espacios" },
    });
    fireEvent.click(screen.getByText("Crear caso"));
    await waitFor(() => {
      expect(screen.getByText(/Handle inválido/)).toBeDefined();
    });
  });
});
