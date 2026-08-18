"use client";

import { useState } from "react";

interface DateRangeCalendarProps {
  startDate: string; // ISO yyyy-mm-dd
  endDate: string;
  onChange: (start: string, end: string) => void;
}

const WEEKDAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function startOfMonth(year: number, month: number): Date {
  return new Date(year, month, 1);
}

function buildWeeks(year: number, month: number): Date[][] {
  const first = startOfMonth(year, month);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());

  const weeks: Date[][] = [];
  const cursor = new Date(gridStart);
  for (let week = 0; week < 6; week++) {
    const days: Date[] = [];
    for (let day = 0; day < 7; day++) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(days);
  }
  return weeks;
}

export function DateRangeCalendar({ startDate, endDate, onChange }: DateRangeCalendarProps) {
  const today = new Date();
  const initial = startDate ? new Date(`${startDate}T00:00:00`) : today;
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  const weeks = buildWeeks(viewYear, viewMonth);
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  function changeMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  function selectDay(date: Date) {
    const iso = toIso(date);
    if (!startDate || (startDate && endDate)) {
      onChange(iso, "");
      return;
    }
    if (iso < startDate) {
      onChange(iso, "");
      return;
    }
    onChange(startDate, iso);
  }

  function goToToday() {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  }

  return (
    <div className="rounded-2xl bg-white p-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={goToToday}
          className="rounded-full border border-brand-dark/20 px-3 py-1 text-sm text-brand-dark"
        >
          Today
        </button>
        <div className="flex items-center gap-1 text-brand-dark">
          <button type="button" onClick={() => changeMonth(-12)} aria-label="Previous year" className="px-1">
            «
          </button>
          <button type="button" onClick={() => changeMonth(-1)} aria-label="Previous month" className="px-1">
            ‹
          </button>
          <span className="min-w-[9rem] text-center font-semibold">{monthLabel}</span>
          <button type="button" onClick={() => changeMonth(1)} aria-label="Next month" className="px-1">
            ›
          </button>
          <button type="button" onClick={() => changeMonth(12)} aria-label="Next year" className="px-1">
            »
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="text-xs font-semibold text-brand-dark/50">
            {label}
          </div>
        ))}

        {weeks.flatMap((week, weekIndex) =>
          week.map((date) => {
            const iso = toIso(date);
            const inCurrentMonth = date.getMonth() === viewMonth;
            const isStart = iso === startDate;
            const isEnd = iso === endDate;
            const inRange = startDate && endDate && iso > startDate && iso < endDate;
            const isToday = iso === toIso(today);

            return (
              <button
                type="button"
                key={`${weekIndex}-${iso}`}
                onClick={() => selectDay(date)}
                className={[
                  "py-1.5 text-sm rounded-none",
                  inCurrentMonth ? "text-brand-dark" : "text-brand-dark/30",
                  inRange ? "bg-brand-lime/40" : "",
                  isStart || isEnd ? "bg-brand-orange text-white rounded-full font-semibold" : "",
                  isToday && !isStart && !isEnd ? "ring-1 ring-brand-orange rounded-full" : "",
                ].join(" ")}
              >
                {date.getDate()}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
