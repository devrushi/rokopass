import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { apiRequest, ApiError } from "../../lib/apiClient";
import type { Activity, ClassSession } from "../../lib/types";
import "./provider.css";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 0]; // Monday-first for the schedule form

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Local calendar day, not UTC — sessions are grouped by the day a parent/provider would see on
// a wall clock. Using toISOString() here would misalign by a day for any timezone ahead of UTC
// (e.g. BST) whenever local midnight falls on the previous UTC calendar day.
function formatDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function ActivityDetail() {
  const { id } = useParams<{ id: string }>();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [error, setError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [isSubmittingSchedule, setIsSubmittingSchedule] = useState(false);

  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState("16:00");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [frequency, setFrequency] = useState<"WEEKLY" | "BIWEEKLY">("WEEKLY");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));

  const loadSessions = useCallback(() => {
    if (!id) return;
    const from = weekStart;
    const to = new Date(weekStart.getTime() + 7 * 24 * 60 * 60_000);
    apiRequest<{ sessions: ClassSession[] }>(
      `/activities/${id}/sessions?from=${from.toISOString()}&to=${to.toISOString()}`,
      { skipAuth: true },
    )
      .then((data) => setSessions(data.sessions))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load sessions"));
  }, [id, weekStart]);

  useEffect(() => {
    if (!id) return;
    apiRequest<{ activity: Activity }>(`/activities/${id}`, { skipAuth: true })
      .then((data) => setActivity(data.activity))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load activity"));
  }, [id]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  async function handleCreateSchedule(event: FormEvent) {
    event.preventDefault();
    if (!id) return;
    setScheduleError(null);
    setIsSubmittingSchedule(true);
    try {
      await apiRequest(`/activities/${id}/schedules`, {
        method: "POST",
        body: { dayOfWeek, startTime, durationMinutes, frequency, startDate },
      });
      loadSessions();
    } catch (err) {
      setScheduleError(err instanceof ApiError ? err.message : "Failed to create schedule");
    } finally {
      setIsSubmittingSchedule(false);
    }
  }

  async function toggleCancelled(session: ClassSession) {
    try {
      await apiRequest<{ session: ClassSession }>(`/sessions/${session.id}`, {
        method: "PATCH",
        body: { isCancelled: !session.isCancelled },
      });
      loadSessions();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update session");
    }
  }

  if (error && !activity) {
    return <p className="page-status">{error}</p>;
  }

  if (!activity) {
    return <p className="page-status">Loading…</p>;
  }

  const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * 24 * 60 * 60_000));
  const sessionsByDay = new Map<string, ClassSession[]>();
  for (const session of sessions) {
    const key = formatDayKey(new Date(session.startsAt));
    sessionsByDay.set(key, [...(sessionsByDay.get(key) ?? []), session]);
  }

  return (
    <div className="provider-page">
      <div className="provider-page__header">
        <div>
          <h1>{activity.title}</h1>
          <p className="activity-card__meta">
            {activity.category} · {activity.ageGroup.label} · {activity.location} · {activity.creditCost}{" "}
            credits · capacity {activity.capacity}
          </p>
        </div>
      </div>

      <section>
        <h2>Add a recurring schedule</h2>
        <form className="form" onSubmit={handleCreateSchedule}>
          <div className="form-row">
            <label>
              Day of week
              <select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))}>
                {DAY_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {DAY_NAMES[d]}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Start time
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
            </label>
          </div>

          <div className="form-row">
            <label>
              Duration (minutes)
              <input
                type="number"
                min={15}
                step={15}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                required
              />
            </label>

            <label>
              Frequency
              <select value={frequency} onChange={(e) => setFrequency(e.target.value as "WEEKLY" | "BIWEEKLY")}>
                <option value="WEEKLY">Weekly</option>
                <option value="BIWEEKLY">Every two weeks</option>
              </select>
            </label>
          </div>

          <label>
            Starts on
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </label>

          {scheduleError && <p className="form__error">{scheduleError}</p>}

          <button type="submit" className="button" disabled={isSubmittingSchedule}>
            {isSubmittingSchedule ? "Adding…" : "Add schedule"}
          </button>
        </form>
      </section>

      <section className="calendar-week">
        <div className="calendar-week__nav">
          <button
            type="button"
            className="button button--secondary"
            onClick={() => setWeekStart((w) => new Date(w.getTime() - 7 * 24 * 60 * 60_000))}
          >
            ← Previous week
          </button>
          <strong>
            Week of {weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </strong>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => setWeekStart((w) => new Date(w.getTime() + 7 * 24 * 60 * 60_000))}
          >
            Next week →
          </button>
        </div>

        {error && <p className="form__error">{error}</p>}

        {days.map((day) => {
          const daySessions = sessionsByDay.get(formatDayKey(day)) ?? [];
          return (
            <div className="calendar-day" key={formatDayKey(day)}>
              <div className="calendar-day__title">
                {day.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
              </div>
              {daySessions.length === 0 && <p className="calendar-day__empty">No classes scheduled</p>}
              {daySessions.map((session) => (
                <div
                  className={`session-row ${session.isCancelled ? "session-row--cancelled" : ""}`}
                  key={session.id}
                >
                  <span>
                    {new Date(session.startsAt).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {" – "}
                    {new Date(session.endsAt).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <div className="session-row__actions">
                    <button
                      type="button"
                      className="button button--secondary"
                      onClick={() => toggleCancelled(session)}
                    >
                      {session.isCancelled ? "Restore" : "Cancel"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </section>
    </div>
  );
}
