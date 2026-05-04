import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import helmet from "helmet";
import { Express, RequestHandler } from "express";

const spec = swaggerJsdoc({
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Web Accessibility Auditing Tool API",
      version: "0.1.0",
      description:
        "Enqueue and retrieve WCAG/axe-core accessibility audits. Every error " +
        "response follows the same envelope: `{ error: { code, message }, requestId }`. " +
        "The `code` is a stable machine token; `message` is human readable; " +
        "`requestId` (also echoed as the `X-Request-Id` response header) " +
        "correlates HTTP and worker logs for support.",
    },
    servers: [{ url: "/" }],
    components: {
      schemas: {
        ErrorEnvelope: {
          type: "object",
          required: ["error", "requestId"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: {
                  type: "string",
                  description: "Stable machine-readable code.",
                  example: "unsafe_target",
                },
                message: {
                  type: "string",
                  description: "Human-readable message (may equal the code for short codes).",
                  example: "unsafe_target",
                },
              },
            },
            requestId: {
              type: "string",
              description:
                "Correlation id for this request. Also returned in the X-Request-Id header.",
              example: "0b4d2f1e-1a9c-4b2c-9a37-1f5d84e1b3a2",
            },
          },
        },
      },
      responses: {
        BadRequest: {
          description: "Validation failed, unsafe URL, or missing X-Client-Id.",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorEnvelope" },
            },
          },
        },
        NotFound: {
          description: "No audit exists with the supplied publicId.",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorEnvelope" },
            },
          },
        },
        ServerError: {
          description: "Unhandled failure on the server. Retry or contact support with requestId.",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorEnvelope" },
            },
          },
        },
      },
    },
  },
  apis: ["./src/interfaces/http/routes/*.ts", "./dist/interfaces/http/routes/*.js"],
});

// Swagger UI ships inline scripts/styles that the strict default CSP blocks.
// Restrict the relaxed policy to the /docs subtree so the rest of the API
// keeps its hardened headers.
const swaggerCsp: RequestHandler = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "script-src": ["'self'", "'unsafe-inline'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:", "https://validator.swagger.io"],
      "connect-src": ["'self'"],
    },
  },
});

export function mountSwagger(app: Express) {
  app.use("/docs", swaggerCsp, swaggerUi.serve, swaggerUi.setup(spec));
  app.get("/openapi.json", (_req, res) => res.json(spec));
}
