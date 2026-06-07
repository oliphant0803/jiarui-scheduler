"use client";

import Image from "next/image";
import { useState } from "react";

import type { BookingPhase } from "./calendar-data";
import Link from "next/dist/client/link";

type ReservationLite = {
  dayLabel: string;
  start: string;
  topic: string;
  examType: string;
};

type Props = {
  phase: BookingPhase;
  loggedIn: boolean;
  reservations?: ReservationLite[];
  comeBackLabel?: string;
  allDaysBooked?: boolean;
  weekLabel?: string;
  isCurrentWeekView?: boolean;
};

export function TalkingBrandHeader({
  phase,
  loggedIn,
  reservations = [],
  comeBackLabel,
  allDaysBooked = false,
  weekLabel,
  isCurrentWeekView = false,
}: Props) {
  const [zh, setZh] = useState(false);

  return (
    <header className="talking-brand-header">
      <div className="talking-brand-mark">
        <Image
          src="/logo.png"
          alt="Jiarui French"
          width={92}
          height={92}
          className="talking-brand-logo"
          priority
          unoptimized
        />
      </div>

      <div className="talking-brand-copy">
        <button
          type="button"
          className="talking-lang-toggle"
          onClick={() => setZh((value) => !value)}
          aria-label={zh ? "Switch to English" : "切换到中文"}
        >
          {zh ? "EN" : "中文"}
        </button>

        <p className="talking-brand-kicker">{zh ? "猫头鹰提醒" : "Owl note"}</p>
        {zh ? (
          <ChineseMessage
            phase={phase}
            loggedIn={loggedIn}
            reservations={reservations}
            comeBackLabel={comeBackLabel}
            allDaysBooked={allDaysBooked}
            weekLabel={weekLabel}
            isCurrentWeekView={isCurrentWeekView}
          />
        ) : (
          <EnglishMessage
            phase={phase}
            loggedIn={loggedIn}
            reservations={reservations}
            comeBackLabel={comeBackLabel}
            allDaysBooked={allDaysBooked}
            weekLabel={weekLabel}
            isCurrentWeekView={isCurrentWeekView}
          />
        )}
      </div>
    </header>
  );
}

function summarize(reservations: ReservationLite[], zh = false): string {
  const first = reservations[0];
  const base = `${first.dayLabel} · ${first.start} (${first.examType} ${first.topic})`;
  if (reservations.length === 1) return base;
  const more = reservations.length - 1;
  return zh ? `${base} 等 ${reservations.length} 个` : `${base} +${more} more`;
}

function reservationList(reservations: ReservationLite[], zh = false): string {
  if (reservations.length === 0) return zh ? "本周暂无预约" : "no reserved slots this week";
  return reservations
    .map((reservation) =>
      `${reservation.dayLabel} · ${reservation.start} (${reservation.examType} ${reservation.topic})`,
    )
    .join(zh ? "；" : "; ");
}

