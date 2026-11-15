import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { WindLogo } from "./WindLogo";

describe("WindLogo", () => {
  it("mounts the animated variant (the class the idle animation uses)", () => {
    const { container } = render(<WindLogo />);
    expect(container.querySelector("svg.wind-logo.anim")).not.toBeNull();
  });

  it("drives the idle sway: the flame transform changes per frame", () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => { frames.push(cb); return frames.length; });
    const { container } = render(<WindLogo />);
    const flame = () =>
      container.querySelector('[data-part="flame"]')
        ?.getAttribute("transform");
    // run a few frames and compare: idle animation must move the mark
    frames.shift()?.(0);
    const first = flame();
    frames.shift()?.(500);
    frames.shift()?.(900);
    expect(first).toBeTruthy();
    expect(flame()).not.toBe(first);
  });

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
