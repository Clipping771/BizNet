/**
 * lib/repo/discussion.ts
 *
 * Discussion LITE (§8.14): questions, answers, votes, best answer, selling filter,
 * similar questions (trigram + full-text, no AI) and admin review of held posts.
 */

import { Prisma, QuestionStatus, VoteTarget } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { logEvent } from "@/lib/events";
import { getSetting } from "@/lib/settings";
import { detectSelling } from "@/lib/discussion/selling";
import { parseSearchQuery } from "@/lib/search/query";
import { sanitizeText } from "@/lib/http/guard";

export class DiscussionError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "DiscussionError";
  }
}

const PUBLIC_STATUSES = [QuestionStatus.OPEN, QuestionStatus.ANSWERED, QuestionStatus.SOLVED];

export interface Viewer {
  userId: string | null;
  isAdmin: boolean;
}

function authorView<T extends { isAnonymous?: boolean; authorUserId: string; author?: { name: string } | null; authorBusiness?: { name: string; slug: string } | null }>(
  row: T,
  viewer: Viewer
) {
  // Anonymous posts hide the author from everyone but the author and admins
  const hidden = row.isAnonymous && !viewer.isAdmin && viewer.userId !== row.authorUserId;
  return {
    authorName: hidden ? null : row.author?.name ?? null,
    authorBusiness: hidden ? null : row.authorBusiness ?? null,
    isMine: viewer.userId === row.authorUserId,
  };
}

