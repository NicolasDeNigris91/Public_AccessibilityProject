import { ApiError } from "./api";

// Stable codes the backend returns in the error envelope. Keeping the
// catalogue in one place means a typo in pt-BR copy doesn't ship without
// a test asking for it. Unknown codes fall back to a generic message.
type KnownCode =
  | "invalid_url"
  | "unsafe_protocol"
  | "unresolvable_host"
  | "unsafe_target"
  | "invalid_client_id"
  | "rate_limited_per_client"
  | "internal_server_error";

const MESSAGES: Record<KnownCode, string> = {
  invalid_url: "Essa URL não parece válida. Confira o endereço e tente de novo.",
  unsafe_protocol: "Só auditamos endereços que começam com http:// ou https://.",
  unresolvable_host: "Não conseguimos resolver esse domínio. Confira se o site está no ar.",
  unsafe_target: "Essa URL aponta para uma rede privada e não pode ser auditada.",
  invalid_client_id:
    "Seu identificador de sessão ficou inválido. Recarregue a página e tente de novo.",
  rate_limited_per_client:
    "Você atingiu o limite de auditorias por hora. Tente de novo mais tarde.",
  internal_server_error:
    "Algo deu errado do nosso lado. Tente de novo em instantes; se persistir, é uma falha temporária.",
};

const FALLBACK_BY_STATUS: Record<number, string> = {
  // Express-rate-limit (per-IP) returns a default body that doesn't go
  // through our error envelope, so we map by status as a fallback.
  429: "Muitas requisições em pouco tempo. Espere alguns segundos e tente de novo.",
  // Network / offline failures arrive as TypeError / fetch failures, not
  // ApiError. The form treats those separately (see networkErrorMessage).
};

const GENERIC = "Não foi possível enviar a auditoria. Tente de novo em instantes.";

/**
 * Map a thrown error from a submit attempt to a human pt-BR message.
 * Accepts ApiError (backend envelope) or unknown (network / programmer
 * error). Always returns a non-empty string so the form can render it.
 */
export function submitErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code && err.code in MESSAGES) {
      return MESSAGES[err.code as KnownCode];
    }
    if (err.status in FALLBACK_BY_STATUS) {
      const message = FALLBACK_BY_STATUS[err.status];
      if (message) return message;
    }
    return GENERIC;
  }
  if (err instanceof TypeError) {
    // fetch() throws TypeError on network failure / CORS / DNS.
    return "Sem conexão com o servidor. Confira sua internet e tente de novo.";
  }
  return GENERIC;
}
