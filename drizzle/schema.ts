import { relations } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id),
    token: text("token").notNull().unique(), // Unique session token
    expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
  },
  (session) => [index("userId_index").on(session.userId)]
);

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id)
    .unique(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", {
    mode: "timestamp",
  }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", {
    mode: "timestamp",
  }),
  scope: text("scope"),
  idToken: text("idToken"),
  password: text("password"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull().unique(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export const jwks = sqliteTable("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("publicKey").notNull(),
  privateKey: text("privateKey").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
});

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull(),
  image: text("image"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export const workspace = sqliteTable(
  "workspace",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    publicId: text("publicId").notNull().unique(),
    title: text("title").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("workspace_user_idx").on(table.userId),
    index("workspace_publicid_idx").on(table.publicId),
  ]
);

export const image = sqliteTable(
  "image",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    publicId: text("publicId").notNull().unique(),
    originalImageKey: text("originalImageKey"),
    compressImageKey: text("compressImageKey"),
    thumbnailImageKey: text("thumbnailImageKey"),
    hoverImageKey: text("hoverImageKey"),

    alt: text("alt"),
    originalWidth: integer("originalWidth"),
    originalHeight: integer("originalHeight"),
    originalSize: integer("originalSize"),
    compressedSize: integer("compressedSize"),
    workspaceId: text("workspaceId")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("image_workspace_idx").on(table.workspaceId),
    index("image_publicid_idx").on(table.publicId),
    index("image_workspubid_idx").on(table.workspaceId, table.publicId),
    index("image_original_idx").on(table.originalImageKey),
  ]
);

export const imageRelations = relations(image, ({ one }) => ({
  workspace: one(workspace, {
    fields: [image.workspaceId],
    references: [workspace.id],
  }),
}));
