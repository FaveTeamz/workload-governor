import { SorobanRpc } from "@stellar/stellar-sdk";
import type { Request, Response } from "express";
import { Histogram, register } from "prom-client";
import { constantTimeCompare } from "./apiKeyAuth.js";
import logger from "./logger.js";

export const sorobanRpcDurationSeconds = new Histogram({
  name: "soroban_rpc_duration_seconds",
  help: "Duration of Soroban RPC calls in seconds",
  labelNames: ["method", "status", "endpoint"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// Instrument the SDK transport so the labels reflect the JSON-RPC request
// and actual HTTP response, including requests made by scheduled jobs.
const rpcInterceptors = SorobanRpc?.AxiosClient?.interceptors;
const rpcTimers = new WeakMap<object, ReturnType<typeof sorobanRpcDurationSeconds.startTimer>>();

rpcInterceptors?.request.use((config) => {
  const { data, url } = config;
  if (data?.jsonrpc === "2.0" && typeof data.method === "string" && url && URL.canParse(url)) {
    const endpoint = new URL(url).hostname;
    const end = sorobanRpcDurationSeconds.startTimer({ method: data.method, endpoint });
    rpcTimers.set(config, end);
  }
  return config;
});

rpcInterceptors?.response.use(
  (response) => {
    rpcTimers.get(response.config)?.({
      status: response.data?.error != null ? "error" : String(response.status),
    });
    return response;
  },
  (error: { config?: object; response?: { status: number } }) => {
    if (error?.config) {
      rpcTimers.get(error.config)?.({
        status: error.response ? String(error.response.status) : "error",
      });
    }
    throw error;
  },
);

export async function metricsHandler(req: Request, res: Response): Promise<void> {
  const token = process.env.METRICS_TOKEN;
  if (token && !constantTimeCompare(req.get("Authorization") ?? "", `Bearer ${token}`)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    res.type(register.contentType).send(await register.metrics());
  } catch (err) {
    logger.error({ err }, "Failed to generate metrics");
    res.status(500).json({ error: "Failed to generate metrics" });
  }
}
