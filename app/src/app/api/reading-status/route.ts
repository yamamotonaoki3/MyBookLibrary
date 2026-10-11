import { ReadingStatusSchema } from "@/lib/validations";
import { getAuthenticatedUserId } from "@/lib/session";
import { logger } from "@/lib/logger";
import { runAfterResponse } from "@/lib/afterResponse";
import { saveReadingStatus } from "@/lib/readingStatusService";

export async function POST(request: Request) {
  try {
    const { userId, error } = await getAuthenticatedUserId();
    if (error) return error;
    const body = await request.json();
    const parsed = ReadingStatusSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const result = await saveReadingStatus({ userId, ...parsed.data });
    if (result.afterResponse) runAfterResponse(result.afterResponse);

    return Response.json(result.body);
  } catch (error) {
    logger.error({ err: error }, "[POST /api/reading-status]");
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
