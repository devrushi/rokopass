import { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError, errorHandler, notFoundHandler } from "../src/middleware/errorHandler";

function mockResponse() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe("AppError", () => {
  it("defaults to a 500, operational error", () => {
    const err = new AppError("boom");
    expect(err.statusCode).toBe(500);
    expect(err.isOperational).toBe(true);
    expect(err.message).toBe("boom");
  });

  it("accepts a custom status code", () => {
    const err = new AppError("not found", 404);
    expect(err.statusCode).toBe(404);
  });
});

describe("notFoundHandler", () => {
  it("responds 404 with the requested method and path", () => {
    const req = { method: "GET", originalUrl: "/does-not-exist" } as Request;
    const res = mockResponse();

    notFoundHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: { message: "Route not found: GET /does-not-exist" },
    });
  });
});

describe("errorHandler", () => {
  const req = {} as Request;
  const next = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the AppError status code and message", () => {
    const res = mockResponse();
    vi.spyOn(console, "error").mockImplementation(() => {});

    errorHandler(new AppError("nope", 403), req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ message: "nope" }) }),
    );
  });

  it("falls back to 500 for a plain Error", () => {
    const res = mockResponse();
    vi.spyOn(console, "error").mockImplementation(() => {});

    errorHandler(new Error("unexpected"), req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("logs 5xx errors but not 4xx AppErrors", () => {
    const res = mockResponse();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    errorHandler(new AppError("bad request", 400), req, res, next);
    expect(errorSpy).not.toHaveBeenCalled();

    errorHandler(new Error("server broke"), req, res, next);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
