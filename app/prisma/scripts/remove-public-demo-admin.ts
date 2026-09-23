/**
 * 公開済みデモ管理者を一度だけ削除するための運用スクリプト。
 * 永続 API ではない。--apply を指定しない限り削除を実行しない。
 */
import "dotenv/config";
import { PrismaClient } from "@/generated/prisma";

const prisma = new PrismaClient();

function assertProductionTarget(): void {
  const url = process.env.DATABASE_URL;
  const expectedHost = process.env.PRODUCTION_DB_HOST;
  if (!url || !expectedHost || new URL(url).hostname !== expectedHost) {
    throw new Error("本番RDSホストの照合に失敗したため停止しました。");
  }
}

async function main(): Promise<void> {
  assertProductionTarget();
  const email = process.env.PUBLIC_DEMO_ADMIN_EMAIL;
  if (!email) throw new Error("削除対象が未指定のため停止しました。");
  const target = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
  if (!target || target.role !== "admin") throw new Error("削除対象が存在しない、または管理者ではないため停止しました。");
  const remainingAdmins = await prisma.user.count({ where: { role: "admin", id: { not: target.id } } });
  if (remainingAdmins === 0) throw new Error("残存する正規管理者がいないため停止しました。");

  if (!process.argv.includes("--apply")) {
    console.log(JSON.stringify({ mode: "dry-run", targetIsAdmin: true, remainingAdmins, ready: true }));
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.like.deleteMany({ where: { OR: [{ userId: target.id }, { review: { userId: target.id } }] } });
    await tx.report.deleteMany({ where: { OR: [{ userId: target.id }, { review: { userId: target.id } }] } });
    await tx.review.deleteMany({ where: { userId: target.id } });
    await tx.readingStatus.deleteMany({ where: { userId: target.id } });
    await tx.favoriteAuthor.deleteMany({ where: { userId: target.id } });
    await tx.userLibrary.deleteMany({ where: { userId: target.id } });
    await tx.follow.deleteMany({ where: { OR: [{ followerId: target.id }, { followingId: target.id }] } });
    await tx.notification.deleteMany({ where: { OR: [{ userId: target.id }, { actorId: target.id }] } });
    await tx.contactInquiry.deleteMany({ where: { OR: [{ userId: target.id }, { email }] } });
    await tx.account.deleteMany({ where: { userId: target.id } });
    await tx.session.deleteMany({ where: { userId: target.id } });
    await tx.book.updateMany({ where: { createdByUserId: target.id }, data: { createdByUserId: null } });
    await tx.$executeRaw`DELETE FROM audit_logs WHERE actor_user_id = ${target.id} OR actor_email = ${email} OR CAST(detail AS CHAR) LIKE CONCAT('%', ${email}, '%')`;
    await tx.user.delete({ where: { id: target.id } });
    await tx.auditLog.create({ data: { eventType: "security_public_demo_admin_removed", targetType: "User", detail: { reason: "public_demo_credentials" } } });
  });

  const [userCount, sessionCount, accountCount, admins] = await Promise.all([
    prisma.user.count({ where: { email } }), prisma.session.count({ where: { userId: target.id } }),
    prisma.account.count({ where: { userId: target.id } }), prisma.user.count({ where: { role: "admin" } }),
  ]);
  if (userCount !== 0 || sessionCount !== 0 || accountCount !== 0 || admins === 0) throw new Error("削除後照合に失敗しました。");
  console.log(JSON.stringify({ mode: "applied", targetLoginDisabled: true, remainingAdmins: admins }));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : "削除処理に失敗しました。");
    await prisma.$disconnect();
    process.exit(1);
  });
