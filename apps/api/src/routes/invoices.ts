import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { zValidator } from "@hono/zod-validator";
import { eq, and, desc, gte, lte, sum } from "drizzle-orm";
import { db, schema } from "@restai/db";
import { createInvoiceSchema, idParamSchema } from "@restai/validators";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware, requireBranch } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/rbac.js";

const invoices = new Hono<AppEnv>();

invoices.use("*", authMiddleware);
invoices.use("*", tenantMiddleware);
invoices.use("*", requireBranch);

// POST / - Create invoice
invoices.post(
  "/",
  requirePermission("invoices:create"),
  zValidator("json", createInvoiceSchema),
  async (c) => {
    const body = c.req.valid("json");
    const tenant = c.get("tenant") as any;

    // Validate document number based on type
    const docNumber = body.customerDocNumber;
    const docType = body.customerDocType;

    if (docType === "dni" && (docNumber.length !== 8 || !/^\d{8}$/.test(docNumber))) {
      return c.json(
        { success: false, error: { code: "BAD_REQUEST", message: "DNI debe ser 8 digitos" } },
        400,
      );
    }
    if (docType === "ruc") {
      if (docNumber.length !== 11 || !/^\d{11}$/.test(docNumber)) {
        return c.json(
          { success: false, error: { code: "BAD_REQUEST", message: "RUC debe ser 11 digitos" } },
          400,
        );
      }
      if (!docNumber.startsWith("10") && !docNumber.startsWith("20")) {
        return c.json(
          { success: false, error: { code: "BAD_REQUEST", message: "RUC debe empezar con 10 o 20" } },
          400,
        );
      }
    }
    if (docType === "ce" && (docNumber.length < 9 || docNumber.length > 12)) {
      return c.json(
        { success: false, error: { code: "BAD_REQUEST", message: "CE debe tener entre 9 y 12 caracteres" } },
        400,
      );
    }

    // Factura requires RUC
    if (body.type === "factura" && docType !== "ruc") {
      return c.json(
        { success: false, error: { code: "BAD_REQUEST", message: "Factura requiere RUC" } },
        400,
      );
    }

    // Get order (scoped to tenant: org + branch)
    const [order] = await db
      .select()
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.id, body.orderId),
          eq(schema.orders.organization_id, tenant.organizationId),
          eq(schema.orders.branch_id, tenant.branchId),
        ),
      )
      .limit(1);

    if (!order) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Orden no encontrada" } },
        404,
      );
    }

    // The order must be fully paid before a fiscal document can be issued.
    const [paid] = await db
      .select({ total_paid: sum(schema.payments.amount) })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.order_id, body.orderId),
          eq(schema.payments.status, "completed"),
        ),
      );

    const totalPaid = Number(paid?.total_paid || 0);
    if (totalPaid < order.total) {
      return c.json(
        {
          success: false,
          error: {
            code: "ORDER_NOT_PAID",
            message: "La orden debe estar totalmente pagada antes de emitir el comprobante",
          },
        },
        409,
      );
    }

    // Enforce one invoice per order.
    const [existingInvoice] = await db
      .select({ id: schema.invoices.id })
      .from(schema.invoices)
      .where(eq(schema.invoices.order_id, body.orderId))
      .limit(1);

    if (existingInvoice) {
      return c.json(
        {
          success: false,
          error: { code: "INVOICE_EXISTS", message: "La orden ya tiene un comprobante emitido" },
        },
        409,
      );
    }

    const prefix = body.type === "boleta" ? "B001" : "F001";

    // Fiscal amounts come straight from the order's stored integer-cent fields:
    // taxable base = subtotal - discount, IGV = order.tax, total includes delivery fee.
    const subtotal = order.subtotal - order.discount;
    const igv = order.tax;
    const total = order.total;

    // Concurrent inserts cannot be fully serialized by SELECT max ... FOR UPDATE
    // (the first row has nothing to lock), so retry on the unique-violation of
    // uq_invoices_branch_series_number and recompute the next number until we win.
    const MAX_RETRIES = 5;
    let invoice: typeof schema.invoices.$inferSelect | undefined;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        invoice = await db.transaction(async (tx) => {
          const lastInvoice = await tx
            .select({ number: schema.invoices.number })
            .from(schema.invoices)
            .where(
              and(
                eq(schema.invoices.branch_id, tenant.branchId),
                eq(schema.invoices.series, prefix),
              ),
            )
            .orderBy(desc(schema.invoices.number))
            .limit(1)
            .for("update");

          const nextNumber = (lastInvoice[0]?.number || 0) + 1;

          const [created] = await tx
            .insert(schema.invoices)
            .values({
              order_id: body.orderId,
              organization_id: tenant.organizationId,
              branch_id: tenant.branchId,
              type: body.type,
              series: prefix,
              number: nextNumber,
              customer_name: body.customerName,
              customer_doc_type: body.customerDocType,
              customer_doc_number: body.customerDocNumber,
              subtotal,
              igv,
              total,
              sunat_status: "pending",
            })
            .returning();

          return created;
        });
        break;
      } catch (err: any) {
        // 23505 = unique_violation. If it's the (branch, series, number) clash,
        // another concurrent insert took our number — recompute and retry.
        const code = err?.code ?? err?.cause?.code;
        if (code === "23505" && attempt < MAX_RETRIES - 1) {
          continue;
        }
        throw err;
      }
    }

    if (!invoice) {
      return c.json(
        {
          success: false,
          error: { code: "CONFLICT", message: "No se pudo generar el número de comprobante, intente nuevamente" },
        },
        409,
      );
    }

    return c.json({ success: true, data: invoice }, 201);
  },
);

// GET / - List invoices with optional filters
invoices.get("/", requirePermission("invoices:read"), async (c) => {
  const tenant = c.get("tenant") as any;
  const type = c.req.query("type");
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");

  const conditions: any[] = [
    eq(schema.invoices.branch_id, tenant.branchId),
    eq(schema.invoices.organization_id, tenant.organizationId),
  ];

  if (type) {
    conditions.push(eq(schema.invoices.type, type as any));
  }
  if (startDate) {
    conditions.push(gte(schema.invoices.created_at, new Date(startDate)));
  }
  if (endDate) {
    conditions.push(lte(schema.invoices.created_at, new Date(endDate)));
  }

  const result = await db
    .select()
    .from(schema.invoices)
    .where(and(...conditions))
    .orderBy(desc(schema.invoices.created_at))
    .limit(100);

  return c.json({ success: true, data: result });
});

// GET /:id - Get invoice detail
invoices.get(
  "/:id",
  requirePermission("invoices:read"),
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const tenant = c.get("tenant") as any;

    const [invoice] = await db
      .select()
      .from(schema.invoices)
      .where(
        and(
          eq(schema.invoices.id, id),
          eq(schema.invoices.organization_id, tenant.organizationId),
          eq(schema.invoices.branch_id, tenant.branchId),
        ),
      )
      .limit(1);

    if (!invoice) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Comprobante no encontrado" } },
        404,
      );
    }

    return c.json({ success: true, data: invoice });
  },
);

export { invoices };
