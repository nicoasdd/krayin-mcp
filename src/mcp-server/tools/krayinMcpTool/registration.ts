import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
    CreateLeadInputSchema,
    CreateLeadInput,
    createLeadInKrayin,
    GetLeadsInputSchema,
    GetLeadsInput,
    getLeadsFromKrayin,
} from "./logic.js";
import {
    ErrorHandler,
    logger,
    requestContextService,
} from "../../../utils/index.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import { RateLimiter } from "../../../utils/security/rateLimiter.js";

const rateLimiter = new RateLimiter({ maxRequests: 5, windowMs: 1000 }); // 5 requests per 1000ms

export const registerKrayinMcpTool = async (
    server: McpServer,
): Promise<void> => {
    const toolName = "createLead";
    const toolDescription = "Creates a new lead in the Krayin CRM.";

    server.tool(
        toolName,
        toolDescription,
        CreateLeadInputSchema.shape,
        async (params: CreateLeadInput): Promise<CallToolResult> => {
            const context = requestContextService.createRequestContext({
                operation: "HandleToolRequest",
                toolName,
                inputSummary: {
                    title: params.title,
                    lead_source_id: params.lead_source_id,
                },
            });
            logger.debug(`Handling '${toolName}' tool request.`, context);
            return await ErrorHandler.tryCatch(
                async () => {
                    const result = await createLeadInKrayin(params);
                    if (result.success) {
                        logger.info("Lead created successfully in Krayin CRM", context);
                        return {
                            isError: false,
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(result.data, null, 2),
                                },
                            ],
                        };
                    } else {
                        logger.error("Failed to create lead in Krayin CRM", {
                            ...context,
                            error: result.error,
                        });
                        return {
                            isError: true,
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(result.error),
                                },
                            ],
                        };
                    }
                },
                {
                    operation: `ExecutingCoreLogicFor_${toolName}`,
                    context,
                    input: params,
                    errorMapper: (error: unknown): McpError => {
                        const baseErrorCode =
                            error instanceof McpError
                                ? error.code
                                : BaseErrorCode.INTERNAL_ERROR;
                        const errorMessage = `Error processing '${toolName}' tool: ${error instanceof Error ? error.message : "An unknown error occurred"}`;
                        return new McpError(baseErrorCode, errorMessage, {
                            ...context,
                            originalErrorName:
                                error instanceof Error ? error.name : typeof error,
                        });
                    },
                },
            );
        },
    );

    // Register getLeads tool
    server.tool(
        "getLeads",
        "Gets a list of leads from the Krayin CRM.",
        GetLeadsInputSchema.shape,
        async (params: GetLeadsInput): Promise<CallToolResult> => {
            const context = requestContextService.createRequestContext({
                operation: "HandleToolRequest",
                toolName: "getLeads",
                inputSummary: params,
            });
            logger.debug(`Handling 'getLeads' tool request.`, context);
            return await ErrorHandler.tryCatch(
                async () => {
                    const result = await getLeadsFromKrayin(params);
                    if (result.success) {
                        logger.info("Leads fetched successfully from Krayin CRM", context);
                        return {
                            isError: false,
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(result.data, null, 2),
                                },
                            ],
                        };
                    } else {
                        logger.error("Failed to fetch leads from Krayin CRM", {
                            ...context,
                            error: result.error,
                        });
                        return {
                            isError: true,
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(result.error),
                                },
                            ],
                        };
                    }
                },
                {
                    operation: `ExecutingCoreLogicFor_getLeads`,
                    context,
                    input: params,
                    errorMapper: (error: unknown): McpError => {
                        const baseErrorCode =
                            error instanceof McpError
                                ? error.code
                                : BaseErrorCode.INTERNAL_ERROR;
                        const errorMessage = `Error processing 'getLeads' tool: ${error instanceof Error ? error.message : "An unknown error occurred"}`;
                        return new McpError(baseErrorCode, errorMessage, {
                            ...context,
                            originalErrorName:
                                error instanceof Error ? error.name : typeof error,
                        });
                    },
                },
            );
        },
    );
    // TODO: Register additional Krayin CRM methods as needed
};
