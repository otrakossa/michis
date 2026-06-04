import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { RoleGate } from "../components/RoleGate";

describe("RoleGate", () => {
  it("muestra el contenido cuando el rol coincide", () => {
    render(<RoleGate role="admin" allow={["admin"]}>secreto</RoleGate>);
    expect(screen.getByText("secreto")).toBeDefined();
  });

  it("oculta el contenido cuando el rol no está permitido", () => {
    render(<RoleGate role="activista" allow={["admin"]}>secreto</RoleGate>);
    expect(screen.queryByText("secreto")).toBeNull();
  });
});