export async function listQuestions(params: { categoryId?: string | null; q?: string | null; viewer: Viewer; offset?: number }) {
  const where: Prisma.QuestionWhereInput = {
    deletedAt: null,
    OR: [
      { status: { in: PUBLIC_STATUSES } },
      ...(params.viewer.userId ? [{ authorUserId: params.viewer.userId, status: QuestionStatus.PENDING_REVIEW }] : []),
    ],
  };
  if (params.categoryId) where.categoryId = params.categoryId;
  if (params.q?.trim()) {
    const ids = await similarQuestionIds(params.q, 50);
    where.id = { in: ids };
  }
  const rows = await prisma.question.findMany({
    where,
    include: {
      author: { select: { name: true } },
      authorBusiness: { select: { name: true, slug: true } },
      category: { select: { slug: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 20,
    skip: params.offset ?? 0,
  });
  return rows.map((q) => ({
    id: q.id,
    title: q.title,
    status: q.status,
    score: q.score,
    answerCount: q.answerCount,
    categorySlug: q.category?.slug ?? null,
    createdAt: q.createdAt,
    ...authorView(q, params.viewer),
  }));
}

/** findFirst with an undefined id matches any row; every id-based lookup goes through this. */
function requireId(id: unknown): string {
  if (typeof id !== "string" || id.length === 0) throw new DiscussionError("Not found", 404);
  return id;
}

export async function getQuestionDetail(id: string, viewer: Viewer) {
  requireId(id);
  const q = await prisma.question.findFirst({
    where: { id, deletedAt: null },
    include: {
      author: { select: { name: true } },
      authorBusiness: { select: { name: true, slug: true } },
      category: { select: { id: true, slug: true } },
      answers: {
        where: { deletedAt: null },
        include: { author: { select: { name: true } }, authorBusiness: { select: { name: true, slug: true } } },
        orderBy: [{ score: "desc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!q) return null;
  if (q.status === QuestionStatus.PENDING_REVIEW && !viewer.isAdmin && viewer.userId !== q.authorUserId) return null;

  const votes = viewer.userId
    ? await prisma.vote.findMany({
        where: { userId: viewer.userId, targetId: { in: [q.id, ...q.answers.map((a) => a.id)] } },
        select: { targetId: true, value: true },
      })
    : [];
  const myVote = (targetId: string) => votes.find((v) => v.targetId === targetId)?.value ?? 0;

  // "Need to buy something for this?" card only when the category has live listings (§8.14)
  const categoryHasListings = q.category
    ? (await prisma.listing.count({ where: { categoryId: q.category.id, isActive: true, deletedAt: null } })) > 0
    : false;

  const answers = [...q.answers].sort((a, b) => (a.id === q.acceptedAnswerId ? -1 : b.id === q.acceptedAnswerId ? 1 : 0));
  return {
    id: q.id,
    title: q.title,
    body: q.body,
    status: q.status,
    score: q.score,
    isAnonymous: q.isAnonymous,
    lang: q.lang,
    category: q.category,
    categoryHasListings,
    acceptedAnswerId: q.acceptedAnswerId,
    createdAt: q.createdAt,
    myVote: myVote(q.id),
    ...authorView(q, viewer),
    answers: answers.map((a) => ({
      id: a.id,
      body: a.body,
      lang: a.lang,
      score: a.score,
      createdAt: a.createdAt,
      isAccepted: a.id === q.acceptedAnswerId,
      myVote: myVote(a.id),
      authorName: a.author?.name ?? null,
      authorBusiness: a.authorBusiness,
      isMine: viewer.userId === a.authorUserId,
    })),
  };
}

/** Top question ids by trigram similarity on the title + full-text on title/body (no AI). */
async function similarQuestionIds(text: string, limit: number): Promise<string[]> {
  const parsed = parseSearchQuery(text);
  if (!parsed.tsquery) return [];
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT q.id
    FROM "Question" q
    WHERE q."deletedAt" IS NULL
      AND q.status::text IN (${Prisma.join(PUBLIC_STATUSES)})
      AND (q.search_vector @@ to_tsquery('simple', unaccent(${parsed.tsquery})) OR similarity(q.title, ${parsed.text}) > 0.2)
    ORDER BY (similarity(q.title, ${parsed.text}) + ts_rank(q.search_vector, to_tsquery('simple', unaccent(${parsed.tsquery})))) DESC, q.id
    LIMIT ${limit}`;
  return rows.map((r) => r.id);
}

export async function similarQuestions(text: string) {
  const ids = await similarQuestionIds(text, 3);
  if (ids.length === 0) return [];
  const rows = await prisma.question.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true, status: true, answerCount: true },
  });
  return ids.map((id) => rows.find((r) => r.id === id)!).filter(Boolean);
}

export interface CreateQuestionInput {
  userId: string;
  businessId: string | null;
  title: string;
  body: string;
  categoryId?: string | null;
  isAnonymous?: boolean;
  lang?: string;
  /** The author saw the selling warning and chose to submit anyway → held for review. */
  submitAnyway?: boolean;
}

export type CreateQuestionResult =
  | { blocked: true; match: string }
  | { blocked: false; question: { id: string; status: QuestionStatus } };

export async function createQuestion(input: CreateQuestionInput): Promise<CreateQuestionResult> {
  const title = sanitizeText(input.title);
  const body = sanitizeText(input.body);
  if (title.length < 10 || title.length > 150) throw new DiscussionError("Title must be 10–150 characters");
  if (body.length < 1 || body.length > 5000) throw new DiscussionError("Body must be 1–5000 characters");
  if (input.categoryId) {
    const category = await prisma.category.findFirst({ where: { id: input.categoryId, isActive: true } });
    if (!category) throw new DiscussionError("Category not found");
  }

  const terms = (await getSetting("sellingFilterTerms")) || [];
  const selling = detectSelling(`${title}\n${body}`, terms);
  if (selling.isSelling && !input.submitAnyway) {
    return { blocked: true, match: selling.match ?? "" };
  }

  const question = await prisma.question.create({
    data: {
      authorUserId: input.userId,
      authorBusinessId: input.isAnonymous ? null : input.businessId,
      isAnonymous: !!input.isAnonymous,
      categoryId: input.categoryId || null,
      title,
      body,
      lang: input.lang || "bn",
      status: selling.isSelling ? QuestionStatus.PENDING_REVIEW : QuestionStatus.OPEN,
    },
    select: { id: true, status: true },
  });

  await logEvent({
    name: selling.isSelling ? "question_held_for_review" : "question_posted",
    userId: input.userId,
    businessId: input.businessId,
    props: { questionId: question.id, sellingMatch: selling.match ?? null },
  });
  return { blocked: false, question };
}

export async function createAnswer(input: { userId: string; businessId: string | null; questionId: string; body: string; lang?: string }) {
  const body = sanitizeText(input.body);
  if (body.length < 1 || body.length > 5000) throw new DiscussionError("Answer must be 1–5000 characters");

  const question = await prisma.question.findFirst({ where: { id: requireId(input.questionId), deletedAt: null } });
  if (!question || !PUBLIC_STATUSES.includes(question.status as any)) {
    throw new DiscussionError("Question not found", 404);
  }

  // Answers have no review state, so a selling answer is refused and must be edited
  const terms = (await getSetting("sellingFilterTerms")) || [];
  const selling = detectSelling(body, terms);
  if (selling.isSelling) return { blocked: true as const, match: selling.match ?? "" };

  const answer = await prisma.$transaction(async (tx) => {
    const created = await tx.answer.create({
      data: { questionId: question.id, authorUserId: input.userId, authorBusinessId: input.businessId, body, lang: input.lang || "bn" },
    });
    await tx.question.update({
      where: { id: question.id },
      data: {
        answerCount: { increment: 1 },
        ...(question.status === QuestionStatus.OPEN ? { status: QuestionStatus.ANSWERED } : {}),
      },
    });
    return created;
  });

  await logEvent({ name: "answer_posted", userId: input.userId, businessId: input.businessId, props: { questionId: question.id, answerId: answer.id } });
  return { blocked: false as const, answer };
}

/**
 * Up/down vote; voting the same value again removes the vote. Authors cannot vote on their own posts.
 * The target's score is kept equal to the sum of its votes inside one transaction.
 */
export async function castVote(input: { userId: string; targetType: VoteTarget; targetId: string; value: 1 | -1 }) {
  const target =
    input.targetType === VoteTarget.QUESTION
      ? await prisma.question.findFirst({ where: { id: requireId(input.targetId), deletedAt: null, status: { in: PUBLIC_STATUSES } }, select: { authorUserId: true } })
      : await prisma.answer.findFirst({ where: { id: requireId(input.targetId), deletedAt: null }, select: { authorUserId: true } });
  if (!target) throw new DiscussionError("Not found", 404);
  if (target.authorUserId === input.userId) throw new DiscussionError("You cannot vote on your own post", 403);

  return prisma.$transaction(async (tx) => {
    const key = { userId_targetType_targetId: { userId: input.userId, targetType: input.targetType, targetId: input.targetId } };
    const existing = await tx.vote.findUnique({ where: key });
    let myVote: number = input.value;
    if (existing && existing.value === input.value) {
      await tx.vote.delete({ where: key });
      myVote = 0;
    } else if (existing) {
      await tx.vote.update({ where: key, data: { value: input.value } });
    } else {
      await tx.vote.create({ data: { userId: input.userId, targetType: input.targetType, targetId: input.targetId, value: input.value } });
    }
    const sum = await tx.vote.aggregate({ where: { targetType: input.targetType, targetId: input.targetId }, _sum: { value: true } });
    const score = sum._sum.value ?? 0;
    if (input.targetType === VoteTarget.QUESTION) {
      await tx.question.update({ where: { id: input.targetId }, data: { score } });
    } else {
      await tx.answer.update({ where: { id: input.targetId }, data: { score } });
    }
    return { score, myVote };
  });
}

/** Only the question's author marks the best answer; the question becomes SOLVED. */
export async function markBestAnswer(input: { userId: string; questionId: string; answerId: string }) {
  const question = await prisma.question.findFirst({ where: { id: requireId(input.questionId), deletedAt: null } });
  if (!question) throw new DiscussionError("Question not found", 404);
  if (question.authorUserId !== input.userId) throw new DiscussionError("Only the person who asked can choose the best answer", 403);
  const answer = await prisma.answer.findFirst({ where: { id: requireId(input.answerId), questionId: question.id, deletedAt: null } });
  if (!answer) throw new DiscussionError("Answer not found", 404);

  const updated = await prisma.question.update({
    where: { id: question.id },
    data: { acceptedAnswerId: answer.id, status: QuestionStatus.SOLVED },
    select: { id: true, status: true, acceptedAnswerId: true },
  });
  await logEvent({ name: "best_answer_marked", userId: input.userId, props: { questionId: question.id, answerId: answer.id } });
  return updated;
}

/** Admin decision on a question held by the selling filter. */
export async function reviewHeldQuestion(input: { adminUserId: string; questionId: string; approve: boolean; note?: string | null }) {
  const question = await prisma.question.findFirst({ where: { id: requireId(input.questionId), status: QuestionStatus.PENDING_REVIEW, deletedAt: null } });
  if (!question) throw new DiscussionError("No held question with this id", 404);
  const updated = await prisma.question.update({
    where: { id: question.id },
    data: input.approve ? { status: QuestionStatus.OPEN } : { status: QuestionStatus.CLOSED, deletedAt: new Date() },
    select: { id: true, status: true },
  });
  await logAudit({
    actorUserId: input.adminUserId,
    action: input.approve ? "QUESTION_APPROVED" : "QUESTION_REJECTED",
    entityType: "QUESTION",
    entityId: question.id,
    before: { status: question.status },
    after: { status: updated.status, note: input.note ?? null },
  });
  return updated;
}

export async function listHeldQuestions() {
  return prisma.question.findMany({
    where: { status: QuestionStatus.PENDING_REVIEW, deletedAt: null },
    select: { id: true, title: true, body: true, createdAt: true, authorUserId: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function listActiveCategoriesForDiscussion() {
  return prisma.category.findMany({ where: { isActive: true }, select: { id: true, slug: true }, orderBy: { sortOrder: "asc" } });
}
