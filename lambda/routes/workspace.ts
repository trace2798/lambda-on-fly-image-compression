import "dotenv/config";
import { desc, eq, lt, and } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { db } from "../../drizzle";
import { image, workspace } from "../../drizzle/schema";

const app = new Hono();

app.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Accept"],
  })
);

app.get("/:workspaceId/images", async (c) => {
  const { workspaceId } = c.req.param();
  console.log("WORKSPACE IF", workspaceId);
  const workspaceInfo = await db
    .select()
    .from(workspace)
    .where(eq(workspace.id, workspaceId))
    .limit(1);
  console.log("WORKSPACE INFO:", workspaceInfo);
  const qsSchema = z.object({
    limit: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 20))
      .refine((n) => !Number.isNaN(n) && n > 0 && n <= 100, {
        message: "limit must be between 1 and 100",
      }),
    before: z
      .string()
      .optional()
      .refine((s) => (s ? !Number.isNaN(Date.parse(s)) : true), {
        message: "before must be a valid ISO timestamp",
      }),
  });

  const parseResult = qsSchema.safeParse(c.req.query());
  if (!parseResult.success) {
    return c.json({ error: parseResult.error.flatten().fieldErrors }, 400);
  }
  const { limit, before } = parseResult.data;

  try {
    const whereClause = before
      ? and(
          eq(image.workspaceId, workspaceId),
          lt(image.createdAt, new Date(before))
        )
      : eq(image.workspaceId, workspaceId);

    const rows = await db
      .select()
      .from(image)
      .where(whereClause)
      .orderBy(desc(image.createdAt))
      .limit(limit + 1);

    let nextCursor: string | null = null;
    if (rows.length > limit) {
      nextCursor = rows[limit].createdAt.toISOString();
      rows.pop();
    }

    return c.json({
      images: rows,
      nextCursor,
      workspacePublicId: workspaceInfo[0].publicId,
    });
  } catch (err) {
    console.error("DB error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export { app as workspaceRoute };
