"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

export type ImportResult = {
  parsed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

/**
 * Server action for the Timesheet CSV import wizard.
 *
 * Expected CSV columns (header row required, case-insensitive):
 *   Date *           (yyyy-MM-dd)
 *   Project Name *   (must match an existing project's name)
 *   Task Name *      (must match a task within that project)
 *   User Email *     (must match an existing org member's email)
 *   Hours *          (decimal, e.g. 1.5)
 *   Billable         (true/false, default true)
 *   Notes
 *
 * Duplicate handling:
 *   - "skip"      → if an entry exists for the same (user, date, project,
 *                    task, hours), skip
 *   - "overwrite" → upsert by the same composite key
 */
export async function importTimesheetAction(input: {
  csvText: string;
  dupHandling: "skip" | "overwrite";
}): Promise<ImportResult> {
  const { user, organization } = await requireOrganization();
  const { csvText, dupHandling } = input;

  const result: ImportResult = {
    parsed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  const lines = csvText.replace(/^﻿/, "").trim().split(/\r?\n/);
  if (lines.length < 2) {
    result.errors.push({
      row: 0,
      message: "CSV must have a header row plus at least one data row.",
    });
    return result;
  }

  const head = splitCsvRow(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (name: string) => head.indexOf(name.toLowerCase());

  const iDate = idx("Date");
  const iProject = idx("Project Name");
  const iTask = idx("Task Name");
  const iEmail = idx("User Email");
  const iHours = idx("Hours");
  const iBillable = idx("Billable");
  const iNotes = idx("Notes");

  if (iDate < 0 || iProject < 0 || iTask < 0 || iEmail < 0 || iHours < 0) {
    result.errors.push({
      row: 0,
      message:
        "Missing required columns. Expected at minimum: Date, Project Name, Task Name, User Email, Hours.",
    });
    return result;
  }

  // Preload all projects + tasks in one go so we don't roundtrip per row.
  const projects = await db.project.findMany({
    where: { organizationId: organization.id },
    select: {
      id: true,
      name: true,
      tasks: { select: { id: true, name: true, billable: true } },
    },
  });
  const projectByName = new Map(
    projects.map((p) => [p.name.trim().toLowerCase(), p])
  );

  // Preload all org members.
  const memberships = await db.organizationMembership.findMany({
    where: { organizationId: organization.id },
    include: { user: { select: { id: true, email: true } } },
  });
  const userByEmail = new Map(
    memberships.map((m) => [m.user.email.trim().toLowerCase(), m.user.id])
  );

  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i];
    if (!raw.trim()) continue;
    result.parsed += 1;

    const cells = splitCsvRow(raw);
    const dateStr = cells[iDate]?.trim() ?? "";
    const projectName = cells[iProject]?.trim() ?? "";
    const taskName = cells[iTask]?.trim() ?? "";
    const email = cells[iEmail]?.trim().toLowerCase() ?? "";
    const hoursStr = cells[iHours]?.trim() ?? "";
    const billableStr =
      iBillable >= 0 ? cells[iBillable]?.trim().toLowerCase() ?? "" : "";
    const notes = iNotes >= 0 ? cells[iNotes]?.trim() ?? "" : "";

    if (!dateStr) {
      result.errors.push({ row: lineNo, message: "Date is required" });
      continue;
    }
    const date = new Date(dateStr);
    if (!Number.isFinite(date.getTime())) {
      result.errors.push({
        row: lineNo,
        message: `Date "${dateStr}" is not a valid yyyy-MM-dd date`,
      });
      continue;
    }
    if (!projectName) {
      result.errors.push({ row: lineNo, message: "Project Name is required" });
      continue;
    }
    const project = projectByName.get(projectName.toLowerCase());
    if (!project) {
      result.errors.push({
        row: lineNo,
        message: `Project "${projectName}" not found`,
      });
      continue;
    }
    if (!taskName) {
      result.errors.push({ row: lineNo, message: "Task Name is required" });
      continue;
    }
    const task = project.tasks.find(
      (t) => t.name.trim().toLowerCase() === taskName.toLowerCase()
    );
    if (!task) {
      result.errors.push({
        row: lineNo,
        message: `Task "${taskName}" not found in project "${projectName}"`,
      });
      continue;
    }
    if (!email) {
      result.errors.push({ row: lineNo, message: "User Email is required" });
      continue;
    }
    const userIdForEntry = userByEmail.get(email);
    if (!userIdForEntry) {
      result.errors.push({
        row: lineNo,
        message: `No org member with email "${email}"`,
      });
      continue;
    }
    const hours = Number(hoursStr.replace(/,/g, ""));
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
      result.errors.push({
        row: lineNo,
        message: `Hours "${hoursStr}" must be > 0 and ≤ 24`,
      });
      continue;
    }
    const billable =
      billableStr === "false" || billableStr === "no" || billableStr === "0"
        ? false
        : true;

    // Dup detection: same (user, date, project, task, hours).
    const existing = await db.timeEntry.findFirst({
      where: {
        organizationId: organization.id,
        userId: userIdForEntry,
        date,
        projectId: project.id,
        taskId: task.id,
        hours,
      },
      select: { id: true },
    });

    try {
      if (existing) {
        if (dupHandling === "skip") {
          result.skipped += 1;
          continue;
        }
        await db.timeEntry.update({
          where: { id: existing.id },
          data: {
            description: notes || null,
            billable,
          },
        });
        result.updated += 1;
      } else {
        await db.timeEntry.create({
          data: {
            organizationId: organization.id,
            userId: userIdForEntry,
            date,
            projectId: project.id,
            taskId: task.id,
            hours,
            description: notes || null,
            billable,
          },
        });
        result.created += 1;
      }
    } catch (err) {
      result.errors.push({
        row: lineNo,
        message: err instanceof Error ? err.message : "Database write failed",
      });
    }
  }

  if (result.created > 0 || result.updated > 0) {
    await writeAuditLog({
      organizationId: organization.id,
      userId: user.id,
      action: "CREATE",
      entityType: "TimeEntry",
      entityId: "bulk-import",
      after: {
        importedBy: "csv",
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors.length,
      },
    });
    revalidatePath("/time/entries");
  }

  return result;
}

function splitCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}
