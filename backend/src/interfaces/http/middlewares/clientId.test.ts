import type { Request, Response, NextFunction } from "express";
import { requireClientId } from "./clientId";
import { AppError } from "./errorHandler";

function makeReq(headers: Record<string, string | undefined>): Request {
  return {
    header(name: string) {
      return headers[name.toLowerCase()];
    },
  } as unknown as Request;
}

describe("requireClientId", () => {
  const res = {} as Response;

  it("assigns req.clientId and calls next with no error when a valid UUID header is present", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const req = makeReq({ "x-client-id": id });
    const next = jest.fn() as unknown as NextFunction;

    requireClientId(req, res, next);

    expect((req as Request & { clientId?: string }).clientId).toBe(id);
    expect(next).toHaveBeenCalledWith();
  });

  it("throws AppError(400) when the header is missing", () => {
    const req = makeReq({});
    const next = jest.fn();
    expect(() => requireClientId(req, res, next as NextFunction)).toThrow(AppError);
    expect(() => requireClientId(req, res, next as NextFunction)).toThrow(
      "invalid_client_id"
    );
  });

  it("throws AppError(400) when the header is not a valid UUID", () => {
    const req = makeReq({ "x-client-id": "not-a-uuid" });
    const next = jest.fn();
    expect(() => requireClientId(req, res, next as NextFunction)).toThrow(AppError);
  });
});
