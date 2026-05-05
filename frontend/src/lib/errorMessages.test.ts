import { ApiError } from "./api";
import { submitErrorMessage } from "./errorMessages";

describe("submitErrorMessage", () => {
  it.each([
    ["invalid_url", /URL não parece válida/i],
    ["unsafe_protocol", /http:\/\/ ou https:\/\//i],
    ["unresolvable_host", /resolver esse domínio/i],
    ["unsafe_target", /rede privada/i],
    ["invalid_client_id", /identificador de sessão/i],
    ["rate_limited_per_client", /limite de auditorias por hora/i],
    ["internal_server_error", /algo deu errado do nosso lado/i],
  ])("maps backend code %s to a pt-BR message", (code, pattern) => {
    const err = new ApiError(400, { error: { code, message: "ignored" } });
    expect(submitErrorMessage(err)).toMatch(pattern);
  });

  it("falls back to status-based message for express-rate-limit (429 with no envelope code)", () => {
    const err = new ApiError(429);
    expect(submitErrorMessage(err)).toMatch(/muitas requisições/i);
  });

  it("falls back to generic message when ApiError has unknown code and status", () => {
    const err = new ApiError(418, { error: { code: "im_a_teapot" } });
    expect(submitErrorMessage(err)).toMatch(/não foi possível enviar/i);
  });

  it("returns network-specific message for TypeError (fetch failure)", () => {
    expect(submitErrorMessage(new TypeError("Failed to fetch"))).toMatch(/sem conexão/i);
  });

  it("returns generic message for unknown error shapes", () => {
    expect(submitErrorMessage("oops")).toMatch(/não foi possível enviar/i);
    expect(submitErrorMessage(undefined)).toMatch(/não foi possível enviar/i);
    expect(submitErrorMessage({ code: "fake" })).toMatch(/não foi possível enviar/i);
  });
});