function EnglishMessage({
  phase,
  loggedIn,
  reservations = [],
  comeBackLabel,
  allDaysBooked,
  weekLabel,
  isCurrentWeekView,
}: Props) {
  if (!loggedIn) {
    return (
      <p className="talking-brand-text">
        For instructors to view all the reservations, but no edit. Student, please 
        <Link href="/reservation" className="btn compact-action talking-brand-text"> 
          <strong>log in first</strong>
          </Link> to book a timeslot.
      </p>
    );
  }

  if (isCurrentWeekView) {
    return (
      <p className="talking-brand-text">
        Here is the list of slots you reserved:{" "}
      </p>
    );
  }

  if (allDaysBooked) {
    return (
      <p className="talking-brand-text">
        Whoa — you booked <strong>all five days</strong>! 🦉 You&apos;ve cleaned
        out the whole nest; there is literally nothing left for you to peck at.
        Go rest those wings — <strong>see you in class {weekLabel ?? "next week"}</strong>. 🪺
      </p>
    );
  }

  if (reservations.length > 0) {
    // Phase 1 (Mon noon–Wed noon): one pick for the whole week — fully locked.
    if (phase === "phase1") {
      return (
        <p className="talking-brand-text">
          You have <strong>{summarize(reservations)}</strong>. That is your one pick
          this week — please come back <strong>{comeBackLabel ?? "Thursday"} at noon</strong>{" "}
          to book another.
        </p>
      );
    }
    if (phase === "phase2") {
      return (
        <p className="talking-brand-text">
          You have <strong>{summarize(reservations)}</strong>. You can still book{" "}
          <strong>one slot per remaining day</strong>.
        </p>
      );
    }
    if (phase === "gap") {
      return (
        <p className="talking-brand-text">
          You have <strong>{summarize(reservations)}</strong>. Booking is{" "}
          <strong>paused until Thursday noon</strong>.
        </p>
      );
    }
    return (
      <p className="talking-brand-text">
        You have <strong>{summarize(reservations)}</strong>. Booking reopens{" "}
        <strong>Monday at noon</strong>.
      </p>
    );
  }

  if (phase === "phase1") {
    return (
      <p className="talking-brand-text">
        You may pick <strong>one timeslot in the whole week</strong>. Come back{" "}
        <strong>Thursday and after</strong> to pick other dates.
      </p>
    );
  }

  if (phase === "phase2") {
    return (
      <p className="talking-brand-text">
        It is <strong>Thursday and after</strong>. You may pick{" "}
        <strong>one timeslot per day</strong> for the remaining dates.
      </p>
    );
  }

  if (phase === "gap") {
    return (
      <p className="talking-brand-text">
        Booking is <strong>paused until Thursday noon</strong>. You can still
        review the calendar now.
      </p>
    );
  }

  return (
    <p className="talking-brand-text">
      Booking is <strong>closed right now</strong>. Come back{" "}
      <strong>Monday at noon</strong>.
    </p>
  );
}

function ChineseMessage({
  phase,
  loggedIn,
  reservations = [],
  comeBackLabel,
  allDaysBooked,
  weekLabel,
  isCurrentWeekView,
}: Props) {
  if (!loggedIn) {
    return (
      <p className="talking-brand-text">
        请先 <Link href="/reservation" className="btn compact-action talking-brand-text"> 
          <strong>登陆</strong>
          </Link>，然后才能预约时间。
      </p>
    );
  }

  if (isCurrentWeekView) {
    return (
      <p className="talking-brand-text">
        这是你已预约的时间段列表：
      </p>
    );
  }

  if (allDaysBooked) {
    return (
      <p className="talking-brand-text">
        哇——你把 <strong>五天全约满</strong> 了！🦉 整个窝都被你掏空了，这儿真的没啥可叼的了。
        回去歇歇翅膀吧，<strong>{weekLabel ?? "下周"} 课上见</strong>。🪺
      </p>
    );
  }

  if (reservations.length > 0) {
    if (phase === "phase1") {
      return (
        <p className="talking-brand-text">
          你已预约 <strong>{summarize(reservations, true)}</strong>。本周只能选择一个时间段，
          请在 <strong>{comeBackLabel ?? "周四"} 中午</strong> 回来预约其他日期。
        </p>
      );
    }
    if (phase === "phase2") {
      return (
        <p className="talking-brand-text">
          你已预约 <strong>{summarize(reservations, true)}</strong>。剩余日期仍可
          <strong>每天预约一个时间段</strong>。
        </p>
      );
    }
    if (phase === "gap") {
      return (
        <p className="talking-brand-text">
          你已预约 <strong>{summarize(reservations, true)}</strong>。预约
          <strong>暂停到周四中午</strong>。
        </p>
      );
    }
    return (
      <p className="talking-brand-text">
        你已预约 <strong>{summarize(reservations, true)}</strong>。预约将在
        <strong>周一中午</strong> 重新开放。
      </p>
    );
  }

  if (phase === "phase1") {
    return (
      <p className="talking-brand-text">
        本周只能选择 <strong>一个时间段</strong>。请在{" "}
        <strong>周四或之后</strong> 回来选择其他日期。
      </p>
    );
  }

  if (phase === "phase2") {
    return (
      <p className="talking-brand-text">
        现在是 <strong>周四或之后</strong>。你可以为剩余日期选择{" "}
        <strong>每天一个时间段</strong>。
      </p>
    );
  }

  if (phase === "gap") {
    return (
      <p className="talking-brand-text">
        预约会 <strong>暂停到周四中午</strong>，现在可以先查看日历。
      </p>
    );
  }

  return (
    <p className="talking-brand-text">
      现在 <strong>暂时不能预约</strong>。请在 <strong>周一中午</strong> 回来。
    </p>
  );
}
