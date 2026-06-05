import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { VerdictView } from "../components/VerdictView";

describe("VerdictView", () => {
  it("muestra score, confianza y señales", () => {
    render(
      <VerdictView
        verdict={{
          score: 85, confianza: "alta",
          senales: [{ tipo: "actividad_24_7", descripcion: "postea sin dormir", peso: 4 }],
          cuentas_vinculadas: [{ handle: "otra", relacion: "mismo_texto", razon: "copypasta" }],
          modo_degradado: true,
        }}
      />,
    );
    expect(screen.getByText("85")).toBeDefined();
    expect(screen.getByText(/alta/)).toBeDefined();
    expect(screen.getByText(/postea sin dormir/)).toBeDefined();
    expect(screen.getByText(/@otra/)).toBeDefined();
    expect(screen.getByText(/modo degradado/i)).toBeDefined();
  });

  it("sin veredicto del agente muestra placeholder", () => {
    render(<VerdictView verdict={{ stub: true, summary: "Pendiente" }} />);
    expect(screen.getByText(/Sin veredicto del agente/)).toBeDefined();
  });
});
