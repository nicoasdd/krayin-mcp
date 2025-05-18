import { z } from "zod";
import { config } from "../../../config/index.js";
import fetch, { Response } from "node-fetch";
import { logger } from "../../../utils/index.js";

// Placeholder: Zod schema for createLead input (to be expanded)
export const CreateLeadInputSchema = z.object({
    title: z.string(),
    description: z.string(),
    lead_value: z.string(),
    lead_source_id: z.union([z.enum(["1", "2", "3", "4", "5"]), z.number()]),
    lead_type_id: z.union([z.enum(["1", "2"]), z.number()]),
    person: z.object({
        name: z.string(),
        emails: z
            .array(z.object({ value: z.string(), label: z.string() }))
            .optional(),
        contact_numbers: z
            .array(z.object({ value: z.string(), label: z.string() }))
            .optional(),
    }),
    expected_close_date: z.string().optional(),
    products: z.record(z.string(), z.any()).optional(),
    entity_type: z.string().optional(),
});

export type CreateLeadInput = z.infer<typeof CreateLeadInputSchema>;

const CRM_BASE_URL = "https://crm.bkelogistics.com";

class KrayinAuthManager {
    private token: string | null = null;
    private tokenExpiresAt: number | null = null;
    private refreshing: Promise<string> | null = null;

    async getToken(forceRefresh = false): Promise<string> {
        if (this.token && !forceRefresh) {
            return this.token;
        }
        if (this.refreshing) {
            return this.refreshing;
        }
        this.refreshing = this.login();
        try {
            const token = await this.refreshing;
            this.token = token;
            this.refreshing = null;
            return token;
        } catch (err) {
            this.refreshing = null;
            throw err;
        }
    }

    private async login(): Promise<string> {
        const form = new URLSearchParams();
        form.append("email", config.crmEmail || "");
        form.append("password", config.crmPassword || "");
        form.append("device_name", config.deviceName || "mcp-server");
        const url = `${CRM_BASE_URL}/api/v1/login`;
        let res: Response;
        try {
            res = await fetch(url, {
                method: "POST",
                body: form,
            });
        } catch (err) {
            logger.error(
                "Krayin CRM login network error: " +
                (err instanceof Error ? err.message : String(err)),
            );
            throw new Error("Failed to connect to CRM login endpoint");
        }
        if (!res.ok) {
            logger.error("Krayin CRM login failed: status " + res.status);
            throw new Error(`CRM login failed with status ${res.status}`);
        }
        const data = await res.json();
        if (!data?.token) {
            logger.error("Krayin CRM login: token missing in response");
            throw new Error("CRM login did not return a token");
        }
        return data.token;
    }

    async invalidateToken() {
        this.token = null;
    }
}

export const krayinAuthManager = new KrayinAuthManager();

// TODO: Implement logic for authentication, token caching, and lead creation

export async function createLeadInKrayin(
    payload: CreateLeadInput,
): Promise<{ success: boolean; data?: any; error?: any }> {
    let token = await krayinAuthManager.getToken();
    let res: Response;
    try {
        res = await fetch(`${CRM_BASE_URL}/api/v1/leads`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });
    } catch (err) {
        logger.error(
            "Krayin CRM createLead network error: " +
            (err instanceof Error ? err.message : String(err)),
        );
        return {
            success: false,
            error: { status: 0, crm_message: "Network error", request_id: null },
        };
    }
    if (res.status === 401) {
        // Token expired or invalid, try refresh once
        await krayinAuthManager.invalidateToken();
        token = await krayinAuthManager.getToken(true);
        try {
            res = await fetch(`${CRM_BASE_URL}/api/v1/leads`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });
        } catch (err) {
            logger.error(
                "Krayin CRM createLead network error after refresh: " +
                (err instanceof Error ? err.message : String(err)),
            );
            return {
                success: false,
                error: {
                    status: 0,
                    crm_message: "Network error after refresh",
                    request_id: null,
                },
            };
        }
    }
    if (res.ok) {
        const data = await res.json();
        return { success: true, data };
    } else {
        let crm_message = "Unknown error";
        let request_id = res.headers.get("x-request-id") || null;
        try {
            const errData = await res.json();
            crm_message = errData?.message || crm_message;
        } catch { }
        return {
            success: false,
            error: { status: res.status, crm_message, request_id },
        };
    }
}

export const GetLeadsInputSchema = z.object({
    sort: z.string().optional(),
    order: z.enum(["asc", "desc"]).optional(),
    page: z.number().optional(),
    limit: z.number().optional(),
});

export type GetLeadsInput = z.infer<typeof GetLeadsInputSchema>;

export async function getLeadsFromKrayin(params: GetLeadsInput): Promise<{ success: boolean; data?: any; error?: any }> {
    let token = await krayinAuthManager.getToken();
    const url = new URL(`${CRM_BASE_URL}/api/v1/leads`);
    if (params.sort) url.searchParams.append("sort", params.sort);
    if (params.order) url.searchParams.append("order", params.order);
    if (params.page !== undefined) url.searchParams.append("page", params.page.toString());
    if (params.limit !== undefined) url.searchParams.append("limit", params.limit.toString());
    let res: Response;
    try {
        res = await fetch(url.toString(), {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
        });
    } catch (err) {
        logger.error(
            "Krayin CRM getLeads network error: " +
            (err instanceof Error ? err.message : String(err)),
        );
        return {
            success: false,
            error: { status: 0, crm_message: "Network error", request_id: null },
        };
    }
    if (res.status === 401) {
        await krayinAuthManager.invalidateToken();
        token = await krayinAuthManager.getToken(true);
        try {
            res = await fetch(url.toString(), {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
            });
        } catch (err) {
            logger.error(
                "Krayin CRM getLeads network error after refresh: " +
                (err instanceof Error ? err.message : String(err)),
            );
            return {
                success: false,
                error: {
                    status: 0,
                    crm_message: "Network error after refresh",
                    request_id: null,
                },
            };
        }
    }
    if (res.ok) {
        const data = await res.json();
        return { success: true, data };
    } else {
        let crm_message = "Unknown error";
        let request_id = res.headers.get("x-request-id") || null;
        try {
            const errData = await res.json();
            crm_message = errData?.message || crm_message;
        } catch { }
        return {
            success: false,
            error: { status: res.status, crm_message, request_id },
        };
    }
}

// TODO: Add more filtering/query options for getLeads as needed

// TODO: Add more Krayin CRM methods here as needed
