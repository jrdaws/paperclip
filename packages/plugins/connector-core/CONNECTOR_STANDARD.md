# Connector Core Standard

All new Paperclip connectors should start from the connector scaffold and follow this baseline:

1. `pnpm --filter @paperclipai/create-paperclip-plugin exec create-paperclip-plugin --template connector`
2. Use `@paperclipai/plugin-connector-core` for:
   - Signature verification
   - Retry/backoff policy
   - Rate limiting
   - Idempotency and dead-letter state
3. Expose a `dashboard` data key with:
   - `syncLagSeconds`
   - `deadLetterDepth`
   - `retryCount`
4. Add a dashboard widget UI slot in the manifest.
5. Keep secret fields annotated as `format: "secret-ref"` in `instanceConfigSchema`.

Before shipping a connector:

- Run `pnpm --filter @paperclipai/plugin-connector-core contract:test`
- Run the connector package `build` and `typecheck`
- Replay at least one webhook delivery twice and verify idempotent behavior
