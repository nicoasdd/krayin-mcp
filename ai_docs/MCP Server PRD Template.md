### Product Requirements Document – **MCP “CRM Leads” Server**

---

#### 1 · Overview

Build an **MCP server** (TypeScript) that lets any LLM-agent create new _Leads_ in our CRM by calling the REST API described in `swagger.json`. The server will:

1. Obtain an **access token** via `POST /api/v1/login`.
2. Expose an MCP **Tool** called `createLead`. When invoked, it will call `POST /api/v1/leads` with the user-supplied payload and the bearer token.
3. Return the CRM response (or a structured error) to the caller.

The server will be based on the **MCP TypeScript template**, which already includes production-grade logging, error handling, security utilities, and both `stdio` & `http` transports .

---

#### 2 · Goals & Success Metrics

| Goal                                           | Success Metric                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| Enable agents to create CRM leads autonomously | >95 % of valid lead-creation attempts succeed end-to-end in staging |
| Easy integration for new agent workflows       | ≤1 JSON argument object needed in a tool call                       |
| Secure handling of credentials & PII           | Zero incidents of leaked tokens / PII                               |

---

#### 3 · User Personas

- **LLM Agent** – an automated planning agent that calls MCP tools.
- **Sales Ops Engineer** – deploys & maintains the MCP server.
- **Product Analyst** – monitors lead-creation funnel analytics.

---

#### 4 · Scope

| In-Scope                                 | Out-of-Scope                                          |
| ---------------------------------------- | ----------------------------------------------------- |
| Login + lead-creation flow               | All other CRM endpoints (update, delete, email, etc.) |
| Server transports: `stdio`, `http (SSE)` | Web UI for humans                                     |
| Observability (JSON logs, basic metrics) | Advanced BI dashboards                                |

---

#### 5 · Functional Requirements

| #   | Requirement                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-1 | **Authenticate** using env vars `CRM_EMAIL`, `CRM_PASSWORD`, `DEVICE_NAME` (default `mcp-server`). Send multipart form-data to `POST /api/v1/login`; parse `data.token` from 200-OK response ([OpenAI Cookbook][1]). |
| F-2 | Cache token in memory; refresh automatically on 401.                                                                                                                                                                 |
| F-3 | Expose MCP **Tool** `createLead(input)` with JSON schema mirroring required body fields in Swagger (see below).                                                                                                      |
| F-4 | Send JSON payload to `POST /api/v1/leads` with `Authorization: Bearer <token>`; forward CRM 200 response (message “Lead Created Successfully.” and `data` object) to caller .                                        |
| F-5 | Return structured errors for non-2xx responses; include `status`, `crm_message`, `request_id`.                                                                                                                       |
| F-6 | Respect rate limit: max 5 lead creations / sec (configurable).                                                                                                                                                       |

##### 5.1 createLead Schema (minimum fields)

```ts
{
  title: string;                // e.g. "Inbound call"
  description: string;          // free text
  lead_value: string;           // numeric-string
  lead_source_id: 1|2|3|4|5;    // see Swagger enum
  lead_type_id: 1|2;
  person: {
    name: string;
    emails?: {value:string,label:string}[];
    contact_numbers?: {value:string,label:string}[];
  }
  /* optional extras: expected_close_date, products, etc. */
}
```

---

#### 6 · Non-Functional Requirements

| Category      | Requirement                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------- |
| Security      | Store credentials only in env; never log secrets; HTTPS when `http` transport enabled.             |
| Availability  | P99 tool-call latency < 800 ms; graceful retry on transient 5xx.                                   |
| Logging       | Structured JSON; redact PII by default.                                                            |
| Observability | Expose `/healthz` for HTTP; emit Prometheus metrics (`token_refresh_total`, `lead_created_total`). |
| Extensibility | Codebase follows template’s directory conventions for new tools / resources.                       |
| Compliance    | GDPR-aligned: delete logs >90 days.                                                                |

---

#### 7 · Prompt-Engineering Reminders (for agents)

Include the three **GPT-4.1 agentic guidelines** in the MCP server’s default _System Prompt_ so any upstream orchestrator inherits them:

1. **Persistence** – “Keep going until the user’s query is completely resolved.”
2. **Tool-calling** – “If unsure, use your tools rather than guessing.”
3. **Planning** – “Plan extensively before each tool call and reflect after.”&#x20;

---

#### 8 · Milestones

| Date   | Deliverable                                                  |
| ------ | ------------------------------------------------------------ |
| May 28 | Skeleton server running, `.env.example` documented           |
| May 30 | Successful token fetch & happy-path lead creation in staging |
| Jun 03 | Error handling, retries, metrics                             |
| Jun 05 | Security review & prod deploy                                |

---

#### 9 · Open Questions

1. What CRM **rate limits** apply to `/api/v1/leads`?
2. Should we write leads **asynchronously** (queue + worker) for higher throughput?
3. Required mapping for `lead_source_id` ↔ internal enums?

---

#### 10 · Appendix

- **Key environment variables**

  | Var                  | Example           | Notes            |
  | -------------------- | ----------------- | ---------------- |
  | `CRM_EMAIL`          | `bot@example.com` | service account  |
  | `CRM_PASSWORD`       | `••••••`          |                  |
  | `DEVICE_NAME`        | `mcp-server`      | login payload    |
  | `MCP_TRANSPORT_TYPE` | `stdio` / `http`  | template default |

- **Sample cURL – Login**

```bash
curl -X POST https://crm.bkelogistics.com/api/v1/login \
  -F email=$CRM_EMAIL -F password=$CRM_PASSWORD -F device_name=${DEVICE_NAME:-mcp-server}
```

- **Sample cURL – Create Lead**

```bash
curl -X POST https://crm.bkelogistics.com/api/v1/leads \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Inbound call", ... }'
```

---

This structure aligns the document with OpenAI’s latest prompting guidance while grounding every requirement in the provided template and API specifications.

[1]: https://cookbook.openai.com/examples/gpt4-1_prompting_guide "GPT-4.1 Prompting Guide | OpenAI Cookbook"
