const { PrismaClient, Prisma } = require("@prisma/client");

const prisma = new PrismaClient({
  log: ["error", "warn"]
});

async function runStep(label, fn) {
  const startedAt = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - startedAt;
    console.log(`\n[OK] ${label} (${ms}ms)`);
    return { ok: true, result };
  } catch (err) {
    const ms = Date.now() - startedAt;
    console.error(`\n[FAIL] ${label} (${ms}ms)`);
    console.error(err);
    return { ok: false, error: err };
  }
}

async function main() {
  await runStep("prisma connect", async () => prisma.$connect());

  await runStep("count InventoryItem", async () => {
    const total = await prisma.inventoryItem.count();
    console.log("total", total);
  });

  // 1) Probar selects mínimos para aislar qué campo revienta.
  const selectCases = [
    { label: "select id", select: { id: true } },
    { label: "select id + skuInternal", select: { id: true, skuInternal: true } },
    { label: "select id + title", select: { id: true, title: true } },
    { label: "select id + mlItemId", select: { id: true, mlItemId: true } },
    { label: "select id + sellerCustomField", select: { id: true, sellerCustomField: true } },
    { label: "select id + status", select: { id: true, status: true } },
    { label: "select id + price", select: { id: true, price: true } },
    { label: "select id + extraData", select: { id: true, extraData: true } }
  ];

  for (const test of selectCases) {
    // take pequeño a propósito
    await runStep(`findMany ${test.label}`, async () => {
      const rows = await prisma.inventoryItem.findMany({
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: test.select
      });
      console.log("rows", rows.length);
    });
  }

  // 2) Medir tamaños de extraData sin traer el JSON completo.
  await runStep("top 20 extraData by size (pg_column_size)", async () => {
    const rows = await prisma.$queryRaw(
      Prisma.sql`
        SELECT "id", pg_column_size("extraData")::int AS size
        FROM "InventoryItem"
        WHERE "extraData" IS NOT NULL
        ORDER BY size DESC
        LIMIT 20
      `
    );
    console.table(rows);
  });

  // 3) Detectar fotos base64 (data:) y longitudes máximas por item.
  await runStep("top 20 max photo length (extraData.photos)", async () => {
    const rows = await prisma.$queryRaw(
      Prisma.sql`
        SELECT
          i."id",
          MAX(LENGTH(p.photo))::int AS max_photo_len,
          BOOL_OR(p.photo LIKE 'data:%') AS has_data_url
        FROM "InventoryItem" i
        JOIN LATERAL jsonb_array_elements_text(i."extraData"->'photos') AS p(photo)
          ON TRUE
        GROUP BY i."id"
        ORDER BY max_photo_len DESC
        LIMIT 20
      `
    );
    console.table(rows);
  });

  // 4) Probar el query recomendado (extraData sin photos) para validar que funcione.
  await runStep("queryRaw inventory snapshot (extraData - photos)", async () => {
    const rows = await prisma.$queryRaw(
      Prisma.sql`
        SELECT
          "id",
          "skuInternal",
          "sellerCustomField",
          "title",
          "price",
          "stock",
          "status",
          "mlItemId",
          ("extraData" - 'photos') AS "extraData",
          "createdAt",
          "updatedAt"
        FROM "InventoryItem"
        ORDER BY "updatedAt" DESC
        LIMIT 5
      `
    );
    console.log("rows", Array.isArray(rows) ? rows.length : 0);
  });
}

main()
  .catch((err) => {
    console.error("\n[FATAL]", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
