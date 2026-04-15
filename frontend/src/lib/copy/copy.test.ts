import { copy } from "./index";

describe("copy module", () => {
  it("provides the product name", () => {
    expect(copy.brand.name).toBe("Euthus");
  });

  it("provides pt-BR tagline", () => {
    expect(copy.brand.tagline).toBe("Acessibilidade, vista com clareza.");
  });

  it("humanizes impact by severity", () => {
    expect(copy.severity.critical.humanImpact).toMatch(/impedir|impede/i);
    expect(copy.severity.serious.label).toBe("Séria");
  });
});
