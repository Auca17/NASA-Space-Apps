import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WindLogo } from "./WindLogo";

describe("WindLogo", () => {
  it("renders an accessible image with the flame and the leaf", () => {
    const { container } = render(<WindLogo size={40} title="Ashfield" />);
    const img = screen.getByRole("img", { name: "Ashfield" });
    expect(img).toHaveAttribute("width", "40");
    expect(container.querySelector('[data-part="flame"]')).not.toBeNull();
    expect(container.querySelector('[data-part="leaf"]')).not.toBeNull();
  });

  it("gives each instance its own heat gradient", () => {
    const { container } = render(<><WindLogo /><WindLogo /></>);
    const ids = [...container.querySelectorAll("linearGradient")].map((g) => g.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("cleans up without errors on unmount", () => {
    const { unmount } = render(<WindLogo />);
    expect(() => unmount()).not.toThrow();
  });
});
