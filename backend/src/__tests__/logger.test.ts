import pino from "pino";
import { logger, REDACT_PATHS } from "../logger";

describe("Logger Redaction", () => {
  it("defines required redaction paths", () => {
    expect(REDACT_PATHS).toContain("req.headers.authorization");
    expect(REDACT_PATHS).toContain('req.headers["x-api-key"]');
    expect(REDACT_PATHS).toContain("req.headers.cookie");
    expect(REDACT_PATHS).toContain("*.secretKey");
    expect(REDACT_PATHS).toContain("*.privateKey");
    expect(REDACT_PATHS).toContain("*.apiKey");
    expect(REDACT_PATHS).toContain("*.token");
    expect(REDACT_PATHS).toContain("*.email");
    expect(REDACT_PATHS).toContain("*.password");
  });

  it("redacts sensitive fields in logged payloads", () => {
    let output = "";
    const testStream = {
      write: (msg: string) => {
        output += msg;
      },
    };

    const testLogger = pino(
      {
        redact: {
          paths: REDACT_PATHS,
          censor: "[REDACTED]",
        },
      },
      testStream,
    );

    testLogger.info({
      req: {
        headers: {
          authorization: "Bearer secret-token-123",
          "x-api-key": "secret-api-key-456",
          cookie: "sessionId=xyz; secret=abc",
        },
      },
      user: {
        email: "contributor@example.com",
        apiKey: "api-secret-key",
        password: "superSecretPassword123!",
        secretKey: "sec-789",
        privateKey: "priv-012",
        token: "tok-345",
      },
      publicData: "safe-value",
    });

    const parsed = JSON.parse(output);
    expect(parsed.req.headers.authorization).toBe("[REDACTED]");
    expect(parsed.req.headers["x-api-key"]).toBe("[REDACTED]");
    expect(parsed.req.headers.cookie).toBe("[REDACTED]");
    expect(parsed.user.email).toBe("[REDACTED]");
    expect(parsed.user.apiKey).toBe("[REDACTED]");
    expect(parsed.user.password).toBe("[REDACTED]");
    expect(parsed.user.secretKey).toBe("[REDACTED]");
    expect(parsed.user.privateKey).toBe("[REDACTED]");
    expect(parsed.user.token).toBe("[REDACTED]");
    expect(parsed.publicData).toBe("safe-value");
  });
});
