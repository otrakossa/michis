import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatusPill } from "../components/StatusPill";
import { EmptyState } from "../components/EmptyState";
import { MiniMarkdown } from "../components/MiniMarkdown";

describe("port de Lovable", () => {
  it("StatusPill muestra la etiqueta humana del estado", () => {
    render(<StatusPill mapa="caso" estado="needs_review" />);
    expect(screen.getByText("esperando tu revisión")).toBeDefined();
  });
  it("EmptyState renderiza emoji, título, texto", () => {
    render(<EmptyState emoji="🐱" titulo="Nada aún" texto="¿viste algo raro?" />);
    expect(screen.getByText("Nada aún")).toBeDefined();
    expect(screen.getByText("¿viste algo raro?")).toBeDefined();
  });
  it("MiniMarkdown renderiza headings, listas y bold", () => {
    render(<MiniMarkdown text={"## Título\n- punto **fuerte**"} />);
    expect(screen.getByText("Título")).toBeDefined();
    expect(screen.getByText("fuerte")).toBeDefined();
  });
});
