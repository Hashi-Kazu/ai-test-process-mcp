import { personaJourneyFrame } from "./resources/personaJourneyFrame.js";
import type {
  GenerateUserStoryMapInput,
  IncompleteTestRequirementRow,
  PersonaJourneyFrame,
  StoryMapDuplicateId,
  StoryMapEntityKind,
  StoryMapIdIssue,
  StoryMapUnresolvedRef,
  UserStoryMapIdPrefixes,
} from "./types.js";

// generate_user_story_map 固有の決定的検査ロジック。
// すべて純関数で、入力を破壊せず、出力順は入力順で決定的。

export const DEFAULT_STORY_MAP_ID_PREFIXES: Record<StoryMapEntityKind, string> = {
  activity: "ACT-",
  task: "TSK-",
  story: "US-",
  testRequirement: "TR-",
};

export const storyMapEntityKinds: StoryMapEntityKind[] = [
  "activity",
  "task",
  "story",
  "testRequirement",
];

export const storyMapEntityLabels: Record<StoryMapEntityKind, string> = {
  activity: "アクティビティ",
  task: "タスク",
  story: "ユーザーストーリー",
  testRequirement: "テスト要求",
};

export function resolveStoryMapIdPrefixes(
  idPrefixes?: UserStoryMapIdPrefixes
): Record<StoryMapEntityKind, string> {
  return {
    activity: idPrefixes?.activity ?? DEFAULT_STORY_MAP_ID_PREFIXES.activity,
    task: idPrefixes?.task ?? DEFAULT_STORY_MAP_ID_PREFIXES.task,
    story: idPrefixes?.story ?? DEFAULT_STORY_MAP_ID_PREFIXES.story,
    testRequirement: idPrefixes?.testRequirement ?? DEFAULT_STORY_MAP_ID_PREFIXES.testRequirement,
  };
}

function idsByKind(input: GenerateUserStoryMapInput): Record<StoryMapEntityKind, string[]> {
  return {
    activity: (input.activities ?? []).map((a) => a.id),
    task: (input.tasks ?? []).map((t) => t.id),
    story: (input.stories ?? []).map((s) => s.id),
    testRequirement: (input.testRequirements ?? []).map((r) => r.id),
  };
}

export function findDuplicateStoryMapIds(input: GenerateUserStoryMapInput): StoryMapDuplicateId[] {
  const all = idsByKind(input);
  const result: StoryMapDuplicateId[] = [];
  for (const kind of storyMapEntityKinds) {
    const counts = new Map<string, number>();
    const order: string[] = [];
    for (const id of all[kind]) {
      if (!counts.has(id)) order.push(id);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const id of order) {
      const count = counts.get(id) as number;
      if (count > 1) result.push({ kind, id, count });
    }
  }
  return result;
}

function parseNumberPart(id: string, idPrefix: string): { raw: string; value: number } | undefined {
  if (!id.startsWith(idPrefix)) return undefined;
  const rest = id.slice(idPrefix.length);
  if (!/^\d+$/.test(rest)) return undefined;
  return { raw: rest, value: Number(rest) };
}

export function findPrefixMismatchStoryMapIds(input: GenerateUserStoryMapInput): StoryMapIdIssue[] {
  const all = idsByKind(input);
  const prefixes = resolveStoryMapIdPrefixes(input.idPrefixes);
  const result: StoryMapIdIssue[] = [];
  for (const kind of storyMapEntityKinds) {
    const expectedPrefix = prefixes[kind];
    for (const id of all[kind]) {
      if (parseNumberPart(id, expectedPrefix)) continue;
      if (result.some((r) => r.kind === kind && r.id === id)) continue;
      result.push({ kind, id, expectedPrefix });
    }
  }
  return result;
}

export function findMissingStoryMapNumbers(input: GenerateUserStoryMapInput): StoryMapIdIssue[] {
  const all = idsByKind(input);
  const prefixes = resolveStoryMapIdPrefixes(input.idPrefixes);
  const result: StoryMapIdIssue[] = [];
  for (const kind of storyMapEntityKinds) {
    const expectedPrefix = prefixes[kind];
    const parsed = all[kind]
      .map((id) => parseNumberPart(id, expectedPrefix))
      .filter((p): p is { raw: string; value: number } => p !== undefined);
    if (parsed.length === 0) continue;

    const widthCounts = new Map<number, number>();
    for (const p of parsed) {
      widthCounts.set(p.raw.length, (widthCounts.get(p.raw.length) ?? 0) + 1);
    }
    let width = 0;
    let bestCount = -1;
    for (const [w, count] of [...widthCounts.entries()].sort((a, b) => a[0] - b[0])) {
      if (count > bestCount || (count === bestCount && w > width)) {
        width = w;
        bestCount = count;
      }
    }

    const present = new Set(parsed.map((p) => p.value));
    const min = Math.min(...parsed.map((p) => p.value));
    const max = Math.max(...parsed.map((p) => p.value));
    for (let n = min; n <= max; n++) {
      if (!present.has(n)) {
        result.push({ kind, id: `${expectedPrefix}${String(n).padStart(width, "0")}`, expectedPrefix });
      }
    }
  }
  return result;
}

