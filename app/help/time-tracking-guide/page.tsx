import Link from "next/link";
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Timer,
  Receipt,
  CheckCircle2,
  Users,
  BarChart3,
  Mail,
  PlayCircle,
} from "lucide-react";

export const metadata = {
  title: "Time Tracking Guide · Quikfinance",
};
export const dynamic = "force-static";

/**
 * Long-form guide backing the "Learn More" link on /time/projects empty state
 * (see app/(dashboard)/time/projects/page.tsx → DoMoreSection). Public route.
 * Pattern follows the year-end-closing-guide / bank-connections-guide articles.
 */
export default function TimeTrackingGuidePage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/" className="text-base font-semibold hover:text-primary">
            Quikfinance
          </Link>
          <Link
            href="/time/projects"
            className="text-sm text-primary hover:underline"
          >
            ← Back to Projects
          </Link>
        </div>
      </header>

      <div className="border-b bg-gradient-to-b from-muted/30 to-background">
        <div className="max-w-3xl mx-auto px-6 py-10">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
            <Link
              href="/help"
              className="hover:text-primary inline-flex items-center gap-1"
            >
              <ChevronLeft className="h-3 w-3" />
              Help Center
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span>Time Tracking Guide</span>
          </div>
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-md bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
              <Clock className="h-7 w-7 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold leading-tight">
                Time Tracking, end-to-end
              </h1>
              <p className="text-sm text-muted-foreground mt-2">
                Set up projects, log billable hours, and turn time into
                invoices &mdash; the way your accountant expects.
              </p>
              <p className="text-xs text-muted-foreground mt-1">8 min read</p>
            </div>
          </div>
        </div>
      </div>

      <article className="max-w-3xl mx-auto px-6 py-10 space-y-10">
        {/* Intro */}
        <section className="space-y-3">
          <p className="text-base leading-relaxed">
            Most service businesses lose money in one of three places: hours
            that nobody logged, hours that were logged but never billed, and
            hours that <em>were</em> billed but the customer disputes because
            the line item said &ldquo;consulting&rdquo; and nothing else.
            Quikfinance&rsquo;s Time Tracking module is designed to close all
            three leaks &mdash; without forcing your team to fill out a
            half-page form for every 30-minute chunk of work.
          </p>
          <p className="text-base leading-relaxed">
            This guide walks through the workflow end-to-end: setting up your
            first project, breaking it into tasks, logging time (timer or
            manual), and converting billable hours into invoice line items.
            Everything below maps to a real screen in your account &mdash;
            click through as you go.
          </p>
        </section>

        {/* Stage 1 */}
        <Stage
          n={1}
          icon={ClipboardList}
          title="Set up your first project"
          subtitle="Project = customer + scope of work. Everything else hangs off it."
        >
          <p>
            Every billable hour in Quikfinance lives inside a project. A
            project ties a chunk of work to a specific customer, gives you
            something to budget against, and acts as the bucket your time
            entries roll up into.
          </p>
          <p>
            Open{" "}
            <Link
              href="/time/projects/new"
              className="text-blue-600 hover:text-blue-700"
            >
              Time Tracking &rarr; Projects &rarr; + New
            </Link>{" "}
            and fill in the five required sections:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Project Name</strong> &mdash; short and human, e.g.
              &ldquo;Q3 Redesign &mdash; Acme&rdquo;. Shows up everywhere.
            </li>
            <li>
              <strong>Project Code</strong> &mdash; optional internal ID. Use
              it if your accountant or PM system already has one.
            </li>
            <li>
              <strong>Customer Name</strong> &mdash; the customer billed for
              this work. If they don&rsquo;t exist yet, hit the magnifying
              glass next to the dropdown to open a new-customer form in a new
              tab.
            </li>
            <li>
              <strong>Billing Method</strong> &mdash; pick one of four. Most
              consultancies use <em>Based on Project Hours</em> (one rate for
              everything) or <em>Based on Task Hours</em> (different rates per
              task). Fixed-fee work uses <em>Fixed Cost for Project</em>.
            </li>
            <li>
              <strong>Description</strong> &mdash; optional, up to 2000
              characters. Useful for scope notes that the team will look at
              later.
            </li>
          </ul>
          <p>
            Then expand the <strong>Budget</strong> section. Cost Budget is
            what you expect to spend (mostly your team&rsquo;s loaded cost).
            Revenue Budget is what you expect to bill the customer. The gap
            between them is your forecasted profit on the engagement.
          </p>
          <Tip title="Tip: invite users before you save">
            The <strong>Users</strong> section lets you pull in teammates
            who&rsquo;ll log time on this project. Adding them here means
            they&rsquo;ll see the project in <em>their</em> timer dropdown the
            next time they hit Start. You can always add more users later
            from the project detail page.
          </Tip>
        </Stage>

        {/* Stage 2 */}
        <Stage
          n={2}
          icon={CheckCircle2}
          title="Add tasks for cleaner reporting"
          subtitle="Tasks make per-line invoices possible. Skip them only if every hour bills at the same rate."
        >
          <p>
            Tasks live inside a project and represent the kinds of work people
            do on it &mdash; &ldquo;Design&rdquo;, &ldquo;Frontend dev&rdquo;,
            &ldquo;QA&rdquo;, &ldquo;Discovery call&rdquo;. They&rsquo;re what
            you pick when starting a timer, and they&rsquo;re what shows up as
            line items when you eventually convert hours into an invoice.
          </p>
          <p>
            You can add tasks straight from the New Project form (the Project
            Tasks table at the bottom), or any time later from the project
            detail page. Each task has:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Task Name</strong> &mdash; what the work is called.
            </li>
            <li>
              <strong>Description</strong> &mdash; optional notes.
            </li>
            <li>
              <strong>Billable</strong> &mdash; ticked by default. Untick if
              this task is internal-only (e.g. &ldquo;Team meeting&rdquo;).
              The default propagates to every timer started against that
              task, but each individual time entry can still be overridden.
            </li>
          </ul>
          <Warning title="Heads up: tasks are required for the timer">
            If a project has zero tasks, the Start Timer modal will refuse to
            run against it. The fix is fast &mdash; one click on{" "}
            <em>Add Project Task</em> &mdash; but it&rsquo;s worth knowing
            before your team hits the wall mid-meeting.
          </Warning>
        </Stage>

        {/* Stage 3 */}
        <Stage
          n={3}
          icon={Timer}
          title="Log time &mdash; timer or manual"
          subtitle="The timer is ideal for live work. Manual entry is for filling in yesterday."
        >
          <p className="font-semibold">Option A: live timer</p>
          <p>
            Click <strong>Start</strong> on the projects list (top-right of
            the toolbar). A modal opens with the elapsed clock, your project
            and task pickers, a Billable checkbox, and a notes textarea.
            Pick the project, pick the task, then hit{" "}
            <strong>Start Timer</strong>. The button turns red and the elapsed
            counter starts ticking.
          </p>
          <p>
            You can navigate anywhere in the app while the timer runs &mdash;
            the pill on the Projects toolbar shows your live elapsed counter,
            and the state survives page reloads. When you&rsquo;re done, open
            the modal again and click <strong>Stop Timer</strong>; the entry
            is saved as fractional hours (e.g. 2h 17m = 2.28 hours).
          </p>
          <p className="font-semibold mt-4">Option B: manual entry</p>
          <p>
            For time you forgot to track live, open{" "}
            <Link
              href="/time/entries/new"
              className="text-blue-600 hover:text-blue-700"
            >
              Time Tracking &rarr; Timesheet &rarr; Log Time
            </Link>{" "}
            and fill in the date, project, task, hours, and a description.
            Saves the same record shape as the timer.
          </p>
          <Tip title="Tip: notes are gold during disputes">
            One sentence per entry &mdash; what you actually did &mdash; pays
            for itself the first time a customer queries an invoice. The
            entry&rsquo;s description becomes the line-item note when you
            convert hours to invoice.
          </Tip>
        </Stage>

        {/* Stage 4 */}
        <Stage
          n={4}
          icon={Users}
          title="Bring your team into the project"
          subtitle="Multi-user logging stays organized when you set up access up front."
        >
          <p>
            Each project has a Users list. Anyone on that list can log time
            against it; everyone else has to be added first. The user who
            created the project is auto-included; you add others either:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              At project-creation time, via the Users section on the New
              Project form.
            </li>
            <li>
              Later from the project detail page (Users tab &rarr; Add User).
            </li>
          </ul>
          <p>
            For users who aren&rsquo;t in your Quikfinance account yet, invite
            them first via{" "}
            <Link
              href="/settings/users/new"
              className="text-blue-600 hover:text-blue-700"
            >
              Settings &rarr; Users &rarr; Invite User
            </Link>
            . Once they accept, they show up in the Add User picker on any
            project.
          </p>
        </Stage>

        {/* Stage 5 */}
        <Stage
          n={5}
          icon={Receipt}
          title="Turn billable hours into invoices"
          subtitle="The bridge between time tracking and AR."
        >
          <p>
            On the project detail page, the &ldquo;Unbilled time&rdquo;
            section lists every time entry with{" "}
            <code className="text-xs px-1 py-0.5 rounded bg-muted">
              billable = true
            </code>{" "}
            that hasn&rsquo;t been pulled into an invoice yet. Pick the
            entries you want to bill, click <strong>Create Invoice</strong>,
            and Quikfinance pre-fills the line items grouped by task &mdash;
            one row per task with rolled-up hours and the task&rsquo;s rate.
          </p>
          <p>
            From there it&rsquo;s a normal invoice: tweak rates if needed,
            add other items, send it. Once the invoice is saved, the
            underlying time entries flip to{" "}
            <code className="text-xs px-1 py-0.5 rounded bg-muted">
              isBilled = true
            </code>{" "}
            so they don&rsquo;t accidentally get billed again on the next
            cycle.
          </p>
          <Warning title="Heads up: non-billable time stays invisible to invoices">
            Time logged with the Billable checkbox unticked (or against a
            non-billable task) is excluded from the &ldquo;Unbilled time&rdquo;
            list by design. It still shows up in project reports and your
            team&rsquo;s timesheets &mdash; just not in the AR pipeline.
          </Warning>
        </Stage>

        {/* Stage 6 */}
        <Stage
          n={6}
          icon={BarChart3}
          title="Reports &amp; project profitability"
          subtitle="Where the data goes once your team's logged a few weeks."
        >
          <p>The reports you&rsquo;ll lean on most:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Project Summary</strong> &mdash; hours logged, budget
              consumed, hours billed vs unbilled, broken down by task.
            </li>
            <li>
              <strong>Time by User</strong> &mdash; team-wide hours per week
              or month. Useful for utilization tracking.
            </li>
            <li>
              <strong>Unbilled Hours</strong> &mdash; quick check before the
              monthly invoicing cycle. If this number is growing, work&rsquo;s
              not getting billed fast enough.
            </li>
          </ul>
          <p>
            All three are accessible from the{" "}
            <Link href="/reports" className="text-blue-600 hover:text-blue-700">
              Reports Center
            </Link>{" "}
            once your team has logged enough entries to make the numbers
            interesting.
          </p>
        </Stage>

        {/* Tips */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">A few things that quietly pay off</h2>
          <Bullet>
            <strong>Set budgets even if they&rsquo;re rough.</strong> Even a
            best-guess Cost Budget is better than nothing &mdash; the project
            detail page shows a percentage consumed and you find out
            you&rsquo;re tracking 130% of budget before the customer call
            instead of after.
          </Bullet>
          <Bullet>
            <strong>Make tasks specific.</strong> &ldquo;Discovery
            call&rdquo; beats &ldquo;Meeting&rdquo;. The task name flows
            through to the invoice; specific tasks are easier for the
            customer to defend internally when they sign off on the bill.
          </Bullet>
          <Bullet>
            <strong>Log the same day, not the next morning.</strong> Memory
            drift on hours is huge. Even a rough estimate logged at 5pm is
            better than a careful one logged 18 hours later.
          </Bullet>
          <Bullet>
            <strong>Run the Unbilled Hours report every Friday.</strong>{" "}
            Anything over a few thousand suggests an invoicing backlog. If
            it&rsquo;s growing weekly, the bottleneck is on your end, not the
            customer&rsquo;s.
          </Bullet>
        </section>

        {/* Related FAQs */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Related questions</h2>
          <ul className="space-y-2 text-sm">
            <li>
              <Link
                href="/help/sales-and-invoicing"
                className="text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
              >
                How do invoices work in Quikfinance?
                <ChevronRight className="h-3 w-3" />
              </Link>
            </li>
            <li>
              <Link
                href="/help/getting-started"
                className="text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
              >
                Inviting users and assigning roles
                <ChevronRight className="h-3 w-3" />
              </Link>
            </li>
            <li>
              <Link
                href="/help/reports"
                className="text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
              >
                What reports does Quikfinance ship out of the box?
                <ChevronRight className="h-3 w-3" />
              </Link>
            </li>
          </ul>
        </section>

        {/* Coming soon */}
        <section className="rounded-lg border bg-muted/20 px-5 py-4">
          <div className="flex items-start gap-3">
            <PlayCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold">Mobile timer &mdash; coming soon</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Native iOS, Android, and desktop apps with a one-tap timer,
                offline logging, and push reminders to stop forgotten timers.
                In the meantime, the web timer survives reloads and works
                fine on mobile browsers.
              </p>
            </div>
          </div>
        </section>

        {/* Support footer */}
        <footer className="border-t pt-6 mt-10 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Still stuck?</span>
            <a
              href="mailto:support@quikfinance.app"
              className="text-blue-600 hover:text-blue-700"
            >
              support@quikfinance.app
            </a>
          </div>
          <p className="text-xs text-muted-foreground">
            Updated for FY 2025-26. We&rsquo;ll add new sections as the
            module grows.
          </p>
        </footer>
      </article>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Layout primitives — kept inline so this page is self-contained.
// ─────────────────────────────────────────────────────────────────────────

function Stage({
  n,
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  n: number;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center text-sm font-semibold shrink-0">
          {n}
        </div>
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-blue-600" />
          <h2 className="text-xl font-semibold">{title}</h2>
        </div>
      </div>
      <p className="text-sm text-muted-foreground italic">{subtitle}</p>
      <div className="space-y-3 text-base leading-relaxed pl-12">
        {children}
      </div>
    </section>
  );
}

function Tip({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 px-4 py-3 mt-4">
      <div className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
        {title}
      </div>
      <p className="text-sm text-emerald-900/90 dark:text-emerald-100/90 mt-1">
        {children}
      </p>
    </div>
  );
}

function Warning({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 mt-4">
      <div className="text-sm font-semibold text-amber-900 dark:text-amber-100">
        {title}
      </div>
      <p className="text-sm text-amber-900/90 dark:text-amber-100/90 mt-1">
        {children}
      </p>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <CheckCircle2 className="h-4 w-4 text-blue-500 mt-1 shrink-0" />
      <p className="text-base leading-relaxed">{children}</p>
    </div>
  );
}
