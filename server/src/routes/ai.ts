import { Router } from "express";
import { z } from "zod";
import { getAIProvider } from "../lib/ai/registry.js";
import { asyncHandler } from "../lib/asyncHandler.js";

export const aiRouter = Router();

const ChatRequestSchema = z.object({
  providerId: z.enum(["openai", "codex", "anthropic", "google", "openrouter", "ollama"]),
  messages: z.array(z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string() })).min(1),
  contextText: z.string().optional(),
  contextImage: z.string().optional(),
});

/** Streams the assistant's reply as Server-Sent Events — the first streaming response
 * in this codebase. `asyncHandler` tolerates this fine (see its own doc comment: it
 * only forwards a rejected promise to `next()`, it doesn't assume a single terminal
 * `res.json()`). The wire format (`data: {"delta": "<text>"}\n\n` or `data: {"error":
 * "<message>"}\n\n`, ending in `data: [DONE]\n\n`) is
 * provider-agnostic on purpose — client/src/editor/AIPanel.tsx never needs to know
 * whether `providerId` was "openai" (a stateless HTTPS call) or "codex" (a long-lived
 * per-user subprocess) behind the scenes. */
aiRouter.post(
  "/chat",
  asyncHandler(async (req, res) => {
    const parsed = ChatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
      return;
    }
    const provider = getAIProvider(parsed.data.providerId);
    if (!provider) {
      res.status(400).json({ error: "unknown_provider" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    try {
      for await (const delta of provider.streamChat(req.user!.sub, {
        messages: parsed.data.messages,
        contextText: parsed.data.contextText,
        contextImage: parsed.data.contextImage,
      })) {
        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
      }
    } catch (err) {
      res.write(`data: ${JSON.stringify({ error: (err as Error).message })}\n\n`);
    } finally {
      res.write("data: [DONE]\n\n");
      res.end();
    }
  })
);