export function findUnresolvedStoryMapRefs(
  input: GenerateUserStoryMapInput
): StoryMapUnresolvedRef[] {
  const personaIds = new Set((input.personas ?? []).map((p) => p.id));
  const activityIds = new Set((input.activities ?? []).map((a) => a.id));
  const taskIds = new Set((input.tasks ?? []).map((t) => t.id));
  const storyIds = new Set((input.stories ?? []).map((s) => s.id));

  const result: StoryMapUnresolvedRef[] = [];
  for (const activity of input.activities ?? []) {
    for (const ref of activity.personaIds ?? []) {
      if (!personaIds.has(ref)) {
        result.push({ ownerId: activity.id, ref, expectedKind: "personas[].id" });
      }
    }
  }
  for (const task of input.tasks ?? []) {
    if (!activityIds.has(task.activityId)) {
      result.push({ ownerId: task.id, ref: task.activityId, expectedKind: "activities[].id" });
    }
  }
  for (const story of input.stories ?? []) {
    if (!taskIds.has(story.taskId)) {
      result.push({ ownerId: story.id, ref: story.taskId, expectedKind: "tasks[].id" });
    }
    for (const ref of story.personaIds ?? []) {
      if (!personaIds.has(ref)) {
        result.push({ ownerId: story.id, ref, expectedKind: "personas[].id" });
      }
    }
  }
  for (const requirement of input.testRequirements ?? []) {
    if (!personaIds.has(requirement.personaId)) {
      result.push({
        ownerId: requirement.id,
        ref: requirement.personaId,
        expectedKind: "personas[].id",
      });
    }
    for (const ref of requirement.storyIds ?? []) {
      if (!storyIds.has(ref)) {
        result.push({ ownerId: requirement.id, ref, expectedKind: "stories[].id" });
      }
    }
  }
  return result;
}

/** ユーザーストーリーを1件以上持つペルソナID集合（直接指定 + 上位 activity 経由） */
function personaIdsWithStories(input: GenerateUserStoryMapInput): Set<string> {
  const activityById = new Map((input.activities ?? []).map((a) => [a.id, a]));
  const taskById = new Map((input.tasks ?? []).map((t) => [t.id, t]));
  const linked = new Set<string>();
  for (const story of input.stories ?? []) {
    for (const id of story.personaIds ?? []) linked.add(id);
    const task = taskById.get(story.taskId);
    if (!task) continue;
    const activity = activityById.get(task.activityId);
    if (!activity) continue;
    for (const id of activity.personaIds ?? []) linked.add(id);
  }
  return linked;
}

export function findPersonasWithoutStories(input: GenerateUserStoryMapInput): string[] {
  const linked = personaIdsWithStories(input);
  return (input.personas ?? []).filter((p) => !linked.has(p.id)).map((p) => p.id);
}

export function findPersonasWithoutTestRequirements(input: GenerateUserStoryMapInput): string[] {
  const covered = new Set((input.testRequirements ?? []).map((r) => r.personaId));
  return (input.personas ?? []).filter((p) => !covered.has(p.id)).map((p) => p.id);
}

export function findIncompleteTestRequirementRows(
  input: GenerateUserStoryMapInput
): IncompleteTestRequirementRow[] {
  const result: IncompleteTestRequirementRow[] = [];
  for (const requirement of input.testRequirements ?? []) {
    const missingFields: string[] = [];
    if (!requirement.before || requirement.before.trim() === "") missingFields.push("現状(Before)");
    if (!requirement.after || requirement.after.trim() === "") missingFields.push("将来(After)");
    if (!requirement.testRequirement || requirement.testRequirement.trim() === "") {
      missingFields.push("テスト要求");
    }
    if (missingFields.length > 0) result.push({ id: requirement.id, missingFields });
  }
  return result;
}

export function findUnusedDomainAnalysisAspects(
  input: GenerateUserStoryMapInput,
  frame: PersonaJourneyFrame = personaJourneyFrame
): { id: string; nameJa: string }[] {
  const used = new Set(
    (input.domainAnalysis ?? [])
      .filter((d) => d.findings && d.findings.some((f) => f.trim() !== ""))
      .map((d) => d.aspectId)
  );
  return frame.domainAnalysisAspects
    .filter((aspect) => !used.has(aspect.id))
    .map((aspect) => ({ id: aspect.id, nameJa: aspect.nameJa }));
}

export function findUnknownDomainAnalysisAspectIds(
  input: GenerateUserStoryMapInput,
  frame: PersonaJourneyFrame = personaJourneyFrame
): string[] {
  const known = new Set(frame.domainAnalysisAspects.map((aspect) => aspect.id));
  const result: string[] = [];
  for (const entry of input.domainAnalysis ?? []) {
    if (!known.has(entry.aspectId) && !result.includes(entry.aspectId)) {
      result.push(entry.aspectId);
    }
  }
  return result;
}
