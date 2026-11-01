import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/d1/schema.prisma",
  datasource: {
    url: "file:./prisma/d1/d1-generate-only.db",
  },
});
